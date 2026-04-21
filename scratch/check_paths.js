const pathProvider = require('../src/main/services/pathProvider');
const fs = require('fs-extra');

console.log('FS25 Data Root:', pathProvider.getFS25DataRoot());
console.log('All potential roots:', pathProvider.getAllFS25DataRoots());

const root = pathProvider.getFS25DataRoot();
if (fs.existsSync(root)) {
    console.log('Root exists!');
    const files = fs.readdirSync(root);
    console.log('Files in root:', files.filter(f => f.startsWith('savegame')));
} else {
    console.log('Root does NOT exist!');
}
