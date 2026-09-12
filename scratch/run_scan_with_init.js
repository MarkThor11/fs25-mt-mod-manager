const { app } = require('electron');
const modManager = require('../src/main/services/modManager');
const cache = require('../src/main/services/cache');

async function test() {
    console.log('--- STARTING SCAN WITH INIT ---');
    try {
        cache.init();
        console.log('Primary mods path setting:', cache.getSetting('modsPath'));
        console.log('modsPaths setting:', cache.getSetting('modsPaths'));
        console.log('getModsPaths():', modManager.getModsPaths());
        
        const result = await modManager.scanLocalMods(null, true);
        console.log('Scan result:');
        console.log('Number of mods found:', result.mods ? result.mods.length : 0);
        console.log('Number of folders found:', result.allFolders ? result.allFolders.length : 0);
    } catch (e) {
        console.error('Scan failed with error:', e);
    }
    process.exit(0);
}

app.whenReady().then(test);
