const path = require('path');
const modManager = require(path.join(__dirname, '../src/main/services/modManager'));

async function testScan() {
  const result = await modManager.scanLocalMods();
  console.log('Result total mods:', result.mods.length);
  
  let modhubCount = 0;
  result.mods.forEach(m => {
    if (!m.isDLC && !m.isFolder && (m.modId || m.isModHub)) {
      modhubCount++;
    }
  });
  console.log('ModHub tag count in scan result:', modhubCount);
  
  const folders = result.mods.filter(m => m.isFolder);
  console.log('Folder mods in scan result:', folders.length);
}

testScan();
