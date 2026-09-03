const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath, { readonly: true });
const rows = db.prepare("SELECT * FROM mod_tracking WHERE modhub_title LIKE '%Daheim%' OR modhub_title LIKE '%Rettenbach%' OR modhub_title LIKE '%North Frisian%' OR modhub_title LIKE '%Oberschwaben%' OR local_file_name LIKE '%Daheim%' OR local_file_name LIKE '%Rettenbach%'").all();
console.log('mod_tracking rows:', rows.length);
for (const r of rows) {
  console.log(r.mod_id, r.modhub_title, '-> file:', r.local_file_name, 'version:', r.remote_version);
}
process.exit(0);
