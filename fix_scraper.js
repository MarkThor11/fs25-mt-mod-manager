const fs = require('fs');
let code = fs.readFileSync('./src/main/services/scraper.js', 'utf8');

code = code.replace(
  '  const techData = {\n    price: 0,\n    hp: 0,\n    hpIsRequirement: false,\n    capacity: 0,\n    speed: 0,\n    weight: 0,\n    scraped: true\n  };',
  '  const techData = {\n    price: 0, priceMin: 0, priceMax: 0,\n    hp: 0, hpMin: 0, hpMax: 0,\n    hpIsRequirement: false,\n    capacity: 0, capacityMin: 0, capacityMax: 0,\n    speed: 0,\n    weight: 0,\n    scraped: true\n  };'
);

code = code.replace(
  /const parseCleanInt = \(str\) => {[\s\S]*?return parseInt\(cleaned, 10\) \|\| 0;\n  };/,
  'const parseRange = (str) => { if (!str) return { min: 0, max: 0 }; const lower = str.toString().toLowerCase(); const isCubicMeter = lower.includes(\'m³\') || lower.includes(\'m3\'); if (isCubicMeter) { const match = lower.replace(/,/g, \'.\').match(/([\\\\d.]+)/); if (match && match[1]) { const val = Math.round(parseFloat(match[1]) * 1000); return { min: val, max: val }; } return { min: 0, max: 0 }; } const parts = lower.split(/[\\\\/-]/); const cleanedParts = parts.map(p => { const cleaned = p.replace(/[$€£]/g, \'\').replace(/(\\\\d+)[\\\\s,.](\\\\d{3})/g, \'\').replace(/[^0-9]/g, \'\'); return parseInt(cleaned, 10) || 0; }).filter(n => n > 0); if (cleanedParts.length === 0) return { min: 0, max: 0 }; return { min: Math.min(...cleanedParts), max: Math.max(...cleanedParts) }; };'
);

code = code.replace(/techData\.price = parseCleanInt\(valStr\);/g, 'const p = parseRange(valStr); techData.price = p.max; techData.priceMin = p.min; techData.priceMax = p.max;');
code = code.replace(/const hpNum = parseCleanInt\(hpStr\);/g, 'const hpNum = parseRange(hpStr).max;');
code = code.replace(/const val = parseCleanInt\(valStr\);/g, 'const val = parseRange(valStr).max;');
code = code.replace(/techData\.capacity = parseCleanInt\(valStr\);/g, 'const c = parseRange(valStr); techData.capacity = c.max; techData.capacityMin = c.min; techData.capacityMax = c.max;');
code = code.replace(/techData\.speed = parseCleanInt\(valStr\);/g, 'techData.speed = parseRange(valStr).max;');
code = code.replace(/techData\.weight = parseCleanInt\(valStr\);/g, 'techData.weight = parseRange(valStr).max;');

code = code.replace(
  /const capMatch = descText\.match\(\/\(\?:capacity\|kapazität\|capacité\|volume\|inhalte\)\.\*\?\(\\d\\[\\d\\s,\.\\]\*\)\\s\*\(\?:l\|liter\|litres\|liters\|m³\|m3\)\/i\) \|\| descText\.match\(\/\(\\d\\[\\d\\s,\.\\]\*\)\\s\*\(\?:l\|liter\|litres\|liters\|m³\|m3\)\/i\);/,
  'const capMatch = descText.match(/(?:capacity|kapazität|capacité|volume|inhalte).*?(\\\\d[\\\\d\\\\s,.\\\\/-]*)\\\\s*(?:l|liter|litres|liters|m³|m3)/i) || descText.match(/(\\\\d[\\\\d\\\\s,.\\\\/-]*)\\\\s*(?:l|liter|litres|liters|m³|m3)/i);'
);

code = code.replace(
  /const parsedCap = parseCleanInt\(capMatch\[0\]\);\n\s*if \(parsedCap > 0 && parsedCap < 50000000\) \{\n\s*techData\.capacity = parsedCap;\n\s*\}/,
  'const parsedCap = parseRange(capMatch[0]);\\n        if (parsedCap.max > 0 && parsedCap.max < 50000000) {\\n          techData.capacity = parsedCap.max; techData.capacityMin = parsedCap.min; techData.capacityMax = parsedCap.max;\\n        }'
);

fs.writeFileSync('./src/main/services/scraper.js', code);
console.log('patched');
