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
    return { profiles: data.profiles || [] };
  } catch (err) {
    console.error('Failed to read profiles:', err);
    return { error: err.message, profiles: [] };
  }
}

async function createProfile(name, mods, options = {}) {
  const profilesPath = getProfilesPath();
  try {
    const { profiles } = await getProfiles();
    const newProfile = {
      id: Date.now().toString(),
      name,
      mods: mods || [],
      options: {
        money: options.money || 1000000,
        initialLoan: options.initialLoan || 0,
        mapId: options.mapId || 'MapUS',
        mapTitle: options.mapTitle || 'Riverbend Springs',
        difficulty: options.difficulty || 1,
        economicDifficulty: options.economicDifficulty || 'NORMAL',
        fixedSeasonLength: options.fixedSeasonLength || 1,
        timeScale: options.timeScale || 1.0,
        startMonth: options.startMonth || 3,
        loadDefaultFarm: options.loadDefaultFarm !== undefined ? options.loadDefaultFarm : true,
        ...options
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
    
    profiles[index] = { 
      ...profiles[index], 
      name, 
      mods,
      options: {
        ...(profiles[index].options || {}),
        ...options
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
