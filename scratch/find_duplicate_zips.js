const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path FROM local_mod_cache').all();
const zipRows = rows.filter(r => r.file_path.toLowerCase().endsWith('.zip'));

const fileNames = new Map();
const duplicates = [];

zipRows.forEach(r => {
  const name = path.basename(r.file_path).toLowerCase();
  if (fileNames.has(name)) {
    duplicates.push({ name, path1: fileNames.get(name), path2: r.file_path });
  } else {
    fileNames.set(name, r.file_path);
  }
});

console.log('Total zip entries in cache:', zipRows.length);
console.log('Unique zip file names:', fileNames.size);
console.log('Duplicate zip entries in cache:', duplicates.length);
if (duplicates.length > 0) {
  console.log('Duplicates:', JSON.stringify(duplicates, null, 2));
}
