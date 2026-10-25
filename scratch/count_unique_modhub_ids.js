const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path, json_data FROM local_mod_cache').all();
const zipRows = rows.filter(r => r.file_path.toLowerCase().endsWith('.zip'));

// Group by modId
const modIdGroups = new Map();
const noModId = [];

zipRows.forEach(r => {
  let d = {};
  try { d = JSON.parse(r.json_data); } catch (_) {}
  const mid = d.modId ? String(d.modId).replace(/^0+/, '') : null;
  if (mid) {
    if (!modIdGroups.has(mid)) modIdGroups.set(mid, []);
    modIdGroups.get(mid).push({ file: path.basename(r.file_path), path: r.file_path });
  } else {
    noModId.push({ file: path.basename(r.file_path), path: r.file_path });
  }
});

console.log('Unique ModHub modIds present among installed zips:', modIdGroups.size);
console.log('Installed zips with NO modId in cache:', noModId.length);
if (noModId.length > 0) {
  console.log('Sample no modId:', noModId.slice(0, 10));
}
