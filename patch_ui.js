const fs = require('fs');

function patchInstalledMods() {
    let code = fs.readFileSync('src/renderer/pages/InstalledModsPage.jsx', 'utf8');
    
    // Add import
    if (!code.includes('resolveRecursiveDependencies')) {
        code = code.replace(
            "import DependencyDownloadModal from '../components/common/DependencyDownloadModal';",
            "import DependencyDownloadModal from '../components/common/DependencyDownloadModal';\nimport { resolveRecursiveDependencies } from '../utils/modUtils';"
        );
    }
    
    // Replace the requirement logic in the grouped mods map
    const oldLogic1 = `const missingMods = [];
            for (const map of maps) {
                if (!map.dependencies || map.dependencies.length === 0) continue;
                
                // For each dependency (which will be ModHub ones if the backend enriched them,
                // or local FS25_ names if not), we check if it's installed.
                for (const dep of map.dependencies) {
                    const depTitle = typeof dep === 'string' ? dep : dep.title;
                    const normalizedDep = ultraNormalize(depTitle);
                    const depId = typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\d+)/)?.[1] || dep.url.match(/storage\\/(\\d+)\\//)?.[1]) : null;

                    const exactCheckStr = (dep.fileName || depTitle || '').toString();

                    const found = mods.some(lm => {
                        // 1. Direct ID Match (Strongest)
                        if (depId && lm.modId && String(lm.modId) === String(depId)) return true;
                        
                        // 2. Exact match against modName or fileName (handling subfolders)
                        // Since modDesc.xml dependencies are exactly the required zip filenames (minus .zip)
                        if (lm.modName && lm.modName.toLowerCase() === exactCheckStr.toLowerCase()) return true;
                        const cleanFileName = lm.fileName ? lm.fileName.split('/').pop().toLowerCase() : '';
                        if (cleanFileName === exactCheckStr.toLowerCase() + '.zip') return true;

                        // 3. Fallback fuzzy match for titles
                        const localUltraTitle = ultraNormalize(lm.title || '');
                        const localUltraName = ultraNormalize(lm.modName || '');
                        const localUltraFile = ultraNormalize(lm.fileName || '');
                        if (localUltraTitle === normalizedDep || localUltraName === normalizedDep || localUltraFile === normalizedDep) return true;
                        if (normalizedDep.length > 3 && localUltraTitle && (localUltraTitle.includes(normalizedDep) || normalizedDep.includes(localUltraTitle))) return true;
                        if (normalizedDep.length > 3 && localUltraName && (localUltraName.includes(normalizedDep) || normalizedDep.includes(localUltraName))) return true;
                        return false;
                    });
                    
                    if (!found && !missingMods.includes(depTitle)) {
                        missingMods.push(depTitle);
                    }
                }
            }`;

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
            }`;
            
    code = code.replace(oldLogic1, newLogic1);
    
    // Replace the checkFolderRequirements function
    const oldLogic2Start = `const checkFolderRequirements = (folderMods) => {`;
    const oldLogic2End = `return { \n        status: missingMods.length === 0 ? 'satisfied' : 'missing', \n        missing: missingMods \n    };\n  };`;
    
    const startIndex = code.indexOf(oldLogic2Start);
    if (startIndex !== -1) {
        let endIndex = code.indexOf(oldLogic2End, startIndex);
        if (endIndex !== -1) {
            endIndex += oldLogic2End.length;
            const newFunc = `const checkFolderRequirements = (folderMods) => {
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
            code = code.substring(0, startIndex) + newFunc + code.substring(endIndex);
        }
    }
    
    fs.writeFileSync('src/renderer/pages/InstalledModsPage.jsx', code, 'utf8');
}

function patchModDetailPage() {
    let code = fs.readFileSync('src/renderer/pages/ModDetailPage.jsx', 'utf8');
    
    if (!code.includes('resolveRecursiveDependencies')) {
        code = code.replace(
            "import { compareVersions } from '../utils/modUtils';",
            "import { compareVersions, resolveRecursiveDependencies } from '../utils/modUtils';"
        );
    }
    
    const oldReqMet = `const requirementsMet = useMemo(() => {
    if (uniqueDependencies.length === 0) return true;
    if (!localMods) return false;

    return uniqueDependencies.every(dep => {
      const depTitle = typeof dep === 'string' ? dep : dep.title;
      const normalizedDep = ultraNormalize(depTitle);
      const depId = typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\d+)/)?.[1] || dep.url.match(/storage\\/(\\d+)\\//)?.[1]) : null;

      return localMods.some(lm => {
        // 1. Direct ID Match (Strongest)
        if (depId && lm.modId && String(lm.modId) === String(depId)) return true;
        
        // 2. Ultra Normalization match for Title, Name, and FileName
        const localUltraTitle = ultraNormalize(lm.title || '');
        const localUltraName = ultraNormalize(lm.modName || '');
        const localUltraFile = ultraNormalize(lm.fileName || '');
        
        if (localUltraTitle === normalizedDep || localUltraName === normalizedDep || localUltraFile === normalizedDep) return true;
        
        // 3. Containment (Safe fuzzy check)
        if (normalizedDep.length > 3 && (localUltraTitle.includes(normalizedDep) || normalizedDep.includes(localUltraTitle))) return true;
        if (normalizedDep.length > 3 && (localUltraName.includes(normalizedDep) || normalizedDep.includes(localUltraName))) return true;

        return false;
      });
    });
  }, [uniqueDependencies, localMods]);`;

    const newReqMet = `const requirementsMet = useMemo(() => {
    if (uniqueDependencies.length === 0) return true;
    if (!localMods) return false;
    
    try {
        const { missing } = resolveRecursiveDependencies(mod.modName || mod.fileName, localMods);
        return missing.size === 0;
    } catch (e) {
        console.error("Failed to resolve dependencies:", e);
        return false;
    }
  }, [uniqueDependencies, localMods, mod]);`;
  
    code = code.replace(oldReqMet, newReqMet);
    
    const oldJSX = `{uniqueDependencies.map((dep) => {
                  const depTitle = typeof dep === 'string' ? dep : dep.title;
                  const normalizedDep = ultraNormalize(depTitle);
                  const depId = typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\d+)/)?.[1] || dep.url.match(/storage\\/(\\d+)\\//)?.[1]) : null;

                  const isInstalled = localMods.some(lm => {
                    // 1. Direct ID Match (Strongest)
                    if (depId && lm.modId && String(lm.modId) === String(depId)) return true;
                    
                    // 2. Exact match against modName or fileName (handling subfolders)
                    // Since modDesc.xml dependencies are exactly the required zip filenames (minus .zip)
                    if (lm.modName && lm.modName.toLowerCase() === depTitle.toLowerCase()) return true;
                    const cleanFileName = lm.fileName ? lm.fileName.split('/').pop().toLowerCase() : '';
                    if (cleanFileName === depTitle.toLowerCase() + '.zip') return true;

                    // 3. Fallback fuzzy match for titles
                    const localUltraTitle = ultraNormalize(lm.title || '');
                    const localUltraName = ultraNormalize(lm.modName || '');
                    const localUltraFile = ultraNormalize(lm.fileName || '');
                    
                    if (localUltraTitle === normalizedDep || localUltraName === normalizedDep || localUltraFile === normalizedDep) return true;
                    
                    // 3. Containment (Safe fuzzy check)
                    if (normalizedDep.length > 3 && localUltraTitle && (localUltraTitle.includes(normalizedDep) || normalizedDep.includes(localUltraTitle))) return true;
                    if (normalizedDep.length > 3 && localUltraName && (localUltraName.includes(normalizedDep) || normalizedDep.includes(localUltraName))) return true;

                    return false;
                  });`;
                  
    const newJSX = `{uniqueDependencies.map((dep) => {
                  const depTitle = typeof dep === 'string' ? dep : dep.title;
                  
                  let isInstalled = false;
                  try {
                      const { missing } = resolveRecursiveDependencies(mod.modName || mod.fileName, localMods);
                      isInstalled = !Array.from(missing).some(m => (m.title === depTitle || m.modName === depTitle || m === depTitle));
                  } catch (e) {
                      console.error("Failed to check dependency status:", e);
                  }`;
                  
    code = code.replace(oldJSX, newJSX);
    
    fs.writeFileSync('src/renderer/pages/ModDetailPage.jsx', code, 'utf8');
}

patchInstalledMods();
patchModDetailPage();
console.log("Patched successfully!");
