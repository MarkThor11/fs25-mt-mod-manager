const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const discovery = db.prepare("SELECT value FROM cache WHERE key = 'modhub_discovery_stats'").get();
console.log('Discovery stats from cache:', discovery ? discovery.value : null);

// Count distinct modId in mod_tracking
const trackedIds = db.prepare("SELECT count(DISTINCT mod_id) as c FROM mod_tracking WHERE mod_id IS NOT NULL AND mod_id != ''").get().c;
console.log('Distinct mod_id in mod_tracking:', trackedIds);

// Total rows in local_mod_cache
const localRows = db.prepare("SELECT count(*) as c FROM local_mod_cache").get().c;
console.log('Rows in local_mod_cache:', localRows);

// Zips in local_mod_cache
const localZips = db.prepare("SELECT count(*) as c FROM local_mod_cache WHERE file_path LIKE '%.zip'").get().c;
console.log('Zip rows in local_mod_cache:', localZips);

// Non-zips (folders) in local_mod_cache
const localFolders = db.prepare("SELECT count(*) as c FROM local_mod_cache WHERE file_path NOT LIKE '%.zip'").get().c;
console.log('Folder rows in local_mod_cache:', localFolders);
