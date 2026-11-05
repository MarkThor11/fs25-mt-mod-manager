const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const roots = ['F:/mods4', 'C:/Users/Mark/Documents/My Games/FarmingSimulator2025/mods', 'D:/mods', 'E:/mods'];
const candidates = [];

for (const dir of roots) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.zip')) continue;
    const fullPath = path.join(dir, file);
    try {
      const zip = new AdmZip(fullPath);
      const entries = zip.getEntries();
      const mapEntry = entries.find(e => {
        const n = e.entryName.toLowerCase();
        return (n.endsWith('map.xml') || n.endsWith('mapus.xml') || n.endsWith('mapeu.xml') || n.endsWith('mapas.xml')) &&
               !n.includes('placeable') && !n.includes('store') && !n.includes('item') && !n.includes('shop');
      });

      if (mapEntry) {
        const xml = mapEntry.getData().toString('utf8');
        const match = xml.match(/<densityMapHeightTypes\b([^>]*?)(\/?)>/i);
        let channels = 'NONE (defaults to 6)';
        if (match) {
          const cMatch = match[1].match(/numChannels=["'](\d+)["']/i);
          channels = cMatch ? cMatch[1] : 'DEFAULT (6)';
        }
        if (channels === 'NONE (defaults to 6)' || channels === 'DEFAULT (6)' || channels === '6' || channels === '7') {
          candidates.push({ file, path: fullPath, channels });
        }
      }
    } catch (_) {}
  }
}

console.log(JSON.stringify(candidates, null, 2));
