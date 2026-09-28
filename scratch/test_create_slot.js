const fs = require('fs');
const path = require('path');

async function testCreate() {
  try {
    const savegameManager = require('../src/main/services/savegameManager');
    const modManager = require('../src/main/services/modManager');

    console.log('Testing createSavegameWithMods for FS25_SomewhereMontana into slot 88...');
    const result = await savegameManager.createSavegameWithMods(88, 'Test Montana Slot', [], {
      mapModName: 'FS25_SomewhereMontana',
      mapId: 'FS25_SomewhereMontana.SomewhereInMontana',
      mapTitle: 'Somewhere, Montana',
      money: 1000000,
      mode: 'NEW_FARMER',
      includeStartFarm: true,
      includeStartVehicles: true
    });

    console.log('Creation result:', result);

    const slotPath = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'savegame88');
    if (fs.existsSync(slotPath)) {
      console.log('=== CREATED SLOT 88 FILES ===');
      const files = fs.readdirSync(slotPath);
      files.forEach(f => {
        const stat = fs.statSync(path.join(slotPath, f));
        console.log(' ', f.padEnd(45), stat.size, 'bytes');
      });

      const careerPath = path.join(slotPath, 'careerSavegame.xml');
      if (fs.existsSync(careerPath)) {
        console.log('=== CAREERSAVEGAME.XML SETTINGS ===');
        const cText = fs.readFileSync(careerPath, 'utf8');
        const sMatch = cText.match(/<settings>[\s\S]*?<\/settings>/i);
        console.log(sMatch ? sMatch[0] : 'No settings tag');
      }
    }
  } catch (e) {
    console.error('Error during test creation:', e);
  }
}

testCreate();
