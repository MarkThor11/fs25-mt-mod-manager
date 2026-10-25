const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path FROM local_mod_cache').all();
console.log('Total local_mod_cache rows:', rows.length);

const extensions = {};
rows.forEach(r => {
  const ext = path.extname(r.file_path).toLowerCase();
  extensions[ext] = (extensions[ext] || 0) + 1;
});
console.log('Extensions:', extensions);

const settings = db.prepare('SELECT * FROM settings').all();
console.log('Settings:', settings);
