const fs = require('fs');
const path = require('path');

const modsDir = "C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods";

if (!fs.existsSync(modsDir)) {
    console.log("Mods directory not found.");
    process.exit(1);
}

const entries = fs.readdirSync(modsDir, { withFileTypes: true });

entries.forEach(entry => {
    const oldName = entry.name;
    let newName = oldName;

    // 1. Check for illegal characters (including spaces)
    if (/[^a-zA-Z0-9_.]/.test(oldName)) {
        newName = oldName.replace(/[^a-zA-Z0-9_.]/g, '_');
    }

    // 2. Check for leading digit
    if (/^[0-9]/.test(newName)) {
        newName = "FS25_" + newName;
    }

    if (oldName !== newName) {
        console.log(`Renaming: "${oldName}" -> "${newName}"`);
        const oldPath = path.join(modsDir, oldName);
        const newPath = path.join(modsDir, newName);
        
        try {
            if (fs.existsSync(newPath)) {
                console.log(`  Skipping: "${newName}" already exists.`);
            } else {
                fs.renameSync(oldPath, newPath);
                console.log(`  Success.`);
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }
});
