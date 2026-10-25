const path = require('path');
const cache = require(path.join(__dirname, '../src/main/services/cache'));
const Database = require('better-sqlite3');

cache.init();
const pool = cache.getModHubMetadataPool();

// Collect all 6911 unique ModHub mod IDs from pool
const poolIds = new Set();
const poolModsById = new Map();
Object.values(pool || {}).forEach(m => {
  if (m && m.modId && m.title && m.title !== 'Error: Mod not found' && !m.title.toLowerCase().includes('not found')) {
    const cleanId = String(m.modId).replace(/^0+/, '');
    poolIds.add(cleanId);
    if (!poolModsById.has(cleanId)) poolModsById.set(cleanId, m);
  }
});
console.log('Total unique ModHub mods on ModHub:', poolIds.size); // 6911

// Now check disk
const fs = require('fs');
const dirs = ['F:\\mods4', 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods', 'D:\\mods', 'E:\\mods'];
const diskFileNames = new Set();
dirs.forEach(d => {
  if (fs.existsSync(d)) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(ent => {
      if (ent.isDirectory()) {
        const sub = path.join(d, ent.name);
        try {
          fs.readdirSync(sub).forEach(f => {
            if (f.toLowerCase().endsWith('.zip')) diskFileNames.add(f.toLowerCase());
          });
        } catch (_) {}
      } else if (ent.name.toLowerCase().endsWith('.zip')) {
        diskFileNames.add(ent.name.toLowerCase());
      }
    });
  }
});
console.log('Unique zip files on disk:', diskFileNames.size);

// For each of the 6911 ModHub mods, check if it exists on disk by ID or fileName
const missingFromDisk = [];
poolModsById.forEach((mod, id) => {
  const fName = mod.fileName ? path.basename(mod.fileName).toLowerCase() : null;
  let found = false;
  if (fName && diskFileNames.has(fName)) {
    found = true;
  }
  if (!found) {
    missingFromDisk.push({ id, title: mod.title, fileName: mod.fileName });
  }
});

console.log('ModHub mods (out of 6911) NOT found on disk:', missingFromDisk.length);
if (missingFromDisk.length > 0) {
  console.log('Missing list:', JSON.stringify(missingFromDisk, null, 2));
}
