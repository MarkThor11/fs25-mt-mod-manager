const fs = require('fs');
const path = require('path');

function findDbs() {
    const roaming = path.join(process.env.APPDATA);
    console.log('Searching in:', roaming);
    const dirs = fs.readdirSync(roaming);
    for (const dir of dirs) {
        try {
            const p = path.join(roaming, dir, 'modhub-cache.db');
            if (fs.existsSync(p)) {
                console.log('Found DB:', p);
                const stats = fs.statSync(p);
                console.log('Size:', stats.size, 'mtime:', stats.mtime);
            }
        } catch (e) {}
    }
}

findDbs();
