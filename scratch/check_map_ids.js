const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const modsDir = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');

const testMaps = [
    'FS25_AgroForests.zip',
    'FS25_Ebony_Island.zip',
    'FS25_2Village_Map.zip',
    'FS25_Arkansas_Of_American.zip',
    'FS25_Frankenmuth_Map.zip',
    'FS25_goldenLandsMap.zip',
    'FS25_Hermanns_Hausen_Map.zip',
    'FS25_Agrospol_Map.zip',
    'FS25_Arkansas_4X.zip',
    'FS25_Blue_Island_Forest.zip',
    'FS25_Dark_Forest_The_Final_Chapter.zip',
    'FS25_FDAYMap4x.zip',
    'FS25_ForestHills.zip',
    'FS25_GreenwoodForest.zip'
];

for (const m of testMaps) {
    const zipPath = path.join(modsDir, m);
    if (!fs.existsSync(zipPath)) {
        console.log(`[NOT FOUND] ${m}`);
        continue;
    }
    const zip = new AdmZip(zipPath);
    const modDesc = zip.getEntry('modDesc.xml');
    if (modDesc) {
        const text = modDesc.getData().toString('utf8');
        const mapMatch = text.match(/<map\s+[^>]*id=["']([^"']+)["']/i) || text.match(/<mapId>([^<]+)<\/mapId>/i);
        const titleMatch = text.match(/<title>[\s\S]*?<en>([^<]+)<\/en>/i) || text.match(/<title>([^<]+)<\/title>/i);
        console.log(`Mod: ${m}`);
        console.log(`   Internal Map ID: ${mapMatch ? mapMatch[1] : 'NOT FOUND'}`);
        console.log(`   Title: ${titleMatch ? titleMatch[1].trim() : 'NOT FOUND'}`);
    }
}
