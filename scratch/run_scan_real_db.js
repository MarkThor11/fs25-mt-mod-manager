const { app } = require('electron');
const path = require('path');

// Override userData to point to the real app's data folder
app.setPath('userData', 'C:\\Users\\Mark\\AppData\\Roaming\\fs25-mt-mod-manager');

const modManager = require('../src/main/services/modManager');
const cache = require('../src/main/services/cache');

async function test() {
    console.log('--- STARTING REAL SCAN ---');
    try {
        cache.init();
        console.log('UserData path:', app.getPath('userData'));
        console.log('Primary mods path setting:', cache.getSetting('modsPath'));
        console.log('modsPaths setting:', cache.getSetting('modsPaths'));
        console.log('getModsPaths():', modManager.getModsPaths());
        
        console.log('Calling scanLocalMods(null, true)...');
        const start = Date.now();
        const result = await modManager.scanLocalMods(null, true);
        const duration = Date.now() - start;
        console.log(`Scan completed in ${duration}ms.`);
        console.log('Number of mods found:', result.mods ? result.mods.length : 0);
        console.log('Number of folders found:', result.allFolders ? result.allFolders.length : 0);
        
        if (result.error) {
            console.error('Scan returned error:', result.error);
        }
        
        if (result.mods && result.mods.length > 0) {
            console.log('First 5 mods:');
            console.log(result.mods.slice(0, 5).map(m => ({
                title: m.title,
                fileName: m.fileName,
                isMap: m.isMap,
                folder: m.folder
            })));
        }
    } catch (e) {
        console.error('Scan failed with error:', e);
    }
    process.exit(0);
}

app.whenReady().then(test);
