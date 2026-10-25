const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path FROM local_mod_cache').all();
const zipRows = rows.filter(r => r.file_path.toLowerCase().endsWith('.zip'));

const missingOnDisk = [];
const existingOnDisk = [];

zipRows.forEach(r => {
  if (fs.existsSync(r.file_path)) {
    existingOnDisk.push(r.file_path);
  } else {
    missingOnDisk.push(r.file_path);
  }
});

console.log('Total zip entries in cache:', zipRows.length);
console.log('Existing on disk:', existingOnDisk.length);
console.log('Missing on disk (stale cache paths):', missingOnDisk.length);
if (missingOnDisk.length > 0) {
  console.log('Sample missing (first 10):', missingOnDisk.slice(0, 10));
}
