/**
 * Recursively resolves dependencies for a given mod.
 * @param {string} targetModName - The name of the mod to check.
 * @param {Array} allMods - The list of all installed mods.
 * @returns {Object} - { installed: Set(names), missing: Set(names) }
 */
export const resolveRecursiveDependencies = (targetModName, allMods) => {
  const installed = new Set();
  const missing = new Set();
  const processed = new Set();

  const cleanModName = (name) => {
    if (!name) return "";
    // Strip version requirements like "ModName (1.2.3.4)" or "ModName*"
    return name.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim();
  };

  const resolve = (depObjOrString) => {
    let depString = '';
    let depId = null;
    let fallbackFileName = null;
    
    if (typeof depObjOrString === 'string') {
        depString = depObjOrString;
    } else {
        const url = depObjOrString.url || '';
        if (url) {
            const fileMatch = url.match(/\/([^\/]+\.zip)$/i);
            if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
        }
        
        depString = fallbackFileName || depObjOrString.modName || depObjOrString.technicalName || depObjOrString.title || depObjOrString.fileName || '';
        
        const idMatch = url.match(/mod_id=(\d+)/) || url.match(/storage\/(\d+)\//);
        if (idMatch) depId = parseInt(idMatch[1], 10).toString();
    }

    const cleanedName = cleanModName(depString);
    if (!cleanedName) return;
    
    const nameLower = cleanedName.toLowerCase();
    
    // To prevent infinite loops, we track by nameLower. If we have depId, we could track by ID too, but nameLower is safe enough.
    if (processed.has(nameLower)) return;
    processed.add(nameLower);

    const match = allMods.find(m => {
        // 1. Mod ID Match (100% accurate)
        if (depId && m.modId && String(m.modId) === depId) return true;
        
        // 2. FileName Match (User explicitly requested zip file names only, avoiding unreliable titles)
        const cleanForMatch = (str) => str.replace(/[^a-z0-9]/g, '').replace(/^(?:fs25|pdlc)+/, '');
        const reqClean = cleanForMatch(nameLower);
        
        const cleanFile = m.fileName ? m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase() : '';
        if (reqClean === cleanForMatch(cleanFile) && reqClean.length > 0) return true;
        
        return false;
    });
    
    if (match) {
      if (match.modName.toLowerCase() !== targetModName.toLowerCase()) {
        installed.add(match.modName);
      }
      if (match.dependencies) {
        match.dependencies.forEach(dep => resolve(dep));
      }
    } else {
      missing.add(cleanedName);
    }
  };

  resolve(targetModName);
  return { installed, missing };
};

/**
 * Compares two version strings.
 * Returns:
 *   - 1 if v1 > v2 (update available if v1 is remote)
 *   - -1 if v1 < v2
 *   - 0 if v1 == v2
 */
export const compareVersions = (v1, v2) => {
    if (!v1 && !v2) return 0;
    if (!v1) return -1;
    if (!v2) return 1;

    const parts1 = String(v1).split(/[.-]/).map(p => parseInt(p, 10) || 0);
    const parts2 = String(v2).split(/[.-]/).map(p => parseInt(p, 10) || 0);
    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
};
