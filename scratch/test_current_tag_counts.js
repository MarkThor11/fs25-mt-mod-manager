const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT file_path, json_data FROM local_mod_cache').all();

let modHubTagCount = 0;
let delistedCount = 0;
let nonModHubCount = 0;

rows.forEach(r => {
  let m = {};
  try { m = JSON.parse(r.json_data); } catch (_) {}
  const isZip = r.file_path.toLowerCase().endsWith('.zip');
  const isFolder = !isZip;
  m.isFolder = isFolder;
  m.fileName = path.basename(r.file_path);
  m.filePath = r.file_path;
  
  // Rule for modhub tag:
  if (!m.isDLC && !m.isFolder && (m.modId || m.isModHub)) {
    modHubTagCount++;
  }
  if (!m.isDLC && (m.isDelisted || m.isRemoved)) {
    delistedCount++;
  }
  if (!m.isDLC && (m.isFolder || (!m.modId && !m.isModHub))) {
    nonModHubCount++;
  }
});

console.log('Total items in cache:', rows.length);
console.log('Items matching ModHub tag:', modHubTagCount);
console.log('Items matching Delisted tag:', delistedCount);
console.log('Items matching Non-ModHub tag:', nonModHubCount);
