const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare("SELECT key, value FROM cache WHERE key LIKE 'mods_%'").all();
console.log('mods_ rows in cache:', rows.length);

const allOnlineMods = new Map();
rows.forEach(r => {
  try {
    const d = JSON.parse(r.value);
    if (d && Array.isArray(d.mods)) {
      d.mods.forEach(m => {
        if (m.modId) allOnlineMods.set(String(m.modId), m);
      });
    }
  } catch (_) {}
});

console.log('Unique online mods across all mods_* cache entries:', allOnlineMods.size);
