const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const montanaZip = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods', 'Somewhere Montana', 'FS25_SomewhereMontana.zip');

if (fs.existsSync(montanaZip)) {
  const zip = new AdmZip(montanaZip);
  console.log('=== SOMEWHERE MONTANA ZIP ENTRIES ===');
  const entries = zip.getEntries();
  entries.forEach(e => {
    const l = e.entryName.toLowerCase();
    if (l.includes('map') || l.includes('field') || l.includes('density') || l.includes('vehicle') || l.includes('placeable')) {
      console.log('  ', e.entryName, '(', e.header.size, 'bytes)');
    }
  });

  const modDesc = zip.getEntry('modDesc.xml');
  if (modDesc) {
    console.log('=== MODDESC.XML ===');
    console.log(modDesc.getData().toString('utf8'));
  }
} else {
  console.log('Montana zip not found at', montanaZip);
}
