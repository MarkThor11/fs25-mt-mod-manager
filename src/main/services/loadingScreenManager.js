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
 * Locate the FS25 'data' directory (contains maps/).
 */
async function getGameDataDir() {
  const shared = await getGameSharedDir();
  if (shared) {
    const dataCandidate = path.join(shared, '..', 'data');
    if (fs.existsSync(dataCandidate) && fs.existsSync(path.join(dataCandidate, 'maps'))) {
      return dataCandidate;
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
 * Ensure clean backups of original map loading screens exist.
 */
async function ensureMapBackups(dataDir) {
  if (!dataDir) return;
  const maps = [
    { id: 'mapUS', rel: path.join('maps', 'mapUS', 'textures', 'ui', 'preview.dds') },
    { id: 'mapEU', rel: path.join('maps', 'mapEU', 'textures', 'ui', 'preview.dds') },
    { id: 'mapAS', rel: path.join('maps', 'mapAS', 'textures', 'ui', 'preview.dds') },
  ];

  for (const m of maps) {
    const fullPath = path.join(dataDir, m.rel);
    const backupPath = fullPath + '.backup_original';
    if (fs.existsSync(fullPath) && !fs.existsSync(backupPath)) {
      try {
        await fs.copyFile(fullPath, backupPath);
        console.log(`[LOADING-SCREEN] Created original backup for ${m.id}`);
      } catch (e) {
        console.warn(`[LOADING-SCREEN] Failed to backup map ${m.id}:`, e.message);
      }
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
 * Encode 4x4 DXT1 blocks directly into a destination buffer.
 */
function encodeDXT1BlocksInto(bgra, width, height, out, initialOffset) {
  const rgbTo565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
  const decode565 = (c) => {
    const r = (c >> 11) & 0x1f;
    const g = (c >> 5) & 0x3f;
    const b = c & 0x1f;
    return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
  };

  let outOffset = initialOffset;
  const blockPixels = new Uint8Array(48);

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
          const b = bgra[idx];
          const g = bgra[idx + 1];
          const r = bgra[idx + 2];
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
}

/**
 * 2x downsampling helper for mipmaps.
 */
function downsample2x(bgra, width, height) {
  const newW = width >> 1;
  const newH = height >> 1;
  const out = Buffer.alloc(newW * newH * 4);
  for (let y = 0; y < newH; y++) {
    const srcY = y * 2;
    for (let x = 0; x < newW; x++) {
      const srcX = x * 2;
      const i00 = (srcY * width + srcX) * 4;
      const i01 = (srcY * width + (srcX + 1)) * 4;
      const i10 = ((srcY + 1) * width + srcX) * 4;
      const i11 = ((srcY + 1) * width + (srcX + 1)) * 4;

      const outIdx = (y * newW + x) * 4;
      out[outIdx]     = (bgra[i00] + bgra[i01] + bgra[i10] + bgra[i11]) >> 2;
      out[outIdx + 1] = (bgra[i00 + 1] + bgra[i01 + 1] + bgra[i10 + 1] + bgra[i11 + 1]) >> 2;
      out[outIdx + 2] = (bgra[i00 + 2] + bgra[i01 + 2] + bgra[i10 + 2] + bgra[i11 + 2]) >> 2;
      out[outIdx + 3] = 255;
    }
  }
  return out;
}

/**
 * Encode a 4096x4096 BGRA buffer into single-mipmap DXT1 DDS format for splash.dds.
 */
function encodeDXT1Single(bgraBuffer, width, height) {
  const ddsSize = 128 + (width * height / 2);
  const out = Buffer.alloc(ddsSize);

  out.write('DDS ', 0, 'ascii');
  out.writeUInt32LE(124, 4);
  out.writeUInt32LE(0x81007, 8);
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

  encodeDXT1BlocksInto(bgraBuffer, width, height, out, 128);
  return out;
}

/**
 * Encode a 2048x2048 BGRA buffer into 3-mipmap DXT1 DDS format matching FS25 preview.dds (2,752,640 bytes).
 */
function encodeMapPreviewDDS(bgra2048) {
  const ddsSize = 128 + 2097152 + 524288 + 131072; // exactly 2752640 bytes
  const out = Buffer.alloc(ddsSize);

  // Header (128 bytes)
  out.write('DDS ', 0, 'ascii');
  out.writeUInt32LE(124, 4); // dwSize
  out.writeUInt32LE(0xa1007, 8); // dwFlags (DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_LINEARSIZE | DDSD_MIPMAPCOUNT)
  out.writeUInt32LE(2048, 12); // dwHeight
  out.writeUInt32LE(2048, 16); // dwWidth
  out.writeUInt32LE(2097152, 20); // dwPitchOrLinearSize (level 0 linear size)
  out.writeUInt32LE(0, 24); // dwDepth
  out.writeUInt32LE(3, 28); // dwMipMapCount (3 levels)
  out.writeUInt32LE(32, 76); // ddspf.dwSize
  out.writeUInt32LE(4, 80); // ddspf.dwFlags (DDPF_FOURCC)
  out.write('DXT1', 84, 'ascii');
  out.writeUInt32LE(0, 88); // ddspf.dwRGBBitCount
  out.writeUInt32LE(0x401000, 108); // dwCaps

  // Level 0: 2048x2048
  encodeDXT1BlocksInto(bgra2048, 2048, 2048, out, 128);

  // Level 1: 1024x1024
  const bgra1024 = downsample2x(bgra2048, 2048, 2048);
  encodeDXT1BlocksInto(bgra1024, 1024, 1024, out, 128 + 2097152);

  // Level 2: 512x512
  const bgra512 = downsample2x(bgra1024, 1024, 1024);
  encodeDXT1BlocksInto(bgra512, 512, 512, out, 128 + 2097152 + 524288);

  return out;
}

/**
 * Fast 2-pass separable box blur on BGRA buffer.
 */
function fastBoxBlur(bgra, width, height, radius = 16) {
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
 * Get map loading screens for basegame maps and any installed mod maps.
 */
async function getMapLoadingScreensStatus() {
  const dataDir = await getGameDataDir();
  if (!dataDir) {
    return { available: false, error: 'Game data directory not found.' };
  }

  await ensureMapBackups(dataDir);

  const baseMaps = [
    {
      id: 'mapUS',
      title: 'Riverbend Springs',
      region: 'North America (US Pacific Northwest)',
      relPath: path.join('maps', 'mapUS', 'textures', 'ui', 'preview.dds'),
    },
    {
      id: 'mapEU',
      title: 'Zielonka',
      region: 'Central Europe',
      relPath: path.join('maps', 'mapEU', 'textures', 'ui', 'preview.dds'),
    },
    {
      id: 'mapAS',
      title: 'Hutan Pantai',
      region: 'East Asia',
      relPath: path.join('maps', 'mapAS', 'textures', 'ui', 'preview.dds'),
    },
  ];

  const mapsList = [];

  for (const b of baseMaps) {
    const fullPath = path.join(dataDir, b.relPath);
    const backupPath = fullPath + '.backup_original';
    const exists = fs.existsSync(fullPath);
    const hasBackup = fs.existsSync(backupPath);

    let isOriginal = true;
    if (exists && hasBackup) {
      const h1 = getFileHash(fullPath);
      const h2 = getFileHash(backupPath);
      isOriginal = h1 === h2;
    }

    mapsList.push({
      id: b.id,
      title: b.title,
      region: b.region,
      filePath: fullPath,
      exists,
      isOriginal,
      preview: exists ? getFilePreviewDataUrl(fullPath, 640) : null,
      isMod: false,
    });
  }

  // Scan installed mod maps from mods folder
  try {
    const modsPath = pathProvider.getDefaultModsPath();
    if (fs.existsSync(modsPath)) {
      const AdmZip = require('adm-zip');
      const files = await fs.readdir(modsPath);
      for (const f of files) {
        if (f.toLowerCase().endsWith('.zip')) {
          const zipPath = path.join(modsPath, f);
          try {
            const zip = new AdmZip(zipPath);
            const modDescEntry = zip.getEntry('modDesc.xml');
            if (modDescEntry) {
              const xmlContent = modDescEntry.getData().toString('utf8');
              if (xmlContent.includes('<map ') || xmlContent.includes('<maps>')) {
                const titleMatch = xmlContent.match(/<title>[\s\S]*?<en>([^<]+)<\/en>/i) || xmlContent.match(/<title>([^<]+)<\/title>/i);
                const mapTitle = titleMatch ? titleMatch[1].trim() : f.replace(/\.zip$/i, '');
                
                // Find preview image inside zip
                const previewEntry = zip.getEntries().find(e => 
                  e.entryName.toLowerCase().endsWith('preview.png') || 
                  e.entryName.toLowerCase().endsWith('preview.dds')
                );

                let previewDataUrl = null;
                if (previewEntry) {
                  const imgBuf = previewEntry.getData();
                  if (previewEntry.entryName.toLowerCase().endsWith('.dds')) {
                    const h = imgBuf.readUInt32LE(12);
                    const w = imgBuf.readUInt32LE(16);
                    const bgra = decodeDXT1(imgBuf, w, h, 128);
                    const img = nativeImage.createFromBitmap(bgra, { width: w, height: h });
                    previewDataUrl = img.resize({ width: 640, height: 360, quality: 'good' }).toDataURL();
                  } else {
                    const img = nativeImage.createFromBuffer(imgBuf);
                    previewDataUrl = img.resize({ width: 640, height: 360, quality: 'good' }).toDataURL();
                  }
                }

                mapsList.push({
                  id: `mod:${f}`,
                  title: mapTitle,
                  region: 'Custom Mod Map',
                  filePath: zipPath,
                  exists: true,
                  isOriginal: !fs.existsSync(zipPath + '.orig_loadscreen_backup'),
                  preview: previewDataUrl,
                  isMod: true,
                  fileName: f,
                });
              }
            }
          } catch (_) {}
        }
      }
    }
  } catch (mErr) {
    console.warn('[LOADING-SCREEN] Error scanning mod maps:', mErr.message);
  }

  return {
    available: true,
    maps: mapsList,
  };
}

/**
 * Apply a custom loading screen to one or all maps.
 */
async function applyMapLoadingScreen(options = {}) {
  const { mapId, filePath, customName, applyToAll = false } = options;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Image file not found.');
  }

  const dataDir = await getGameDataDir();
  if (!dataDir) throw new Error('Game data directory not found.');

  await ensureMapBackups(dataDir);

  // Convert source image to 2048x2048 DXT1 with 3 mip levels
  const ext = path.extname(filePath).toLowerCase();
  let bgra2048 = null;

  if (ext === '.dds') {
    const ddsBuf = await fs.readFile(filePath);
    if (ddsBuf.length < 128 || ddsBuf.toString('ascii', 0, 4) !== 'DDS ') {
      throw new Error('Invalid DDS file.');
    }
    const origH = ddsBuf.readUInt32LE(12);
    const origW = ddsBuf.readUInt32LE(16);
    const decodedBgra = decodeDXT1(ddsBuf, origW, origH, 128);
    const img = nativeImage.createFromBitmap(decodedBgra, { width: origW, height: origH });
    const resized = img.resize({ width: 2048, height: 2048, quality: 'best' });
    bgra2048 = resized.toBitmap();
  } else {
    const srcImg = nativeImage.createFromPath(filePath);
    if (!srcImg || srcImg.isEmpty()) {
      throw new Error('Unable to decode image. Please choose a valid JPG, PNG, or DDS.');
    }
    const { width: origW, height: origH } = srcImg.getSize();
    const targetAspect = 16 / 9;
    const currentAspect = origW / origH;

    let croppedImg = srcImg;
    if (Math.abs(currentAspect - targetAspect) > 0.02) {
      if (currentAspect > targetAspect) {
        const cropW = Math.round(origH * targetAspect);
        const cropX = Math.round((origW - cropW) / 2);
        croppedImg = srcImg.crop({ x: cropX, y: 0, width: cropW, height: origH });
      } else {
        const cropH = Math.round(origW / targetAspect);
        const cropY = Math.round((origH - cropH) / 2);
        croppedImg = srcImg.crop({ x: 0, y: cropY, width: origW, height: cropH });
      }
    }
    const resized = croppedImg.resize({ width: 2048, height: 2048, quality: 'best' });
    bgra2048 = resized.toBitmap();
  }

  // Generate 3-mipmap 2048x2048 DDS buffer
  const finalMapDdsBuffer = encodeMapPreviewDDS(bgra2048);

  // Save copy into custom screens gallery
  const baseName = customName || path.basename(filePath, ext);
  const cleanId = `mapload_${Date.now()}_${baseName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const customDir = getCustomScreensDir();
  const savedDdsPath = path.join(customDir, `${cleanId}.dds`);
  const savedMetaPath = path.join(customDir, `${cleanId}.json`);

  await fs.writeFile(savedDdsPath, finalMapDdsBuffer);
  await fs.writeJson(savedMetaPath, {
    id: cleanId,
    name: baseName,
    createdAt: Date.now(),
    type: 'map_loading_screen',
  });

  const baseMaps = [
    { id: 'mapUS', rel: path.join('maps', 'mapUS', 'textures', 'ui', 'preview.dds') },
    { id: 'mapEU', rel: path.join('maps', 'mapEU', 'textures', 'ui', 'preview.dds') },
    { id: 'mapAS', rel: path.join('maps', 'mapAS', 'textures', 'ui', 'preview.dds') },
  ];

  if (applyToAll) {
    // Apply to all 3 basegame maps
    for (const b of baseMaps) {
      const target = path.join(dataDir, b.rel);
      await fs.writeFile(target, finalMapDdsBuffer);
    }
  } else {
    // Apply to specific map
    if (mapId && mapId.startsWith('mod:')) {
      // Mod Map handling
      const zipName = mapId.replace(/^mod:/, '');
      const modsPath = pathProvider.getDefaultModsPath();
      const zipPath = path.join(modsPath, zipName);
      if (fs.existsSync(zipPath)) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipPath);
        // Backup zip if not backed up
        const zipBackup = zipPath + '.orig_loadscreen_backup';
        if (!fs.existsSync(zipBackup)) {
          await fs.copyFile(zipPath, zipBackup);
        }
        // Check for preview entry in zip
        const existingEntry = zip.getEntries().find(e => 
          e.entryName.toLowerCase().endsWith('preview.dds') || 
          e.entryName.toLowerCase().endsWith('preview.png')
        );
        const targetEntryName = existingEntry ? existingEntry.entryName : 'preview.dds';
        zip.addFile(targetEntryName, finalMapDdsBuffer);
        zip.writeZip(zipPath);
      }
    } else {
      const matched = baseMaps.find(b => b.id === mapId) || baseMaps[0];
      const target = path.join(dataDir, matched.rel);
      await fs.writeFile(target, finalMapDdsBuffer);
    }
  }

  previewCache.clear();
  return await getStatus();
}

/**
 * Restore original map loading screen.
 */
async function restoreMapLoadingScreen(options = {}) {
  const { mapId, restoreAll = false } = options;
  const dataDir = await getGameDataDir();
  if (!dataDir) throw new Error('Game data directory not found.');

  const baseMaps = [
    { id: 'mapUS', rel: path.join('maps', 'mapUS', 'textures', 'ui', 'preview.dds') },
    { id: 'mapEU', rel: path.join('maps', 'mapEU', 'textures', 'ui', 'preview.dds') },
    { id: 'mapAS', rel: path.join('maps', 'mapAS', 'textures', 'ui', 'preview.dds') },
  ];

  if (restoreAll) {
    for (const b of baseMaps) {
      const full = path.join(dataDir, b.rel);
      const backup = full + '.backup_original';
      if (fs.existsSync(backup)) {
        await fs.copyFile(backup, full);
      }
    }
  } else if (mapId && mapId.startsWith('mod:')) {
    const zipName = mapId.replace(/^mod:/, '');
    const modsPath = pathProvider.getDefaultModsPath();
    const zipPath = path.join(modsPath, zipName);
    const zipBackup = zipPath + '.orig_loadscreen_backup';
    if (fs.existsSync(zipBackup)) {
      await fs.copyFile(zipBackup, zipPath);
      await fs.remove(zipBackup);
    }
  } else {
    const matched = baseMaps.find(b => b.id === mapId);
    if (matched) {
      const full = path.join(dataDir, matched.rel);
      const backup = full + '.backup_original';
      if (fs.existsSync(backup)) {
        await fs.copyFile(backup, full);
      }
    }
  }

  previewCache.clear();
  return await getStatus();
}

/**
 * Get comprehensive status: active loading screen, official presets, custom gallery, and map loading screens.
 */
async function getStatus() {
  const sharedDir = await getGameSharedDir();
  const dataDir = await getGameDataDir();

  if (!sharedDir) {
    return {
      available: false,
      error: 'Farming Simulator 25 installation folder could not be detected. Please set your Game Path in Settings.',
    };
  }

  await ensureOriginalBackup(sharedDir);
  await ensureMapBackups(dataDir);

  const activeSplashPath = path.join(sharedDir, 'splash.dds');
  const activeHash = getFileHash(activeSplashPath);
  const activePreview = getFilePreviewDataUrl(activeSplashPath, 960);

  const originalBackupPath = path.join(sharedDir, 'splash.dds.backup_original');
  const originalHash = getFileHash(originalBackupPath);

  // 1. Presets for Main Menu
  const presets = [];
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

  // 2. Custom Gallery
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
  } catch (e) {}

  // 3. Map Loading Screens Status
  const mapScreensStatus = await getMapLoadingScreensStatus();

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
    dataDir,
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
    mapScreens: mapScreensStatus?.maps || [],
  };
}

/**
 * Apply a selected preset to Main Menu splash screen.
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

  await fs.copyFile(preset.filePath, targetSplash);

  if (preset.isDefault) {
    const origBlur = path.join(sharedDir, 'splashBlur.dds.backup_original');
    if (fs.existsSync(origBlur)) {
      await fs.copyFile(origBlur, targetBlur);
    }
  } else {
    try {
      const splashBuf = await fs.readFile(targetSplash);
      const bgra = decodeDXT1(splashBuf, 4096, 4096, 128);
      const img = nativeImage.createFromBitmap(bgra, { width: 4096, height: 4096 });
      const smallImg = img.resize({ width: 2048, height: 2048, quality: 'best' });
      const smallBgra = smallImg.toBitmap();
      const blurredBgra = fastBoxBlur(smallBgra, 2048, 2048, 16);
      const blurDds = encodeDXT1Single(blurredBgra, 2048, 2048);
      await fs.writeFile(targetBlur, blurDds);
    } catch (bErr) {
      console.warn('[LOADING-SCREEN] Failed to generate blurred splash for preset:', bErr.message);
    }
  }

  previewCache.clear();
  return await getStatus();
}

/**
 * Apply a custom user image to the Main Menu splash screen.
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
    const buf = await fs.readFile(filePath);
    if (buf.length < 128 || buf.toString('ascii', 0, 4) !== 'DDS ') {
      throw new Error('Invalid DDS file format.');
    }
    await fs.writeFile(savedDdsPath, buf);
    await fs.copyFile(savedDdsPath, targetSplash);

    try {
      const height = buf.readUInt32LE(12) || 4096;
      const width = buf.readUInt32LE(16) || 4096;
      const bgra = decodeDXT1(buf, width, height, 128);
      const img = nativeImage.createFromBitmap(bgra, { width, height });
      const smallImg = img.resize({ width: 2048, height: 2048, quality: 'best' });
      const smallBgra = smallImg.toBitmap();
      const blurredBgra = fastBoxBlur(smallBgra, 2048, 2048, 16);
      const blurDds = encodeDXT1Single(blurredBgra, 2048, 2048);
      await fs.writeFile(targetBlur, blurDds);
    } catch (e) {
      console.warn('[LOADING-SCREEN] Blur generation skipped for raw DDS:', e.message);
    }
  } else {
    const srcImg = nativeImage.createFromPath(filePath);
    if (!srcImg || srcImg.isEmpty()) {
      throw new Error('Unable to decode image file. Please choose a valid JPG, PNG, or DDS.');
    }

    const { width: origW, height: origH } = srcImg.getSize();
    const targetAspect = 16 / 9;
    const currentAspect = origW / origH;

    let croppedImg = srcImg;
    if (Math.abs(currentAspect - targetAspect) > 0.02) {
      if (currentAspect > targetAspect) {
        const cropW = Math.round(origH * targetAspect);
        const cropX = Math.round((origW - cropW) / 2);
        croppedImg = srcImg.crop({ x: cropX, y: 0, width: cropW, height: origH });
      } else {
        const cropH = Math.round(origW / targetAspect);
        const cropY = Math.round((origH - cropH) / 2);
        croppedImg = srcImg.crop({ x: 0, y: cropY, width: origW, height: cropH });
      }
    }

    const splashImg = croppedImg.resize({ width: 4096, height: 4096, quality: 'best' });
    const splashBgra = splashImg.toBitmap();
    const splashDds = encodeDXT1Single(splashBgra, 4096, 4096);

    await fs.writeFile(savedDdsPath, splashDds);
    await fs.writeFile(targetSplash, splashDds);

    const blurImg = croppedImg.resize({ width: 2048, height: 2048, quality: 'best' });
    const blurBgra = blurImg.toBitmap();
    const blurredBgra = fastBoxBlur(blurBgra, 2048, 2048, 16);
    const blurDds = encodeDXT1Single(blurredBgra, 2048, 2048);
    await fs.writeFile(targetBlur, blurDds);
  }

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
  getGameDataDir,
  getCustomScreensDir,
  getStatus,
  applyPreset,
  applyCustomImage,
  restoreDefault,
  deleteCustomScreen,
  getMapLoadingScreensStatus,
  applyMapLoadingScreen,
  restoreMapLoadingScreen,
};
