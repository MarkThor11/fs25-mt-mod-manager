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

  const resolve = (name) => {
    const cleanedName = cleanModName(name);
    if (!cleanedName) return;
    
    const nameLower = cleanedName.toLowerCase();
    if (processed.has(nameLower)) return;
    processed.add(nameLower);

    const match = allMods.find(m => {
        const mName = m.modName.toLowerCase();
        // 1. Exact match
        if (mName === nameLower) return true;
        // 2. DLC prefix mismatch: scanner has "highlands", request has "pdlc_highlands"
        if (nameLower.startsWith('pdlc_') && mName === nameLower.substring(5)) return true;
        // 3. DLC prefix mismatch reverse: scanner has "pdlc_highlands", request has "highlands"
        if (mName.startsWith('pdlc_') && mName.substring(5) === nameLower) return true;
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
