const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const modsRoot = path.join(process.env.USERPROFILE, 'Documents/My Games/FarmingSimulator2025/mods');

// Check both Alliklepa and compare with Ebony Island
const maps = [
    { name: 'Alliklepa', zip: path.join(modsRoot, 'FS25_Alliklepa_crossplay.zip') },
    { name: 'Ebony Island', zip: 'C:/Users/Mark/Documents/My Games/FarmingSimulator2025/modManagerTemplates/FS25_Ebony_Island_SampleModMap.zip' }
];

for (const { name, zip } of maps) {
    if (!fs.existsSync(zip)) {
        console.log(`\n${name}: ZIP not found at ${zip}`);
        continue;
    }
    
    console.log(`\n=== ${name} ===`);
    const z = new AdmZip(zip);
    const entries = z.getEntries();
    
    // Find densityMap_fruits.gdm
    const gdm = entries.find(e => path.basename(e.entryName).toLowerCase() === 'densitymap_fruits.gdm');
    if (!gdm) {
        console.log('  No densityMap_fruits.gdm found');
        continue;
    }
    
    const data = gdm.getData();
    console.log(`  GDM size: ${data.length} bytes`);
    console.log(`  Header (32 bytes hex): ${data.slice(0, 32).toString('hex')}`);
    
    // Count non-zero bytes in the data (excluding header)
    const payload = data.slice(32);
    const nonZero = payload.filter(b => b !== 0).length;
    const zeroPercent = (100 * (payload.length - nonZero) / payload.length).toFixed(1);
    console.log(`  Payload: ${payload.length} bytes, ${zeroPercent}% zeros (${nonZero} non-zero bytes)`);
    console.log(`  Sample bytes at offset 1000-1016: ${data.slice(1000, 1016).toString('hex')}`);
    console.log(`  Sample bytes at offset 5000-5016: ${data.slice(5000, 5016).toString('hex')}`);
}
