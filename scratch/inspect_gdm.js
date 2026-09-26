const AdmZip = require('adm-zip');

function inspectGdm(zipPath, entryPath) {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntry(entryPath);
  if (!entry) return console.log('Not found:', entryPath, 'in', zipPath);
  const buf = entry.getData();
  console.log(zipPath, entryPath);
  console.log('  Size:', buf.length);
  console.log('  Header:', buf.slice(0, 16).toString());
  // Read first 64 bytes as uint32
  const headerVals = [];
  for (let i = 0; i < Math.min(64, buf.length); i += 4) {
    headerVals.push(buf.readUInt32LE(i));
  }
  console.log('  Header uint32s:', headerVals);
}

inspectGdm('F:/mods4/FS25_2Village_Map.zip', 'maps/data/densityMap_fruits.gdm');
inspectGdm('F:/mods4/FS25_Cybuchowo.zip', 'maps/data/densityMap_fruits.gdm');
