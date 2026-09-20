const test = (str) => {
    const match = str.match(/(?:capacity|kapazität|capacité|volume|inhalte).*?((?:\d[\d,.]*\d|\d+)(?:\s*(?:and|to|or|from|-|\/|&|,|\[.*?\])\s*(?:\d[\d,.]*\d|\d+))*)\s*(?:l\b|liter|litres|liters|m³|m3)/i);
    return match ? match[1] : null;
};
console.log(test('Capacity: 17500, 22500[Silage Trailer]liters'));
console.log(test('Capacity: 8,000 and 15,000 liters'));
console.log(test('Capacity: from 45.000 to 71.000 L'));
console.log(test('Capacity: 1500, 3500 and 5000 liters'));
console.log(test('Capacity: 25.200 to 39.600 liters'));
console.log(test('2 Capacity options 20350, 101800 Liters'));
console.log(test('Bale Transport / Capacity 17,000 / Capacity 36,000 and Capacity 45,000'));
console.log(test('Capacity: 45 cubic meters of material'));
