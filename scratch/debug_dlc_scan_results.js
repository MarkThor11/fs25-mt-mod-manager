const modManager = require('../src/main/services/modManager');
const path = require('path');

async function debugScan() {
    console.log('--- DLC SCAN DEBUG ---');
    try {
        const result = await modManager.performScan();
        const dlcs = result.mods.filter(m => m.isDLC);
        console.log(`Found ${dlcs.length} DLCs:`);
        dlcs.forEach(d => {
            console.log(` - ${d.title} (${d.fileName}) [Icon: ${d.iconData.substring(0, 50)}...]`);
        });
    } catch (e) {
        console.error('Scan failed:', e);
    }
}

debugScan();
