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

            const regexAction = /<action\s+[^>]*name=["']([^"']+)["']/g;
            let match;
            while ((match = regexAction.exec(text)) !== null) {
                if (match[1]) actionMap[match[1]] = title;
            }

            const regexBinding = /<actionBinding\s+[^>]*action=["']([^"']+)["']/g;
            while ((match = regexBinding.exec(text)) !== null) {
                if (match[1]) actionMap[match[1]] = title;
            }
        } catch (_) {}
    }
}

const outputPath = path.join(__dirname, 'modActionMap.json');
fs.writeFileSync(outputPath, JSON.stringify(actionMap, null, 2), 'utf8');
console.log('Successfully saved', Object.keys(actionMap).length, 'action mappings to modActionMap.json');
