const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');

// Mock a tiny DDS header and data if no real one found
function probeDDS(buffer) {
    if (buffer[0] === 0x44 && buffer[1] === 0x44 && buffer[2] === 0x53 && buffer[3] === 0x20) {
        const height = buffer.readInt32LE(12);
        const width = buffer.readInt32LE(16);
        const flags = buffer.readInt32LE(8);
        const pitch = buffer.readInt32LE(20);
        const mipmaps = buffer.readInt32LE(28);
        const fourCC = buffer.toString('utf8', 84, 88);
        console.log(`DDS Header: ${width}x${height}, format=${fourCC}, mipmaps=${mipmaps}, flags=0x${flags.toString(16)}`);
        return { width, height, fourCC };
    }
    return null;
}

async function verify() {
    const modsPath = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');
    const files = fs.readdirSync(modsPath).filter(f => f.endsWith('.zip'));
    
    if (files.length === 0) {
        console.log("No mods found to verify.");
        return;
    }

    const testFile = files[0];
    console.log(`Analyzing: ${testFile}`);
    const zip = new AdmZip(path.join(modsPath, testFile));
    const ddsEntries = zip.getEntries().filter(e => e.entryName.toLowerCase().endsWith('.dds'));
    
    if (ddsEntries.length === 0) {
        console.log("No DDS files in this mod.");
        return;
    }

    const buffer = ddsEntries[0].getData();
    const info = probeDDS(buffer);
    if (info) {
        // We can't easily "see" the image, but we can check if the file uses standard DXT formats
        // that our decoder handles.
    }
}

verify();
