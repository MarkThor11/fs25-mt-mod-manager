const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const fs25Path = path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025');
const templatesDir = path.join(fs25Path, 'modManagerTemplates');
const mapId = 'MapEU';
const cleanMapId = mapId.replace(/[^a-z0-9]/gi, '_');
const folderPath = path.join(templatesDir, cleanMapId);
const heightmap = path.join(folderPath, 'terrain.heightmap.png');

console.log('mapId:', mapId);
console.log('cleanMapId:', cleanMapId);
console.log('folderPath:', folderPath);
console.log('Exists:', fs.existsSync(heightmap));
