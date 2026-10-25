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

function cleanAlphanum(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/^(?:fs25|fs22|pdlc)_/i, "")
    .replace(/\.zip$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function matchModWithDependency(m, dep, resolvedMetadata = {}) {
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

  // Look up resolved metadata pool or cache for exact ZIP filename and title if available
  const metaLookup = (key) => {
    if (!key) return null;
    if (resolvedMetadata && resolvedMetadata[key]) return resolvedMetadata[key];
    try {
      const cache = require('./cache');
      const pool = cache.getModHubMetadataPool();
      if (pool && pool[key]) return pool[key];
    } catch (_) {}
    return null;
  };

  const meta = (depId ? metaLookup(depId) : null) || (depFileName ? metaLookup(depFileName) : null);
  if (meta) {
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
}

/**
 * Recursively resolves all dependencies for a target mod or map.
 * @param {string|Object} targetModOrName - Name or mod object to resolve.
 * @param {Array} allMods - All installed mods.
 * @param {Object} [sessionInstalled] - Optional map of session-installed mods.
 * @param {Object} [resolvedMetadata] - Optional resolved metadata pool.
 * @returns {Object} - { installed: string[], missing: string[] }
 */
function resolveRecursiveDependencies(targetModOrName, allMods, sessionInstalled = {}, resolvedMetadata = {}) {
  const installed = new Set();
  const missing = new Set();
  const processed = new Set();

  if (!allMods || allMods.length === 0) {
    return { installed: [], missing: [] };
  }

  const targetModName = typeof targetModOrName === 'string' 
    ? targetModOrName 
    : (targetModOrName?.modName || targetModOrName?.fileName?.replace(/\.zip$/i, '') || targetModOrName?.title || '');

  const indexById = new Map();
  const indexByName = new Map();
  const indexByCleanAlpha = new Map();
  const subfolderModsMap = new Map();

  for (let i = 0; i < allMods.length; i++) {
    const m = allMods[i];
    if (!m) continue;
    if (m.modId) indexById.set(String(m.modId).replace(/^0+/, ''), m);
    if (m.modName) {
      indexByName.set(m.modName.toLowerCase(), m);
      const mNameAlpha = cleanAlphanum(m.modName);
      if (mNameAlpha && mNameAlpha.length >= 4 && !indexByCleanAlpha.has(mNameAlpha)) {
        indexByCleanAlpha.set(mNameAlpha, m);
      }
    }
    if (m.fileName) {
      const cleanFile = m.fileName.split(/[\/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
      indexByName.set(cleanFile, m);
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
    let depTitle = null;

    if (typeof depObjOrString === 'string') {
      const raw = depObjOrString.trim();
      if (raw.includes('http') || raw.toLowerCase().includes('.zip') || raw.includes('/')) {
        const idMatch = raw.match(/mod_id=(\d+)/i) || raw.match(/storage\/(\d+)\//i);
        if (idMatch) depId = parseInt(idMatch[1], 10).toString();
        const fileMatch = raw.match(/\/([^\/?#]+\.zip)/i) || raw.match(/([a-z0-9_]+\.zip)/i);
        if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
      }
      depString = fallbackFileName || raw.replace(/\.zip$/i, '');
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

    if (depId && !fallbackFileName) {
      const meta = (resolvedMetadata && resolvedMetadata[depId]) || (() => {
        try {
          const cache = require('./cache');
          return cache.getModHubMetadataPool()[depId];
        } catch (_) { return null; }
      })();
      if (meta && meta.fileName) {
        fallbackFileName = meta.fileName.replace(/\.zip$/i, '');
        depString = fallbackFileName;
      }
      if (meta && meta.title && !depTitle) {
        depTitle = cleanModName(meta.title);
      }
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
    const alphaKey = cleanAlphanum(depTitle || cleanedName);

    if (processed.has(nameLower) || (alphaKey && processed.has(alphaKey))) return;
    processed.add(nameLower);
    if (alphaKey) processed.add(alphaKey);

    let match = (depId ? indexById.get(depId) : null) || 
                indexByName.get(nameLower) || 
                (alphaKey && indexByCleanAlpha.get(alphaKey)) || 
                null;

    if (!match) {
      match = allMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata));
    }
    if (!match && mapSubfolderMods.length > 0) {
      match = mapSubfolderMods.find(m => matchModWithDependency(m, depObjOrString, resolvedMetadata));
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
  cleanAlphanum,
  matchModWithDependency,
  resolveRecursiveDependencies
};
