const AdmZip = require('adm-zip');
const zip = new AdmZip('F:/mods4/FS25_Cybuchowo.zip');

console.log('--- modDesc.xml maps tag ---');
const md = zip.readAsText('modDesc.xml');
const mapMatch = md.match(/<map\s+[^>]+>/i);
console.log(mapMatch ? mapMatch[0] : 'no map tag');

zip.getEntries().forEach(e => {
  if (e.entryName.includes('field') || e.entryName.includes('fruit') || e.entryName.includes('density')) {
    console.log(e.entryName, e.header.size);
  }
});
