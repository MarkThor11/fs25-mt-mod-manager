const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');

async function testIconExtraction() {
    const modsPath = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');
    console.log(`Checking mods path: ${modsPath}`);
    
    if (!fs.existsSync(modsPath)) {
        console.error("Mods path does not exist!");
        return;
    }

    const files = fs.readdirSync(modsPath).filter(f => f.endsWith('.zip'));
    console.log(`Found ${files.length} zip files.`);

    for (let i = 0; i < Math.min(5, files.length); i++) {
        const filePath = path.join(modsPath, files[i]);
        console.log(`\nTesting: ${files[i]}`);
        try {
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();
            const pngs = entries.filter(e => e.entryName.toLowerCase().endsWith('.png'));
            const jpgs = entries.filter(e => e.entryName.toLowerCase().endsWith('.jpg'));
            const dds = entries.filter(e => e.entryName.toLowerCase().endsWith('.dds'));

            console.log(`  - PNGs: ${pngs.length}`);
            console.log(`  - JPGs: ${jpgs.length}`);
            console.log(`  - DDS: ${dds.length}`);

            if (pngs.length > 0) {
                const buffer = pngs[0].getData();
                console.log(`  - Extracted ${pngs[0].entryName} (${buffer.length} bytes)`);
                const base64 = buffer.toString('base64');
                console.log(`  - Base64 Length: ${base64.length}`);
                console.log(`  - First 50 chars: ${base64.substring(0, 50)}...`);
            }
        } catch (err) {
            console.error(`  - Failed to read zip: ${err.message}`);
        }
    }
}

testIconExtraction();
