const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');

async function findCorruptMods() {
    const modsPath = 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods';
    if (!fs.existsSync(modsPath)) {
        console.error('mods folder not found!');
        return;
    }

    const entries = fs.readdirSync(modsPath);
    console.log(`Checking ${entries.length} items for corruption...`);

    const corrupt = [];

    for (const entry of entries) {
        if (!entry.endsWith('.zip')) continue;
        const fullPath = path.join(modsPath, entry);

        try {
            // Check file size first
            const stats = fs.statSync(fullPath);
            if (stats.size === 0) {
                throw new Error('Zero byte file');
            }

            // Try to open and read central directory
            const zip = new AdmZip(fullPath);
            const zipEntries = zip.getEntries();
            
            // Try to find modDesc.xml
            const hasModDesc = zipEntries.some(e => e.entryName.toLowerCase() === 'moddesc.xml');
            if (!hasModDesc) {
                // Not necessarily a crash cause, but suspicious
                // console.warn(`[WARN] ${entry} has no modDesc.xml`);
            }
        } catch (err) {
            console.log(`[CORRUPT] ${entry}: ${err.message}`);
            corrupt.push({ entry, error: err.message });
        }
    }

    console.log('\n--- CORRUPTION REPORT ---');
    if (corrupt.length === 0) {
        console.log('No obvious ZIP corruption detected by AdmZip.');
        console.log('The crash might be caused by a valid ZIP with content the game engine hates.');
    } else {
        console.log(`Found ${corrupt.length} potentially corrupt files:`);
        corrupt.forEach(c => console.log(`  - ${c.entry} (${c.error})`));
        
        console.log('\nMoving corrupt files to mods_corrupt folder...');
        const dest = 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods_corrupt';
        fs.ensureDirSync(dest);
        for (const c of corrupt) {
            try {
                fs.moveSync(path.join(modsPath, c.entry), path.join(dest, c.entry));
                console.log(`  Moved ${c.entry}`);
            } catch (e) {
                console.error(`  Failed to move ${c.entry}: ${e.message}`);
            }
        }
    }
}

findCorruptMods();
