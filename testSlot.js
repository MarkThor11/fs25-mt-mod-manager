const savegameManager = require('./src/main/services/savegameManager.js');
const fs = require('fs-extra');
const path = require('path');

async function test() {
    await savegameManager.createSavegameWithMods(10, 'Test', [
        { modName: 'FS25_Alliklepa_crossplay', isMap: true }
    ]);
    const sp = 'C:/Users/Mark/Documents/My Games/FarmingSimulator2025/savegame10';
    console.log('fields.xml exists:', fs.existsSync(path.join(sp, 'fields.xml')));
    console.log('fruits GDM exists:', fs.existsSync(path.join(sp, 'densityMap_fruits.gdm')));
    const c = fs.readFileSync(path.join(sp, 'careerSavegame.xml'), 'utf8');
    console.log('densityMapRevision matches:', c.match(/<densityMapRevision>.*?<\/densityMapRevision>/));
    
    // simulate gameLauncher
    await savegameManager.ensureSavegameDensityMaps(sp);
    const c2 = fs.readFileSync(path.join(sp, 'careerSavegame.xml'), 'utf8');
    console.log('after ensure - densityMapRevision matches:', c2.match(/<densityMapRevision>.*?<\/densityMapRevision>/));
    console.log('after ensure - fruits GDM exists:', fs.existsSync(path.join(sp, 'densityMap_fruits.gdm')));
}
test().catch(console.error);
