const fs = require('fs');
for(let i=1;i<=20;i++) {
    try {
        const data = fs.readFileSync('C:/Users/Mark/Documents/My Games/FarmingSimulator2025/savegame' + i + '/careerSavegame.xml', 'utf8');
        const match = data.match(/mapId="([^"]+)"/);
        if(match) console.log('savegame' + i + ': ' + match[1]);
    } catch(e) {}
}
