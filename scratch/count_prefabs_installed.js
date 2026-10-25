const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const localRows = db.prepare("SELECT file_path, json_data FROM local_mod_cache WHERE file_path LIKE '%.zip'").all();
console.log('Total local zip rows:', localRows.length);

const prefabsInstalled = localRows.filter(r => r.file_path.toLowerCase().includes('prefab'));
console.log('Installed zips containing prefab in filename/path:', prefabsInstalled.length);
