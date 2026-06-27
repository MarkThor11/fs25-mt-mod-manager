const modManager = require('../src/main/services/modManager');
const cache = require('../src/main/services/cache');

async function test() {
    console.log('--- STARTING SCAN ---');
    try {
        console.log('Primary mods path setting:', cache.getSetting('modsPath'));
        console.log('modsPaths setting:', cache.getSetting('modsPaths'));
        console.log('getDefaultModsPath():', modManager.getDefaultModsPath());
        
        const result = await modManager.scanLocalMods(null, true);
        console.log('Scan result:');
        console.log('Number of mods found:', result.mods ? result.mods.length : 0);
        console.log('Number of folders found:', result.allFolders ? result.allFolders.length : 0);
        console.log('Conflicts:', result.conflicts ? result.conflicts.length : 0);
        console.log('Missing dependencies:', result.missingDependencies ? result.missingDependencies.length : 0);
        if (result.mods && result.mods.length > 0) {
            console.log('First 5 mods:');
            console.log(result.mods.slice(0, 5).map(m => ({
                title: m.title,
                fileName: m.fileName,
                isMap: m.isMap,
                folder: m.folder
            })));
            const maps = result.mods.filter(m => m.isMap);
            console.log('Maps found:', maps.length);
            if (maps.length > 0) {
                console.log('First 5 maps:', maps.slice(0, 5).map(m => m.title));
            }
        }
    } catch (e) {
        console.error('Scan failed with error:', e);
    }
}

test();
