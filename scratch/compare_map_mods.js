const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const modsDir = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');

function inspectZip(zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    const modDesc = zip.getEntry('modDesc.xml');
    if (!modDesc) return;
    const modDescText = modDesc.getData().toString('utf8');
    if (!modDescText.includes('<map')) return;

    const modName = path.basename(zipPath, '.zip');
    const entries = zip.getEntries();
    
    // Find density map files and XML files
    const gdmFiles = [];
    const xmlFiles = [];
    let mapXmlText = '';

    entries.forEach(e => {
      const lower = e.entryName.toLowerCase();
      if (lower.endsWith('.gdm') || lower.endsWith('.grle')) {
        gdmFiles.push({ name: e.entryName, size: e.header.size });
      }
      if (lower.endsWith('.xml') && (lower.includes('field') || lower.includes('density') || lower.includes('map') || lower.includes('vehicle') || lower.includes('farmland'))) {
        xmlFiles.push({ name: e.entryName, size: e.header.size });
      }
      if (lower.endsWith('map.xml') && !lower.includes('sound')) {
        mapXmlText = e.getData().toString('utf8');
      }
    });

    console.log('==================================================');
    console.log('MAP MOD:', modName);
    console.log('  ZIP:', zipPath);
    console.log('  GDM/GRLE Files:');
    gdmFiles.forEach(f => console.log('    ', f.name, '(', f.size, 'bytes)'));
    console.log('  Key XML Files:');
    xmlFiles.forEach(f => console.log('    ', f.name, '(', f.size, 'bytes)'));

    if (mapXmlText) {
      const densityRev = mapXmlText.match(/<densityMap\s+[^>]*revision=["'](\d+)["']/i);
      const fields = mapXmlText.match(/<fields\s+[^>]*filename=["']([^"']+)["']/i);
      const farmlands = mapXmlText.match(/<farmlands\s+[^>]*filename=["']([^"']+)["']/i);
      console.log('  map.xml densityMap revision:', densityRev ? densityRev[1] : 'none');
      console.log('  map.xml fields filename:', fields ? fields[1] : 'none');
      console.log('  map.xml farmlands filename:', farmlands ? farmlands[1] : 'none');
    }
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
        inspectZip(full);
      }
    } catch (e) {}
  }
}

scan(modsDir);
