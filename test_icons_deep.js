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

    for (let i = 0; i < Math.min(10, files.length); i++) {
        const filePath = path.join(modsPath, files[i]);
        console.log(`\nTesting: ${files[i]}`);
        try {
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();
            
            // Search for every single image file in the entire ZIP
            const imgs = entries.filter(e => {
                const name = e.entryName.toLowerCase();
                return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.dds');
            });

            console.log(`  - Total Images: ${imgs.length}`);
            imgs.forEach(img => {
                console.log(`    - ${img.entryName} (${img.header.size} bytes)`);
            });
            
        } catch (err) {
            console.error(`  - Failed to read zip: ${err.message}`);
        }
    }
}

testIconExtraction();
