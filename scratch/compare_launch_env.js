const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const fs25Path = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025');
const modsDir = path.join(fs25Path, 'mods');

console.log("Checking map dependencies and script mods...");

// Inspect map zips for dependencies or required filltypes / scripts / prefabs / DLCs
const testMaps = ['FS25_2Village_Map.zip', 'FS25_Arkansas_Of_American.zip'];

for (const m of testMaps) {
    const zipPath = path.join(modsDir, m);
    if (!fs.existsSync(zipPath)) continue;
    const zip = new AdmZip(zipPath);
    const modDesc = zip.getEntry('modDesc.xml');
    if (modDesc) {
        const text = modDesc.getData().toString('utf8');
        console.log(`\n=== ${m} modDesc.xml ===`);
        const deps = text.match(/<dependency[^>]*>.*?<\/dependency>/gi) || text.match(/<dependencies>[\s\S]*?<\/dependencies>/gi) || [];
        console.log("Dependencies in modDesc:", deps);
        const extraSource = text.match(/<extraSourceFiles>[\s\S]*?<\/extraSourceFiles>/gi) || [];
        console.log("ExtraSourceFiles in modDesc:", extraSource);
    }
}
