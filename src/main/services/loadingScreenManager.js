const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { nativeImage } = require('electron');
const pathProvider = require('./pathProvider');

// In-memory cache for generated thumbnail data URLs so UI renders instantly
const previewCache = new Map();

/**
 * Locate the FS25 'shared' directory.
 */
async function getGameSharedDir() {
  try {
    const gameLauncher = require('./gameLauncher');
    const detected = await gameLauncher.detectGamePath();
    if (detected && detected.path) {
      const dir = path.dirname(detected.path);
      const candidates = [
        path.join(dir, 'shared'),
        path.join(dir, '..', 'shared'),
        path.join(dir, '..', '..', 'shared'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand) && (fs.existsSync(path.join(cand, 'splash.dds')) || fs.existsSync(path.join(cand, 'splash')))) {
          return cand;
        }
      }
    }
  } catch (e) {
    console.error('[LOADING-SCREEN] Error detecting game path:', e.message);
  }

  // Fallback to common paths
  const commonSharedPaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Farming Simulator 25\\shared',
    'C:\\Program Files\\Steam\\steamapps\\common\\Farming Simulator 25\\shared',
    'D:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25\\shared',
    'E:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25\\shared',
    'C:\\Program Files\\Farming Simulator 2025\\shared',
    'C:\\Program Files (x86)\\Farming Simulator 2025\\shared',
  ];
  for (const p of commonSharedPaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'splash.dds'))) {
      return p;
    }
  }

  return null;
}

/**
 * Get user custom loading screens storage directory.
 */
function getCustomScreensDir() {
  const dataRoot = pathProvider.getFS25DataRoot();
  const dir = path.join(dataRoot, 'custom_loading_screens');
  fs.ensureDirSync(dir);
  return dir;
}

/**
 * Ensure clean backups of original game splash and splashBlur exist.
 */
async function ensureOriginalBackup(sharedDir) {
  if (!sharedDir || !fs.existsSync(sharedDir)) return;

  const origBackup = path.join(sharedDir, 'splash.dds.backup_original');
  const origBlurBackup = path.join(sharedDir, 'splashBlur.dds.backup_original');
  const gameSplashDds = path.join(sharedDir, 'splash.dds');
  const stockSplashDds = path.join(sharedDir, 'splash', 'splash.dds');
  const gameBlurDds = path.join(sharedDir, 'splashBlur.dds');

  if (!fs.existsSync(origBackup)) {
    if (fs.existsSync(stockSplashDds)) {
      await fs.copyFile(stockSplashDds, origBackup);
      console.log('[LOADING-SCREEN] Created backup from stock splash/splash.dds');
    } else if (fs.existsSync(gameSplashDds)) {
      await fs.copyFile(gameSplashDds, origBackup);
      console.log('[LOADING-SCREEN] Created backup from shared/splash.dds');
    }
  }

  if (!fs.existsSync(origBlurBackup) && fs.existsSync(gameBlurDds)) {
    await fs.copyFile(gameBlurDds, origBlurBackup);
    console.log('[LOADING-SCREEN] Created backup from shared/splashBlur.dds');
  }
}

/**
 * Calculate MD5 hash of a file for identity verification.
 */
function getFileHash(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buf).digest('hex');
  } catch (e) {
    return null;
  }
}

/**
 * Decode DXT1 DDS file into 32-bit BGRA buffer for Electron nativeImage.
 */
function decodeDXT1(buffer, width, height, dataOffset = 128) {
  const bgra = Buffer.alloc(width * height * 4);
  let offset = dataOffset;

  const decode565 = (val) => {
    const r = (val >> 11) & 0x1F;
    const g = (val >> 5) & 0x3F;
    const b = val & 0x1F;
    return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
  };

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      if (offset + 8 > buffer.length) return bgra;
      const c0 = buffer.readUInt16LE(offset);
      const c1 = buffer.readUInt16LE(offset + 2);
      const lookup = buffer.readUInt32LE(offset + 4);
      offset += 8;

      const rgb0 = decode565(c0);
      const rgb1 = decode565(c1);

      const colors = [
        [...rgb0, 255],
        [...rgb1, 255],
        c0 > c1
          ? [Math.floor((2 * rgb0[0] + rgb1[0]) / 3), Math.floor((2 * rgb0[1] + rgb1[1]) / 3), Math.floor((2 * rgb0[2] + rgb1[2]) / 3), 255]
          : [Math.floor((rgb0[0] + rgb1[0]) / 2), Math.floor((rgb0[1] + rgb1[1]) / 2), Math.floor((rgb0[2] + rgb1[2]) / 2), 255],
        c0 > c1
          ? [Math.floor((rgb0[0] + 2 * rgb1[0]) / 3), Math.floor((rgb0[1] + 2 * rgb1[1]) / 3), Math.floor((rgb0[2] + 2 * rgb1[2]) / 3), 255]
          : [0, 0, 0, 255],
      ];

      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const px = x + i;
          const py = y + j;
          if (px < width && py < height) {
            const idx = (lookup >> (2 * (j * 4 + i))) & 0x03;
            const pixel = colors[idx];
            const outIdx = (py * width + px) * 4;
            // NativeImage bitmap format on Windows is BGRA:
            bgra[outIdx]     = pixel[2]; // Blue
            bgra[outIdx + 1] = pixel[1]; // Green
            bgra[outIdx + 2] = pixel[0]; // Red
            bgra[outIdx + 3] = pixel[3]; // Alpha
          }
        }
      }
    }
  }

  return bgra;
}

/**
 * Encode a BGRA buffer into DXT1 DDS format.
 */
function encodeDXT1(bgraBuffer, width, height) {
  const ddsSize = 128 + (width * height / 2);
  const out = Buffer.alloc(ddsSize);

  // DDS Header (128 bytes)
  out.write('DDS ', 0, 'ascii');
  out.writeUInt32LE(124, 4); // dwSize
  out.writeUInt32LE(0x81007, 8); // dwFlags (DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_LINEARSIZE)
  out.writeUInt32LE(height, 12);
  out.writeUInt32LE(width, 16);
  out.writeUInt32LE(width * height / 2, 20); // dwPitchOrLinearSize
  out.writeUInt32LE(0, 24); // dwDepth
  out.writeUInt32LE(1, 28); // dwMipMapCount (1 mipmap)
  out.writeUInt32LE(32, 76); // ddspf.dwSize
  out.writeUInt32LE(4, 80); // ddspf.dwFlags (DDPF_FOURCC)
  out.write('DXT1', 84, 'ascii');
  out.writeUInt32LE(0, 88); // ddspf.dwRGBBitCount
  out.writeUInt32LE(0x1000, 108); // dwCaps (DDSCAPS_TEXTURE)

  const rgbTo565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
  const decode565 = (c) => {
    const r = (c >> 11) & 0x1f;
    const g = (c >> 5) & 0x3f;
    const b = c & 0x1f;
    return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
  };

  let outOffset = 128;
  const blockPixels = new Uint8Array(48); // 16 pixels * 3 (r, g, b)

  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      let minR = 255, minG = 255, minB = 255;
      let maxR = 0, maxG = 0, maxB = 0;
      let pIdx = 0;

      for (let py = 0; py < 4; py++) {
        const y = by + py;
        const rowOffset = y * width * 4;
        for (let px = 0; px < 4; px++) {
          const x = bx + px;
          const idx = rowOffset + x * 4;
          // In BGRA: [0]=B, [1]=G, [2]=R
          const b = bgraBuffer[idx];
          const g = bgraBuffer[idx + 1];
          const r = bgraBuffer[idx + 2];
          blockPixels[pIdx++] = r;
          blockPixels[pIdx++] = g;
          blockPixels[pIdx++] = b;

          if (r < minR) minR = r;
          if (g < minG) minG = g;
          if (b < minB) minB = b;
          if (r > maxR) maxR = r;
          if (g > maxG) maxG = g;
          if (b > maxB) maxB = b;
        }
      }

      let c0_565 = rgbTo565(maxR, maxG, maxB);
      let c1_565 = rgbTo565(minR, minG, minB);

      if (c0_565 <= c1_565) {
        if (c0_565 === c1_565) {
          c0_565 = Math.min(65535, c0_565 + 1);
        } else {
          const tmp = c0_565;
          c0_565 = c1_565;
          c1_565 = tmp;
        }
      }

      const rgb0 = decode565(c0_565);
      const rgb1 = decode565(c1_565);
      const p2 = [
        Math.floor((2 * rgb0[0] + rgb1[0]) / 3),
        Math.floor((2 * rgb0[1] + rgb1[1]) / 3),
        Math.floor((2 * rgb0[2] + rgb1[2]) / 3),
      ];
      const p3 = [
        Math.floor((rgb0[0] + 2 * rgb1[0]) / 3),
        Math.floor((rgb0[1] + 2 * rgb1[1]) / 3),
        Math.floor((rgb0[2] + 2 * rgb1[2]) / 3),
      ];

      let indices = 0;
      for (let i = 0; i < 16; i++) {
        const pr = blockPixels[i * 3];
        const pg = blockPixels[i * 3 + 1];
        const pb = blockPixels[i * 3 + 2];

        const d0 = (pr - rgb0[0]) ** 2 + (pg - rgb0[1]) ** 2 + (pb - rgb0[2]) ** 2;
        const d1 = (pr - rgb1[0]) ** 2 + (pg - rgb1[1]) ** 2 + (pb - rgb1[2]) ** 2;
        const d2 = (pr - p2[0]) ** 2 + (pg - p2[1]) ** 2 + (pb - p2[2]) ** 2;
        const d3 = (pr - p3[0]) ** 2 + (pg - p3[1]) ** 2 + (pb - p3[2]) ** 2;

        let bestIdx = 0, bestDist = d0;
        if (d1 < bestDist) { bestDist = d1; bestIdx = 1; }
        if (d2 < bestDist) { bestDist = d2; bestIdx = 2; }
        if (d3 < bestDist) { bestDist = d3; bestIdx = 3; }

        indices |= (bestIdx << (2 * i));
      }

      out.writeUInt16LE(c0_565, outOffset);
      out.writeUInt16LE(c1_565, outOffset + 2);
      out.writeUInt32LE(indices >>> 0, outOffset + 4);
      outOffset += 8;
    }
  }

  return out;
}

/**
 * Fast 2-pass separable box blur on BGRA buffer.
 */
function fastBoxBlur(bgra, width, height, radius = 16) {
  const temp = Buffer.alloc(bgra.length);
  const out = Buffer.alloc(bgra.length);
  const windowSize = 2 * radius + 1;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    let bSum = 0, gSum = 0, rSum = 0;
    for (let i = -radius; i <= radius; i++) {
      const x = Math.min(width - 1, Math.max(0, i));
      const idx = rowOffset + x * 4;
      bSum += bgra[idx];
      gSum += bgra[idx + 1];
      rSum += bgra[idx + 2];
    }
    for (let x = 0; x < width; x++) {
      const outIdx = rowOffset + x * 4;
      temp[outIdx]     = Math.round(bSum / windowSize);
      temp[outIdx + 1] = Math.round(gSum / windowSize);
      temp[outIdx + 2] = Math.round(rSum / windowSize);
      temp[outIdx + 3] = 255;

      const removeX = Math.max(0, x - radius);
      const addX = Math.min(width - 1, x + radius + 1);
      bSum += bgra[rowOffset + addX * 4] - bgra[rowOffset + removeX * 4];
      gSum += bgra[rowOffset + addX * 4 + 1] - bgra[rowOffset + removeX * 4 + 1];
      rSum += bgra[rowOffset + addX * 4 + 2] - bgra[rowOffset + removeX * 4 + 2];
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let bSum = 0, gSum = 0, rSum = 0;
    for (let i = -radius; i <= radius; i++) {
      const y = Math.min(height - 1, Math.max(0, i));
      const idx = (y * width + x) * 4;
      bSum += temp[idx];
      gSum += temp[idx + 1];
      rSum += temp[idx + 2];
    }
    for (let y = 0; y < height; y++) {
      const outIdx = (y * width + x) * 4;
      out[outIdx]     = Math.round(bSum / windowSize);
      out[outIdx + 1] = Math.round(gSum / windowSize);
      out[outIdx + 2] = Math.round(rSum / windowSize);
      out[outIdx + 3] = 255;

      const removeY = Math.max(0, y - radius);
      const addY = Math.min(height - 1, y + radius + 1);
      bSum += temp[(addY * width + x) * 4] - temp[(removeY * width + x) * 4];
      gSum += temp[(addY * width + x) * 4 + 1] - temp[(removeY * width + x) * 4 + 1];
      rSum += temp[(addY * width + x) * 4 + 2] - temp[(removeY * width + x) * 4 + 2];
    }
  }

  return out;
}

/**
 * Generate a web-ready DataURL (PNG base64) for previewing a DDS or image file.
 */
function getFilePreviewDataUrl(filePath, maxDimension = 640) {
  try {
    if (!fs.existsSync(filePath)) return null;

    const stat = fs.statSync(filePath);
    const cacheKey = `${filePath}_${stat.mtimeMs}_${maxDimension}`;
    if (previewCache.has(cacheKey)) {
      return previewCache.get(cacheKey);
    }

    let img = null;
    if (filePath.toLowerCase().endsWith('.dds')) {
      const buf = fs.readFileSync(filePath);
      if (buf.length < 128 || buf.toString('ascii', 0, 4) !== 'DDS ') return null;
      const height = buf.readUInt32LE(12);
      const width = buf.readUInt32LE(16);
      const bgra = decodeDXT1(buf, width, height, 128);
      img = nativeImage.createFromBitmap(bgra, { width, height });
    } else {
      img = nativeImage.createFromPath(filePath);
    }

    if (!img || img.isEmpty()) return null;

    const size = img.getSize();
    const aspect = (size.width || 1) / (size.height || 1);
    const targetW = maxDimension;
    const targetH = Math.max(1, Math.round(maxDimension / aspect));
    const resized = img.resize({ width: targetW, height: targetH, quality: 'good' });
    const dataUrl = resized.toDataURL();

    previewCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error(`[LOADING-SCREEN] Failed to generate preview for ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Get comprehensive status: active loading screen, official presets, and custom gallery.
 */
async function getStatus() {
  const sharedDir = await getGameSharedDir();
  if (!sharedDir) {
    return {
      available: false,
      error: 'Farming Simulator 25 installation folder could not be detected. Please set your Game Path in Settings.',
    };
  }

  await ensureOriginalBackup(sharedDir);

  const activeSplashPath = path.join(sharedDir, 'splash.dds');
  const activeHash = getFileHash(activeSplashPath);
  const activePreview = getFilePreviewDataUrl(activeSplashPath, 960);

  const originalBackupPath = path.join(sharedDir, 'splash.dds.backup_original');
  const originalHash = getFileHash(originalBackupPath);

  // 1. Gather Presets
  const presets = [];

  // Default FS25 preset
  const defaultPath = fs.existsSync(originalBackupPath) ? originalBackupPath : path.join(sharedDir, 'splash', 'splash.dds');
  if (fs.existsSync(defaultPath)) {
    const dHash = getFileHash(defaultPath);
    presets.push({
      id: 'default',
      title: 'FS25 Standard',
      description: 'Official Farming Simulator 25 key art (Case IH field at sunset)',
      filePath: defaultPath,
      hash: dHash,
      preview: getFilePreviewDataUrl(defaultPath, 480),
      isDefault: true,
      isActive: activeHash === dHash,
    });
  }

  // Official variants in shared/
  const officialVariants = [
    {
      fileName: 'splash_highlandsFishing.dds',
      id: 'highlandsFishing',
      title: 'Highlands Fishing',
      description: 'Scenic highlands lake, mountains, and fishing boat atmosphere',
    },
    {
      fileName: 'splash_beansandalpacas.dds',
      id: 'beansAndAlpacas',
      title: 'Beans & Alpacas',
      description: 'Harvesting green fields with farm alpacas and new crop varieties',
    },
  ];

  for (const v of officialVariants) {
    const vPath = path.join(sharedDir, v.fileName);
    if (fs.existsSync(vPath)) {
      const vHash = getFileHash(vPath);
      presets.push({
        id: v.id,
        title: v.title,
        description: v.description,
        filePath: vPath,
        hash: vHash,
        preview: getFilePreviewDataUrl(vPath, 480),
        isDefault: false,
        isActive: activeHash === vHash,
      });
    }
  }

  // Any other splash_*.dds present in shared/
  try {
    const files = await fs.readdir(sharedDir);
    for (const file of files) {
      if (file.toLowerCase().startsWith('splash_') && file.toLowerCase().endsWith('.dds')) {
        const alreadyHandled = presets.some(p => path.basename(p.filePath).toLowerCase() === file.toLowerCase());
        if (!alreadyHandled) {
          const filePath = path.join(sharedDir, file);
          const fHash = getFileHash(filePath);
          const cleanName = file.replace(/^splash_/i, '').replace(/\.dds$/i, '');
          const formattedTitle = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
          presets.push({
            id: file,
            title: formattedTitle,
            description: `Game shared preset: ${file}`,
            filePath,
            hash: fHash,
            preview: getFilePreviewDataUrl(filePath, 480),
            isDefault: false,
            isActive: activeHash === fHash,
          });
        }
      }
    }
  } catch (e) {}

  // 2. Gather User Custom Loading Screens
  const customScreensDir = getCustomScreensDir();
  const custom = [];
  try {
    const customFiles = await fs.readdir(customScreensDir);
    const ddsFiles = customFiles.filter(f => f.toLowerCase().endsWith('.dds'));

    for (const ddsName of ddsFiles) {
      const ddsPath = path.join(customScreensDir, ddsName);
      const cHash = getFileHash(ddsPath);
      const baseName = path.basename(ddsName, path.extname(ddsName));
      const metaPath = path.join(customScreensDir, `${baseName}.json`);

      let meta = { name: baseName, createdAt: Date.now() };
      if (fs.existsSync(metaPath)) {
        try {
          meta = { ...meta, ...(await fs.readJson(metaPath)) };
        } catch (_) {}
      }

      custom.push({
        id: ddsName,
        title: meta.name || baseName,
        createdAt: meta.createdAt,
        filePath: ddsPath,
        hash: cHash,
        preview: getFilePreviewDataUrl(ddsPath, 480),
        isActive: activeHash === cHash,
      });
    }
  } catch (e) {
    console.error('[LOADING-SCREEN] Error reading custom screens:', e.message);
  }

  // Active preset or custom matching
  let activeName = 'Custom Loading Screen';
  const matchedPreset = presets.find(p => p.isActive);
  const matchedCustom = custom.find(c => c.isActive);

  if (matchedPreset) {
    activeName = matchedPreset.title;
  } else if (matchedCustom) {
    activeName = matchedCustom.title;
  } else if (activeHash === originalHash) {
    activeName = 'FS25 Standard (Default)';
  }

  return {
    available: true,
    sharedDir,
    active: {
      name: activeName,
      hash: activeHash,
      preview: activePreview,
      isDefault: activeHash === originalHash,
      fileSize: fs.existsSync(activeSplashPath) ? fs.statSync(activeSplashPath).size : 0,
      modifiedTime: fs.existsSync(activeSplashPath) ? fs.statSync(activeSplashPath).mtimeMs : 0,
    },
    presets,
    custom,
  };
}

/**
 * Apply a selected preset.
 */
async function applyPreset(presetId) {
  const sharedDir = await getGameSharedDir();
  if (!sharedDir) throw new Error('Game directory not found.');

  await ensureOriginalBackup(sharedDir);

  const status = await getStatus();
  const preset = status.presets.find(p => p.id === presetId);
  if (!preset || !fs.existsSync(preset.filePath)) {
    throw new Error(`Preset "${presetId}" not found.`);
  }

  const targetSplash = path.join(sharedDir, 'splash.dds');
  const targetBlur = path.join(sharedDir, 'splashBlur.dds');

  // Copy preset to splash.dds
  await fs.copyFile(preset.filePath, targetSplash);

  // If restoring default, also restore original blur
  if (preset.isDefault) {
    const origBlur = path.join(sharedDir, 'splashBlur.dds.backup_original');
    if (fs.existsSync(origBlur)) {
      await fs.copyFile(origBlur, targetBlur);
    }
  } else {
    // Generate matching blurred version for non-default presets
    try {
      const splashBuf = await fs.readFile(targetSplash);
      const bgra = decodeDXT1(splashBuf, 4096, 4096, 128);
      // Downscale to 2048x2048 for splashBlur
      const img = nativeImage.createFromBitmap(bgra, { width: 4096, height: 4096 });
      const smallImg = img.resize({ width: 2048, height: 2048, quality: 'best' });
      const smallBgra = smallImg.toBitmap();
      const blurredBgra = fastBoxBlur(smallBgra, 2048, 2048, 16);
      const blurDds = encodeDXT1(blurredBgra, 2048, 2048);
      await fs.writeFile(targetBlur, blurDds);
    } catch (bErr) {
      console.warn('[LOADING-SCREEN] Failed to generate blurred splash for preset:', bErr.message);
    }
  }

  // Clear preview cache for splash.dds
  previewCache.clear();

  return await getStatus();
}

/**
 * Apply a custom user image (PNG, JPG, WebP, BMP, or DDS).
 */
async function applyCustomImage(filePath, customName = null) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Selected image file does not exist.');
  }

  const sharedDir = await getGameSharedDir();
  if (!sharedDir) throw new Error('Game directory not found.');

  await ensureOriginalBackup(sharedDir);

  const ext = path.extname(filePath).toLowerCase();
  const baseName = customName || path.basename(filePath, ext);
  const cleanId = `custom_${Date.now()}_${baseName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const customDir = getCustomScreensDir();
  const savedDdsPath = path.join(customDir, `${cleanId}.dds`);
  const savedMetaPath = path.join(customDir, `${cleanId}.json`);

  const targetSplash = path.join(sharedDir, 'splash.dds');
  const targetBlur = path.join(sharedDir, 'splashBlur.dds');

  if (ext === '.dds') {
    // Direct DDS copy
    const buf = await fs.readFile(filePath);
    if (buf.length < 128 || buf.toString('ascii', 0, 4) !== 'DDS ') {
      throw new Error('Invalid DDS file format.');
    }
    await fs.writeFile(savedDdsPath, buf);
    await fs.copyFile(savedDdsPath, targetSplash);

    // Generate blurred version
    try {
      const height = buf.readUInt32LE(12) || 4096;
      const width = buf.readUInt32LE(16) || 4096;
      const bgra = decodeDXT1(buf, width, height, 128);
      const img = nativeImage.createFromBitmap(bgra, { width, height });
      const smallImg = img.resize({ width: 2048, height: 2048, quality: 'best' });
      const smallBgra = smallImg.toBitmap();
      const blurredBgra = fastBoxBlur(smallBgra, 2048, 2048, 16);
      const blurDds = encodeDXT1(blurredBgra, 2048, 2048);
      await fs.writeFile(targetBlur, blurDds);
    } catch (e) {
      console.warn('[LOADING-SCREEN] Blur generation skipped for raw DDS:', e.message);
    }
  } else {
    // Standard image: load with nativeImage
    const srcImg = nativeImage.createFromPath(filePath);
    if (!srcImg || srcImg.isEmpty()) {
      throw new Error('Unable to decode image file. Please choose a valid JPG, PNG, or DDS.');
    }

    const { width: origW, height: origH } = srcImg.getSize();
    const targetAspect = 16 / 9;
    const currentAspect = origW / origH;

    // Smart 16:9 center crop to prevent visual distortion
    let croppedImg = srcImg;
    if (Math.abs(currentAspect - targetAspect) > 0.02) {
      if (currentAspect > targetAspect) {
        // Image is wider than 16:9 -> crop width
        const cropW = Math.round(origH * targetAspect);
        const cropX = Math.round((origW - cropW) / 2);
        croppedImg = srcImg.crop({ x: cropX, y: 0, width: cropW, height: origH });
      } else {
        // Image is taller than 16:9 -> crop height
        const cropH = Math.round(origW / targetAspect);
        const cropY = Math.round((origH - cropH) / 2);
        croppedImg = srcImg.crop({ x: 0, y: cropY, width: origW, height: cropH });
      }
    }

    // 1. Splash DDS: 4096x4096 texture (game engine native resolution)
    const splashImg = croppedImg.resize({ width: 4096, height: 4096, quality: 'best' });
    const splashBgra = splashImg.toBitmap();
    const splashDds = encodeDXT1(splashBgra, 4096, 4096);

    // Save to custom gallery and apply to game
    await fs.writeFile(savedDdsPath, splashDds);
    await fs.writeFile(targetSplash, splashDds);

    // 2. SplashBlur DDS: 2048x2048 texture with box blur
    const blurImg = croppedImg.resize({ width: 2048, height: 2048, quality: 'best' });
    const blurBgra = blurImg.toBitmap();
    const blurredBgra = fastBoxBlur(blurBgra, 2048, 2048, 16);
    const blurDds = encodeDXT1(blurredBgra, 2048, 2048);
    await fs.writeFile(targetBlur, blurDds);
  }

  // Save metadata
  await fs.writeJson(savedMetaPath, {
    id: cleanId,
    name: baseName,
    createdAt: Date.now(),
    originalFile: filePath,
  });

  previewCache.clear();
  return await getStatus();
}

/**
 * Restore game original stock splash screen.
 */
async function restoreDefault() {
  const sharedDir = await getGameSharedDir();
  if (!sharedDir) throw new Error('Game directory not found.');

  const origBackup = path.join(sharedDir, 'splash.dds.backup_original');
  const stockSplash = path.join(sharedDir, 'splash', 'splash.dds');
  const sourceToRestore = fs.existsSync(origBackup) ? origBackup : stockSplash;

  if (!fs.existsSync(sourceToRestore)) {
    throw new Error('Default game splash backup not found.');
  }

  const targetSplash = path.join(sharedDir, 'splash.dds');
  await fs.copyFile(sourceToRestore, targetSplash);

  const origBlur = path.join(sharedDir, 'splashBlur.dds.backup_original');
  const targetBlur = path.join(sharedDir, 'splashBlur.dds');
  if (fs.existsSync(origBlur)) {
    await fs.copyFile(origBlur, targetBlur);
  }

  previewCache.clear();
  return await getStatus();
}

/**
 * Delete a custom screen from the user's gallery.
 */
async function deleteCustomScreen(id) {
  const customDir = getCustomScreensDir();
  const ddsPath = path.join(customDir, id.endsWith('.dds') ? id : `${id}.dds`);
  const metaPath = path.join(customDir, `${path.basename(ddsPath, '.dds')}.json`);

  if (fs.existsSync(ddsPath)) await fs.remove(ddsPath);
  if (fs.existsSync(metaPath)) await fs.remove(metaPath);

  previewCache.clear();
  return await getStatus();
}

module.exports = {
  getGameSharedDir,
  getCustomScreensDir,
  getStatus,
  applyPreset,
  applyCustomImage,
  restoreDefault,
  deleteCustomScreen,
};
