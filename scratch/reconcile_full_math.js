const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const r = db.prepare("SELECT value FROM settings WHERE key = 'modCache'").get();
const mods = JSON.parse(r.value).mods;
const modhub_installed = mods.filter(m => !m.isDLC && !m.isFolder && (m.modId || m.isModHub));

console.log('Total modhub_installed:', modhub_installed.length); // 6912

// Get set of unique modIds
const installedIds = new Set();
modhub_installed.forEach(m => {
  if (m.modId) installedIds.add(String(m.modId));
});
console.log('Unique modIds among modhub_installed:', installedIds.size); // 6910 (because 6912 - 2 duplicates = 6910)

// Discovery stats
const stats = db.prepare("SELECT value FROM cache WHERE key = 'modhub_discovery_stats'").get();
console.log('modhub_discovery_stats:', stats.value); // 6911

// Which 1 mod on ModHub (out of 6911) is NOT in installedIds?
const pool = {};
const cacheRows = db.prepare("SELECT key, value FROM cache WHERE key LIKE 'mods_%' OR key LIKE 'modDetail_%'").all();
cacheRows.forEach(row => {
  try {
    const data = JSON.parse(row.value);
    if (row.key.startsWith('modDetail_') && data.modId) {
      pool[String(data.modId)] = data;
    } else if (data.mods && Array.isArray(data.mods)) {
      data.mods.forEach(m => { if (m.modId) pool[String(m.modId)] = m; });
    }
  } catch (_) {}
});

const tracks = db.prepare("SELECT mod_id, modhub_title, local_file_name FROM mod_tracking").all();
tracks.forEach(t => {
  if (t.mod_id && !pool[String(t.mod_id)]) {
    pool[String(t.mod_id)] = { modId: t.mod_id, title: t.modhub_title, fileName: t.local_file_name };
  }
});

console.log('Total unique ModHub catalog IDs collected:', Object.keys(pool).length);

const missingFromInstalled = [];
Object.keys(pool).forEach(id => {
  if (!installedIds.has(String(id))) {
    missingFromInstalled.push({ id, title: pool[id].title, fileName: pool[id].fileName });
  }
});

console.log('ModHub IDs not in installedIds:', missingFromInstalled.length);
console.log('Details:', JSON.stringify(missingFromInstalled, null, 2));
