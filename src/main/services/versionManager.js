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
  const parts1 = String(v1).split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const parts2 = String(v2).split(/[.-]/).map(p => parseInt(p, 10) || 0);
  
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
  const { mods: localMods } = await modManager.scanLocalMods();
  const results = [];

  for (const localMod of localMods) {
    const modId = await findModHubId(localMod);
    if (!modId) {
        results.push({ ...localMod, hasUpdate: false, modId: null });
        continue;
    }

    try {
        const detail = await scraper.fetchModDetail(modId);
        const hasUpdate = compareVersions(localMod.version, detail.version) > 0;
        
        // Update cache
        cache.setModTracking(modId, {
            localFileName: localMod.fileName,
            localVersion: localMod.version,
            remoteVersion: detail.version,
            modhubTitle: detail.title,
            category: detail.category
        });

        results.push({
            ...localMod,
            modId,
            remoteVersion: detail.version,
            hasUpdate,
            modhubTitle: detail.title
        });
    } catch (err) {
        const isRemoved = err.message.includes('HTTP 404');
        results.push({ 
            ...localMod, 
            modId, 
            hasUpdate: false, 
            isRemoved,
            error: err.message 
        });
    }
  }

  return results.filter(r => r.hasUpdate || r.isRemoved);
}

module.exports = {
  checkAllUpdates,
  compareVersions
};
