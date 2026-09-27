const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const modsDir = path.join(process.env.USERPROFILE, 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');
const files = fs.readdirSync(modsDir).filter(f => f.endsWith('.zip'));

// Filter files containing map-related keywords or starting with FS25_
const mapCandidateFiles = files.filter(f => {
    const l = f.toLowerCase();
    return l.includes('map') || l.includes('village') || l.includes('ebony') || l.includes('forest') || l.includes('arkansas') || l.includes('american');
});

console.log(`Candidate map files: ${mapCandidateFiles.length}`);

for (const m of mapCandidateFiles) {
    try {
        const zipPath = path.join(modsDir, m);
        const zip = new AdmZip(zipPath);
        const modDescEntry = zip.getEntries().find(e => e.entryName.toLowerCase() === 'moddesc.xml');
        if (!modDescEntry) continue;
        const xml = modDescEntry.getData().toString('utf8');
        if (!xml.includes('<map') && !xml.includes('<maps>')) continue;

        console.log(`\n=================== ${m} ===================`);
        const entries = zip.getEntries();
        
        // Find map.xml or xml referenced in modDesc
        const mapXmlEntry = entries.find(e => e.entryName.toLowerCase().endsWith('map.xml') && !e.entryName.toLowerCase().includes('sound'));
        console.log(`map.xml entry: ${mapXmlEntry ? mapXmlEntry.entryName : 'NOT FOUND'}`);

        // Check densityMap_fruits
        const fruitGdm = entries.find(e => e.entryName.toLowerCase().endsWith('densitymap_fruits.gdm'));
        const fruitPng = entries.find(e => e.entryName.toLowerCase().endsWith('densitymap_fruits.png'));
        console.log(`densityMap_fruits: GDM=${fruitGdm ? fruitGdm.entryName + ' (' + fruitGdm.header.size + 'b)' : 'NO'}, PNG=${fruitPng ? fruitPng.entryName : 'NO'}`);

        // Check fields.xml / fieldground.xml
        const fieldsXml = entries.find(e => e.entryName.toLowerCase().endsWith('fields.xml'));
        console.log(`fields.xml in ZIP: ${fieldsXml ? fieldsXml.entryName : 'NO'}`);

        // Check defaultSavegame / careerSavegame in ZIP
        const defaultSave = entries.filter(e => e.entryName.toLowerCase().includes('defaultsavegame'));
        console.log(`defaultSavegame entries in ZIP: ${defaultSave.length}`);
        if (defaultSave.length > 0) {
            defaultSave.forEach(s => console.log(`   -> ${s.entryName}`));
        }
    } catch (e) {
        // ignore bad zips
    }
}
