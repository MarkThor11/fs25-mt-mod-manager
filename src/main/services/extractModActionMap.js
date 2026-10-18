const fs = require('fs-extra');
const path = require('path');
const modManager = require('./modManager');

const modFolders = [
    'F:\\mods4',
    'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods',
    'D:\\mods',
    'E:\\mods'
];

const actionMap = {};
const actionCategoryMap = {};

for (const folder of modFolders) {
    if (!fs.existsSync(folder)) continue;
    let files = [];
    try {
        files = fs.readdirSync(folder);
    } catch (_) {
        continue;
    }

    for (const f of files) {
        if (!f.toLowerCase().endsWith('.zip')) continue;
        const fullPath = path.join(folder, f);
        try {
            const buf = modManager.readEntryFromZip(fullPath, 'modDesc.xml');
            if (!buf) continue;
            const text = buf.toString('utf8');
            if (!text.includes('<action') && !text.includes('<actionBinding')) continue;

            let title = f.replace(/\.zip$/i, '');
            const enTitleMatch = text.match(/<title>[\s\S]*?<en>([\s\S]*?)<\/en>/i);
            const rawTitleMatch = text.match(/<title>([\s\S]*?)<\/title>/i);
            const titleMatch = enTitleMatch || rawTitleMatch;
            if (titleMatch && titleMatch[1]) {
                const cleaned = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleaned) title = cleaned;
            }

            // Extract actions with optional category
            const regexAction = /<action\s+([^>]*?)>/gi;
            let m;
            while ((m = regexAction.exec(text)) !== null) {
                const attrStr = m[1];
                const nameMatch = attrStr.match(/name=["']([^"']+)["']/i);
                if (nameMatch && nameMatch[1]) {
                    const actName = nameMatch[1].trim();
                    actionMap[actName] = title;
                    const catMatch = attrStr.match(/category=["']([^"']+)["']/i);
                    if (catMatch && catMatch[1]) {
                        actionCategoryMap[actName] = catMatch[1].trim().toUpperCase();
                    }
                }
            }

            const regexBinding = /<actionBinding\s+[^>]*action=["']([^"']+)["']/gi;
            while ((m = regexBinding.exec(text)) !== null) {
                if (m[1]) actionMap[m[1].trim()] = title;
            }
        } catch (_) {}
    }
}

const outputPath = path.join(__dirname, 'modActionMap.json');
fs.writeFileSync(outputPath, JSON.stringify(actionMap, null, 2), 'utf8');

const outputCatPath = path.join(__dirname, 'modActionCategories.json');
fs.writeFileSync(outputCatPath, JSON.stringify(actionCategoryMap, null, 2), 'utf8');

console.log('Saved', Object.keys(actionMap).length, 'action titles and', Object.keys(actionCategoryMap).length, 'action categories.');
