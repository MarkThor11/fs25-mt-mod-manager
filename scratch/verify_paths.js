// Mock electron for testing in Node
require.cache[require.resolve('electron')] = {
    exports: {
        app: {
            getPath: (name) => {
                if (name === 'documents') return 'C:\\Users\\Mark\\Documents';
                return '';
            }
        }
    }
};

const pathProvider = require('../src/main/services/pathProvider');
const path = require('path');

console.log('--- Path Provider Test ---');
try {
    const root = pathProvider.getFS25DataRoot();
    const mods = pathProvider.getDefaultModsPath();
    const roots = pathProvider.getAllFS25DataRoots();
    const personal = pathProvider.getPersonalFolderPath();

    console.log('Data Root:', root);
    console.log('Mods Path:', mods);
    console.log('All Roots:', roots);
    console.log('Personal Folder:', personal);

    if (root && root.includes('FarmingSimulator2025')) {
        console.log('SUCCESS: Root path looks correct.');
    } else {
        console.log('WARNING: Root path does not contain FarmingSimulator2025.');
    }
} catch (err) {
    console.error('FAILED: ', err.message);
}
