const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const modsDir = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');

function checkMapMod(zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    const modDescEntry = zip.getEntry('modDesc.xml');
    if (!modDescEntry) return;
    const xml = modDescEntry.getData().toString('utf8');
    
    // Check if modDesc contains <map> tag
    if (!xml.includes('<map')) return;

    const modName = path.basename(zipPath, '.zip');
    
    // Extract map id
    const mapMatch = xml.match(/<map\s+([^>]+)>/i);
    let mapId = 'unknown';
    if (mapMatch) {
      const idM = mapMatch[1].match(/id=["']([^"']+)["']/i);
      if (idM) mapId = idM[1];
    }
    const mapIdTag = xml.match(/<mapId>([^<]+)<\/mapId>/i);
    if (mapIdTag) mapId = mapIdTag[1];

    console.log('--------------------------------------------------');
    console.log('MAP MOD:', modName);
    console.log('  ZIP Path:', zipPath);
    console.log('  modDesc mapId:', mapId);
    console.log('  Expected engine mapId:', modName + '.' + mapId);

    // Check map.xml for densityMap revision and default XML files
    const mapXmlEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('map.xml') && !e.entryName.toLowerCase().includes('sound'));
    if (mapXmlEntry) {
      const mXml = mapXmlEntry.getData().toString('utf8');
      const revM = mXml.match(/<densityMap\s+[^>]*revision=["'](\d+)["']/i);
      console.log('  map.xml densityMap revision:', revM ? revM[1] : 'none');
      
      const flM = mXml.match(/<farmlands\s+[^>]*filename=["']([^"']+)["']/i);
      console.log('  farmlands filename:', flM ? flM[1] : 'none');

      const fM = mXml.match(/<fields\s+[^>]*filename=["']([^"']+)["']/i);
      console.log('  fields filename:', fM ? fM[1] : 'none');
    }
  } catch (e) {
    console.error('Error reading', zipPath, e.message);
  }
}

function findMaps(dir) {
  let items;
  try { items = fs.readdirSync(dir); } catch (e) { return; }
  for (const item of items) {
    const full = path.join(dir, item);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        findMaps(full);
      } else if (item.endsWith('.zip')) {
        checkMapMod(full);
      }
    } catch (e) {}
  }
}

findMaps(modsDir);
