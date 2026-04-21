const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');

// MOCK the decoder logic here
function decode565(val) {
    const r = (val >> 11) & 0x1F;
    const g = (val >> 5) & 0x3F;
    const b = val & 0x1F;
    return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

function decodeDDS(buffer, width, height, format) {
    const rgba = Buffer.alloc(width * height * 4);
    const dataOffset = 128;
    let offset = dataOffset;

    for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
            let colors = [];
            let alphaBlocks = null;

            if (format === 'dxt5') {
                alphaBlocks = buffer.slice(offset, offset + 8);
                offset += 8;
            }

            if (offset + 8 > buffer.length) break;

            const c0 = buffer.readUInt16LE(offset);
            const c1 = buffer.readUInt16LE(offset + 2);
            const lookup = buffer.readUInt32LE(offset + 4);
            offset += 8;

            const rgb0 = decode565(c0);
            const rgb1 = decode565(c1);
            colors[0] = [...rgb0, 255];
            colors[1] = [...rgb1, 255];
            
            if (c0 > c1) {
                colors[2] = [Math.floor((2 * colors[0][0] + colors[1][0]) / 3), Math.floor((2 * colors[0][1] + colors[1][1]) / 3), Math.floor((2 * colors[0][2] + colors[1][2]) / 3), 255];
                colors[3] = [Math.floor((colors[0][0] + 2 * colors[1][0]) / 3), Math.floor((colors[0][1] + 2 * colors[1][1]) / 3), Math.floor((colors[0][2] + 2 * colors[1][2]) / 3), 255];
            } else {
                colors[2] = [Math.floor((colors[0][0] + colors[1][0]) / 2), Math.floor((colors[0][1] + colors[1][1]) / 2), Math.floor((colors[0][2] + colors[1][2]) / 2), 255];
                colors[3] = [0, 0, 0, 0];
            }

            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < 4; i++) {
                    const idx = (lookup >> (2 * (j * 4 + i))) & 0x03;
                    let pixel = colors[idx];
                    
                    if (format === 'dxt5' && alphaBlocks) {
                        const a0 = alphaBlocks[0];
                        const a1 = alphaBlocks[1];
                        const aLookup = (BigInt(alphaBlocks.readUInt32LE(2)) | (BigInt(alphaBlocks.readUInt16LE(6)) << 32n));
                        const aIdx = Number((aLookup >> BigInt(3 * (j * 4 + i))) & 0x07n);
                        let alpha = 255;
                        if (aIdx === 0) alpha = a0;
                        else if (aIdx === 1) alpha = a1;
                        else if (a0 > a1) alpha = Math.floor(((8 - aIdx) * a0 + (aIdx - 1) * a1) / 7);
                        else if (aIdx === 6) alpha = 0;
                        else if (aIdx === 7) alpha = 255;
                        else alpha = Math.floor(((6 - aIdx) * a0 + (aIdx - 5) * a1) / 5);
                        pixel = [...pixel.slice(0, 3), alpha];
                    }

                    const px = x + i;
                    const py = y + j;
                    if (px < width && py < height) {
                        const rgbaIdx = (py * width + px) * 4;
                        // Use RGBA for the test (we'll save with a library or just check raw)
                        rgba[rgbaIdx] = pixel[0]; 
                        rgba[rgbaIdx+1] = pixel[1];
                        rgba[rgbaIdx+2] = pixel[2];
                        rgba[rgbaIdx+3] = pixel[3];
                    }
                }
            }
        }
    }
    return rgba;
}

async function debugIcon() {
    const modsPath = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');
    const geistalPath = path.join(modsPath, 'Geistal.zip');
    
    if (!fs.existsSync(geistalPath)) return;
    
    const zip = new AdmZip(geistalPath);
    const dds = zip.getEntry('icon_Geistal.dds');
    const buffer = dds.getData();
    
    const rgba = decodeDDS(buffer, 512, 512, 'dxt1');
    
    // Save raw RGBA for size check
    fs.writeFileSync('debug_rgba.bin', rgba);
    console.log(`Saved 512x512 RGBA (${rgba.length} bytes) to debug_rgba.bin`);
    
    // Check if the output has recognizable data (not just zeros or noise)
    let nonZeroCount = 0;
    for(let i=0; i<rgba.length; i++) if(rgba[i] !== 0) nonZeroCount++;
    console.log(`Non-zero bytes: ${nonZeroCount} out of ${rgba.length} (${Math.round(nonZeroCount/rgba.length*100)}%)`);
}

debugIcon();
