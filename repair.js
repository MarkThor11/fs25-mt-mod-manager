const fs = require('fs');
const path = require('path');
const dir = 'C:/Users/Mark/Documents/My Games/FarmingSimulator2025';
const dirs = fs.readdirSync(dir);
for (const d of dirs) {
    if (d.startsWith('savegame')) {
        const p = path.join(dir, d, 'careerSavegame.xml');
        if (fs.existsSync(p)) {
            let xml = fs.readFileSync(p, 'utf8');
            if (!xml.includes('valid="true"')) {
                xml = xml.replace('<careerSavegame revision="2">', '<careerSavegame revision="2" valid="true">');
                xml = xml.replace('<careerSavegame revision="2" valid>', '<careerSavegame revision="2" valid="true">');
                fs.writeFileSync(p, xml);
                console.log('Repaired ' + d);
            }
        }
    }
}
