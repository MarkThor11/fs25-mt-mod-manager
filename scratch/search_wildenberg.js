const modManager = require('../src/main/services/modManager');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const zipPath = path.join(modManager.getModsPath(), 'FS25_Wildenberg.zip');
const zip = new AdmZip(zipPath);

const entry = zip.getEntry('maps/map/map.i3d');
if (entry) {
    const text = entry.getData().toString('utf8');
    const lines = text.split('\n');
    lines.forEach((l, idx) => {
        const m = l.match(/translation="([^"]+)"/);
        if (m) {
            const coords = m[1].split(' ').map(parseFloat);
            if (coords[0] >= 550 && coords[0] <= 680 && coords[2] >= 750 && coords[2] <= 850) {
                console.log('L' + (idx+1) + ':', l.trim());
            }
        }
    });
}
