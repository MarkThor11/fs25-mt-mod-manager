const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const modsDir = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');

function checkFruitsPath(zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    const modDesc = zip.getEntry('modDesc.xml');
    if (!modDesc) return;
    const modDescText = modDesc.getData().toString('utf8');
    if (!modDescText.includes('<map')) return;

    const modName = path.basename(zipPath, '.zip');
    const entries = zip.getEntries();
    
    const fruitEntries = entries.filter(e => path.basename(e.entryName).toLowerCase() === 'densitymap_fruits.gdm');
    
    console.log('MAP:', modName.padEnd(35), '| fruits entries:', fruitEntries.map(f => `${f.entryName} (${f.header.size} bytes)`).join(', ') || 'NONE');
  } catch (e) {
    console.error('Error reading', zipPath, e.message);
  }
}

function scan(dir) {
  let items;
  try { items = fs.readdirSync(dir); } catch (e) { return; }
  for (const item of items) {
    const full = path.join(dir, item);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        scan(full);
      } else if (item.endsWith('.zip')) {
        checkFruitsPath(full);
      }
    } catch (e) {}
  }
}

scan(modsDir);
