const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { nativeImage } = require('electron');
const pathProvider = require('./pathProvider');

// In-memory cache for generated thumbnail data URLs so UI renders instantly
const previewCache = new Map();

const OFFICIAL_MENU_VARIANTS = [
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
 * Find all splash_*.dds menu variant files in shared/ (excluding backups and splashBlur).
 */
function getMenuVariantFiles(sharedDir) {
  if (!sharedDir || !fs.existsSync(sharedDir)) return [];
  try {
    return fs.readdirSync(sharedDir).filter((f) => {
      const lower = f.toLowerCase();
      return (
        lower.startsWith('splash_') &&
        lower.endsWith('.dds') &&
        !lower.includes('blur') &&
        !lower.includes('backup')
      );
    });
  } catch (_) {
    return OFFICIAL_MENU_VARIANTS.map((v) => v.fileName).filter((f) =>
      fs.existsSync(path.join(sharedDir, f))
    );
  }
}

/**
 * Ensure clean backups of original game splash, menu splash variants, and splashBlur exist.
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

  for (const fileName of getMenuVariantFiles(sharedDir)) {
    const srcPath = path.join(sharedDir, fileName);
    const bakPath = path.join(sharedDir, `${fileName}.backup_original`);
    if (fs.existsSync(srcPath) && !fs.existsSync(bakPath)) {
      await fs.copyFile(srcPath, bakPath);
      console.log(`[LOADING-SCREEN] Created backup for ${fileName}`);
    }
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
    const r = (val >> 11) & 0x1f;
    const g = (val >> 5) & 0x3f;
    const b = val & 0x1f;
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
            bgra[outIdx] = pixel[2]; // Blue
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
 * Encode 4x4 DXT1 blocks directly into a destination buffer.
 */
function encodeDXT1BlocksInto(bgra, width, height, out, initialOffset) {
  const q5 = (v) => Math.max(0, Math.min(31, Math.round((v * 31) / 255)));
  const q6 = (v) => Math.max(0, Math.min(63, Math.round((v * 63) / 255)));
  const e5 = (c) => (c << 3) | (c >> 2);
  const e6 = (c) => (c << 2) | (c >> 4);
  const dec = (c) => [e5(c >> 11), e6((c >> 5) & 63), e5(c & 31)];
  const px = new Float32Array(48);
  const weights = [1, 0, 2 / 3, 1 / 3];
  let o = initialOffset;

  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      const mn = [255, 255, 255];
      const mx = [0, 0, 0];
      let n = 0;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const i = ((by + y) * width + bx + x) * 4;
          const c = [bgra[i + 2], bgra[i + 1], bgra[i]];
          for (let k = 0; k < 3; k++) {
            px[n * 3 + k] = c[k];
            if (c[k] < mn[k]) mn[k] = c[k];
            if (c[k] > mx[k]) mx[k] = c[k];
          }
          n++;
        }
      }

      const hi = mx.map((v, k) => v - (v - mn[k]) / 16);
      const lo = mn.map((v, k) => v + (mx[k] - v) / 16);
      let best = null;
      for (let it = 0; it < 3; it++) {
        let c0 = (q5(hi[0]) << 11) | (q6(hi[1]) << 5) | q5(hi[2]);
        let c1 = (q5(lo[0]) << 11) | (q6(lo[1]) << 5) | q5(lo[2]);
        if (c0 < c1) { const t = c0; c0 = c1; c1 = t; }
        const C0 = dec(c0);
        const C1 = dec(c1);
        const pal = [
          C0,
          C1,
          C0.map((v, k) => Math.floor((2 * v + C1[k]) / 3)),
          C0.map((v, k) => Math.floor((v + 2 * C1[k]) / 3)),
        ];
        let idx = 0;
        let err = 0;
        const ids = [];
        for (let i = 0; i < 16; i++) {
          let bd = Infinity;
          let bi = 0;
          for (let j = 0; j < 4; j++) {
            const d = (px[i * 3] - pal[j][0]) ** 2 + (px[i * 3 + 1] - pal[j][1]) ** 2 + (px[i * 3 + 2] - pal[j][2]) ** 2;
            if (d < bd) { bd = d; bi = j; }
          }
          idx |= bi << (2 * i);
          err += bd;
          ids.push(bi);
        }
        if (!best || err < best.err) best = { c0, c1, idx, err };
        if (err === 0) break;

        let aa = 0, bb = 0, ab = 0;
        const ax = [0, 0, 0];
        const bxv = [0, 0, 0];
        for (let i = 0; i < 16; i++) {
          const al = weights[ids[i]];
          const be = 1 - al;
          aa += al * al; bb += be * be; ab += al * be;
          for (let k = 0; k < 3; k++) { ax[k] += al * px[i * 3 + k]; bxv[k] += be * px[i * 3 + k]; }
        }
        const det = aa * bb - ab * ab;
        if (Math.abs(det) < 1e-6) break;
        for (let k = 0; k < 3; k++) {
          hi[k] = (ax[k] * bb - bxv[k] * ab) / det;
          lo[k] = (bxv[k] * aa - ax[k] * ab) / det;
        }
      }

      let { c0, c1, idx } = best;
      if (c0 === c1 && c0 < 65535) c0++;
      out.writeUInt16LE(c0, o);
      out.writeUInt16LE(c1, o + 2);
      out.writeUInt32LE(idx >>> 0, o + 4);
      o += 8;
    }
  }
}

/**
 * Encode a BGRA buffer into single-mipmap DXT1 DDS format.
 */
function encodeDXT1Single(bgraBuffer, width, height, templateHeader = null) {
  const ddsSize = 128 + (width * height / 2);
  const out = Buffer.alloc(ddsSize);

  if (templateHeader && templateHeader.length >= 128) {
    templateHeader.copy(out, 0, 0, 128);
    out.writeUInt32LE(height, 12);
    out.writeUInt32LE(width, 16);
    out.writeUInt32LE(width * height / 2, 20);
  } else {
    out.write('DDS ', 0, 'ascii');
    out.writeUInt32LE(124, 4);
    out.writeUInt32LE(0xa1007, 8);
    out.writeUInt32LE(height, 12);
    out.writeUInt32LE(width, 16);
    out.writeUInt32LE(width * height / 2, 20);
    out.writeUInt32LE(0, 24);
    out.writeUInt32LE(1, 28);
    out.writeUInt32LE(32, 76);
    out.writeUInt32LE(4, 80);
    out.write('DXT1', 84, 'ascii');
    out.writeUInt32LE(0, 88);
    out.writeUInt32LE(0x1000, 108);
  }

  encodeDXT1BlocksInto(bgraBuffer, width, height, out, 128);
  return out;
}

/**
 * Fast 2-pass separable box blur on BGRA buffer (with optional brightness factor).
 */
function fastBoxBlur(bgra, width, height, radius = 16, darkenFactor = 1.0) {
  const temp = Buffer.alloc(bgra.length);
  const out = Buffer.alloc(bgra.length);
  const windowSize = 2 * radius + 1;

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
      temp[outIdx] = Math.round(bSum / windowSize);
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
      out[outIdx] = Math.round((bSum / windowSize) * darkenFactor);
      out[outIdx + 1] = Math.round((gSum / windowSize) * darkenFactor);
      out[outIdx + 2] = Math.round((rSum / windowSize) * darkenFactor);
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
 * For 1:1 square splash DDS textures, extracts the bottom 16:9 viewport that FS25 displays on screen.
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
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.dds') || lower.includes('.dds.')) {
      const buf = fs.readFileSync(filePath);
      if (buf.length < 128 || buf.toString('ascii', 0, 4) !== 'DDS ') return null;
      const height = buf.readUInt32LE(12);
      const width = buf.readUInt32LE(16);
      const bgra = decodeDXT1(buf, width, height, 128);
      if (width === height && width >= 1024) {
        // FS25 aligns 4096x4096 splash textures to the bottom edge and crops the top on 16:9 screens
        const viewH = Math.round((width * 9) / 16);
        const startY = height - viewH;
        const viewBgra = bgra.subarray(startY * width * 4, height * width * 4);
        img = nativeImage.createFromBitmap(viewBgra, { width, height: viewH });
      } else {
        img = nativeImage.createFromBitmap(bgra, { width, height });
      }
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
 * Helper to apply a 4096x4096 DDS buffer to the requested targets ('both', 'launch', 'menu').
 */
async function writeSplashTargets(sharedDir, ddsBuffer, target = 'both', isDefaultRestore = false) {
  const applyLaunch = target === 'both' || target === 'launch';
  const applyMenu = target === 'both' || target === 'menu';

  if (applyLaunch) {
    const targetSplash = path.join(sharedDir, 'splash.dds');
    await fs.writeFile(targetSplash, ddsBuffer);
  }

  if (applyMenu) {
    // Overwrite all splash_*.dds menu variants (e.g. Highlands Fishing, Beans & Alpacas)
    for (const fileName of getMenuVariantFiles(sharedDir)) {
      const variantTarget = path.join(sharedDir, fileName);
      await fs.writeFile(variantTarget, ddsBuffer);
    }

    // Also update splashBlur.dds for blurred submenu backgrounds
    const targetBlur = path.join(sharedDir, 'splashBlur.dds');
    const origBlur = path.join(sharedDir, 'splashBlur.dds.backup_original');
    if (isDefaultRestore && fs.existsSync(origBlur)) {
      await fs.copyFile(origBlur, targetBlur);
    } else {
      try {
        const height = ddsBuffer.readUInt32LE(12) || 4096;
        const width = ddsBuffer.readUInt32LE(16) || 4096;
        const bgra = decodeDXT1(ddsBuffer, width, height, 128);
        const img = nativeImage.createFromBitmap(bgra, { width, height });
        const smallImg = img.resize({ width: 2048, height: 2048, quality: 'best' });
        const smallBgra = smallImg.toBitmap();
        const blurredBgra = fastBoxBlur(smallBgra, 2048, 2048, 16, 0.73);
        const blurHeader = fs.existsSync(origBlur) ? (await fs.readFile(origBlur)).subarray(0, 128) : null;
        const blurDds = encodeDXT1Single(blurredBgra, 2048, 2048, blurHeader);
        await fs.writeFile(targetBlur, blurDds);
      } catch (bErr) {
        console.warn('[LOADING-SCREEN] Failed to generate blurred splash:', bErr.message);
      }
    }
  }
}

/**
 * Get comprehensive status: active launch screen, active menu screen, official presets, custom gallery.
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

  // Determine the active main menu screen (latest expansion/patch splash_*.dds if present, else splash.dds)
  const menuVariantFiles = getMenuVariantFiles(sharedDir);
  const primaryMenuFile =
    menuVariantFiles.find((f) => f.toLowerCase().includes('beans')) ||
    menuVariantFiles[menuVariantFiles.length - 1] ||
    'splash.dds';
  const activeMenuPath = path.join(sharedDir, primaryMenuFile);
  const activeMenuHash = getFileHash(activeMenuPath);
  const activeMenuPreview = getFilePreviewDataUrl(activeMenuPath, 960);

  const originalBackupPath = path.join(sharedDir, 'splash.dds.backup_original');
  const originalHash = getFileHash(originalBackupPath);

  // 1. Official Presets (always read from .backup_original so presets stay intact when game files are customized)
  const presets = [];
  const defaultPath = fs.existsSync(originalBackupPath)
    ? originalBackupPath
    : path.join(sharedDir, 'splash', 'splash.dds');
  if (fs.existsSync(defaultPath)) {
    const dHash = getFileHash(defaultPath);
    presets.push({
      id: 'default',
      title: 'FS25 Standard',
      description: 'Official Farming Simulator 25 key art',
      filePath: defaultPath,
      hash: dHash,
      preview: getFilePreviewDataUrl(defaultPath, 480),
      isDefault: true,
      isActive: activeHash === dHash,
      isMenuActive: activeMenuHash === dHash,
    });
  }

  for (const v of OFFICIAL_MENU_VARIANTS) {
    const bakPath = path.join(sharedDir, `${v.fileName}.backup_original`);
    const vPath = fs.existsSync(bakPath) ? bakPath : path.join(sharedDir, v.fileName);
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
        isMenuActive: activeMenuHash === vHash,
      });
    }
  }

  // 2. Custom Gallery
  const customScreensDir = getCustomScreensDir();
  const custom = [];
  try {
    const customFiles = await fs.readdir(customScreensDir);
    const ddsFiles = customFiles.filter((f) => f.toLowerCase().endsWith('.dds'));

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
        isMenuActive: activeMenuHash === cHash,
      });
    }
  } catch (e) {}

  const resolveName = (hash, defLabel) => {
    const mp = presets.find((p) => p.hash === hash);
    if (mp) return mp.title;
    const mc = custom.find((c) => c.hash === hash);
    if (mc) return mc.title;
    if (hash === originalHash) return 'FS25 Standard (Default)';
    return defLabel;
  };

  // Check if all menu variants match their original backups
  const isMenuDefault = menuVariantFiles.every((f) => {
    const cur = getFileHash(path.join(sharedDir, f));
    const bak = getFileHash(path.join(sharedDir, `${f}.backup_original`));
    return !bak || cur === bak;
  });

  return {
    available: true,
    sharedDir,
    active: {
      name: resolveName(activeHash, 'Custom Launch Screen'),
      hash: activeHash,
      preview: activePreview,
      isDefault: activeHash === originalHash && isMenuDefault,
      isLaunchDefault: activeHash === originalHash,
      fileSize: fs.existsSync(activeSplashPath) ? fs.statSync(activeSplashPath).size : 0,
      modifiedTime: fs.existsSync(activeSplashPath) ? fs.statSync(activeSplashPath).mtimeMs : 0,
    },
    activeMenu: {
      name: resolveName(activeMenuHash, 'Custom Menu Screen'),
      fileName: primaryMenuFile,
      hash: activeMenuHash,
      preview: activeMenuPreview,
      isDefault: isMenuDefault,
    },
    presets,
    custom,
  };
}

/**
 * Apply a selected preset to Game Launch Screen and/or Main Menu Screen.
 */
async function applyPreset(presetId, target = 'both') {
  const sharedDir = await getGameSharedDir();
  if (!sharedDir) throw new Error('Game directory not found.');

  await ensureOriginalBackup(sharedDir);

  const status = await getStatus();
  const preset = status.presets.find((p) => p.id === presetId);
  if (!preset || !fs.existsSync(preset.filePath)) {
    throw new Error(`Preset "${presetId}" not found.`);
  }

  const ddsBuf = await fs.readFile(preset.filePath);
  await writeSplashTargets(sharedDir, ddsBuf, target, preset.isDefault);

  previewCache.clear();
  return await getStatus();
}

/**
 * Apply a custom user image to Game Launch Screen and/or Main Menu Screen.
 */
async function applyCustomImage(filePath, customName = null, target = 'both') {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Selected image file does not exist.');
  }

  const sharedDir = await getGameSharedDir();
  if (!sharedDir) throw new Error('Game directory not found.');

  await ensureOriginalBackup(sharedDir);

  const customDir = getCustomScreensDir();
  const isAlreadyInCustomDir =
    path.dirname(path.resolve(filePath)).toLowerCase() === path.resolve(customDir).toLowerCase();

  let finalDdsBuffer = null;

  if (isAlreadyInCustomDir && filePath.toLowerCase().endsWith('.dds')) {
    finalDdsBuffer = await fs.readFile(filePath);
  } else {
    const ext = path.extname(filePath).toLowerCase();
    const baseName = customName || path.basename(filePath, ext);
    const cleanId = `custom_${Date.now()}_${baseName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const savedDdsPath = path.join(customDir, `${cleanId}.dds`);
    const savedMetaPath = path.join(customDir, `${cleanId}.json`);

    if (ext === '.dds') {
      const buf = await fs.readFile(filePath);
      if (buf.length < 128 || buf.toString('ascii', 0, 4) !== 'DDS ') {
        throw new Error('Invalid DDS file format.');
      }
      finalDdsBuffer = buf;
    } else {
      const srcImg = nativeImage.createFromPath(filePath);
      if (!srcImg || srcImg.isEmpty()) {
        throw new Error('Unable to decode image file. Please choose a valid JPG, PNG, or DDS.');
      }

      const SIZE = 4096;
      const { width: origW, height: origH } = srcImg.getSize();

      let fgW = SIZE;
      let fgH = Math.max(1, Math.round((SIZE * origH) / origW));
      let fgSrc = srcImg;
      if (fgH > SIZE) {
        const cropH = origW;
        const cropY = Math.max(0, Math.round((origH - cropH) / 2));
        fgSrc = srcImg.crop({ x: 0, y: cropY, width: origW, height: Math.min(cropH, origH) });
        fgH = SIZE;
      }
      const fgBgra = fgSrc.resize({ width: fgW, height: fgH, quality: 'best' }).toBitmap();

      // Use original stock splash as the top background canvas (if available), otherwise blurred image
      const origBackup = path.join(sharedDir, 'splash.dds.backup_original');
      let splashBgra = null;
      let templateHeader = null;
      if (fs.existsSync(origBackup)) {
        try {
          const origBuf = await fs.readFile(origBackup);
          templateHeader = origBuf.subarray(0, 128);
          splashBgra = decodeDXT1(origBuf, SIZE, SIZE, 128);
        } catch (_) {}
      }
      if (!splashBgra) {
        const side = Math.min(origW, origH);
        const bgCrop = srcImg.crop({
          x: Math.round((origW - side) / 2),
          y: Math.round((origH - side) / 2),
          width: side,
          height: side,
        });
        const bgSmall = bgCrop.resize({ width: 256, height: 256, quality: 'good' }).toBitmap();
        const bgBlur = fastBoxBlur(bgSmall, 256, 256, 8);
        splashBgra = nativeImage
          .createFromBitmap(bgBlur, { width: 256, height: 256 })
          .resize({ width: SIZE, height: SIZE, quality: 'best' })
          .toBitmap();
      }

      fgBgra.copy(splashBgra, (SIZE - fgH) * SIZE * 4);
      finalDdsBuffer = encodeDXT1Single(splashBgra, SIZE, SIZE, templateHeader);
    }

    await fs.writeFile(savedDdsPath, finalDdsBuffer);
    await fs.writeJson(savedMetaPath, {
      id: cleanId,
      name: baseName,
      createdAt: Date.now(),
      originalFile: filePath,
    });
  }

  await writeSplashTargets(sharedDir, finalDdsBuffer, target, false);

  previewCache.clear();
  return await getStatus();
}

/**
 * Restore game original stock launch and main menu screens.
 */
async function restoreDefault(target = 'both') {
  const sharedDir = await getGameSharedDir();
  if (!sharedDir) throw new Error('Game directory not found.');

  const restoreLaunch = target === 'both' || target === 'launch';
  const restoreMenu = target === 'both' || target === 'menu';

  if (restoreLaunch) {
    const origBackup = path.join(sharedDir, 'splash.dds.backup_original');
    const stockSplash = path.join(sharedDir, 'splash', 'splash.dds');
    const sourceToRestore = fs.existsSync(origBackup) ? origBackup : stockSplash;
    if (fs.existsSync(sourceToRestore)) {
      await fs.copyFile(sourceToRestore, path.join(sharedDir, 'splash.dds'));
    }
  }

  if (restoreMenu) {
    for (const fileName of getMenuVariantFiles(sharedDir)) {
      const bakPath = path.join(sharedDir, `${fileName}.backup_original`);
      const targetPath = path.join(sharedDir, fileName);
      if (fs.existsSync(bakPath)) {
        await fs.copyFile(bakPath, targetPath);
      }
    }
    const origBlur = path.join(sharedDir, 'splashBlur.dds.backup_original');
    const targetBlur = path.join(sharedDir, 'splashBlur.dds');
    if (fs.existsSync(origBlur)) {
      await fs.copyFile(origBlur, targetBlur);
    }
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
