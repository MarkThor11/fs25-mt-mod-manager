const fs = require('fs');
const cache = JSON.parse(fs.readFileSync('./src/main/resources/bundled_cache.json', 'utf8'));

const parseCleanInt = (str) => {
    if (!str) return 0;
    const lower = str.toString().toLowerCase();
    const isCubicMeter = lower.includes('m³') || lower.includes('m3');
    
    if (isCubicMeter) {
        const match = lower.replace(/,/g, '.').match(/([\d.]+)/);
        if (match && match[1]) {
            return Math.round(parseFloat(match[1]) * 1000);
        }
        return 0;
    }
    
    const parts = lower.split(/[\/-]/);
    const cleanedParts = parts.map(p => {
        const cleaned = p.replace(/[$€£]/g, '').replace(/(\d+)[\s,.](\d{3})/g, '$1$2').replace(/[^0-9]/g, '');
        return parseInt(cleaned, 10) || 0;
    });
    return Math.max(...cleanedParts);
};

let updated = 0;
Object.values(cache).forEach(mod => {
    if (mod.techData && mod.techData.capacity === 0 && mod.description) {
        const descText = mod.description.replace(/<[^>]*>/g, ' ');
        const capMatch = descText.match(/(?:capacity|kapazität|capacité|volume|inhalte).*?(\d[\d\s,.\/-]*)\s*(?:l|liter|litres|liters|m³|m3)/i) || descText.match(/(\d[\d\s,.\/-]*)\s*(?:l|liter|litres|liters|m³|m3)/i);
        if (capMatch && capMatch[0]) {
            const parsedCap = parseCleanInt(capMatch[0]);
            if (parsedCap > 0 && parsedCap < 50000000) {
                mod.techData.capacity = parsedCap;
                updated++;
            }
        }
    }
});

fs.writeFileSync('./src/main/resources/bundled_cache.json', JSON.stringify(cache, null, 2));
console.log('Updated capacities for ' + updated + ' mods');
