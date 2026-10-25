const path = require('path');
const cache = require(path.join(__dirname, '../src/main/services/cache'));
const Database = require('better-sqlite3');

cache.init();
const pool = cache.getModHubMetadataPool();

// Look for FS25_CargosPack vs FS25_Cargos_Pack
console.log('Pool for FS25_CargosPack.zip:', pool['file_fs25_cargospack.zip'] || pool['fs25_cargospack']);
console.log('Pool for FS25_Cargos_Pack.zip:', pool['file_fs25_cargos_pack.zip'] || pool['fs25_cargos_pack']);

// Check mod_tracking for CargosPack
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);
const r1 = db.prepare("SELECT * FROM mod_tracking WHERE local_file_name LIKE '%cargos%'").all();
console.log('mod_tracking cargos:', r1);
