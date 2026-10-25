const path = require('path');
const modManager = require(path.join(__dirname, '../src/main/services/modManager'));

async function check() {
  const result = await modManager.scanLocalMods();
  console.log('Total returned from scanLocalMods:', result.mods.length);
  
  const sample = result.mods.slice(0, 5).map(m => ({
    title: m.title,
    modId: m.modId,
    isModHub: m.isModHub,
    isFolder: m.isFolder,
    isDLC: m.isDLC
  }));
  console.log('Sample mods:', sample);
}

check();
