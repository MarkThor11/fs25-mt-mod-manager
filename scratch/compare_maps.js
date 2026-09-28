const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const modsDir = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');

function inspectZip(zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    const modName = path.basename(zipPath, '.zip');
    const entries = zip.getEntries();
    
    // Find density map files and XML files
    const gdmFiles = [];
    const xmlFiles = [];
    let modDescText = '';
    let mapXmlText = '';

    entries.forEach(e => {
      const lower = e.entryName.toLowerCase();
      if (lower.endsWith('.gdm') || lower.endsWith('.grle')) {
        gdmFiles.push({ name: e.entryName, size: e.header.size });
      }
      if (lower.endsWith('.xml') && (lower.includes('field') || lower.includes('density') || lower.includes('map') || lower.includes('vehicle'))) {
        xmlFiles.push({ name: e.entryName, size: e.header.size });
      }
      if (lower === 'moddesc.xml') {
        modDescText = e.getData().toString('utf8');
      }
      if (lower.endsWith('map.xml') && !lower.includes('sound')) {
        mapXmlText = e.getData().toString('utf8');
      }
    });

    console.log('==================================================');
    console.log('MAP:', modName);
    console.log('  ZIP:', zipPath);
    console.log('  GDM/GRLE Files count:', gdmFiles.length);
    gdmFiles.forEach(f => console.log('    GDM:', f.name, f.size, 'bytes'));
    console.log('  XML Files count:', xmlFiles.length);
    xmlFiles.forEach(f => console.log('    XML:', f.name, f.size, 'bytes'));

    if (mapXmlText) {
      const densityRev = mapXmlText.match(/<densityMap\s+[^>]*revision=["'](\d+)["']/i);
      const fields = mapXmlText.match(/<fields\s+[^>]*filename=["']([^"']+)["']/i);
      const densityMapHeight = mapXmlText.match(/<densityMapHeightTypes\s+[^>]*filename=["']([^"']+)["']/i);
      console.log('  map.xml densityMap revision:', densityRev ? densityRev[1] : 'none');
      console.log('  map.xml fields filename:', fields ? fields[1] : 'none');
      console.log('  map.xml densityMapHeightTypes:', densityMapHeight ? densityMapHeight[1] : 'none');
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
      } else if (item.endsWith('.zip') && item.startsWith('FS25_')) {
        inspectZip(full);
      }
    } catch (e) {}
  }
}

scan(modsDir);
