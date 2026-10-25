const scraper = require('./scraper');
const cache = require('./cache');
const modManager = require('./modManager');
const path = require('path');
const fs = require('fs-extra');

/**
 * Robustly compares two version strings (e.g. "1.0.0.0" vs "1.1.0.0").
 * Returns positive if v2 > v1, negative if v1 > v2, 0 if equal.
 */
function compareVersions(v1, v2) {
  const cleanVersion = (v) => {
    if (!v) return '';
    return String(v).trim().replace(/^[vV]/, '').replace(/[^0-9.-]/g, '');
  };

  const s1 = cleanVersion(v1);
  const s2 = cleanVersion(v2);

  if (!s1 && !s2) return 0;
  if (!s1) return 1;
  if (!s2) return -1;

  const parts1 = s1.split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const parts2 = s2.split(/[.-]/).map(p => parseInt(p, 10) || 0);
  
  const maxLength = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return 1;
    if (p1 > p2) return -1;
  }
  return 0;
}

/**
 * Tries to find the ModHub ID for a local mod by searching its title.
 */
async function findModHubId(localMod) {
  // Check cache first
  const allTracking = cache.getAllModTracking();
  const existing = allTracking.find(t => t.local_file_name === localMod.fileName);
  if (existing) return existing.mod_id;

  // Skip ModHub search on version check to prevent unnecessary scanning/rate-limits
  return null;
}

/**
 * Checks all local mods for updates.
 */
async function checkAllUpdates() {
  const cachedScan = modManager.getLastScanResult();
  const scanData = cachedScan || await modManager.scanLocalMods();
  const localMods = scanData?.mods || [];
  if (!Array.isArray(localMods) || localMods.length === 0) return [];

  // Load tracking map and metadata pool ONCE in memory for O(1) lookups
  // avoids thousands of repeated DB queries and sequential web scraper HTTP requests
  const trackingMap = cache.getAllModTrackingMap();
  const pool = cache.getModHubMetadataPool();
  const delistedIdsSet = cache.getDelistedModIdsSet ? cache.getDelistedModIdsSet() : new Set();
  const results = [];

  for (const localMod of localMods) {
    if (!localMod || localMod.isDLC || localMod.folder === 'DLC') continue;

    const modId = localMod.modId || null;
    const cleanFileName = (localMod.fileName || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
    
    // Look up tracking record in memory
    const tracked = (modId ? trackingMap.get(`ID_${modId}`) : null) || 
                    (cleanFileName ? trackingMap.get(`FILE_${cleanFileName}`) : null);

    const effectiveModId = modId || tracked?.mod_id || null;
    const cleanEffectiveId = effectiveModId ? String(effectiveModId).replace(/^0+/, '') : null;

    if (cleanEffectiveId && delistedIdsSet.has(cleanEffectiveId)) {
      results.push({
        ...localMod,
        modId: effectiveModId,
        isRemoved: true,
        isDelisted: true,
        hasUpdate: false,
        modhubTitle: localMod.title
      });
      continue;
    }
    
    // Find remote metadata from pool or tracking record
    const poolItem = effectiveModId ? pool[String(effectiveModId)] : null;
    const remoteVersion = tracked?.remote_version || poolItem?.version || null;

    if (!remoteVersion) continue;

    // Physical version on disk (from modDesc.xml) takes absolute precedence over stale tracking entries
    const localVersion = localMod.version || tracked?.local_version;
    if (!localVersion || localVersion === 'Unknown' || localVersion === 'Invalid') continue;

    // If tracking records that this exact remoteVersion (or higher) was already installed,
    // skip it to prevent infinite update loops when mod authors forget to bump <version> in modDesc.xml
    if (tracked?.local_version && compareVersions(tracked.local_version, remoteVersion) <= 0) {
      continue;
    }

    // Prefabs do not contain modDesc.xml and cannot be version-compared via modDesc
    const isPrefab = (localMod.title || '').includes('(Prefab*)') || 
                     (tracked?.category || '').toLowerCase() === 'prefab' ||
                     (localMod.category || '').toLowerCase() === 'prefab' ||
                     cleanFileName.includes('prefab');
    if (isPrefab) continue;

    const hasUpdate = compareVersions(localVersion, remoteVersion) > 0;
    const title = tracked?.modhub_title || poolItem?.title || localMod.title;

    if (hasUpdate) {
      results.push({
        ...localMod,
        modId: effectiveModId,
        remoteVersion,
        hasUpdate: true,
        modhubTitle: title
      });
    }
  }

  return results;
}

module.exports = {
  checkAllUpdates,
  compareVersions
};
