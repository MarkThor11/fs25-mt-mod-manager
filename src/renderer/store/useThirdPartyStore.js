import { create } from 'zustand';

export const useThirdPartyStore = create((set, get) => ({
  externalMods: JSON.parse(localStorage.getItem('third_party_mods') || '[]'),
  isChecking: false,
  
  addExternalMod: (modData) => {
    const { externalMods } = get();
    // Prevent duplicates
    if (externalMods.some(m => m.url === modData.url)) {
      return { success: false, error: 'Link already exists' };
    }

    const newMod = {
      id: Date.now().toString(),
      dateAdded: new Date().toISOString(),
      status: 'added',
      localFileName: null,
      currentVersion: null,
      remoteVersion: null,
      lastChecked: null,
      hasUpdate: false,
      ...modData
    };
    const updated = [newMod, ...externalMods];
    set({ externalMods: updated });
    localStorage.setItem('third_party_mods', JSON.stringify(updated));
    return { success: true };
  },
  
  removeExternalMod: (id) => {
    const { externalMods } = get();
    const updated = externalMods.filter(m => m.id !== id);
    set({ externalMods: updated });
    localStorage.setItem('third_party_mods', JSON.stringify(updated));
  },

  updateExternalMod: (id, data) => {
    const { externalMods } = get();
    const updated = externalMods.map(m => m.id === id ? { ...m, ...data } : m);
    set({ externalMods: updated });
    localStorage.setItem('third_party_mods', JSON.stringify(updated));
  },

  checkAllUpdates: async () => {
    if (!window.api?.thirdParty) return;
    const { externalMods, updateExternalMod } = get();
    set({ isChecking: true });
    
    try {
      for (const mod of externalMods) {
        if (!mod.url) continue;
        
        const res = await window.api.thirdParty.checkUrl({ url: mod.url });
        if (res.success) {
          let hasUpdate = false;
          if (res.version) {
            hasUpdate = mod.currentVersion && res.version !== mod.currentVersion;
          } else if (mod.fingerprint && res.fingerprint && mod.fingerprint !== res.fingerprint) {
            hasUpdate = true;
          }

          updateExternalMod(mod.id, {
            remoteVersion: res.version || 'New',
            fingerprint: res.fingerprint,
            lastChecked: new Date().toISOString(),
            hasUpdate: hasUpdate
          });
        }
      }
    } finally {
      set({ isChecking: false });
    }
  }
}));
