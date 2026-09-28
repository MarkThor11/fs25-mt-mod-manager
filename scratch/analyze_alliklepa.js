const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const modsRoot = path.join(process.env.USERPROFILE, 'Documents/My Games/FarmingSimulator2025/mods');
const zipPath = path.join(modsRoot, 'FS25_Alliklepa_crossplay.zip');

console.log('Analyzing:', zipPath);
const zip = new AdmZip(zipPath);

// Read the fields.xml
const fieldsEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('fields.xml'));
if (fieldsEntry) {
    const xml = fieldsEntry.getData().toString('utf8');
    const fieldCount = (xml.match(/<field /gi) || []).length;
    console.log('\nFields.xml found at:', fieldsEntry.entryName);
    console.log('Field count:', fieldCount);
    console.log('First 300 chars:', xml.substring(0, 300));
} else {
    console.log('No fields.xml found in ZIP');
}

// Check map.xml for densityMap revision
const mapXml = zip.getEntries().find(e => {
    const lower = e.entryName.toLowerCase();
    return lower.endsWith('map.xml') && !lower.includes('sound') && !lower.includes('mission');
});
if (mapXml) {
    const xml = mapXml.getData().toString('utf8');
    const revMatch = xml.match(/densityMap[^>]*revision="(\d+)"/i);
    console.log('\nMap.xml entry:', mapXml.entryName);
    console.log('Map.xml densityMap revision:', revMatch ? revMatch[1] : 'not found');
    
    // Also check for fields and farmlands paths
    const fieldsMatch = xml.match(/fields[^>]*filename="([^"]+)"/i);
    const farmlandsMatch = xml.match(/farmlands[^>]*filename="([^"]+)"/i);
    console.log('Fields file ref:', fieldsMatch ? fieldsMatch[1] : 'not found');
    console.log('Farmlands file ref:', farmlandsMatch ? farmlandsMatch[1] : 'not found');
}

// Check what the GDM header looks like (first 32 bytes)
const gdmEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('densitymap_fruits.gdm'));
if (gdmEntry) {
    const data = gdmEntry.getData();
    console.log('\ndensityMap_fruits.gdm size:', data.length, 'bytes');
    console.log('First 16 bytes (hex):', data.slice(0, 16).toString('hex'));
    // Check GDM magic number
    const magic = data.slice(0, 4).toString('ascii');
    console.log('Magic:', JSON.stringify(magic));
}
