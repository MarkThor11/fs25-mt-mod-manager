import { create } from 'zustand';
import { useToastStore } from './useToastStore';

export const useLoadingScreenStore = create((set, get) => ({
  status: null,
  isLoading: false,
  isApplying: false,
  error: null,

  fetchStatus: async () => {
    if (!window.api?.loadingScreen?.getStatus) return;
    set({ isLoading: true, error: null });
    try {
      const res = await window.api.loadingScreen.getStatus();
      if (res?.available) {
        set({ status: res, isLoading: false, error: null });
      } else {
        set({ status: res, isLoading: false, error: res?.error || 'Game installation not detected' });
      }
    } catch (err) {
      set({ isLoading: false, error: err.message });
    }
  },

  applyPreset: async (presetId, title) => {
    if (!window.api?.loadingScreen?.applyPreset) return;
    set({ isApplying: true });
    try {
      const res = await window.api.loadingScreen.applyPreset(presetId);
      if (res?.error) {
        useToastStore.getState().error(`Failed to apply preset: ${res.error}`);
        set({ isApplying: false });
      } else {
        set({ status: res, isApplying: false });
        useToastStore.getState().success(`Applied "${title || presetId}" as game loading screen!`);
      }
    } catch (err) {
      useToastStore.getState().error(`Failed to apply preset: ${err.message}`);
      set({ isApplying: false });
    }
  },

  applyCustomImage: async (filePath, customName) => {
    if (!window.api?.loadingScreen?.applyCustomImage) return;
    set({ isApplying: true });
    try {
      const res = await window.api.loadingScreen.applyCustomImage(filePath, customName);
      if (res?.error) {
        useToastStore.getState().error(`Failed to apply image: ${res.error}`);
        set({ isApplying: false });
      } else {
        set({ status: res, isApplying: false });
        useToastStore.getState().success('Custom loading screen converted and applied to game!');
      }
    } catch (err) {
      useToastStore.getState().error(`Failed to apply image: ${err.message}`);
      set({ isApplying: false });
    }
  },

  restoreDefault: async () => {
    if (!window.api?.loadingScreen?.restoreDefault) return;
    set({ isApplying: true });
    try {
      const res = await window.api.loadingScreen.restoreDefault();
      if (res?.error) {
        useToastStore.getState().error(`Restore failed: ${res.error}`);
        set({ isApplying: false });
      } else {
        set({ status: res, isApplying: false });
        useToastStore.getState().success('Restored default FS25 loading screen.');
      }
    } catch (err) {
      useToastStore.getState().error(`Restore error: ${err.message}`);
      set({ isApplying: false });
    }
  },

  deleteCustom: async (id, title) => {
    if (!window.api?.loadingScreen?.deleteCustom) return;
    try {
      const res = await window.api.loadingScreen.deleteCustom(id);
      if (res?.error) {
        useToastStore.getState().error(`Delete failed: ${res.error}`);
      } else {
        set({ status: res });
        useToastStore.getState().info(`Removed "${title || id}" from custom gallery.`);
      }
    } catch (err) {
      useToastStore.getState().error(`Delete error: ${err.message}`);
    }
  },

  openSharedFolder: () => {
    window.api?.loadingScreen?.openSharedFolder?.();
  },

  openCustomFolder: () => {
    window.api?.loadingScreen?.openCustomFolder?.();
  },
}));
