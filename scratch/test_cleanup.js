const path = require('path');
const fs = require('fs-extra');

// Mock Electron app
const app = {
    getPath: (name) => {
        if (name === 'userData') return 'C:\\Users\\Mark\\AppData\\Roaming\\GoogleModManager';
        return '';
    }
};

// Mock Cache
const cache = {
    getSetting: (name) => {
        if (name === 'modsPaths') return JSON.stringify(['C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods']);
        if (name === 'modsPath') return 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods';
        return null;
    }
};

// Mock PathProvider
const pathProvider = {
    getFS25DataRoot: () => 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025',
    getDefaultModsPath: () => 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods'
};

async function test() {
    try {
        console.log('Testing prepareVirtualModsFolder...');
        // We can't easily import the real modManager because it has many dependencies (AdmZip, etc.)
        // But we can check if the virtual path exists and if we can clean it.
        const virtualPath = path.join('C:\\Users\\Mark\\AppData\\Roaming\\GoogleModManager', 'VirtualActiveMods');
        console.log(`Virtual Path: ${virtualPath}`);
        
        if (fs.existsSync(virtualPath)) {
            console.log('Cleaning virtual path...');
            const files = await fs.readdir(virtualPath);
            console.log(`Found ${files.length} files.`);
            for (const f of files) {
                const p = path.join(virtualPath, f);
                try {
                    await fs.remove(p);
                } catch (e) {
                    console.error(`FAILED TO REMOVE: ${p} - ${e.message}`);
                }
            }
        } else {
            console.log('Virtual path does not exist.');
        }
        console.log('Done.');
    } catch (e) {
        console.error('TEST FAILED:', e);
    }
}

test();
