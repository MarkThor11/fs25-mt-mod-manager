const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

console.log('--- DATABASE STATS ---');
try {
  const modhubCount = db.prepare('SELECT count(*) as c FROM modhub_mods').get().c;
  console.log('modhub_mods online count in DB:', modhubCount);
} catch (e) {
  console.log('modhub_mods error:', e.message);
}

try {
  const localCache = db.prepare('SELECT count(*) as c FROM local_mod_cache').get().c;
  console.log('local_mod_cache rows:', localCache);
} catch (e) {
  console.log('local_mod_cache error:', e.message);
}

try {
  const trackingCount = db.prepare('SELECT count(*) as c FROM mod_tracking').get().c;
  console.log('mod_tracking rows:', trackingCount);
} catch (e) {
  console.log('mod_tracking error:', e.message);
}

try {
  const stats = db.prepare('SELECT * FROM modhub_discovery_stats ORDER BY id DESC LIMIT 1').get();
  console.log('modhub_discovery_stats:', stats);
} catch (e) {
  console.log('modhub_discovery_stats error:', e.message);
}
