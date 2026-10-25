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

// Check against mod_tracking
const tracked = db.prepare('SELECT mod_id, local_file_name, modhub_title FROM mod_tracking').all();
const trackedFiles = new Set();
tracked.forEach(t => {
  if (t.local_file_name) trackedFiles.add(path.basename(t.local_file_name).toLowerCase());
});

const notOnModHub = [];
diskFiles.forEach(f => {
  if (!trackedFiles.has(f)) {
    notOnModHub.push(f);
  }
});

console.log('Total unique zip files on disk:', diskFiles.size);
console.log('Total tracked files in mod_tracking:', trackedFiles.size);
console.log('Disk zip files NOT in mod_tracking (Non-ModHub):', notOnModHub.length);
console.log('List:', notOnModHub);
