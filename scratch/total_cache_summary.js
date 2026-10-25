const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path, json_data FROM local_mod_cache').all();
console.log('Total local_mod_cache entries:', rows.length);

const zips = rows.filter(r => r.file_path.toLowerCase().endsWith('.zip'));
const folders = rows.filter(r => !r.file_path.toLowerCase().endsWith('.zip'));
console.log('Total zips in cache:', zips.length);
console.log('Total folders in cache:', folders.length);
folders.forEach(f => console.log('Folder:', f.file_path));
