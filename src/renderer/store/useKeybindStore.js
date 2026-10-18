import { create } from 'zustand';

export const useKeybindStore = create((set, get) => ({
  actions: [],
  devices: [],
  conflicts: [],
  backups: [],
  isLoading: false,
  error: null,
  selectedDevice: 'ALL',
  selectedCategory: 'ALL',
  searchQuery: '',

  fetchKeybinds: async () => {
    if (!window.api?.keybinds?.get) {
      set({ error: 'Keybindings API is not available. Please restart the desktop application.', isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const res = await window.api.keybinds.get();
      if (res.success) {
        set({
          actions: res.actions || [],
          devices: res.devices || [],
          conflicts: res.conflicts || [],
          isLoading: false
        });
      } else {
        set({ error: res.error, isLoading: false });
      }
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchBackups: async () => {
    if (!window.api?.keybinds?.getBackups) return;
    try {
      const res = await window.api.keybinds.getBackups();
      if (res.success) {
        set({ backups: res.backups || [] });
      }
    } catch (err) {
      console.error('Failed to fetch keybind backups:', err);
    }
  },

  updateBinding: async (actionName, deviceId, oldInput, newInput) => {
    if (!window.api?.keybinds?.update) return { success: false, error: 'API unavailable' };
    const res = await window.api.keybinds.update({ actionName, deviceId, oldInput, newInput });
    if (res.success) {
      await get().fetchKeybinds();
      await get().fetchBackups();
    }
    return res;
  },

  createBackup: async (name) => {
    if (!window.api?.keybinds?.createBackup) return { success: false };
    const res = await window.api.keybinds.createBackup({ name });
    if (res.success) {
      await get().fetchBackups();
    }
    return res;
  },

  restoreBackup: async (fileName) => {
    if (!window.api?.keybinds?.restoreBackup) return { success: false };
    const res = await window.api.keybinds.restoreBackup({ fileName });
    if (res.success) {
      await get().fetchKeybinds();
      await get().fetchBackups();
    }
    return res;
  },

  deleteBackup: async (fileName) => {
    if (!window.api?.keybinds?.deleteBackup) return { success: false };
    const res = await window.api.keybinds.deleteBackup({ fileName });
    if (res.success) {
      await get().fetchBackups();
    }
    return res;
  },

  resetToDefaults: async () => {
    if (!window.api?.keybinds?.resetToDefaults) return { success: false };
    const res = await window.api.keybinds.resetToDefaults();
    if (res.success) {
      await get().fetchKeybinds();
      await get().fetchBackups();
    }
    return res;
  },

  compileKeybinds: async (specificModPaths) => {
    if (!window.api?.keybinds?.compile) return { success: false, error: 'API unavailable' };
    set({ isLoading: true });
    try {
      const res = await window.api.keybinds.compile(specificModPaths);
      if (res.success) {
        await get().fetchKeybinds();
      }
      set({ isLoading: false });
      return res;
    } catch (err) {
      set({ isLoading: false });
      return { success: false, error: err.message };
    }
  },

  setSelectedDevice: (device) => set({ selectedDevice: device }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query })
}));
