const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare('SELECT fileName FROM local_mod_cache').all();
const matches = rows.filter(r => r.fileName.includes('Average_Wooden') || r.fileName.includes('SmallWoodenShed'));
console.log("Found:", matches);
