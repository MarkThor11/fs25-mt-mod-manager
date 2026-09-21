/**
 * Recursively resolves dependencies for a given mod.
 * @param {string} targetModName - The name of the mod to check.
 * @param {Array} allMods - The list of all installed mods.
 * @returns {Object} - { installed: Set(names), missing: Set(names) }
 */
export const cleanModName = (name) => {
  if (!name) return "";
  return name
    .replace(/^[\s\-\*\•\–\—]+/, '')
    .replace(/\s*(?:\(|\[)?by:?[\s\S]*$/i, '')
    .replace(/\s*\(v?\d+\.\d+.*?\)/i, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\*+$/, '')
    .trim();
};

export const normalizeForMatching = (str) => {
  if (!str) return '';
  return str.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase().trim();
};

/**
 * Accurately determines if a category string belongs to a map category.
 * Non-map categories like Gameplay, Prefab, Package, Objects, etc. are strictly false.
 */
export const isMapCategory = (category) => {
  if (!category || typeof category !== 'string') return false;
  const c = category.trim().toLowerCase();
  // Any explicit non-map category is strictly false
  if (
    c.includes('gameplay') ||
    c.includes('prefab') ||
    c.includes('package') ||
    c.includes('object') ||
    c.includes('placeable') ||
    c.includes('drivable') ||
    c.includes('trailer') ||
    c.includes('tool') ||
    c.includes('animal') ||
    c.includes('baling') ||
    c.includes('harvest') ||
    c.includes('forestry') ||
    c.includes('grassland') ||
    c.includes('grape') ||
    c.includes('loader') ||
    c.includes('rootcrop') ||
    c.includes('seeding') ||
    c.includes('cultivation') ||
    c.includes('crop') ||
    c.includes('vegetable') ||
    c.includes('yield') ||
    c.includes('misc')
  ) {
    return false;
  }
  return /\bmaps?\b/i.test(c);
};

/**
 * Checks if an installed mod matches a dependency requirement.
 * @param {Object} m - The installed mod object.
 * @param {string|Object} dep - The dependency requirement.
 * @param {Object} [resolvedMetadata] - Optional ModHub resolved metadata pool/lookup.
 */
export const matchModWithDependency = (m, dep, resolvedMetadata = {}, strict = false) => {
  if (!dep || !m) return false;

  let depId = null;
  let depFileName = null;
  let depTitle = null;

  if (typeof dep === 'string') {
    if (dep.includes('http')) {
      const idMatch = dep.match(/mod_id=(\d+)/i) || dep.match(/storage\/(\d+)\//i);
      if (idMatch) depId = parseInt(idMatch[1], 10).toString();
      const fileMatch = dep.match(/\/([^\/]+\.zip)$/i);
      if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
    } else {
      depTitle = cleanModName(dep);
      depFileName = dep.replace(/\.zip$/i, '').trim().toLowerCase();
    }
  } else if (typeof dep === 'object') {
    if (dep.modId) depId = String(dep.modId).replace(/^0+/, '');
    if (dep.url) {
      const idMatch = dep.url.match(/mod_id=(\d+)/i) || dep.url.match(/storage\/(\d+)\//i);
      if (idMatch && !depId) depId = parseInt(idMatch[1], 10).toString();
      const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
      if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
    }
    if (!depFileName) {
      const fn = dep.fileName || dep.modName || dep.technicalName;
      if (fn) depFileName = fn.replace(/\.zip$/i, '').toLowerCase();
    }
    if (dep.title) depTitle = cleanModName(dep.title);
  }

  // Check resolvedMetadata pool if available
  const metaKey = depId || depTitle;
  if (metaKey && resolvedMetadata && resolvedMetadata[metaKey]) {
    const meta = resolvedMetadata[metaKey];
    if (meta.modId && !depId) depId = String(meta.modId).replace(/^0+/, '');
    if (meta.fileName && !depFileName) depFileName = meta.fileName.replace(/\.zip$/i, '').toLowerCase();
    if (meta.title && !depTitle) depTitle = cleanModName(meta.title);
  }

  // 1. Identity 1: ModHub ID Match (exact)
  if (depId && m.modId) {
    const safeModId = String(m.modId).replace(/^0+/, '');
    if (safeModId === depId) return true;
    return false;
  }

  const mFileNorm = m.fileName ? normalizeForMatching(m.fileName) : '';
  const mNameNorm = m.modName ? normalizeForMatching(m.modName) : '';

  // 2. Identity 2: ZIP Filename / Technical Mod Name Match (exact or prefix-stripped)
  if (depFileName) {
    const normDepFile = normalizeForMatching(depFileName);
    if (mFileNorm === normDepFile || mNameNorm === normDepFile) return true;

    const cleanDepFile = normDepFile.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');
    const cleanMName = mNameNorm.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');
    const cleanMFile = mFileNorm.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');

    if (cleanDepFile && (cleanMName === cleanDepFile || cleanMFile === cleanDepFile)) return true;
  }

  if (strict) return false;

  // 3. Identity 3: Internal modDesc.xml Mod Title / Normalized Name Match
  if (depTitle) {
    const cleanDepTitle = cleanModName(depTitle).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanMTitle = m.title ? cleanModName(m.title).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const cleanMName = mNameNorm.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');
    const cleanMFile = mFileNorm.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');

    if (!cleanDepTitle) return false;

    // Exact clean title or modName match
    if (cleanMTitle && cleanMTitle === cleanDepTitle) return true;
    if (cleanMName && cleanMName === cleanDepTitle) return true;
    if (cleanMFile && cleanMFile === cleanDepTitle) return true;

    // Substring token match (e.g. "Workshop" in "garageworkshop" or "Garage Workshop")
    if (cleanDepTitle.length >= 4) {
      if (cleanMTitle && (cleanMTitle.includes(cleanDepTitle) || cleanDepTitle.includes(cleanMTitle))) return true;
      if (cleanMName && (cleanMName.includes(cleanDepTitle) || cleanDepTitle.includes(cleanMName))) return true;
      if (cleanMFile && (cleanMFile.includes(cleanDepTitle) || cleanDepTitle.includes(cleanMFile))) return true;
    }
  }

  return false;
};

/**
 * Recursively resolves dependencies for a given mod.
 * @param {string} targetModName - The name of the mod to check.
 * @param {Array} allMods - The list of all installed mods.
 * @returns {Object} - { installed: Set(names), missing: Set(names) }
 */
export const resolveRecursiveDependencies = (targetModOrName, allMods, sessionInstalled = {}, resolvedMetadata = {}) => {
  const installed = new Set();
  const missing = new Set();
  const processed = new Set();

  if (!allMods || allMods.length === 0) {
    return { installed: [], missing: [] };
  }

  // Pre-build O(1) fast lookup index across all installed mods
  const indexById = new Map();
  const indexByName = new Map();
  const subfolderModsMap = new Map();

  const addToIndex = (indexMap, key, mod) => {
    if (!key) return;
    const existing = indexMap.get(key);
    // Prioritize ModHub mods over local third-party mods when names collide
    if (existing && existing.modId && !mod.modId) return;
    indexMap.set(key, mod);
  };

  for (let i = 0; i < allMods.length; i++) {
    const m = allMods[i];
    if (!m) continue;
    if (m.modId) indexById.set(String(m.modId).replace(/^0+/, ''), m);
    if (m.modName) addToIndex(indexByName, m.modName.toLowerCase(), m);
    if (m.fileName) {
      const cleanFile = m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
      addToIndex(indexByName, cleanFile, m);
    }
    if (m.title) addToIndex(indexByName, m.title.toLowerCase(), m);

    if (m.folder && m.folder.toLowerCase() !== 'mods' && m.folder.toLowerCase() !== '') {
      const fLow = m.folder.toLowerCase();
      if (!subfolderModsMap.has(fLow)) subfolderModsMap.set(fLow, []);
      subfolderModsMap.get(fLow).push(m);
    }
  }

  let mapSubfolderMods = [];
  let targetMod = null;
  let targetModNameForResolve = '';

  if (targetModOrName) {
    if (typeof targetModOrName === 'string') {
        targetMod = indexByName.get(targetModOrName.toLowerCase());
        targetModNameForResolve = targetModOrName;
    } else if (typeof targetModOrName === 'object') {
        targetMod = targetModOrName;
        targetModNameForResolve = targetMod.modName || targetMod.fileName || targetMod.title;
    }

    if (targetMod && targetMod.folder && targetMod.folder.toLowerCase() !== 'mods' && targetMod.folder.toLowerCase() !== '') {
      const folderLower = targetMod.folder.toLowerCase();
      mapSubfolderMods = subfolderModsMap.get(folderLower) || [];
    }
  }

  const resolve = (depObjOrString) => {
    let depString = '';
    let depId = null;
    let fallbackFileName = null;
    
    if (typeof depObjOrString === 'string') {
        depString = depObjOrString;
    } else if (typeof depObjOrString === 'object') {
        const url = depObjOrString.url || '';
        if (url) {
            const fileMatch = url.match(/\/([^\/]+\.zip)$/i);
            if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
        }
        depString = fallbackFileName || depObjOrString.modName || depObjOrString.technicalName || depObjOrString.title || depObjOrString.fileName || '';
        
        const idMatch = url.match(/mod_id=(\d+)/) || url.match(/storage\/(\d+)\//);
        if (idMatch) depId = parseInt(idMatch[1], 10).toString();
    }

    // Handle combined author description lines (e.g., "Lizard Animal Barns - Wood Chip Production (By: JonnyXPRO)")
    if (!depId && depString && !fallbackFileName && (depString.includes(' - ') || depString.includes('(By:') || depString.includes('(By ') || depString.includes(' (by '))) {
      const parts = depString.replace(/\s*(?:\(|\[)?by:?.*?(?:\)|\])?$/gi, '').split(/\s+-\s+/);
      if (parts.length > 1) {
        parts.forEach(part => resolve(part.trim()));
        return;
      }
    }

    const cleanedName = cleanModName(depString);
    if (!cleanedName) return;
    const nameLower = cleanedName.toLowerCase();

    // Ignore official GIANTS DLCs (e.g. pdlc_highlandsFishingPack) as missing zip mods
    if (nameLower.startsWith('pdlc_')) return;
    
    if (processed.has(nameLower)) return;
    processed.add(nameLower);

    // 1. Mod ID lookup (O(1) and strictly exact)
    let match = depId ? indexById.get(depId) : null;
    
    // 2. Subfolder Priority: If we are resolving dependencies for a map, check its subfolder first
    if (!match && mapSubfolderMods.length > 0) {
      match = mapSubfolderMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata, false));
    }

    // 3. Global Name Lookup (O(1) but prone to generic name collisions)
    if (!match) {
      match = indexByName.get(nameLower);
    }
    
    // 4. Global Loose Search (O(N))
    if (!match) {
      match = allMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata, false));
    }
    
    const isSessionInstalledByName = Boolean(nameLower) && Object.values(sessionInstalled).some(val => val && val.toLowerCase() === nameLower);

    if (match) {
      if (match.modName && match.modName.toLowerCase() !== targetModNameForResolve.toLowerCase()) {
        installed.add(match.modName);
      }
      if (match.dependencies) {
        match.dependencies.forEach(dep => resolve(dep));
      }
    } else if (nameLower && ((depId && sessionInstalled[depId]) || isSessionInstalledByName)) {
      installed.add(cleanedName);
    } else {
      missing.add(cleanedName);
    }
  };

  resolve(targetModNameForResolve);
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

/**
 * Calculates which mods in a given savegame are actively conflicting.
 * A conflict only triggers if MULTIPLE mods from the same conflict group are active.
 * @param {Array|Set} activeModNames - List of currently active modNames in the savegame
 * @param {Array} allConflicts - Global array of all detected script conflicts
 * @returns {Map} Map of modName (lowercase) to array of conflict objects
 */
export const getActiveConflictsForSave = (activeModNames, allConflicts) => {
  const activeSet = new Set();
  (activeModNames || []).forEach(name => {
    if (typeof name === 'string') activeSet.add(name.toLowerCase());
    else if (name && name.modName) activeSet.add(name.modName.toLowerCase());
  });

  const conflictsMap = new Map();

  (allConflicts || []).forEach(conflict => {
    // Determine which mods in this conflict group are actually active
    const activeInGroup = (conflict.modNames || conflict.mods || []).filter(m => activeSet.has(m.toLowerCase()));
    
    // A conflict only manifests if 2 or more mods from the group are active
    if (activeInGroup.length > 1) {
      activeInGroup.forEach(modName => {
        const lowerName = modName.toLowerCase();
        if (!conflictsMap.has(lowerName)) {
          conflictsMap.set(lowerName, []);
        }
        conflictsMap.get(lowerName).push({
          ...conflict,
          activeConflictingMods: activeInGroup.filter(m => m.toLowerCase() !== lowerName)
        });
      });
    }
  });

  return conflictsMap;
};
