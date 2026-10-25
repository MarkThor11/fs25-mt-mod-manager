const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path FROM local_mod_cache').all();
const folderCounts = {};
rows.forEach(r => {
  const dir = path.dirname(r.file_path);
  folderCounts[dir] = (folderCounts[dir] || 0) + 1;
});
console.log('Folders in local_mod_cache:');
console.log(JSON.stringify(folderCounts, null, 2));
