const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const p = path.join(os.homedir(), 'Documents/My Games/FarmingSimulator2025');
const saves = fs.readdirSync(p).filter(f => /^savegame\d+$/.test(f) && fs.statSync(path.join(p, f)).isDirectory());
for(let s of saves) {
    const cp = path.join(p, s, 'careerSavegame.xml');
    if(!fs.existsSync(cp)) continue;
    const careerXml = fs.readFileSync(cp, 'utf8');
    const titleMatch = careerXml.match(/<mapTitle>(.*?)<\/mapTitle>/);
    const title = titleMatch ? titleMatch[1] : '';
    const modsMatch = careerXml.match(/<mod.*?modName="([^"]+)"/g);
    console.log(s, title, 'Mods:', modsMatch ? modsMatch.length : 0);
    if(modsMatch) {
        console.log('   Mods:', modsMatch.map(m => m.match(/modName="([^"]+)"/)[1]).join(', '));
    }
}
