const mm = require('./src/main/services/modManager');
const cache = require('./src/main/services/cache');

async function test() {
    const r = await mm.scanLocalMods();
    const monteriggioni = r.mods.find(m => m.modName === 'FS25_Monteriggioni');
    
    // Let's print out Monteriggioni's dependencies as seen by the app
    console.log('Monteriggioni Dependencies in App:', monteriggioni.dependencies);

    // Let's also run our resolveRecursiveDependencies logic
    const { resolveRecursiveDependencies } = await import('./src/renderer/utils/modUtils.js');
    const result = resolveRecursiveDependencies('FS25_Monteriggioni', r.mods);
    
    console.log('Auto-Selected Mods:', Array.from(result.installed));
    console.log('Missing Mods:', Array.from(result.missing));
}

test().catch(console.error);
