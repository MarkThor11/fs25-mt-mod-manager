const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');

// Mocking minimal dependencies for the test
const decodeDDS = (buffer, width, height, format) => {
    // This is the logic from modManager.js
    const rgba = Buffer.alloc(width * height * 4);
    let offset = 128; // Header
    
    for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
            if (offset + 8 > buffer.length) break;
            const c0 = buffer.readUInt16LE(offset);
            const c1 = buffer.readUInt16LE(offset + 2);
            let lookup = buffer.readUInt32LE(offset + 4);
            offset += 8;

            const r0 = (c0 >> 11) & 0x1F;
            const g0 = (c0 >> 5) & 0x3F;
            const b0 = c0 & 0x1F;
            const rgb0 = [Math.floor(r0 * 255 / 31), Math.floor(g0 * 255 / 63), Math.floor(b0 * 255 / 31)];

            const r1 = (c1 >> 11) & 0x1F;
            const g1 = (c1 >> 5) & 0x3F;
            const b1 = c1 & 0x1F;
            const rgb1 = [Math.floor(r1 * 255 / 31), Math.floor(g1 * 255 / 63), Math.floor(b1 * 255 / 31)];

            const colors = [
                [...rgb0, 255],
                [...rgb1, 255],
                [0, 0, 0, 255],
                [0, 0, 0, 255]
            ];

            if (c0 > c1) {
                colors[2] = [
                    Math.floor((2 * colors[0][0] + colors[1][0] + 1) / 3),
                    Math.floor((2 * colors[0][1] + colors[1][1] + 1) / 3),
                    Math.floor((2 * colors[0][2] + colors[1][2] + 1) / 3),
                    255
                ];
                colors[3] = [
                    Math.floor((colors[0][0] + 2 * colors[1][0] + 1) / 3),
                    Math.floor((colors[0][1] + 2 * colors[1][1] + 1) / 3),
                    Math.floor((colors[0][2] + 2 * colors[1][2] + 1) / 3),
                    255
                ];
            } else {
                colors[2] = [
                    Math.floor((colors[0][0] + colors[1][0]) / 2),
                    Math.floor((colors[0][1] + colors[1][1]) / 2),
                    Math.floor((colors[0][2] + colors[1][2]) / 2),
                    255
                ];
                colors[3] = [0, 0, 0, 0];
            }

            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < 4; i++) {
                    const idx = (lookup >> (2 * (j * 4 + i))) & 0x03;
                    const pixel = colors[idx];
                    const px = x + i;
                    const py = y + j;
                    if (px < width && py < height) {
                        const rgbaIdx = (py * width + px) * 4;
                        rgba[rgbaIdx] = pixel[0];
                        rgba[rgbaIdx + 1] = pixel[1];
                        rgba[rgbaIdx + 2] = pixel[2];
                        rgba[rgbaIdx + 3] = pixel[3];
                    }
                }
            }
        }
    }
    return rgba;
};

async function test() {
    console.log('Testing Jasper River Valley icon extraction...');
    const zipPath = 'C:/Users/Mark/Documents/My Games/FarmingSimulator2025/mods/Jasper_River_Valley.zip';
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry('icon_JasperRiverValley.dds');
    
    if (!entry) {
        console.log('FAILED: icon_JasperRiverValley.dds not found in zip');
        return;
    }

    const buffer = entry.getData();
    console.log('Icon buffer size:', buffer.length);

    const width = 512;
    const height = 512;
    const format = 'dxt1';

    try {
        const rgba = decodeDDS(buffer, width, height, format);
        console.log('Successfully decoded DDS to RGBA buffer. Size:', rgba.length);
        
        // Sample some pixels to see if they are all black
        let totalVal = 0;
        for (let i = 0; i < rgba.length; i++) {
            totalVal += rgba[i];
        }
        console.log('Sample total pixel sum:', totalVal);
        if (totalVal === 0) {
            console.log('WARNING: The entire image is PURE BLACK.');
        } else {
            console.log('SUCCESS: Image contains data.');
        }

    } catch (e) {
        console.error('Decoding failed:', e);
    }
}

test();
