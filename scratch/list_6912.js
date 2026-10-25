const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

// All rows in local_mod_cache
const rows = db.prepare('SELECT file_path, json_data FROM local_mod_cache').all();

// Filter to what InstalledModsPage considered "ModHub" when it was 6912:
// Boolean(!m.isDLC && !m.isFolder && (m.modId || m.isModHub))
const modHubItems = [];
const nonModHubItems = [];

rows.forEach(r => {
  let m = {};
  try { m = JSON.parse(r.json_data); } catch (_) {}
  const isZip = r.file_path.toLowerCase().endsWith('.zip');
  m.isFolder = !isZip;
  m.fileName = path.basename(r.file_path);
  m.filePath = r.file_path;

  const isMH = Boolean(!m.isDLC && !m.isFolder && (m.modId || m.isModHub));
  if (isMH) {
    modHubItems.push({
      fileName: m.fileName,
      filePath: r.file_path,
      modId: m.modId,
      title: m.title
    });
  } else {
    nonModHubItems.push({
      fileName: m.fileName,
      filePath: r.file_path,
      isDLC: m.isDLC,
      isFolder: m.isFolder,
      modId: m.modId,
      title: m.title
    });
  }
});

console.log('Total in local_mod_cache:', rows.length);
console.log('ModHub items count:', modHubItems.length);
console.log('Non-ModHub items count:', nonModHubItems.length);
