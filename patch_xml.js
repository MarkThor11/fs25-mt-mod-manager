const fs = require('fs');

const jsPath = 'C:/Users/Mark/Desktop/GoogleModManager/src/main/services/savegameManager.js';
let js = fs.readFileSync(jsPath, 'utf8');
js = js.replace(/new XMLParser\(\{ ignoreAttributes: false, attributeNamePrefix: '@_' \}\)/g, "new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true })");
fs.writeFileSync(jsPath, js);

const xmlPath = 'C:/Users/Mark/Documents/My Games/FarmingSimulator2025/savegame6/careerSavegame.xml';
let xml = fs.readFileSync(xmlPath, 'utf8');
xml = xml.replace(/<mod modName="([^"]+)" title="([^"]+)" version="([^"]+)" required fileHash/g, "<mod modName=\"$1\" title=\"$2\" version=\"$3\" required=\"true\" fileHash");
xml = xml.replace(/<mod modName="([^"]+)" title="([^"]+)" version="([^"]+)" required><\/mod>/g, "<mod modName=\"$1\" title=\"$2\" version=\"$3\" required=\"true\"></mod>");
fs.writeFileSync(xmlPath, xml);
