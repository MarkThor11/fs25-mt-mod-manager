const fs = require('fs-extra');
const path = require('path');
const pathProvider = require('./src/main/services/pathProvider');

const p = path.join(pathProvider.getFS25DataRoot(), 'savegame1', 'careerSavegame.xml');
if (fs.existsSync(p)) {
    let xml = fs.readFileSync(p, 'utf8');
    xml = xml.replace(/<mapId>[^<]*<\/mapId>/i, '<mapId>FS25_Alliklepa.SampleModMap</mapId>');
    xml = xml.replace(/<mapTitle>[^<]*<\/mapTitle>/i, '<mapTitle>Alliklepa</mapTitle>');
    xml = xml.replace(/FS25_Alliklepa_crossplay/g, 'FS25_Alliklepa');
    fs.writeFileSync(p, xml, 'utf8');
    console.log('Successfully repaired savegame1 careerSavegame.xml!');
} else {
    console.log('savegame1 careerSavegame.xml not found.');
}
