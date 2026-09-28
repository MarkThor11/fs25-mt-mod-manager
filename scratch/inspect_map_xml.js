const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const montanaZip = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods', 'Somewhere Montana', 'FS25_SomewhereMontana.zip');

if (fs.existsSync(montanaZip)) {
  const zip = new AdmZip(montanaZip);
  const entry = zip.getEntry('maps/map.xml');
  if (entry) {
    console.log('=== MAP.XML ===');
    console.log(entry.getData().toString('utf8'));
  }
}
