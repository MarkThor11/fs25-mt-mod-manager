const path = require('path');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

async function deepCheckMods() {
    const modsPath = 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods';
    const parser = new XMLParser();

    if (!fs.existsSync(modsPath)) return;

    const entries = fs.readdirSync(modsPath);
    console.log(`Deep checking ${entries.length} items...`);

    const problematic = [];

    for (const entry of entries) {
        const fullPath = path.join(modsPath, entry);
        let xml = '';

        try {
            if (entry.endsWith('.zip')) {
                const zip = new AdmZip(fullPath);
                const modDescEntry = zip.getEntries().find(e => e.entryName.toLowerCase() === 'moddesc.xml');
                if (modDescEntry) {
                    xml = modDescEntry.getData().toString('utf8');
                }
            } else if (fs.statSync(fullPath).isDirectory()) {
                const xmlPath = path.join(fullPath, 'modDesc.xml');
                if (fs.existsSync(xmlPath)) {
                    xml = fs.readFileSync(xmlPath, 'utf8');
                }
            }

            if (xml) {
                // Try to parse XML
                parser.parse(xml);
            }
        } catch (err) {
            console.log(`[PROBLEM] ${entry}: ${err.message}`);
            problematic.push({ entry, error: err.message });
        }
    }

    if (problematic.length > 0) {
        console.log(`\nFound ${problematic.length} problematic mods. Moving to mods_quarantine...`);
        const dest = 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods_quarantine';
        fs.ensureDirSync(dest);
        for (const p of problematic) {
            try {
                fs.moveSync(path.join(modsPath, p.entry), path.join(dest, p.entry));
                console.log(`  Moved ${p.entry}`);
            } catch (e) {
                console.error(`  Failed to move ${p.entry}: ${e.message}`);
            }
        }
    } else {
        console.log('No XML parsing errors found in modDesc.xml files.');
    }
}

deepCheckMods();
