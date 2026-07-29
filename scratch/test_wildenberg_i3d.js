const modManager = require('../src/main/services/modManager');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

function degToRad(deg) { return deg * Math.PI / 180; }

function applyTransform(pos, rotYDeg, localPos) {
    const rad = degToRad(rotYDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const x = localPos[0]*cos + localPos[2]*sin + pos[0];
    const y = localPos[1] + pos[1];
    const z = -localPos[0]*sin + localPos[2]*cos + pos[2];
    return [x, y, z];
}

function parseI3dShopPos(i3dText) {
    // 1. Look for vehicleShopTrigger containing vehicleShopPlayerSpawn
    const triggerMatch = i3dText.match(/<Shape\s+[^>]*name="[^"]*vehicleShopTrigger[^"]*"[^>]*translation="([^"]+)"[^>]*rotation="([^"]+)"[\s\S]*?<TransformGroup\s+[^>]*name="[^"]*vehicleShopPlayerSpawn[^"]*"[^>]*translation="([^"]+)"/i) ||
                         i3dText.match(/<TransformGroup\s+[^>]*name="[^"]*vehicleShop[^"]*"[^>]*translation="([^"]+)"[^>]*rotation="([^"]+)"[\s\S]*?<TransformGroup\s+[^>]*name="[^"]*vehicleShopPlayerSpawn[^"]*"[^>]*translation="([^"]+)"/i);
    
    if (triggerMatch) {
        const tPos = triggerMatch[1].split(' ').map(parseFloat);
        const tRot = triggerMatch[2].split(' ').map(parseFloat);
        const sPos = triggerMatch[3].split(' ').map(parseFloat);
        const rotY = tRot.length >= 2 ? tRot[1] : 0;
        const worldPos = applyTransform(tPos, rotY, sPos);
        return { x: worldPos[0], y: worldPos[1], z: worldPos[2] };
    }

    // 2. Direct transform group match with translation
    const match = i3dText.match(/<TransformGroup\s+[^>]*name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport)[^"]*"[^>]*translation="([^"]+)"/i) ||
                  i3dText.match(/name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport)[^"]*"[^>]*translation="([^"]+)"/i) ||
                  i3dText.match(/translation="([^"]+)"[^>]*name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport)[^"]*"/i);
    if (match && match[1]) {
        const coords = match[1].split(' ').map(parseFloat);
        if (coords.length >= 3 && !isNaN(coords[0])) {
            return { x: coords[0], y: coords[1], z: coords[2] };
        }
    }
    return null;
}

const zipPath = path.join(modManager.getModsPath(), 'FS25_Wildenberg.zip');
const zip = new AdmZip(zipPath);
const i3dEntry = zip.getEntry('maps/map/map.i3d') || zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('map.i3d'));
if (i3dEntry) {
    const text = i3dEntry.getData().toString('utf8');
    console.log('Parsed Wildenberg shop pos from map.i3d:', parseI3dShopPos(text));
}
