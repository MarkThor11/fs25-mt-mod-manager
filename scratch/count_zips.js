const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path, json_data FROM local_mod_cache').all();
const zipRows = rows.filter(r => r.file_path.toLowerCase().endsWith('.zip'));

console.log('Total zip entries in local_mod_cache:', zipRows.length);
