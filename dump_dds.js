const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');

async function dumpDDSHeaders() {
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
        console.log(`\n--- ${files[i]} ---`);
        try {
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();
            const dds = entries.find(e => e.entryName.toLowerCase().endsWith('_icon.dds') || e.entryName.toLowerCase().startsWith('icon_') && e.entryName.toLowerCase().endsWith('.dds'));

            if (dds) {
                const buffer = dds.getData();
                console.log(`File: ${dds.entryName} (${buffer.length} bytes)`);
                // Dump first 128 bytes (header)
                const header = buffer.slice(0, 128);
                console.log(`Headers (Hex): ${header.toString('hex').match(/.{1,32}/g).join('\n')}`);
                
                // Parse Width/Height from bytes 12/16
                const height = buffer.readUInt32LE(12);
                const width = buffer.readUInt32LE(16);
                console.log(`Resolution: ${width}x${height}`);
                
                // Pixel Format FourCC at offset 84
                const fourCC = buffer.toString('utf8', 84, 88);
                const flags = buffer.readUInt32LE(80);
                console.log(`PixelFormat: FourCC='${fourCC}', Flags=${flags.toString(16)}`);
            } else {
                console.log("No DDS icon found.");
            }
            
        } catch (err) {
            console.error(`Failed to read zip: ${err.message}`);
        }
    }
}

dumpDDSHeaders();
