const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const stats = db.prepare("SELECT value FROM cache WHERE key = 'modhub_discovery_stats'").get();
console.log('modhub_discovery_stats:', stats ? stats.value : 'none');
