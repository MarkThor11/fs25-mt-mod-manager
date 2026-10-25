const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const rows = db.prepare("SELECT * FROM mod_tracking WHERE mod_id IN ('349449', '311930')").all();
console.log('mod_tracking for Carpathian and Pallegney:', rows);
