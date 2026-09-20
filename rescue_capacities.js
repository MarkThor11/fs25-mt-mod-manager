const fs = require('fs');
const cache = JSON.parse(fs.readFileSync('./src/main/resources/bundled_cache.json', 'utf8'));

let rescued = 0;

Object.values(cache).forEach(mod => {
    if (mod.techData && mod.techData.capacity === 0 && mod.description) {
        const lines = mod.description.replace(/<br[^>]*>/gi, '\n').split('\n');
        for (const line of lines) {
            if (/(capacity|kapazität|capacité|volume|inhalte)/i.test(line) && /(liters?|litres?|l\b|m³|m3|cubic)/i.test(line)) {
                let isCubic = /(m³|m3|cubic)/i.test(line);
                const nums = (line.match(/\d[\d,.]*\d|\d+/g) || []).map(n => parseInt(n.replace(/[,.]/g, ''), 10));
                const valid = nums.filter(n => isCubic ? n > 0 : n >= 100);
                if (valid.length > 0) {
                    let min = Math.min(...valid);
                    let max = Math.max(...valid);
                    if (isCubic && max < 1000) { min *= 1000; max *= 1000; }
                    if (max < 50000000) {
                        mod.techData.capacityMin = min;
                        mod.techData.capacityMax = max;
                        mod.techData.capacity = max;
                        rescued++;
                    }
                    break;
                }
            }
        }
    }
});

fs.writeFileSync('./src/main/resources/bundled_cache.json', JSON.stringify(cache, null, 2));
console.log('Rescued capacities for ' + rescued + ' mods');
