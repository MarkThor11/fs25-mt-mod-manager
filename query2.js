const sqlite3 = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'GoogleModManager', 'manager.db');
const db = new sqlite3(dbPath);
const row = db.prepare("SELECT dependencies FROM modhub_cache WHERE title = 'Monteriggioni'").get();
console.log(JSON.stringify(JSON.parse(row.dependencies), null, 2));
