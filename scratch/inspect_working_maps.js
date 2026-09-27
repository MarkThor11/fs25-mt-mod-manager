const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const modsDir = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');

const workingMaps = [
    'FS25_AgroForests.zip',
    'FS25_Ebony_Island.zip'
];

for (const zipName of workingMaps) {
    const zipPath = path.join(modsDir, zipName);
    console.log(`\n=================== ${zipName} ===================`);
    if (!fs.existsSync(zipPath)) {
        console.log("ZIP not found!");
        continue;
    }
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    // Fruit GDM
    const fruitEntries = entries.filter(e => e.entryName.toLowerCase().endsWith('densitymap_fruits.gdm'));
    for (const fe of fruitEntries) {
        const buf = fe.getData();
        const headerHex = buf.slice(0, 16).toString('hex').toUpperCase();
        const isMdf = buf.length >= 4 && buf[0] === 0x21 && buf[1] === 0x4D && buf[2] === 0x44 && buf[3] === 0x46;
        console.log(`Fruit GDM: ${fe.entryName} | Size: ${buf.length} bytes | Header: ${headerHex} | isMapEditor(!MDF): ${isMdf}`);
    }

    // fields.xml
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
