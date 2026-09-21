/**
 * Centralized Backend Dependency Resolver
 * Provides robust, recursive dependency matching across all folders, subfolders, and drives.
 */

function cleanModName(name) {
  if (!name) return "";
  return name
    .replace(/^[\s\-\*\•\–\—]+/, "")
    .replace(/\s*(?:\(|\[)?by:?[\s\S]*$/i, "")
    .replace(/\s*\(v?\d+\.\d+.*?\)/i, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\*+$/, "")
    .trim();
}

function normalizeForMatching(str) {
  if (!str) return "";
  return str.split(/[/\\]/).pop().replace(/\.zip$/i, "").toLowerCase().trim();
}

function matchModWithDependency(m, dep) {
  if (!dep || !m) return false;
  let depId = null, depFileName = null, depTitle = null;

  if (typeof dep === "string") {
    if (dep.includes("http")) {
      const idMatch = dep.match(/mod_id=(\d+)/i) || dep.match(/storage\/(\d+)\//i);
      if (idMatch) depId = parseInt(idMatch[1], 10).toString();
      const fileMatch = dep.match(/\/([^\/]+\.zip)$/i);
      if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, "").toLowerCase();
    } else {
      depTitle = cleanModName(dep);
      depFileName = dep.replace(/\.zip$/i, "").trim().toLowerCase();
    }
  } else if (typeof dep === "object") {
    if (dep.modId) depId = String(dep.modId).replace(/^0+/, "");
    if (dep.url) {
      const idMatch = dep.url.match(/mod_id=(\d+)/i) || dep.url.match(/storage\/(\d+)\//i);
      if (idMatch) depId = parseInt(idMatch[1], 10).toString();
      const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
      if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, "").toLowerCase();
    }
    if (!depFileName) {
      const fn = dep.fileName || dep.modName || dep.technicalName;
      if (fn) depFileName = fn.replace(/\.zip$/i, "").toLowerCase();
    }
    if (dep.title) depTitle = cleanModName(dep.title);
  }

  // 1. ModHub ID Match (robust: leading zeros stripped)
  if (depId && m.modId) {
    const safeModId = String(m.modId).replace(/^0+/, "");
    if (safeModId === depId) return true;
    // Contradicting ModHub ID means it is definitely not the same mod!
    return false;
  }

  // 2. File / Technical ModName Match (exact)
  if (depFileName) {
    const normDepFile = normalizeForMatching(depFileName);
    const mFileNorm = m.fileName ? normalizeForMatching(m.fileName) : null;
    const mNameNorm = m.modName ? normalizeForMatching(m.modName) : null;

    if (mFileNorm === normDepFile || mNameNorm === normDepFile) return true;

    if ((normDepFile.startsWith('fs25_') || normDepFile.includes('_')) && (mFileNorm || mNameNorm)) {
      if (mFileNorm && mFileNorm !== normDepFile && mFileNorm.startsWith('fs25_')) return false;
      if (mNameNorm && mNameNorm !== normDepFile && mNameNorm.startsWith('fs25_')) return false;
    }
  }

  // 3. Title Match (exact full string)
  if (depTitle) {
    const cleanDepTitle = cleanModName(depTitle).toLowerCase();
    const cleanMTitle = m.title ? cleanModName(m.title).toLowerCase() : null;
    const cleanMModName = m.modName ? m.modName.toLowerCase() : null;
    const cleanMFileName = m.fileName ? normalizeForMatching(m.fileName) : null;

    if (cleanMTitle === cleanDepTitle || cleanMModName === cleanDepTitle || cleanMFileName === cleanDepTitle) {
      if (depFileName && (cleanMModName || cleanMFileName)) {
        const normDepFile = normalizeForMatching(depFileName);
        if (cleanMModName && cleanMModName !== normDepFile && normDepFile.startsWith('fs25_')) return false;
        if (cleanMFileName && cleanMFileName !== normDepFile && normDepFile.startsWith('fs25_')) return false;
      }
      return true;
    }
  }

  return false;
}


/**
 * Recursively resolves all dependencies for a target mod or map.
 * @param {string} targetModName - Name of the mod/map to resolve.
 * @param {Array} allMods - All installed mods.
 * @param {Object} [sessionInstalled] - Optional map of session-installed mods.
 * @param {Object} [resolvedMetadata] - Optional resolved metadata pool.
 * @returns {Object} - { installed: string[], missing: string[] }
 */
function resolveRecursiveDependencies(targetModName, allMods, sessionInstalled = {}, resolvedMetadata = {}) {
  const installed = new Set();
  const missing = new Set();
  const processed = new Set();

  if (!allMods || allMods.length === 0) {
    return { installed: [], missing: [] };
  }

  const indexById = new Map();
  const indexByName = new Map();
  const subfolderModsMap = new Map();

  for (let i = 0; i < allMods.length; i++) {
    const m = allMods[i];
    if (!m) continue;
    if (m.modId) indexById.set(String(m.modId).replace(/^0+/, ''), m);
    if (m.modName) indexByName.set(m.modName.toLowerCase(), m);
    if (m.fileName) {
      const cleanFile = m.fileName.split(/[\/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
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

    let match = (depId ? indexById.get(depId) : null) || indexByName.get(nameLower);
    if (!match) {
      match = allMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata, false));
    }
    if (!match && mapSubfolderMods.length > 0) {
      match = mapSubfolderMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata, false));
    }

    const isSessionInstalledByName = Boolean(nameLower) && Object.values(sessionInstalled).some(val => val && val.toLowerCase() === nameLower);

    if (match) {
      if (match.modName && match.modName.toLowerCase() !== targetModName.toLowerCase()) {
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

  resolve(targetModName);
  return { installed: Array.from(installed), missing: Array.from(missing) };
}

module.exports = {
  cleanModName,
  normalizeForMatching,
  matchModWithDependency,
  resolveRecursiveDependencies
};
