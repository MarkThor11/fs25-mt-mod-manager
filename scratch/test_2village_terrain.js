const AdmZip = require('adm-zip');
const zip = new AdmZip('F:/mods4/FS25_2Village_Map.zip');

const i3d = zip.readAsText('maps/map.i3d');
const match = i3d.match(/<File\s+fileId=["']1["']\s+filename=["']([^"']+)["']/i);
console.log('fileId 1:', match ? match[1] : 'not found');
