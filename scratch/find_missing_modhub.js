const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const trackingRows = db.prepare("SELECT mod_id, local_file_name, modhub_title FROM mod_tracking").all();
const trackingIds = new Set(trackingRows.map(r => String(r.mod_id).replace(/^0+/, '')));

const localRows = db.prepare("SELECT file_path, json_data FROM local_mod_cache WHERE file_path LIKE '%.zip'").all();
const localIds = new Set();
const localFiles = new Set();
localRows.forEach(r => {
  localFiles.add(path.basename(r.file_path).toLowerCase());
  try {
    const d = JSON.parse(r.json_data);
    if (d.modId) localIds.add(String(d.modId).replace(/^0+/, ''));
  } catch (_) {}
});

console.log('Total ModHub mod IDs tracked (online catalog):', trackingIds.size);
console.log('Installed zips with known modId:', localIds.size);

// Which tracked mod_ids are NOT in localIds?
const missing = [];
trackingRows.forEach(r => {
  const id = String(r.mod_id).replace(/^0+/, '');
  const fileName = r.local_file_name ? path.basename(r.local_file_name).toLowerCase() : null;
  if (!localIds.has(id) && (!fileName || !localFiles.has(fileName))) {
    missing.push({ id, title: r.modhub_title, file: r.local_file_name });
  }
});

console.log('ModHub mods tracked that are NOT installed:', missing.length);
if (missing.length > 0) {
  console.log('Missing mods:', JSON.stringify(missing, null, 2));
}
