const modManager = require('./src/main/services/modManager');
const path = require('path');
const fs = require('fs');

async function debug() {
    console.log('--- DEBUG DLC ---');
    try {
        const { mods, allFolders } = await modManager.scanLocalMods();
        const dlcs = mods.filter(m => m.isDLC);
        console.log(`Found ${mods.length} total mods.`);
        console.log(`Found ${dlcs.length} DLCs.`);
        console.log('Folders:', allFolders);
        
        if (dlcs.length > 0) {
            console.log('First DLC:', dlcs[0]);
        } else {
            // Check paths manually
            const dataRoot = modManager.getFS25DataRoot();
            console.log('Data Root:', dataRoot);
            const pdlcPath = path.join(dataRoot, 'pdlc');
            console.log('Profile pdlc path:', pdlcPath);
            if (fs.existsSync(pdlcPath)) {
                console.log('Files in profile pdlc:', fs.readdirSync(pdlcPath));
            } else {
                console.log('Profile pdlc folder does NOT exist.');
            }
        }
    } catch (e) {
        console.error('Debug failed:', e);
    }
}

debug();
