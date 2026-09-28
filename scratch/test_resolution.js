const fs = require('fs');
const path = require('path');

async function testResolution() {
  const savegameManager = require('../src/main/services/savegameManager');
  const modManager = require('../src/main/services/modManager');

  const { mods: allMods } = await modManager.scanLocalMods();
  console.log('Total scanned mods:', allMods.length);

  const mapMod = allMods.find(m => m.isMap && m.modName && m.modName.toLowerCase().includes('montana'));
  console.log('Found Montana map mod:', mapMod);
}

testResolution();
