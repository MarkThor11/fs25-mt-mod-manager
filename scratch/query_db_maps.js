const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath, { readonly: true });

const rows = db.prepare("SELECT file_path, json_data FROM local_mod_cache WHERE file_path LIKE '%Daheim%' OR file_path LIKE '%Rettenbach%' OR file_path LIKE '%Pfaffenwinkel%' OR file_path LIKE '%Frisian%' OR file_path LIKE '%Oberschwaben%'").all();
console.log('Total matches in local_mod_cache:', rows.length);
for (const r of rows) {
  let title = 'N/A';
  try { title = JSON.parse(r.json_data).title; } catch (_) {}
  console.log(r.file_path, '--> Title:', title);
}
process.exit(0);
