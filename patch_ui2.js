const fs = require('fs');

function patchModDetailPage() {
    let code = fs.readFileSync('src/renderer/pages/ModDetailPage.jsx', 'utf8');
    
    // Replace requirementsMet
    const reqMetStart = "const requirementsMet = useMemo(() => {";
    const reqMetEnd = "}, [uniqueDependencies, localMods]);";
    
    const startIndex = code.indexOf(reqMetStart);
    if (startIndex !== -1) {
        const endIndex = code.indexOf(reqMetEnd, startIndex) + reqMetEnd.length;
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
        
        code = code.substring(0, startIndex) + newReqMet + code.substring(endIndex);
    }
    
    // Replace isInstalled logic
    const isInstStart = "const isInstalled = localMods.some(lm => {";
    const isInstEnd = "return false;\n                  });";
    
    let isInstIndex = code.indexOf(isInstStart);
    if (isInstIndex !== -1) {
        const isInstEndIndex = code.indexOf(isInstEnd, isInstIndex) + isInstEnd.length;
        const newIsInst = `let isInstalled = false;
                  try {
                      const { missing } = resolveRecursiveDependencies(mod.modName || mod.fileName, localMods);
                      isInstalled = !Array.from(missing).some(m => {
                          const mTitle = typeof m === 'string' ? m : (m.title || m.modName);
                          return mTitle === depTitle;
                      });
                  } catch (e) {
                      console.error("Failed to check dependency status:", e);
                  }`;
                  
        // Also remove the unused variables before it
        const varStart = "const normalizedDep = ultraNormalize(depTitle);";
        const varEnd = "dep.url.match(/storage\\/(\\d+)\\//)?.[1]) : null;";
        
        let cleanedCode = code.substring(0, isInstIndex) + newIsInst + code.substring(isInstEndIndex);
        cleanedCode = cleanedCode.replace(varStart, "");
        cleanedCode = cleanedCode.replace("const depId = typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\\d+)/)?.[1] || \ndep.url.match(/storage\\/(\\d+)\\//)?.[1]) : null;", "");
        
        code = cleanedCode;
    }
    
    fs.writeFileSync('src/renderer/pages/ModDetailPage.jsx', code, 'utf8');
}

patchModDetailPage();
console.log("Patched ModDetailPage.jsx!");
