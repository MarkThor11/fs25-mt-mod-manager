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
  if (depTitle && resolvedMetadata[depTitle]) {
    const meta = resolvedMetadata[depTitle];
    if (meta.modId && !depId) depId = String(meta.modId).replace(/^0+/, '');
    if (meta.fileName && !depFileName) depFileName = meta.fileName.replace(/\.zip$/i, '').toLowerCase();
    if (meta.title && !depTitle) depTitle = cleanModName(meta.title);
  }

  // 1. Identity 1: ModHub ID Match
  if (depId && m.modId) {
    const safeModId = String(m.modId).replace(/^0+/, '');
    if (safeModId === depId) return true;
  }

  // 2. Identity 2: ZIP Filename / Technical Mod Name Match
  if (depFileName) {
    const normDepFile = normalizeForMatching(depFileName);
    if (m.fileName && normalizeForMatching(m.fileName) === normDepFile) return true;
    if (m.modName && normalizeForMatching(m.modName) === normDepFile) return true;
  }

  if (strict) return false;

  // 3. Identity 3: Internal modDesc.xml Mod Title Match
  if (depTitle) {
    const cleanDepTitle = cleanModName(depTitle).toLowerCase();
    if (m.title && cleanModName(m.title).toLowerCase() === cleanDepTitle) return true;
    if (m.modName && cleanModName(m.modName).toLowerCase() === cleanDepTitle) return true;
    if (m.fileName && normalizeForMatching(m.fileName) === normalizeForMatching(cleanDepTitle)) return true;
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

  for (let i = 0; i < allMods.length; i++) {
    const m = allMods[i];
    if (!m) continue;
    if (m.modId) indexById.set(String(m.modId).replace(/^0+/, ''), m);
    if (m.modName) indexByName.set(m.modName.toLowerCase(), m);
    if (m.fileName) {
      const cleanFile = m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
      indexByName.set(cleanFile, m);
    }
    if (m.title) indexByName.set(m.title.toLowerCase(), m);

    if (m.folder && m.folder.toLowerCase() !== 'mods' && m.folder.toLowerCase() !== '') {
      const fLow = m.folder.toLowerCase();
      if (!subfolderModsMap.has(fLow)) subfolderModsMap.set(fLow, []);
      subfolderModsMap.get(fLow).push(m);
    }
  }

  let mapSubfolderMods = [];
  if (targetModName) {
    const targetMod = indexByName.get(targetModName.toLowerCase());
    if (targetMod && targetMod.folder && targetMod.folder.toLowerCase() !== 'mods' && targetMod.folder.toLowerCase() !== '') {
      const folderLower = targetMod.folder.toLowerCase();
      mapSubfolderMods = subfolderModsMap.get(folderLower) || [];
      for (const m of mapSubfolderMods) {
        if (m.modName && m.modName.toLowerCase() !== targetModName.toLowerCase()) {
          installed.add(m.modName);
        }
      }
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
    
    if (processed.has(nameLower)) return;
    processed.add(nameLower);

    // O(1) Instant Lookup Strategy
    let match = (depId ? indexById.get(depId) : null) || indexByName.get(nameLower);
    
    if (!match) {
      match = allMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata, false));
    }

    // Check if installed in map subfolder
    if (!match && mapSubfolderMods.length > 0) {
      match = mapSubfolderMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata, false));
    }
    
    const isSessionInstalledByName = Object.values(sessionInstalled).some(val => val && val.toLowerCase() === nameLower);

    if (match) {
      if (match.modName && match.modName.toLowerCase() !== targetModName.toLowerCase()) {
        installed.add(match.modName);
      }
      if (match.dependencies) {
        match.dependencies.forEach(dep => resolve(dep));
      }
    } else if ((depId && sessionInstalled[depId]) || isSessionInstalledByName) {
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
