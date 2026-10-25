const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const r = db.prepare("SELECT value FROM settings WHERE key = 'modCache'").get();
if (!r) {
  console.log('No modCache in settings table!');
  process.exit(0);
}

const data = JSON.parse(r.value);
const mods = data.mods || [];
console.log('Total mods in modCache:', mods.length);

const modhub_installed = mods.filter(m => !m.isDLC && !m.isFolder && (m.modId || m.isModHub));
console.log('Total modhub_installed in modCache:', modhub_installed.length);

// Count how many have duplicate modIds or duplicate fileNames
const byId = new Map();
const duplicatesById = [];
modhub_installed.forEach(m => {
  if (m.modId) {
    const id = String(m.modId);
    if (byId.has(id)) {
      duplicatesById.push({ id, mod1: byId.get(id), mod2: m });
    } else {
      byId.set(id, m);
    }
  }
});

console.log('Duplicate modIds in modhub_installed:', duplicatesById.length);
duplicatesById.forEach(d => {
  console.log(`ID ${d.id}:`);
  console.log('   Mod 1:', d.mod1.fileName, '| folder:', d.mod1.folder, '| title:', d.mod1.title);
  console.log('   Mod 2:', d.mod2.fileName, '| folder:', d.mod2.folder, '| title:', d.mod2.title);
});
