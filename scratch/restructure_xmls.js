const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const root = 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025';

function repairFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const $ = cheerio.load(content, { xmlMode: true, decodeEntities: false });
        
        let changed = false;

        // 1. Fix <settings>
        const settings = $('settings');
        if (settings.length) {
            const attribs = settings[0].attribs;
            const keys = Object.keys(attribs);
            if (keys.length > 0) {
                keys.forEach(key => {
                    if (key.startsWith('revisio') || key === 'valid') return; // Keep these as attributes
                    
                    const val = attribs[key];
                    settings.append(`    <${key}>${val}</${key}>\n`);
                    delete attribs[key];
                    changed = true;
                });
            }
        }

        // 2. Fix <statistics>
        const statistics = $('statistics');
        if (statistics.length) {
            const attribs = statistics[0].attribs;
            const keys = Object.keys(attribs);
            if (keys.length > 0) {
                keys.forEach(key => {
                    const val = attribs[key];
                    statistics.append(`    <${key}>${val}</${key}>\n`);
                    delete attribs[key];
                    changed = true;
                });
            }
        }

        // 3. Fix <map>
        const map = $('map');
        if (map.length) {
            const attribs = map[0].attribs;
            const keys = Object.keys(attribs);
            if (keys.length > 0) {
                keys.forEach(key => {
                    const val = attribs[key];
                    map.append(`    <${key}>${val}</${key}>\n`);
                    delete attribs[key];
                    changed = true;
                });
            }
        }

        if (changed) {
            let output = $.xml();
            // Post-process to fix indentation if needed, but $.xml() is usually okay
            fs.writeFileSync(filePath, output);
            console.log(`[RESTRUCTURED] ${filePath}`);
        }
    } catch (e) {
        console.error(`[ERROR] ${filePath}: ${e.message}`);
    }
}

function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                if (file.startsWith('shader_cache') || file === 'mods' || file === 'pdlc') continue;
                walk(fullPath);
            } else if (file === 'careerSavegame.xml') {
                repairFile(fullPath);
            }
        } catch (e) {}
    }
}

console.log("Restructuring careerSavegame.xml files...");
walk(root);
console.log("Done.");
