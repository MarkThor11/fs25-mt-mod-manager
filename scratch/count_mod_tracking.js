const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const count = db.prepare('SELECT count(*) as c FROM mod_tracking').get().c;
console.log('Total rows in mod_tracking:', count);

const distinctIds = db.prepare('SELECT count(DISTINCT mod_id) as c FROM mod_tracking').get().c;
console.log('Distinct mod_id in mod_tracking:', distinctIds);

const distinctFiles = db.prepare('SELECT count(DISTINCT local_file_name) as c FROM mod_tracking').get().c;
console.log('Distinct local_file_name in mod_tracking:', distinctFiles);
