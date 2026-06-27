const AdmZip = require('adm-zip');
const zip = new AdmZip('C:/Users/Mark/Documents/My Games/FarmingSimulator2025/mods/FS25_The_Hamlet.zip');
const entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('map.i3d'));
if (entry) {
    const text = entry.getData().toString('utf8');
    const match = text.match(/<[^>]*name=\"[^\"]*(careerStartPoint|playerStart)[^\"]*\"[^>]*>/gi);
    console.log(match);
}
