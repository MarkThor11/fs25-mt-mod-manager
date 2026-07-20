/**
 * Recursively resolves dependencies for a given mod.
 * @param {string} targetModName - The name of the mod to check.
 * @param {Array} allMods - The list of all installed mods.
 * @returns {Object} - { installed: Set(names), missing: Set(names) }
 */
export const cleanModName = (name) => {
  if (!name) return "";
  // Strip version requirements like "ModName (1.2.3.4)" or "ModName*"
  return name.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim();
};

export const normalizeForMatching = (str) => {
  if (!str) return '';
  const fileClean = str.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
  return fileClean.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');
};

/**
 * Checks if an installed mod matches a dependency requirement.
 * @param {Object} m - The installed mod object.
 * @param {string|Object} dep - The dependency requirement.
 * @param {Object} [resolvedMetadata] - Optional ModHub resolved metadata pool/lookup.
 */
export const matchModWithDependency = (m, dep, resolvedMetadata = {}) => {
  if (!dep || !m) return false;
  
  let depString = '';
  let depId = null;
  let fallbackFileName = null;
  let resolvedFileName = null;
  let resolvedTitle = null;
  
  if (typeof dep === 'string') {
      depString = dep;
  } else {
      const url = dep.url || '';
      if (url) {
          const fileMatch = url.match(/\/([^\/]+\.zip)$/i);
          if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
      }
      
      depString = fallbackFileName || dep.modName || dep.technicalName || dep.title || dep.fileName || '';
      resolvedFileName = dep.fileName || null;
      resolvedTitle = dep.title || null;
      
      const idMatch = url.match(/mod_id=(\d+)/) || url.match(/storage\/(\d+)\//);
      if (idMatch) depId = parseInt(idMatch[1], 10).toString();
  }

  const cleanedName = cleanModName(depString);
  if (!cleanedName) return false;
  
  // Attempt lookup in resolvedMetadata if available
  const depTitle = typeof dep === 'string' ? dep : dep.title;
  const resolvedObj = resolvedMetadata[depTitle] || (typeof dep === 'object' ? (resolvedMetadata[dep.title] || resolvedMetadata[dep.modName] || resolvedMetadata[dep.fileName]) : null);
  
  if (resolvedObj) {
      if (resolvedObj.modId) depId = String(resolvedObj.modId);
      if (resolvedObj.fileName) resolvedFileName = resolvedObj.fileName;
      if (resolvedObj.title) resolvedTitle = resolvedObj.title;
  }

  // 1. Mod ID Match (100% accurate)
  if (depId && m.modId) {
      const safeModId = String(m.modId).replace(/^0+/, '');
      if (safeModId === depId) return true;
  }

  // 2. ModHub Title fallback if titles match case-insensitively
  const titleToCheck = resolvedTitle || (typeof dep === 'object' && dep.title ? dep.title : null);
  if (titleToCheck && m.title && titleToCheck.toLowerCase() === m.title.toLowerCase()) return true;

  // 3. Filename fallback if ModHub ID was resolved but ID match failed
  const fileToCheck = resolvedFileName || (typeof dep === 'object' && dep.fileName ? dep.fileName : null);
  if (fileToCheck) {
      const rFile = normalizeForMatching(fileToCheck);
      const lFile = normalizeForMatching(m.fileName);
      if (rFile && lFile && rFile === lFile) return true;
  }
  
  // 4. Exact/Normalized ModName match
  const targetNormalized = normalizeForMatching(cleanedName);
  if (m.modName) {
      if (m.modName.toLowerCase() === cleanedName.toLowerCase()) return true;
      if (normalizeForMatching(m.modName) === targetNormalized) return true;
  }

  // 5. Exact/Normalized FileName match
  if (m.fileName) {
      const cleanFile = m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
      if (cleanFile === cleanedName.toLowerCase()) return true;
      if (normalizeForMatching(m.fileName) === targetNormalized) return true;
  }
  
  return false;
};

/**
 * Recursively resolves dependencies for a given mod.
 * @param {string} targetModName - The name of the mod to check.
 * @param {Array} allMods - The list of all installed mods.
 * @returns {Object} - { installed: Set(names), missing: Set(names) }
 */
export const resolveRecursiveDependencies = (targetModName, allMods, sessionInstalled = {}, resolvedMetadata = {}) => {
  console.log(`[RESOLVE] targetModName=${targetModName} allMods.length=${allMods ? allMods.length : 0}`);
  const installed = new Set();
  const missing = new Set();
  const processed = new Set();

  // If the target mod resides in a subfolder (organizational folder),
  // automatically include all other mods sharing the exact same subfolder.
  if (targetModName && allMods) {
    const targetMod = allMods.find(m => m.modName && m.modName.toLowerCase() === targetModName.toLowerCase());
    if (targetMod && targetMod.folder && targetMod.folder.toLowerCase() !== 'mods' && targetMod.folder.toLowerCase() !== '') {
      const folderLower = targetMod.folder.toLowerCase();
      console.log(`[RESOLVE] Target mod is in subfolder '${targetMod.folder}'. Auto-selecting sibling mods...`);
      allMods.forEach(m => {
        if (m.folder && m.folder.toLowerCase() === folderLower && m.modName && m.modName.toLowerCase() !== targetModName.toLowerCase()) {
          installed.add(m.modName);
        }
      });
    }
  }

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

    const match = allMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata));
    
    console.log(`[RESOLVE-STEP] depString=${depString} cleanedName=${cleanedName} foundMatch=${match ? 'YES' : 'NO'}`);

    // Check if any value in sessionInstalled matches the requested dependency name
    const isSessionInstalledByName = Object.values(sessionInstalled).some(val => val && val.toLowerCase() === nameLower);

    if (match) {
      if (match.modName && match.modName.toLowerCase() !== targetModName.toLowerCase()) {
        installed.add(match.modName);
      }
      if (match.dependencies) {
        console.log(`[RESOLVE-DEPS] Match ${match.modName} has ${match.dependencies.length} deps:`, match.dependencies);
        match.dependencies.forEach(dep => resolve(dep));
      }
    } else if ((depId && sessionInstalled[depId]) || isSessionInstalledByName) {
      // Optimistic UI: If we just installed this in the current session, assume it's installed
      installed.add(cleanedName);
    } else {
      missing.add(cleanedName);
    }
  };

  resolve(targetModName);
  return { installed: Array.from(installed), missing: Array.from(missing) };
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
