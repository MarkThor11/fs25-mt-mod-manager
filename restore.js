
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = 'C:/Users/Mark/AppData/Roaming/fs25-mt-mod-manager/modhub-cache.db';
const db = new Database(dbPath);

const modsRoot = 'C:/Users/Mark/Documents/My Games/FarmingSimulator2025/mods';
const rows = db.prepare('SELECT file_path FROM local_mod_cache').all();

let moved = 0;
for (const row of rows) {
    const cachedPath = row.file_path;
    const fileName = path.basename(cachedPath);
    const currentRootPath = path.join(modsRoot, fileName);
    
    if (fs.existsSync(currentRootPath) && path.dirname(cachedPath) !== modsRoot) {
        const targetDir = path.dirname(cachedPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.renameSync(currentRootPath, cachedPath);
        moved++;
        console.log('Restored ' + fileName + ' to ' + targetDir);
    }
}
console.log('Total Restored: ' + moved);
db.close();
process.exit(0);

