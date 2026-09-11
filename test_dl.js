const { downloadWithNet } = require('./src/main/services/modManager');

const modId = '315279';
const url = 'https://cdn25.giants-software.com/modHub/storage/00315279/FS25_silverrunForest.zip';
const targetDir = 'C:\\Users\\Mark\\Desktop\\GoogleModManager\\scratch';
const modTitle = 'Silverrun Forest';
const modUrl = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;

downloadWithNet(modId, url, targetDir, modTitle, (prog) => {
    console.log(prog.percent + '% - ' + prog.fileName);
}, 'map', 0, null, modUrl, null)
.then(res => console.log('SUCCESS:', res))
.catch(err => console.error('FAILED:', err));
