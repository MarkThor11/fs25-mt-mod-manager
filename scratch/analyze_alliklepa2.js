const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const modsRoot = path.join(process.env.USERPROFILE, 'Documents/My Games/FarmingSimulator2025/mods');
const zipPath = path.join(modsRoot, 'FS25_Alliklepa_crossplay.zip');

const zip = new AdmZip(zipPath);

// Read all XML files to understand map structure
const mapXmls = zip.getEntries().filter(e => 
    e.entryName.toLowerCase().endsWith('.xml') && 
    !e.entryName.toLowerCase().includes('sound') &&
    !e.entryName.toLowerCase().includes('mission') &&
    !e.entryName.toLowerCase().includes('vehicle') &&
    !e.entryName.toLowerCase().includes('locale') &&
    e.header.size < 500000
);

// Find the main map.xml
const mapXml = mapXmls.find(e => {
    const parts = e.entryName.split('/');
    return parts[parts.length - 1] === 'map.xml' || parts[parts.length - 1] === 'mapEU.xml';
});

if (mapXml) {
    const content = mapXml.getData().toString('utf8');
    console.log('=== Map XML:', mapXml.entryName, '===');
    
    // Extract key attributes
    const densityMatch = content.match(/<densityMap[^>]+revision="(\d+)"[^>]*\/>/g);
    if (densityMatch) console.log('DensityMap entries:', densityMatch.slice(0, 5).join('\n  '));
    
    // Check for fields configuration
    const fieldsMatch = content.match(/<fields[^>]*\/>/g) || content.match(/<fields[^>]*>/g);
    if (fieldsMatch) console.log('Fields config:', fieldsMatch.slice(0, 3));
    
    // Find loadFruitType or similar
    if (content.includes('loadFruitType')) {
        console.log('Has loadFruitType');
    }
    
    // Check growthSystem
    const growthMatch = content.match(/growthSystem[^>]*>/g);
    if (growthMatch) console.log('Growth system:', growthMatch.slice(0, 3));
}

// Check fields.xml thoroughly
const fieldsXml = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('fields.xml'));
if (fieldsXml) {
    const content = fieldsXml.getData().toString('utf8');
    console.log('\n=== Fields.xml:', fieldsXml.entryName, '===');
    console.log('Total size:', content.length, 'chars');
    // Count field entries and fruit types
    const fieldMatches = content.match(/<field\s+fieldId="(\d+)"[^>]*/g) || [];
    console.log('Field count:', fieldMatches.length);
    fieldMatches.slice(0, 5).forEach(f => console.log(' -', f));
    
    // Count fruit types
    const fruitMatches = content.match(/fruit\s+type="([^"]+)"/g) || [];
    const types = {};
    fruitMatches.forEach(m => {
        const t = m.match(/type="([^"]+)"/)[1];
        types[t] = (types[t] || 0) + 1;
    });
    console.log('Fruit types:', types);
}
