const extractCaps = (desc) => {
    const lines = desc.replace(/<br[^>]*>/gi, '\n').split('\n');
    for (const line of lines) {
        if (/(capacity|kapazität|capacité|volume|inhalte)/i.test(line) && /(liters?|litres?|l\b|m³|m3)/i.test(line)) {
            let isCubic = /(m³|m3|cubic)/i.test(line);
            const nums = (line.match(/\d[\d,.]*\d|\d+/g) || []).map(n => parseInt(n.replace(/[,.]/g, '')));
            const valid = nums.filter(n => isCubic ? n > 0 : n >= 100);
            if (valid.length > 0) {
                let min = Math.min(...valid);
                let max = Math.max(...valid);
                if (isCubic && max < 1000) {
                   min = min * 1000;
                   max = max * 1000;
                }
                return { min, max };
            }
        }
    }
    return null;
};
console.log(extractCaps('Capacity: 17500, 22500[Silage Trailer]liters'));
console.log(extractCaps('Capacity: 8,000 and 15,000 liters'));
console.log(extractCaps('Capacity: from 45.000 to 71.000 L'));
console.log(extractCaps('Capacity: 1500, 3500 and 5000 liters'));
console.log(extractCaps('Capacity: 25.200 to 39.600 liters'));
console.log(extractCaps('2 Capacity options 20350, 101800 Liters'));
console.log(extractCaps('Bale Transport / Capacity 17,000 / Capacity 36,000 and Capacity 45,000 liters'));
console.log(extractCaps('Capacity: 45 cubic meters of material'));
