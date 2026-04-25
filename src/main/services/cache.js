const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs-extra');
const pathProvider = require('./pathProvider');

let db = null;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'modhub-cache.db');
}

function debugLog(msg) {
  try {
    const logPath = path.join(app.getPath('userData'), 'detection_log.txt');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [CACHE] ${msg}\n`);
  } catch (e) {}
}

function init() {
  try {
    const dbPath = getDbPath();
    fs.ensureDirSync(path.dirname(dbPath));
    
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

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
    theme: 'dark',
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

  // ── STARTUP OPTIMIZATION ──
  // We used to purge 'Latest' here, but we'll now rely on TTL to keep things fresh 
  // without forcing a slow reload on every single startup.
  // db.prepare("DELETE FROM cache WHERE key LIKE 'mods_latest_%'").run();

  // One-time purge for inverted icons (v1.0.3 — removed incorrect Y-flip)
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('iconFixVersion');
    if (!row || row.value !== 'v1.1.2') {
      // v1.1.2: Force re-scan to apply aggressive downscaling to icons
      db.prepare('DELETE FROM local_mod_cache').run();
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('iconFixVersion', 'v1.1.2');
      debugLog('Performed cache purge for icon downscaling improvements (v1.1.2).');
      console.log('[CACHE] Purged local_mod_cache for v1.1.2 icon downscaling.');
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
}
  
function getModHubMetadataPool() {
  if (!db) return {};
  const pool = {};
  try {
    // 1. Scan scraper cache for all ever-browsed mods
    const rows = db.prepare("SELECT key, value FROM cache WHERE key LIKE 'mods_%' OR key LIKE 'modDetail_%'").all();
    const now = Date.now();
    for (const row of rows) {
      try {
        const data = JSON.parse(row.value);
        if (row.key.startsWith('modDetail_')) {
          if (data && data.modId) {
              pool[String(data.modId)] = { ...data, timestamp: now };
          }
        } else if (data && Array.isArray(data.mods)) {
          for (const m of data.mods) {
            if (m.modId) pool[String(m.modId)] = { ...m, timestamp: now };
          }
        }
      } catch (e) {}
    }

    // 2. Scan mod_tracking for local-to-remote links (fixes ID-less library mods)
    const tracks = db.prepare("SELECT mod_id, local_file_name, local_version, modhub_title, category, hp, price, technical_data FROM mod_tracking").all();
    for (const t of tracks) {
      if (!t.mod_id && !t.local_file_name) continue;
      const id = String(t.mod_id || t.local_file_name); // Fallback to fileName as ID for pool if no modId
      
      let techData = null;
      try { techData = t.technical_data ? JSON.parse(t.technical_data) : null; } catch (e) {}

      if (!pool[id]) {
        pool[id] = { 
          modId: t.mod_id, 
          title: t.modhub_title, 
          category: t.category, 
          fileName: t.local_file_name, 
          version: t.local_version,
          techData: techData || (t.hp ? { hp: t.hp, price: t.price } : null),
          timestamp: now 
        };
      } else {
        // Enrich existing cache entry with the local filename/version if missing
        pool[id].fileName = t.local_file_name || pool[id].fileName;
        pool[id].version = t.local_version || pool[id].version;
        if (!pool[id].techData && (t.hp || techData)) {
            pool[id].techData = techData || { hp: t.hp, price: t.price };
        }
      }
      // Also index by fileName for easier matching by title-less local mods
      if (t.local_file_name) {
          const fileId = `file_${t.local_file_name.toLowerCase()}`;
          if (!pool[fileId]) pool[fileId] = { ...pool[id], timestamp: now };
      }
    }

  } catch (err) {
    console.error('[CACHE] Metadata pool scan failed:', err.message);
  }
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
function getModTracking(modId) {
  if (!db) return null;
  return db.prepare('SELECT * FROM mod_tracking WHERE mod_id = ?').get(modId);
}

function setModTracking(modId, data) {
  if (!db) return;
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
        WHEN excluded.category IS NOT NULL AND excluded.category != '' THEN excluded.category 
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
}

function removeModTracking(modId) {
  if (!db) return;
  db.prepare('DELETE FROM mod_tracking WHERE mod_id = ?').run(modId);
}

function removeModTrackingByFile(identifier) {
  if (!db) return;
  db.prepare(`
    DELETE FROM mod_tracking WHERE mod_id = ? OR LOWER(local_file_name) = LOWER(?)
  `).run(identifier, String(identifier));
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
  
  // Update tracking
  const row = db.prepare(`
    SELECT * FROM mod_tracking WHERE mod_id = ? OR LOWER(local_file_name) = LOWER(?)
  `).get(identifier, String(identifier));

  if (row) {
    db.prepare(`
      UPDATE mod_tracking SET tags = ? WHERE mod_id = ? OR LOWER(local_file_name) = LOWER(?)
    `).run(tagsJson, identifier, String(identifier));
  }

  // Also update cache if it exists
  db.prepare(`
    UPDATE local_mod_cache SET tags = ? WHERE file_path LIKE ?
  `).run(tagsJson, `%${identifier}%`);
}

// ── Local Mod Metadata Cache (Performance) ──
function getLocalModCache(filePath) {
  if (!db) return null;
  return db.prepare('SELECT * FROM local_mod_cache WHERE file_path = ?').get(filePath);
}

function getAllLocalModCache() {
  if (!db) return [];
  return db.prepare('SELECT * FROM local_mod_cache').all();
}

function setLocalModCache(filePath, mtime, size, data, iconBase64 = null, fileHash = null, storeBase64 = null) {
  if (!db) return;
  db.prepare(`
    INSERT OR REPLACE INTO local_mod_cache (file_path, mtime, size, json_data, icon_base64, file_hash, store_base64)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(filePath, Math.floor(mtime), size, JSON.stringify(data), iconBase64, fileHash, storeBase64);
}

function removeLocalModCache(filePath) {
  if (!db) return;
  db.prepare('DELETE FROM local_mod_cache WHERE file_path = ?').run(filePath);
}

function clearLocalModCache() {
  if (!db) return;
  db.prepare('DELETE FROM local_mod_cache').run();
}

function updateLocalModCachePath(oldPath, newPath) {
  if (!db) return;
  db.prepare(`
    UPDATE local_mod_cache SET file_path = ? WHERE file_path = ?
  `).run(newPath, oldPath);
}

function updateModTrackingFileInfo(oldFileName, newFileName) {
  if (!db) return;
  // This updates based on the exact local file name (which might include a folder prefix)
  db.prepare(`
    UPDATE mod_tracking SET local_file_name = ? WHERE local_file_name = ?
  `).run(newFileName, oldFileName);
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

function getRemoteImage(url) {
  if (!db) return null;
  const row = db.prepare('SELECT base64 FROM image_cache WHERE url = ?').get(url);
  return row ? row.base64 : null;
}

function setRemoteImage(url, base64) {
  if (!db) return;
  db.prepare('INSERT OR REPLACE INTO image_cache (url, base64, created_at) VALUES (?, ?, ?)').run(url, base64, Date.now());
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
  getModTracking, setModTracking, removeModTracking, removeModTrackingByFile, getAllModTracking, getModTrackingByFile,
  setModTags, setModLocation,
  getLocalModCache, getAllLocalModCache, setLocalModCache, removeLocalModCache, clearLocalModCache,
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
    const { mod_id, mod_title, download_url, target_dir, file_name, total_bytes, received_bytes, category, tech_data } = data;
    db.prepare(`
      INSERT OR REPLACE INTO pending_downloads 
      (mod_id, mod_title, download_url, target_dir, file_name, total_bytes, received_bytes, category, tech_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(mod_id, mod_title, download_url, target_dir, file_name, total_bytes, received_bytes, category, tech_data, Date.now());
  },
  updateDownloadProgress: (modId, received) => {
    if (!db) return;
    db.prepare('UPDATE pending_downloads SET received_bytes = ? WHERE mod_id = ?').run(received, modId);
  },
  removePendingDownload: (modId) => {
    if (!db) return;
    db.prepare('DELETE FROM pending_downloads WHERE mod_id = ?').run(modId);
  },
  close,
  beginTransaction: () => db && db.prepare('BEGIN').run(),
  commitTransaction: () => db && db.prepare('COMMIT').run(),
  rollbackTransaction: () => db && db.prepare('ROLLBACK').run(),
};
