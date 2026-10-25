const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const dirs = ['F:\\mods4', 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods', 'D:\\mods', 'E:\\mods'];
const diskFiles = new Set();
dirs.forEach(d => {
  if (fs.existsSync(d)) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(ent => {
      if (ent.isDirectory()) {
        const sub = path.join(d, ent.name);
        try {
          fs.readdirSync(sub).forEach(f => {
            if (f.toLowerCase().endsWith('.zip')) diskFiles.add(f.toLowerCase());
          });
        } catch (_) {}
      } else if (ent.name.toLowerCase().endsWith('.zip')) {
        diskFiles.add(ent.name.toLowerCase());
      }
    });
  }
});

const tracked = db.prepare('SELECT mod_id, local_file_name, modhub_title FROM mod_tracking').all();
const missingFromDisk = [];
tracked.forEach(t => {
  if (t.local_file_name) {
    const base = path.basename(t.local_file_name).toLowerCase();
    if (!diskFiles.has(base)) {
      missingFromDisk.push({ id: t.mod_id, file: t.local_file_name, title: t.modhub_title });
    }
  }
});

console.log('Tracked items in mod_tracking missing from disk:', missingFromDisk.length);
if (missingFromDisk.length > 0) {
  console.log(missingFromDisk);
}
