const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const r = db.prepare("SELECT value FROM settings WHERE key = 'modCache'").get();
const mods = JSON.parse(r.value).mods;

const missing = [];
mods.forEach(m => {
  if (m.filePath && !require('fs').existsSync(m.filePath)) {
    missing.push({ fileName: m.fileName, filePath: m.filePath });
  }
});

console.log('Stale mods in modCache setting (files that no longer exist on disk):', missing.length);
console.log('Missing list:', missing);
