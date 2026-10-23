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

function matchModWithDependency(m, dep, resolvedMetadata = {}) {
  if (!dep || !m) return false;

  let depFileName = null;

  if (typeof dep === 'string') {
    if (dep.includes('http') || dep.toLowerCase().includes('.zip')) {
      const fileMatch = dep.match(/\/([^\/?#]+\.zip)/i) || dep.match(/([a-z0-9_]+\.zip)/i);
      if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
    }
    if (!depFileName) {
      depFileName = dep.replace(/\.zip$/i, '').trim().toLowerCase();
    }
  } else if (typeof dep === 'object') {
    if (dep.url) {
      const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i) || dep.url.match(/([a-z0-9_]+\.zip)/i);
      if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
    }
    if (!depFileName) {
      const fn = dep.fileName || dep.modName || dep.technicalName || (dep.title && /^[A-Za-z0-9_.\-]+$/.test(dep.title) ? dep.title : null);
      if (fn) depFileName = fn.replace(/\.zip$/i, '').toLowerCase();
    }
  }

  // Look up resolved metadata pool for exact ZIP filename if available
  if (depFileName && resolvedMetadata && resolvedMetadata[depFileName]) {
    const meta = resolvedMetadata[depFileName];
    if (meta.fileName) depFileName = meta.fileName.replace(/\.zip$/i, '').toLowerCase();
  }

  // Match strictly by filename/technical name
  if (depFileName) {
    const normDepFile = normalizeForMatching(depFileName);
    const mFileNorm = m.fileName ? normalizeForMatching(m.fileName) : '';
    const mNameNorm = m.modName ? normalizeForMatching(m.modName) : '';

    if (mFileNorm === normDepFile || mNameNorm === normDepFile) return true;
  }

  return false;
};


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
    // Do not index arbitrary mod titles into indexByName to avoid generic title collisions

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
