const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath, { readonly: true });
const tracking = db.prepare("SELECT local_file_name FROM mod_tracking WHERE local_file_name LIKE '%Wooden%'").all();
console.log("Tracking paths:", tracking);
