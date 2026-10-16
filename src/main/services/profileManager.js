const fs = require('fs-extra');
const path = require('path');
const { app } = require('electron');

function getProfilesPath() {
  const userData = app.getPath('userData');
  return path.join(userData, 'profiles.json');
}

/**
 * Load all profiles.
 * Shape: [ { id: '...', name: '...', mods: ['modA', 'modB'] } ]
 */
async function getProfiles() {
  const profilesPath = getProfilesPath();
  try {
    if (!fs.existsSync(profilesPath)) {
      return { profiles: [] };
    }
    const data = await fs.readJson(profilesPath);
    const rawList = Array.isArray(data?.profiles) ? data.profiles : [];
    // Sanitize any existing corrupt profile records where name was stored as an object
    const cleanProfiles = rawList.map(p => ({
      ...p,
      name: (typeof p?.name === 'object' && p?.name !== null) ? (p.name.name || 'Game Template') : (String(p?.name || 'Game Template'))
    }));
    return { profiles: cleanProfiles };
  } catch (err) {
    console.error('Failed to read profiles:', err);
    return { error: err.message, profiles: [] };
  }
}

async function createProfile(name, mods, options = {}) {
  const profilesPath = getProfilesPath();
  try {
    const { profiles } = await getProfiles();
    const safeName = (typeof name === 'object' && name !== null) ? (name.name || 'New Profile') : (name || 'New Profile');
    const safeMods = Array.isArray(mods) ? mods : (typeof name === 'object' && Array.isArray(name?.mods) ? name.mods : []);
    const safeOptions = (typeof options === 'object' && options !== null) ? options : (typeof name === 'object' && name?.options ? name.options : {});

    const newProfile = {
      id: Date.now().toString(),
      name: safeName,
      mods: safeMods,
      linkedSlot: safeOptions.linkedSlot !== undefined ? safeOptions.linkedSlot : (typeof name === 'object' && name?.linkedSlot !== undefined ? name.linkedSlot : null),
      options: {
        money: safeOptions.money || 1000000,
        initialLoan: safeOptions.initialLoan || 0,
        mapId: safeOptions.mapId || 'MapUS',
        mapTitle: safeOptions.mapTitle || 'Riverbend Springs',
        difficulty: safeOptions.difficulty || 1,
        economicDifficulty: safeOptions.economicDifficulty || 'NORMAL',
        fixedSeasonLength: safeOptions.fixedSeasonLength || 1,
        timeScale: safeOptions.timeScale || 1.0,
        startMonth: safeOptions.startMonth || 3,
        loadDefaultFarm: safeOptions.loadDefaultFarm !== undefined ? safeOptions.loadDefaultFarm : true,
        ...safeOptions
      }
    };
    profiles.push(newProfile);
    await fs.writeJson(profilesPath, { profiles }, { spaces: 2 });
    return { success: true, profile: newProfile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function updateProfile(id, name, mods, options = {}) {
  const profilesPath = getProfilesPath();
  try {
    const { profiles } = await getProfiles();
    const index = profiles.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Profile not found');
    
    const safeName = (typeof name === 'object' && name !== null) ? (name.name || 'Untitled Template') : (name || profiles[index].name || 'Untitled Template');
    const safeMods = Array.isArray(mods) ? mods : (typeof name === 'object' && Array.isArray(name?.mods) ? name.mods : (profiles[index].mods || []));
    const safeOptions = (typeof options === 'object' && options !== null) ? options : (typeof name === 'object' && name?.options ? name.options : {});
    const safeLinkedSlot = safeOptions.linkedSlot !== undefined 
      ? safeOptions.linkedSlot 
      : (typeof name === 'object' && name?.linkedSlot !== undefined ? name.linkedSlot : profiles[index].linkedSlot);

    profiles[index] = { 
      ...profiles[index], 
      name: safeName, 
      mods: safeMods,
      linkedSlot: safeLinkedSlot !== undefined ? safeLinkedSlot : null,
      options: {
        ...(profiles[index].options || {}),
        ...safeOptions
      }
    };
    await fs.writeJson(profilesPath, { profiles }, { spaces: 2 });
    return { success: true, profile: profiles[index] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function deleteProfile(id) {
  const profilesPath = getProfilesPath();
  try {
    const { profiles } = await getProfiles();
    const newProfiles = profiles.filter(p => p.id !== id);
    await fs.writeJson(profilesPath, { profiles: newProfiles }, { spaces: 2 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function exportProfile(id, filePath) {
  try {
    const { profiles } = await getProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile) throw new Error('Profile not found');
    
    // Create export object (remove local ID to prevent collisions)
    const exportData = {
        version: "1.0",
        type: "FMP_PROFILE",
        data: {
            name: `${profile.name} (Imported)`,
            mods: profile.mods || [],
            options: profile.options || {}
        }
    };
    
    await fs.writeJson(filePath, exportData, { spaces: 2 });
    return { success: true };
  } catch (err) {
    console.error('Export failed:', err);
    return { success: false, error: err.message };
  }
}

async function importProfile(filePath) {
  try {
    const data = await fs.readJson(filePath);
    if (!data || data.type !== "FMP_PROFILE" || !data.data) {
        throw new Error('Invalid file format. Please select a valid profile export file.');
    }
    
    const { name, mods, options } = data.data;
    return await createProfile(name, mods, options);
  } catch (err) {
    console.error('Import failed:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  exportProfile,
  importProfile,
};
