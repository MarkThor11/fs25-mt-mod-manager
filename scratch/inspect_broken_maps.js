const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const modsDir = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');

const targetMaps = [
    'FS25_2Village_Map.zip',
    'FS25_Arkansas_Of_American.zip',
    'FS25_Frankenmuth_Map.zip',
    'FS25_goldenLandsMap.zip',
    'FS25_Hermanns_Hausen_Map.zip'
];

for (const zipName of targetMaps) {
    const zipPath = path.join(modsDir, zipName);
    console.log(`\n=================== ${zipName} ===================`);
    if (!fs.existsSync(zipPath)) {
        console.log("ZIP not found!");
        continue;
    }
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    // 1. Check modDesc.xml for map config path
    const modDesc = entries.find(e => e.entryName.toLowerCase() === 'moddesc.xml');
    if (modDesc) {
        const text = modDesc.getData().toString('utf8');
        const mapMatch = text.match(/<map\s+[^>]*configFilename=["']([^"']+)["']/i);
        console.log(`modDesc configFilename: ${mapMatch ? mapMatch[1] : 'NOT FOUND'}`);
    }

    // 2. Find and check map.xml / map config XML
    const mapXmls = entries.filter(e => e.entryName.toLowerCase().endsWith('map.xml') && !e.entryName.toLowerCase().includes('sound'));
    for (const mx of mapXmls) {
        console.log(`Checking map XML: ${mx.entryName}`);
        const text = mx.getData().toString('utf8');
        
        // Search for densityMap / densityMaps tag
        const dMatches = text.match(/<densityMap[s]?\s+[^>]*>/gi) || [];
        dMatches.forEach(m => console.log(`   ${m}`));
        
        // Search for fields tag
        const fMatches = text.match(/<fields\s+[^>]*>/gi) || [];
        fMatches.forEach(m => console.log(`   ${m}`));
    }

    // 3. Inspect densityMap_fruits.gdm header (first 16 bytes)
    const fruitEntries = entries.filter(e => e.entryName.toLowerCase().endsWith('densitymap_fruits.gdm'));
    for (const fe of fruitEntries) {
        const buf = fe.getData();
        const headerHex = buf.slice(0, 16).toString('hex').toUpperCase();
        const isMdf = buf.length >= 4 && buf[0] === 0x21 && buf[1] === 0x4D && buf[2] === 0x44 && buf[3] === 0x46;
        console.log(`Fruit GDM: ${fe.entryName} | Size: ${buf.length} bytes | Header: ${headerHex} | isMapEditor(!MDF): ${isMdf}`);
    }

    // 4. Inspect fields.xml if found
    const fieldsXmls = entries.filter(e => e.entryName.toLowerCase().endsWith('fields.xml'));
    for (const fx of fieldsXmls) {
        const text = fx.getData().toString('utf8');
        const fieldTags = text.match(/<field\s+[^>]*>/gi) || [];
        const stateTags = text.match(/<fieldState\s+[^>]*>/gi) || [];
        console.log(`fields.xml: ${fx.entryName} | <field> tags: ${fieldTags.length} | <fieldState> tags: ${stateTags.length}`);
        if (fieldTags.length > 0) {
            console.log(`   Sample field: ${fieldTags[0]}`);
        }
        if (stateTags.length > 0) {
            console.log(`   Sample fieldState: ${stateTags[0]}`);
        }
    }
}
