const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs-extra');
const pathProvider = require('./pathProvider');

let db = null;

function getDbPath() {
  const userDataPath = (app && app.getPath) ? app.getPath('userData') : path.join(process.env.APPDATA, 'fs25-mt-mod-manager');
  return path.join(userDataPath, 'modhub-cache.db');
}

function debugLog(msg) {
  try {
    const userDataPath = (app && app.getPath) ? app.getPath('userData') : path.join(process.env.APPDATA, 'fs25-mt-mod-manager');
    const logPath = path.join(userDataPath, 'detection_log.txt');
    fs.appendFile(logPath, `[${new Date().toISOString()}] [CACHE] ${msg}\n`, 'utf8', () => {});
  } catch (e) {}
}

function openDatabase(dbPath) {
  try {
    return new Database(dbPath);
  } catch (err) {
    console.error('[DB] Database open error:', err);
    if (err.message && (err.message.includes('malformed') || err.message.includes('corrupt') || err.code === 'SQLITE_CORRUPT')) {
      console.warn('[DB] Database file corrupted. Backing up and recreating fresh DB...');
      try {
        if (fs.existsSync(dbPath)) fs.renameSync(dbPath, `${dbPath}.corrupted.${Date.now()}`);
      } catch (_) {}
      return new Database(dbPath);
    }
    throw err;
  }
}

function init() {
  try {
    const dbPath = getDbPath();
    fs.ensureDirSync(path.dirname(dbPath));
    
    db = openDatabase(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = MEMORY');
    db.pragma('cache_size = -32000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mod_tracking (
      mod_id TEXT PRIMARY KEY,
      local_file_name TEXT,
      local_version TEXT,
      remote_version TEXT,
      last_checked INTEGER
    );

    CREATE TABLE IF NOT EXISTS local_mod_cache (
      file_path TEXT PRIMARY KEY,
      mtime INTEGER,
      size INTEGER,
      json_data TEXT
    );

    CREATE TABLE IF NOT EXISTS image_cache (
      url TEXT PRIMARY KEY,
      base64 TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_downloads (
      mod_id TEXT PRIMARY KEY,
      mod_title TEXT NOT NULL,
      download_url TEXT NOT NULL,
      target_dir TEXT NOT NULL,
      file_name TEXT,
      total_bytes INTEGER,
      received_bytes INTEGER,
      category TEXT,
      tech_data TEXT,
      created_at INTEGER
    );
  `);
  
  // ── MIGRATIONS ──
  const migrations = [
    { table: 'mod_tracking', column: 'modhub_title', type: 'TEXT' },
    { table: 'mod_tracking', column: 'category', type: 'TEXT' },
    { table: 'mod_tracking', column: 'custom_category', type: 'TEXT' },
    { table: 'mod_tracking', column: 'tags', type: 'TEXT' },
    { table: 'mod_tracking', column: 'hp', type: 'INTEGER' },
    { table: 'mod_tracking', column: 'price', type: 'INTEGER' },
    { table: 'mod_tracking', column: 'technical_data', type: 'TEXT' },
    { table: 'local_mod_cache', column: 'icon_base64', type: 'TEXT' },
    { table: 'local_mod_cache', column: 'file_hash', type: 'TEXT' },
    { table: 'local_mod_cache', column: 'tags', type: 'TEXT' },
    { table: 'local_mod_cache', column: 'store_base64', type: 'TEXT' }
  ];

  for (const m of migrations) {
    try {
      db.prepare(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`).run();
      console.log(`[DB] Added column ${m.column} to ${m.table}`);
    } catch (e) {
      // Ignore "duplicate column" error
    }
  }

  // Set defaults
  const defaults = {
    modsPath: pathProvider.getDefaultModsPath(),
    gamePath: '',
    theme: 'glass-ocean',
    autoCheckUpdates: 'true',
    launchPreference: 'default',
    appFullscreen: 'true',
    lastUpdateCheck: '0',
    lastGlobalWarming: '0',
    backupRetention: '1w',
    autoResolveDependencies: 'false',
    autoOptimize: 'true',
  };

  const insertDefault = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

  for (const [key, value] of Object.entries(defaults)) {
    insertDefault.run(key, value);
  }

  // Enforce autoResolveDependencies to false
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('false', 'autoResolveDependencies');

  // ── STARTUP OPTIMIZATION ──
  // We used to purge 'Latest' here, but we'll now rely on TTL to keep things fresh 
  // without forcing a slow reload on every single startup.
  // db.prepare("DELETE FROM cache WHERE key LIKE 'mods_latest_%'").run();

  // One-time purge for cache structural changes (v1.2.0 — keybind extraction)
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('cacheVersion');
    if (!row || row.value !== 'v1.2.0') {
      db.prepare('DELETE FROM local_mod_cache').run();
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('cacheVersion', 'v1.2.0');
      debugLog('Performed cache purge for keybind extraction (v1.2.0).');
      console.log('[CACHE] Purged local_mod_cache for v1.2.0 keybind extraction.');
    }
  } catch (e) {
    debugLog('One-time purge check failed: ' + e.message);
  }

  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    db = null;
  }
}

function getDefaultModsPath() {
  return pathProvider.getDefaultModsPath();
}

// ── Cache operations ──
function get(key) {
  if (!db) return null;
  const row = db.prepare('SELECT value, expires_at FROM cache WHERE key = ?').get(key);
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM cache WHERE key = ?').run(key);
    return null;
  }
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function set(key, value, ttlMs = 24 * 60 * 60 * 1000) {
  if (!db) return;
  const now = Date.now();
  db.prepare(
    'INSERT OR REPLACE INTO cache (key, value, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(key, JSON.stringify(value), now + ttlMs, now);
}

function clearAll() {
  if (!db) return;
  db.prepare('DELETE FROM cache').run();
  db.prepare('DELETE FROM image_cache').run();
}
  
let cachedBundledData = null;

function getModHubMetadataPool() {
  if (!db) return {};
  const pool = {};
  const poolByCleanTitle = {};

  const addToPool = (rawKey, item) => {
    if (!rawKey || !item) return;
    const strKey = String(rawKey).trim();
    if (!strKey) return;
    if (!pool[strKey]) pool[strKey] = item;
    
    // Numeric ID variants (raw, stripped of leading zeroes, padded to 8 digits)
    if (/^\d+$/.test(strKey)) {
      const cleanId = strKey.replace(/^0+/, '');
      if (cleanId) {
        const paddedId = cleanId.padStart(8, '0');
        if (!pool[cleanId]) pool[cleanId] = item;
        if (!pool[paddedId]) pool[paddedId] = item;
        if (!pool[`id_${cleanId}`]) pool[`id_${cleanId}`] = item;
        if (!pool[`id_${paddedId}`]) pool[`id_${paddedId}`] = item;
      }
    }
  };

  const addFilenameToPool = (filename, item) => {
    if (!filename || !item) return;
    const base = path.basename(filename).toLowerCase();
    const noZip = base.replace(/\.zip$/i, '');
    const noPrefix = noZip.replace(/^(?:fs25|fs22|pdlc)_/i, '');
    const cleanAlphanum = noPrefix.replace(/[^a-z0-9]/g, '');

    addToPool(base, item);
    addToPool(noZip, item);
    addToPool(noPrefix, item);
    if (cleanAlphanum) addToPool(cleanAlphanum, item);
    addToPool(`file_${base}`, item);
    addToPool(`file_${noZip}`, item);
  };

  const addToTitleIndex = (item) => {
    if (!item) return;
    const title = item.title || item.modhub_title || item.name;
    if (title) {
      const cleanTitle = title.replace(/\s+/g, '').replace(/_/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanTitle) {
        if (!poolByCleanTitle[cleanTitle]) poolByCleanTitle[cleanTitle] = item;
        addToPool(cleanTitle, item);
        addToPool(`title_${cleanTitle}`, item);
      }
      const rawTitleLower = title.toLowerCase().trim();
      if (rawTitleLower) {
        addToPool(rawTitleLower, item);
      }
    }
  };

  try {
    // 1. Scan scraper cache for all ever-browsed mods
    const rows = db.prepare("SELECT key, value FROM cache WHERE key LIKE 'mods_%' OR key LIKE 'modDetail_%'").all();
    const now = Date.now();
    for (const row of rows) {
      try {
        const data = JSON.parse(row.value);
        if (row.key.startsWith('modDetail_')) {
          if (data && data.modId) {
            const item = { ...data, timestamp: now };
            addToPool(data.modId, item);
            if (data.fileName) addFilenameToPool(data.fileName, item);
            if (data.downloadUrl) addFilenameToPool(data.downloadUrl, item);
            addToTitleIndex(item);
          }
        } else if (data && Array.isArray(data.mods)) {
          for (const m of data.mods) {
            if (m.modId) {
              const item = { ...m, timestamp: now };
              addToPool(m.modId, item);
              if (m.fileName) addFilenameToPool(m.fileName, item);
              addToTitleIndex(item);
            }
          }
        }
      } catch (e) {}
    }

    // 2. Scan mod_tracking for local-to-remote links (fixes ID-less library mods)
    const tracks = db.prepare("SELECT mod_id, local_file_name, local_version, modhub_title, category, hp, price, technical_data FROM mod_tracking").all();
    for (const t of tracks) {
      if (!t.mod_id && !t.local_file_name) continue;
      let techData = null;
      try { techData = t.technical_data ? JSON.parse(t.technical_data) : null; } catch (e) {}

      const item = { 
        modId: t.mod_id ? String(t.mod_id).replace(/^0+/, '') : null, 
        rawModId: t.mod_id,
        title: t.modhub_title, 
        category: t.category, 
        fileName: t.local_file_name, 
        version: t.local_version,
        techData: techData || (t.hp ? { hp: t.hp, price: t.price } : null),
        timestamp: now 
      };

      if (t.mod_id) addToPool(t.mod_id, item);
      if (t.local_file_name) addFilenameToPool(t.local_file_name, item);
      addToTitleIndex(item);
    }

  } catch (err) {
    console.error('[CACHE] Metadata pool scan failed:', err.message);
  }

  // 3. Fallback: merge bundled_cache.json (memoized in memory)
  try {
    if (!cachedBundledData) {
      const fs = require('fs-extra');
      const bundledPath = path.join(app.getAppPath(), 'src/main/resources/bundled_cache.json');
      if (fs.existsSync(bundledPath)) {
        cachedBundledData = fs.readJsonSync(bundledPath);
      } else {
        cachedBundledData = {};
      }
    }
    for (const [k, v] of Object.entries(cachedBundledData)) {
      if (v) {
        addToPool(k, v);
        if (v.modId) addToPool(v.modId, v);
        if (v.fileName) addFilenameToPool(v.fileName, v);
        addToTitleIndex(v);
      }
    }
  } catch (err) {
    // Ignore if not present
  }

  pool._byCleanTitle = poolByCleanTitle;
  return pool;
}

// ── Settings operations ──
function getSetting(key) {
  if (!db) return null;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  if (!db) return;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function getAllSettings() {
  if (!db) return {};
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ── Mod tracking ──
function getAllModTrackingMap() {
  if (!db) return new Map();
  const rows = db.prepare('SELECT * FROM mod_tracking').all();
  const map = new Map();
  for (const r of rows) {
    if (r.mod_id) map.set(`ID_${r.mod_id}`, r);
    if (r.local_file_name) {
      const clean = r.local_file_name.replace(/\\/g, '/');
      const base = clean.split('/').pop().toLowerCase();
      map.set(`FILE_${clean.toLowerCase()}`, r);
      map.set(`FILE_${base}`, r);
    }
  }
  return map;
}

function getModTracking(modId) {
  if (!db) return null;
  return db.prepare('SELECT * FROM mod_tracking WHERE mod_id = ?').get(modId);
}

function setModTracking(modId, data) {
  if (!db) return;
  try {
    db.prepare(`
      INSERT INTO mod_tracking (
        mod_id, local_file_name, local_version, remote_version, 
        last_checked, modhub_title, category, hp, price, technical_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mod_id) DO UPDATE SET
        local_file_name = COALESCE(excluded.local_file_name, local_file_name),
        local_version = COALESCE(excluded.local_version, local_version),
        remote_version = COALESCE(excluded.remote_version, remote_version),
        last_checked = excluded.last_checked,
        modhub_title = COALESCE(excluded.modhub_title, modhub_title),
        hp = COALESCE(excluded.hp, hp),
        price = COALESCE(excluded.price, price),
        technical_data = COALESCE(excluded.technical_data, technical_data),
        category = CASE 
          WHEN excluded.category IS NOT NULL AND excluded.category != '' AND LOWER(excluded.category) != 'unknown' THEN excluded.category 
          ELSE category 
        END
    `).run(
      modId, 
      data.localFileName || null, 
      data.localVersion || null, 
      data.remoteVersion || null, 
      Date.now(), 
      data.modhubTitle || null, 
      data.category || null,
      data.techData?.hp || null,
      data.techData?.price || null,
      data.techData ? JSON.stringify(data.techData) : null
    );
  } catch (e) {
    console.error('[CACHE] setModTracking error:', e.message);
  }
}

function removeModTracking(modId) {
  if (!db) return;
  try {
    db.prepare('DELETE FROM mod_tracking WHERE mod_id = ?').run(modId);
  } catch (e) {}
}

function removeModTrackingByFile(identifier) {
  if (!db) return;
  try {
    db.prepare(`
      DELETE FROM mod_tracking WHERE mod_id = ? OR LOWER(local_file_name) = LOWER(?)
    `).run(identifier, String(identifier));
  } catch (e) {}
}

function setCustomCategory(identifier, customCategory) {
  if (!db) return;
  
  // Check if we already have a record (case-insensitive for filename)
  const row = db.prepare(`
    SELECT * FROM mod_tracking WHERE mod_id = ? OR LOWER(local_file_name) = LOWER(?)
  `).get(identifier, String(identifier));

  if (row) {
    db.prepare(`
      UPDATE mod_tracking SET custom_category = ? WHERE mod_id = ? OR LOWER(local_file_name) = LOWER(?)
    `).run(customCategory, identifier, String(identifier));
  } else {
    // For local mods not tracked yet
    db.prepare(`
      INSERT INTO mod_tracking (local_file_name, custom_category) VALUES (?, ?)
    `).run(identifier, customCategory);
  }
}

function setModTags(identifier, tags) {
  if (!db) return;
  const tagsJson = JSON.stringify(tags || []);
  const cleanId = String(identifier).replace(/\\/g, '/');
  const baseName = cleanId.split('/').pop().toLowerCase();
  
  // 1. Update tracking
  const rows = db.prepare('SELECT rowid, * FROM mod_tracking').all();
  const trackingRow = rows.find(r => {
    if (r.mod_id && String(r.mod_id) === String(identifier)) return true;
    if (r.local_file_name) {
      const rClean = r.local_file_name.replace(/\\/g, '/').toLowerCase();
      const rBase = rClean.split('/').pop();
      if (rClean === cleanId.toLowerCase() || rBase === baseName) return true;
    }
    return false;
  });

  if (trackingRow) {
    db.prepare('UPDATE mod_tracking SET tags = ? WHERE rowid = ?').run(tagsJson, trackingRow.rowid);
  } else {
    db.prepare('INSERT INTO mod_tracking (local_file_name, tags) VALUES (?, ?)').run(identifier, tagsJson);
  }

  // 2. Update local_mod_cache
  const cacheRows = db.prepare('SELECT file_path FROM local_mod_cache').all();
  for (const cRow of cacheRows) {
    const cClean = cRow.file_path.replace(/\\/g, '/').toLowerCase();
    const cBase = cClean.split('/').pop();
    if (cClean.includes(cleanId.toLowerCase()) || cBase === baseName) {
      db.prepare('UPDATE local_mod_cache SET tags = ? WHERE file_path = ?').run(tagsJson, cRow.file_path);
    }
  }
}

// ── Local Mod Metadata Cache (Performance) ──
function getLocalModCache(filePath) {
  if (!db) return null;
  return db.prepare('SELECT * FROM local_mod_cache WHERE file_path = ?').get(filePath);
}

function getLocalModIconOnly(filePath) {
  if (!db) return null;
  const row = db.prepare('SELECT icon_base64 FROM local_mod_cache WHERE file_path = ?').get(filePath);
  return row ? row.icon_base64 : null;
}

function getAllLocalModCache() {
  if (!db) return [];
  // Exclude heavy icon_base64 and store_base64 columns to keep memory usage at ~2MB instead of 1.6GB
  return db.prepare('SELECT file_path, mtime, size, json_data, file_hash FROM local_mod_cache').all();
}

function setLocalModCache(filePath, mtime, size, data, iconBase64 = null, fileHash = null, storeBase64 = null) {
  if (!db) return;
  try {
    db.prepare(`
      INSERT OR REPLACE INTO local_mod_cache (file_path, mtime, size, json_data, icon_base64, file_hash, store_base64)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(filePath, Math.floor(mtime), size, JSON.stringify(data), iconBase64, fileHash, storeBase64);
  } catch (e) {
    console.error('[CACHE] setLocalModCache error:', e.message);
  }
}

function updateLocalModIcon(filePath, iconBase64) {
  if (!db) return;
  try {
    db.prepare('UPDATE local_mod_cache SET icon_base64 = ? WHERE file_path = ?').run(iconBase64, filePath);
  } catch (e) {
    console.error('[CACHE] Failed to update local mod icon:', e.message);
  }
}

function removeLocalModCache(filePath) {
  if (!db) return;
  try {
    db.prepare('DELETE FROM local_mod_cache WHERE file_path = ?').run(filePath);
  } catch (e) {}
}

function clearLocalModCache() {
  if (!db) return;
  try {
    db.prepare('DELETE FROM local_mod_cache').run();
  } catch (e) {}
}

function updateLocalModCachePath(oldPath, newPath) {
  if (!db) return;
  try {
    db.prepare(`
      UPDATE local_mod_cache SET file_path = ? WHERE file_path = ?
    `).run(newPath, oldPath);
  } catch (e) {}
}

function updateModTrackingFileInfo(oldFileName, newFileName) {
  if (!db) return;
  try {
    // This updates based on the exact local file name (which might include a folder prefix)
    db.prepare(`
      UPDATE mod_tracking SET local_file_name = ? WHERE local_file_name = ?
    `).run(newFileName, oldFileName);
  } catch (e) {}
}

function setModLocation(oldLoc, newLoc, oldRelative, newRelative) {
  if (!db) return;
  try {
    updateLocalModCachePath(oldLoc, newLoc);
    updateModTrackingFileInfo(oldRelative, newRelative);
    debugLog(`[DB] Updated location for ${oldRelative} -> ${newRelative}`);
  } catch (e) {
    debugLog(`[DB] Failed to update location: ${e.message}`);
  }
}

function getAllModTracking() {
  if (!db) return [];
  return db.prepare('SELECT * FROM mod_tracking').all();
}

function getModTrackingByFile(identifier) {
  if (!db) return null;
  return db.prepare(`
    SELECT * FROM mod_tracking WHERE mod_id = ? OR LOWER(local_file_name) = LOWER(?)
  `).get(identifier, String(identifier));
}

function getModTrackingByBaseName(fileName) {
  if (!db) return null;
  const lowerName = fileName.toLowerCase();
  return db.prepare(`
    SELECT * FROM mod_tracking 
    WHERE LOWER(local_file_name) = ? 
       OR local_file_name LIKE ? 
       OR local_file_name LIKE ?
  `).get(lowerName, '%/' + lowerName, '%\\' + lowerName);
}

function getRemoteImage(url) {
  if (!db) return null;
  const row = db.prepare('SELECT base64 FROM image_cache WHERE url = ?').get(url);
  return row ? row.base64 : null;
}

function setRemoteImage(url, base64) {
  if (!db) return;
  db.prepare('INSERT OR REPLACE INTO image_cache (url, base64, created_at) VALUES (?, ?, ?)').run(url, base64, Date.now());
}

function getModHubTotalCount() {
  if (!db) return 0;
  try {
    const row = db.prepare("SELECT COUNT(DISTINCT mod_id) as cnt FROM mod_tracking WHERE mod_id IS NOT NULL AND mod_id != '' AND mod_id NOT LIKE '177%'").get();
    return row?.cnt || 0;
  } catch (_) {
    return 0;
  }
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  init, get, set, clearAll,
  getSetting, setSetting, getAllSettings,
  getModTracking, setModTracking, removeModTracking, removeModTrackingByFile, getAllModTracking, getModTrackingByFile, getModTrackingByBaseName, getAllModTrackingMap,
  getModHubTotalCount,
  setModTags, setModLocation,
  getLocalModCache, getLocalModIconOnly, getAllLocalModCache, setLocalModCache, removeLocalModCache, clearLocalModCache, updateLocalModIcon,
  updateLocalModCachePath, updateModTrackingFileInfo,
  getModHubMetadataPool,
  getRemoteImage, setRemoteImage,
  // Pending Downloads
  getPendingDownloads: () => {
    if (!db) return [];
    return db.prepare('SELECT * FROM pending_downloads ORDER BY created_at ASC').all();
  },
  savePendingDownload: (data) => {
    if (!db) return;
    try {
      const { mod_id, mod_title, download_url, target_dir, file_name, total_bytes, received_bytes, category, tech_data } = data;
      db.prepare(`
        INSERT OR REPLACE INTO pending_downloads 
        (mod_id, mod_title, download_url, target_dir, file_name, total_bytes, received_bytes, category, tech_data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(mod_id, mod_title, download_url, target_dir, file_name, total_bytes, received_bytes, category, tech_data, Date.now());
    } catch (e) {
      console.error('[CACHE] savePendingDownload error:', e.message);
    }
  },
  updateDownloadProgress: (modId, received) => {
    if (!db) return;
    try {
      db.prepare('UPDATE pending_downloads SET received_bytes = ? WHERE mod_id = ?').run(received, modId);
    } catch (e) {}
  },
  removePendingDownload: (modId) => {
    if (!db) return;
    try {
      db.prepare('DELETE FROM pending_downloads WHERE mod_id = ?').run(modId);
    } catch (e) {}
  },
  close,
  beginTransaction: () => {
    if (!db) return;
    try {
      db.prepare('BEGIN').run();
    } catch (_) {}
  },
  commitTransaction: () => {
    if (!db) return;
    try {
      db.prepare('COMMIT').run();
    } catch (_) {}
  },
  rollbackTransaction: () => {
    if (!db) return;
    try {
      db.prepare('ROLLBACK').run();
    } catch (_) {}
  },
};
