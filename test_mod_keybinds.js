const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

const modsDir = "c:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods";

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: false,
    parseTagValue: false
});

function scanModKeybinds() {
    if (!fs.existsSync(modsDir)) return;
    const files = fs.readdirSync(modsDir);
    
    let allModActions = [];
    
    for (const file of files) {
        if (!file.endsWith('.zip')) continue;
        const zipPath = path.join(modsDir, file);
        try {
            const zip = new AdmZip(zipPath);
            const entry = zip.getEntry('modDesc.xml');
            if (!entry) continue;
            
            const xml = zip.readAsText(entry);
            const data = parser.parse(xml);
            
            if (data.modDesc && data.modDesc.actions && data.modDesc.actions.action) {
                let actions = data.modDesc.actions.action;
                if (!Array.isArray(actions)) actions = [actions];
                
                actions.forEach(act => {
                    allModActions.push({
                        mod: file,
                        name: act['@_name'],
                        category: act['@_category'] || 'General'
                    });
                });
            }
            if (data.modDesc && data.modDesc.inputBinding) {
                // some mods also supply inputBinding defaults in modDesc
            }
        } catch (e) {
            console.error(`Error reading ${file}:`, e.message);
        }
    }
    
    console.log(`Found ${allModActions.length} mod actions.`);
    console.log(allModActions.slice(0, 5));
}

scanModKeybinds();
