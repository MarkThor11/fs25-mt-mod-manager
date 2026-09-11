
const modManager = require('./src/main/services/modManager.js');
const path = require('path');

async function test() {
    await modManager.scanLocalMods();
    const result = modManager.getLastScanResult();
    const mods = result.mods;
    
    // The user sent a screenshot showing LumberJack selected. 
    // Let's print out ANY mod that has loki in the author field OR LumberJack in the title.
    const candidates = mods.filter(m => 
        (m.author && m.author.toLowerCase().includes('loki')) ||
        (m.title && typeof m.title === 'string' && m.title.toLowerCase().includes('lumber')) ||
        (m.modName && m.modName.toLowerCase().includes('lumber'))
    );
    
    console.log('Candidates:', JSON.stringify(candidates.map(m => ({title: m.title, name: m.modName, author: m.author, isMap: m.isMapMod, scripts: (m.scripts || []).length})), null, 2));
}

test().catch(console.error);
