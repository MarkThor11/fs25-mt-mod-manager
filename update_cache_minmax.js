const fs = require('fs');
const cache = JSON.parse(fs.readFileSync('./src/main/resources/bundled_cache.json', 'utf8'));

const parseRange = (str) => {
    if (!str) return { min: 0, max: 0 };
    const lower = str.toString().toLowerCase();
    const isCubicMeter = lower.includes('m³') || lower.includes('m3');
    
    if (isCubicMeter) {
        const match = lower.replace(/,/g, '.').match(/([\d.]+)/);
        if (match && match[1]) {
            const val = Math.round(parseFloat(match[1]) * 1000);
            return { min: val, max: val };
        }
        return { min: 0, max: 0 };
    }
    
    const parts = lower.split(/[\/-]/);
    const cleanedParts = parts.map(p => {
        const cleaned = p.replace(/[$€£]/g, '').replace(/(\d+)[\s,.](\d{3})/g, '$1$2').replace(/[^0-9]/g, '');
        return parseInt(cleaned, 10) || 0;
    }).filter(n => n > 0);
    
    if (cleanedParts.length === 0) return { min: 0, max: 0 };
    return { 
        min: Math.min(...cleanedParts), 
        max: Math.max(...cleanedParts) 
    };
};

let updated = 0;
Object.values(cache).forEach(mod => {
    if (mod.techData) {
        if (!mod.techData.priceMin) mod.techData.priceMin = mod.techData.price;
        if (!mod.techData.priceMax) mod.techData.priceMax = mod.techData.price;
        if (!mod.techData.hpMin) mod.techData.hpMin = mod.techData.hp;
        if (!mod.techData.hpMax) mod.techData.hpMax = mod.techData.hp;
        if (!mod.techData.capacityMin) mod.techData.capacityMin = mod.techData.capacity;
        if (!mod.techData.capacityMax) mod.techData.capacityMax = mod.techData.capacity;

        if (mod.description) {
            const descText = mod.description.replace(/<[^>]*>/g, ' ');
            
            // Re-run capacity check to get min/max
            const capMatch = descText.match(/(?:capacity|kapazität|capacité|volume|inhalte).*?(\d[\d\s,.\/-]*)\s*(?:l|liter|litres|liters|m³|m3)/i) || descText.match(/(\d[\d\s,.\/-]*)\s*(?:l|liter|litres|liters|m³|m3)/i);
            if (capMatch && capMatch[0]) {
                const pCap = parseRange(capMatch[0]);
                if (pCap.max > 0 && pCap.max < 50000000) {
                    mod.techData.capacityMin = pCap.min;
                    mod.techData.capacityMax = pCap.max;
                    mod.techData.capacity = pCap.max;
                }
            }
            
            // Re-run price check to get min/max
            const priceMatch = descText.match(/(?:price|preis|prix|cost|from|base price)[:\-\s]*([$€£]?\s*\d[\d\s,.\/-]*\s*[$€£]?)/i);
            if (priceMatch && priceMatch[1]) {
                const pPrice = parseRange(priceMatch[1]);
                if (pPrice.max > 0 && pPrice.max < 50000000) {
                    mod.techData.priceMin = pPrice.min;
                    mod.techData.priceMax = pPrice.max;
                    mod.techData.price = pPrice.max;
                }
            }
            
            // Re-run hp check to get min/max
            const hpMatch = descText.match(/(?:horsepower|power|performance|requirement|required|leistung|puissance|output)[:\-\s]*(\d[\d\s\/-]*)/i);
            if (hpMatch && hpMatch[1] && !/[\/-]\d+/.test(hpMatch[0])) {
                const pHp = parseRange(hpMatch[1]);
                if (pHp.max > 15 && pHp.max < 2000) {
                    mod.techData.hpMin = pHp.min;
                    mod.techData.hpMax = pHp.max;
                    mod.techData.hp = pHp.max;
                }
            }
        }
    }
});

fs.writeFileSync('./src/main/resources/bundled_cache.json', JSON.stringify(cache, null, 2));
console.log('Cache updated with min/max values');

