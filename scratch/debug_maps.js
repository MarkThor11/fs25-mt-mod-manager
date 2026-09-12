const fs = require('fs-extra');
const path = require('path');
const os = require('os');

function getFS25Path() {
    return path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025');
}

async function debugMaps() {
    const fs25Path = getFS25Path();
    const templatesDir = path.join(fs25Path, 'modManagerTemplates');
    
    console.log('Templates Directory:', templatesDir);
    
    if (!fs.existsSync(templatesDir)) {
        console.log('Templates directory does not exist.');
        return;
    }
    
    const folders = await fs.readdir(templatesDir);
    console.log('Found folders:', folders);
    
    for (const folder of folders) {
        const folderPath = path.join(templatesDir, folder);
        const heightmap = path.join(folderPath, 'terrain.heightmap.png');
        const careerPath = path.join(folderPath, 'careerSavegame.xml');
        
        console.log(`\n--- Folder: ${folder} ---`);
        console.log('Heightmap exists:', fs.existsSync(heightmap));
        console.log('Career XML exists:', fs.existsSync(careerPath));
        
        if (fs.existsSync(careerPath)) {
            const xml = await fs.readFile(careerPath, 'utf8');
            const mapIdMatch = xml.match(/<mapId>([^<]*)<\/mapId>/i);
            const mapTitleMatch = xml.match(/<mapTitle>([^<]*)<\/mapTitle>/i);
            console.log('Map ID:', mapIdMatch ? mapIdMatch[1] : 'NOT FOUND');
            console.log('Map Title:', mapTitleMatch ? mapTitleMatch[1] : 'NOT FOUND');
        }
    }
}

debugMaps();
