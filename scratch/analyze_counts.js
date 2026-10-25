const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path, json_data FROM local_mod_cache').all();
const tracking = db.prepare('SELECT * FROM mod_tracking').all();
const trackingMap = new Map();
tracking.forEach(t => {
  if (t.mod_key) trackingMap.set(t.mod_key.toLowerCase(), t);
  if (t.file_path) trackingMap.set(t.file_path.toLowerCase(), t);
});

let modHubCount = 0;
const modHubList = [];
const nonModHubList = [];

rows.forEach(r => {
  let data = {};
  try { data = JSON.parse(r.json_data); } catch (_) {}
  const base = path.basename(r.file_path);
  const isZip = r.file_path.toLowerCase().endsWith('.zip');
  
  let modId = data.modId;
  if (!modId) {
    const tr = trackingMap.get(`file_${base.toLowerCase()}`) || trackingMap.get(r.file_path.toLowerCase());
    if (tr && tr.mod_id) modId = tr.mod_id;
  }
  
  const isModHub = Boolean(isZip && !data.isDLC && !data.isFolder && (modId || data.isModHub));
  if (isModHub) {
    modHubCount++;
    modHubList.push({ file: base, modId: modId || data.modId, title: data.title });
  } else {
    nonModHubList.push({ file: base, isZip, isDLC: data.isDLC, isFolder: data.isFolder, modId, title: data.title });
  }
});

console.log('Total cache entries:', rows.length);
console.log('Classified as ModHub:', modHubCount);
console.log('Classified as Non-ModHub:', nonModHubList.length);
console.log('Non-ModHub entries:', JSON.stringify(nonModHubList, null, 2));
