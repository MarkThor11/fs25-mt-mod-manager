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
export const cleanAlphanum = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/^(?:fs25|fs22|pdlc)_/i, '')
    .replace(/\.zip$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

/**
 * Checks if an installed mod matches a dependency requirement.
 * @param {Object} m - The installed mod object.
 * @param {string|Object} dep - The dependency requirement.
 * @param {Object} [resolvedMetadata] - Optional ModHub resolved metadata pool/lookup.
 */
export const matchModWithDependency = (m, dep, resolvedMetadata = {}) => {
  if (!dep || !m) return false;

  let depId = null;
  let depFileName = null;
  let depTitle = null;

  if (typeof dep === 'string') {
    const raw = dep.trim();
    if (raw.includes('http') || raw.toLowerCase().includes('.zip') || raw.includes('/')) {
      const idMatch = raw.match(/mod_id=(\d+)/i) || raw.match(/storage\/(\d+)\//i);
      if (idMatch) depId = parseInt(idMatch[1], 10).toString();
      const fileMatch = raw.match(/\/([^\/?#]+\.zip)/i) || raw.match(/([a-z0-9_]+\.zip)/i);
      if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
    }
    if (!depFileName) {
      if (raw.toLowerCase().endsWith('.zip') || /^(?:fs25|fs22|pdlc)_/i.test(raw)) {
        depFileName = raw.replace(/\.zip$/i, '').trim().toLowerCase();
      } else {
        depTitle = cleanModName(raw);
        depFileName = raw.replace(/\.zip$/i, '').trim().toLowerCase();
      }
    }
  } else if (typeof dep === 'object' && dep !== null) {
    if (dep.modId) depId = String(dep.modId).replace(/^0+/, '');
    if (dep.title) depTitle = cleanModName(dep.title);
    if (dep.url) {
      const idMatch = dep.url.match(/mod_id=(\d+)/i) || dep.url.match(/storage\/(\d+)\//i);
      if (idMatch && !depId) depId = parseInt(idMatch[1], 10).toString();
      const fileMatch = dep.url.match(/\/([^\/?#]+\.zip)/i) || dep.url.match(/([a-z0-9_]+\.zip)/i);
      if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
    }
    if (!depFileName) {
      const fn = dep.fileName || dep.modName || dep.technicalName;
      if (fn) depFileName = fn.replace(/\.zip$/i, '').toLowerCase();
    }
  }

  // Look up resolved metadata pool for exact ZIP filename and title if available
  const metaKey = depId || depFileName;
  if (metaKey && resolvedMetadata && resolvedMetadata[metaKey]) {
    const meta = resolvedMetadata[metaKey];
    if (meta.modId && !depId) depId = String(meta.modId).replace(/^0+/, '');
    if (meta.fileName && !depFileName) depFileName = meta.fileName.replace(/\.zip$/i, '').toLowerCase();
    if (meta.title && !depTitle) depTitle = cleanModName(meta.title);
  }

  // 1. ModHub ID Match (exact)
  if (depId && m.modId) {
    const safeModId = String(m.modId).replace(/^0+/, '');
    if (safeModId === depId) return true;
  }

  // 2. Exact Technical Name / Filename Match
  if (depFileName) {
    const normDep = normalizeForMatching(depFileName);
    const mFileNorm = m.fileName ? normalizeForMatching(m.fileName) : '';
    const mNameNorm = m.modName ? normalizeForMatching(m.modName) : '';

    if (mFileNorm === normDep || mNameNorm === normDep) return true;

    // Game prefix stripped match (e.g. FS25_precisionFarming vs precisionFarming)
    const cleanDep = normDep.replace(/^(?:fs25|fs22|pdlc)_/i, '');
    const cleanMName = mNameNorm.replace(/^(?:fs25|fs22|pdlc)_/i, '');
    const cleanMFile = mFileNorm.replace(/^(?:fs25|fs22|pdlc)_/i, '');
    if (cleanDep && (cleanMName === cleanDep || cleanMFile === cleanDep)) return true;
  }

  // 3. Exact Title Match
  if (depTitle && m.title && m.title.trim().toLowerCase() === depTitle.trim().toLowerCase()) {
    return true;
  }

  // 4. Normalized Alphanumeric Title / ModName Match (e.g. "Precision Farming" <-> "FS25_precisionFarming")
  const depAlpha = cleanAlphanum(depTitle || depFileName);
  if (depAlpha && depAlpha.length >= 4) {
    const mTitleAlpha = cleanAlphanum(m.title);
    const mNameAlpha = cleanAlphanum(m.modName);
    const mFileAlpha = cleanAlphanum(m.fileName);

    if (mTitleAlpha === depAlpha || mNameAlpha === depAlpha || mFileAlpha === depAlpha) {
      return true;
    }
  }

  return false;
};

/**
 * Recursively resolves dependencies for a given mod.
 * @param {string|Object} targetModOrName - The name or object of the mod to check.
 * @param {Array} allMods - The list of all installed mods.
 * @returns {Object} - { installed: Array(names), missing: Array(names) }
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
  const indexByCleanAlpha = new Map();
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
    if (m.modName) {
      addToIndex(indexByName, m.modName.toLowerCase(), m);
      const mNameAlpha = cleanAlphanum(m.modName);
      if (mNameAlpha && mNameAlpha.length >= 4 && !indexByCleanAlpha.has(mNameAlpha)) {
        indexByCleanAlpha.set(mNameAlpha, m);
      }
    }
    if (m.fileName) {
      const cleanFile = m.fileName.split(/[\/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
      addToIndex(indexByName, cleanFile, m);
      const mFileAlpha = cleanAlphanum(cleanFile);
      if (mFileAlpha && mFileAlpha.length >= 4 && !indexByCleanAlpha.has(mFileAlpha)) {
        indexByCleanAlpha.set(mFileAlpha, m);
      }
    }
    if (m.title) {
      const mTitleAlpha = cleanAlphanum(m.title);
      if (mTitleAlpha && mTitleAlpha.length >= 4 && !indexByCleanAlpha.has(mTitleAlpha)) {
        indexByCleanAlpha.set(mTitleAlpha, m);
      }
    }

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
    let depTitle = null;
    
    if (typeof depObjOrString === 'string') {
        const raw = depObjOrString.trim();
        const fileMatch = raw.match(/\/([^\/?#]+\.zip)/i) || raw.match(/([a-z0-9_]+\.zip)/i);
        if (fileMatch) {
          depString = fileMatch[1].replace(/\.zip$/i, '');
          fallbackFileName = depString;
        } else {
          depString = raw.replace(/\.zip$/i, '');
        }
        depTitle = cleanModName(raw);
    } else if (typeof depObjOrString === 'object' && depObjOrString !== null) {
        if (depObjOrString.modId) depId = String(depObjOrString.modId).replace(/^0+/, '');
        if (depObjOrString.title) depTitle = cleanModName(depObjOrString.title);
        const url = depObjOrString.url || '';
        if (url) {
            const fileMatch = url.match(/\/([^\/?#]+\.zip)/i) || url.match(/([a-z0-9_]+\.zip)/i);
            if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
            const idMatch = url.match(/mod_id=(\d+)/i) || url.match(/storage\/(\d+)\//i);
            if (idMatch && !depId) depId = parseInt(idMatch[1], 10).toString();
        }
        depString = fallbackFileName || depObjOrString.modName || depObjOrString.technicalName || depObjOrString.fileName || depObjOrString.title || '';
    }

    if (depId && !fallbackFileName && resolvedMetadata && resolvedMetadata[depId]) {
      const meta = resolvedMetadata[depId];
      if (meta && meta.fileName) {
        fallbackFileName = meta.fileName.replace(/\.zip$/i, '');
        depString = fallbackFileName;
      }
      if (meta && meta.title && !depTitle) {
        depTitle = cleanModName(meta.title);
      }
    }

    // Handle combined author description lines
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
    const alphaKey = cleanAlphanum(depTitle || cleanedName);

    // Ignore official GIANTS DLCs and blacklisted incompatible mods as missing zip mods
    if (nameLower.startsWith('pdlc_') || nameLower === 'fs25_maxdensityheighttypesbymap') return;
    
    if (processed.has(nameLower) || (alphaKey && processed.has(alphaKey))) return;
    processed.add(nameLower);
    if (alphaKey) processed.add(alphaKey);

    // 1. Mod ID lookup (O(1) and strictly exact)
    let match = depId ? indexById.get(depId) : null;
    
    // 2. Subfolder Priority: If we are resolving dependencies for a map, check its subfolder first
    if (!match && mapSubfolderMods.length > 0) {
      match = mapSubfolderMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata, false));
    }

    // 3. Global Name Lookup
    if (!match) {
      match = indexByName.get(nameLower);
    }

    // 4. Global Alphanumeric Title / ModName Lookup
    if (!match && alphaKey) {
      match = indexByCleanAlpha.get(alphaKey);
    }
    
    // 5. Global Loose Search
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

export const compareVersions = (v1, v2) => {
    const cleanVersion = (v) => {
        if (!v) return '';
        return String(v).trim().replace(/^[vV]/, '').replace(/[^0-9.-]/g, '');
    };

    const s1 = cleanVersion(v1);
    const s2 = cleanVersion(v2);

    if (!s1 && !s2) return 0;
    if (!s1) return -1;
    if (!s2) return 1;

    const parts1 = s1.split(/[.-]/).map(p => parseInt(p, 10) || 0);
    const parts2 = s2.split(/[.-]/).map(p => parseInt(p, 10) || 0);
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

/**
 * Standardized check to see if two mod objects refer to the same mod
 * Handles ModHub ID matching (normalizing strings and stripping leading zeroes),
 * filename matching (normalizing slashes and stripping .zip), and title matching.
 */
export const isModMatch = (a, b) => {
  if (!a || !b) return false;

  // 1. Match by modId
  const aId = a.modId != null && a.modId !== '' ? String(a.modId).replace(/^0+/, '').trim() : null;
  const bId = b.modId != null && b.modId !== '' ? String(b.modId).replace(/^0+/, '').trim() : null;
  if (aId && bId && aId === bId) return true;

  // 2. Match by fileName / modName / technicalName
  const aFile = a.fileName || a.modName || a.technicalName;
  const bFile = b.fileName || b.modName || b.technicalName;
  if (aFile && bFile) {
    const aNorm = normalizeForMatching(aFile);
    const bNorm = normalizeForMatching(bFile);
    if (aNorm && bNorm && aNorm === bNorm) return true;
  }

  // 3. Fallback: match by title if both titles exist and are non-empty
  if (a.title && b.title) {
    const cleanTitleA = String(a.title).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const cleanTitleB = String(b.title).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    if (cleanTitleA && cleanTitleB && cleanTitleA === cleanTitleB) return true;
  }

  return false;
};

