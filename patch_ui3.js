const fs = require('fs');

function patchInstalledMods() {
    let code = fs.readFileSync('src/renderer/pages/InstalledModsPage.jsx', 'utf8');

    // 1. Add import
    if (!code.includes('resolveRecursiveDependencies')) {
        code = code.replace(
            "import DependencyDownloadModal from '../components/common/DependencyDownloadModal';",
            "import DependencyDownloadModal from '../components/common/DependencyDownloadModal';\nimport { resolveRecursiveDependencies } from '../utils/modUtils';"
        );
    }

    // 2. Fix the first requirementStatus logic
    const oldLogic1Start = "const missingMods = [];\n            for (const map of maps) {\n                if (!map.dependencies || map.dependencies.length === 0) continue;";
    const oldLogic1End = "requirementStatus = { \n                status: missingMods.length === 0 ? 'satisfied' : 'missing', \n                missing: missingMods \n            };";
    
    let start1 = code.indexOf(oldLogic1Start);
    if (start1 !== -1) {
        let end1 = code.indexOf(oldLogic1End, start1);
        if (end1 !== -1) {
            end1 += oldLogic1End.length;
            const newLogic1 = `const missingMods = [];
            for (const map of maps) {
                try {
                    const { missing } = resolveRecursiveDependencies(map.modName || map.fileName, mods);
                    for (const missingDep of Array.from(missing)) {
                        const title = typeof missingDep === 'string' ? missingDep : (missingDep.title || missingDep.modName || 'Unknown Mod');
                        if (!missingMods.includes(title)) missingMods.push(title);
                    }
                } catch (e) {
                    console.error("Failed to check map requirements:", e);
                }
            }
            requirementStatus = { 
                status: missingMods.length === 0 ? 'satisfied' : 'missing', 
                missing: missingMods 
            };`;
            code = code.substring(0, start1) + newLogic1 + code.substring(end1);
        }
    }

    // 3. Fix the checkFolderRequirements function
    const oldLogic2Start = "const checkFolderRequirements = (folderMods) => {";
    const oldLogic2End = "return { \n        status: missingMods.length === 0 ? 'satisfied' : 'missing', \n        missing: missingMods \n    };\n  };";
    
    let start2 = code.indexOf(oldLogic2Start);
    if (start2 !== -1) {
        let end2 = code.indexOf(oldLogic2End, start2);
        if (end2 !== -1) {
            end2 += oldLogic2End.length;
            const newLogic2 = `const checkFolderRequirements = (folderMods) => {
    // Check for maps
    const maps = folderMods.filter(m => {
        if (m.isMap) return true;
        const name = ((m.title || '') + ' ' + (m.fileName || '') + ' ' + (m.folder || '')).toLowerCase();
        return name.match(/map|terrain/i) && m.size > 80 * 1024 * 1024;
    });

    if (maps.length === 0) return { status: 'none', missing: [] };

    const missingMods = [];
    for (const map of maps) {
        try {
            const { missing } = resolveRecursiveDependencies(map.modName || map.fileName, mods);
            for (const missingDep of Array.from(missing)) {
                const title = typeof missingDep === 'string' ? missingDep : (missingDep.title || missingDep.modName || 'Unknown Mod');
                if (!missingMods.includes(title)) missingMods.push(title);
            }
        } catch (e) {
            console.error("Failed to check folder requirements:", e);
        }
    }
    
    return { 
        status: missingMods.length === 0 ? 'satisfied' : 'missing', 
        missing: missingMods 
    };
  };`;
            code = code.substring(0, start2) + newLogic2 + code.substring(end2);
        }
    }

    fs.writeFileSync('src/renderer/pages/InstalledModsPage.jsx', code, 'utf8');
    console.log("Patched InstalledModsPage.jsx successfully!");
}

patchInstalledMods();
