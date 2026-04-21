const path = require('path');
const fs = require('fs-extra');

const home = process.env.USERPROFILE || process.env.HOME || '';
const fs25Path = path.join(home, 'Documents', 'My Games', 'FarmingSimulator2025');
const save1 = path.join(fs25Path, 'savegame1');

async function verify() {
    console.log(`Checking savegame1 at: ${save1}`);
    if (fs.existsSync(save1)) {
        const files = fs.readdirSync(save1);
        console.log(`Files found: ${files.join(', ')}`);
        
        const required = ['careerSavegame.xml', 'farms.xml', 'environment.xml', 'placeables.xml', 'items.xml', 'vehicles.xml', 'player.xml', 'salesStats.xml'];
        const missing = required.filter(f => !files.includes(f));
        
        if (missing.length === 0) {
            console.log('SUCCESS: All mandatory XML files are present.');
        } else {
            console.log(`FAILURE: Missing files: ${missing.join(', ')}`);
        }
    } else {
        console.log('Savegame1 folder not found.');
    }
}

verify();
