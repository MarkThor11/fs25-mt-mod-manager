const AdmZip = require('adm-zip');
const zip = new AdmZip('F:/mods4/FS25_2Village_Map.zip');

console.log('--- maps/config/map.xml ---');
const mapXml = zip.readAsText('maps/config/map.xml');
console.log(mapXml.slice(0, 2000));

const fieldsMatch = mapXml.match(/<fields\s+[^>]*filename=["']([^"']+)["']/i);
console.log('fields filename:', fieldsMatch ? fieldsMatch[1] : 'not found');
if (fieldsMatch) {
  const fPath = fieldsMatch[1].replace(/^\$mapdir\$\//, '');
  console.log('fields path:', fPath);
  const fText = zip.readAsText(fPath);
  console.log('fields content snippet:');
  console.log(fText ? fText.slice(0, 1000) : 'FILE NOT FOUND: ' + fPath);
}

const text = zip.readAsText('maps/map.i3d');
const fieldMatches = text.match(/<TransformGroup[^>]*name=["']field\d+["'][^>]*>/gi);
console.log('field count in i3d:', fieldMatches ? fieldMatches.length : 0);
if (fieldMatches) console.log(fieldMatches.slice(0, 10));

