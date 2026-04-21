import { create } from 'zustand';

export const useProfileStore = create((set) => ({
  profiles: [],
  isLoading: false,
  error: null,

  fetchProfiles: async () => {
    if (!window.api?.profiles) return;
    set({ isLoading: true, error: null });
    try {
      const result = await window.api.profiles.get();
      set({ profiles: result.profiles || [], isLoading: false });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  createProfile: async (name, mods, options = {}) => {
    if (!window.api?.profiles) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.profiles.create({ name, mods, options });
      if (result.success) {
        set((s) => ({ profiles: [...s.profiles, result.profile] }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  updateProfile: async (id, name, mods, options = {}) => {
    if (!window.api?.profiles) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.profiles.update({ id, name, mods, options });
      if (result.success) {
        set((s) => ({
          profiles: s.profiles.map(p => p.id === id ? result.profile : p),
        }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  deleteProfile: async (id) => {
    if (!window.api?.profiles) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.profiles.delete({ id });
      if (result.success) {
        set((s) => ({ profiles: s.profiles.filter(p => p.id !== id) }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  exportProfile: async (id) => {
    if (!window.api?.profiles) return { success: false, error: 'API Offline' };
    try {
      return await window.api.profiles.export(id);
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  importProfile: async () => {
    if (!window.api?.profiles) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.profiles.import();
      if (result.success) {
        // If import succeeds, refresh the list to show the new profile
        const { profiles } = await window.api.profiles.get();
        set({ profiles: profiles || [] });
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
}));
