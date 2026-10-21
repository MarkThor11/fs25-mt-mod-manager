import { create } from 'zustand';
import { useToastStore } from './useToastStore';

const TARGET_LABELS = {
  both: 'launch & main menu screens',
  launch: 'game launch screen',
  menu: 'main menu screen',
};

export const useLoadingScreenStore = create((set, get) => ({
  targetMode: 'both', // 'both' | 'launch' | 'menu'
  status: null,
  isLoading: false,
  isApplying: false,
  error: null,

  setTargetMode: (targetMode) => set({ targetMode }),

  fetchStatus: async () => {
    if (!window.api?.loadingScreen?.getStatus) return;
    set({ isLoading: true, error: null });
    try {
      const res = await window.api.loadingScreen.getStatus();
      if (res?.available) {
        set({
          status: res,
          isLoading: false,
          error: null,
        });
      } else {
        set({
          status: res,
          isLoading: false,
          error: res?.error || 'Game installation not detected',
        });
      }
    } catch (err) {
      set({ isLoading: false, error: err.message });
    }
  },

  applyPreset: async (presetId, title) => {
    if (!window.api?.loadingScreen?.applyPreset) return;
    const { targetMode } = get();
    set({ isApplying: true });
    try {
      const res = await window.api.loadingScreen.applyPreset(presetId, targetMode);
      if (res?.error) {
        useToastStore.getState().error(`Failed to apply preset: ${res.error}`);
        set({ isApplying: false });
      } else {
        set({ status: res, isApplying: false });
        useToastStore.getState().success(
          `Applied "${title || presetId}" to ${TARGET_LABELS[targetMode] || 'game'}!`
        );
      }
    } catch (err) {
      useToastStore.getState().error(`Failed to apply preset: ${err.message}`);
      set({ isApplying: false });
    }
  },

  applyCustomImage: async (filePath, customName) => {
    if (!window.api?.loadingScreen?.applyCustomImage) return;
    const { targetMode } = get();
    set({ isApplying: true });
    try {
      const res = await window.api.loadingScreen.applyCustomImage(filePath, customName, targetMode);
      if (res?.error) {
        useToastStore.getState().error(`Failed to apply image: ${res.error}`);
        set({ isApplying: false });
      } else {
        set({ status: res, isApplying: false });
        useToastStore.getState().success(
          `Custom image applied to ${TARGET_LABELS[targetMode] || 'game'}!`
        );
      }
    } catch (err) {
      useToastStore.getState().error(`Failed to apply image: ${err.message}`);
      set({ isApplying: false });
    }
  },

  restoreDefault: async () => {
    if (!window.api?.loadingScreen?.restoreDefault) return;
    const { targetMode } = get();
    set({ isApplying: true });
    try {
      const res = await window.api.loadingScreen.restoreDefault(targetMode);
      if (res?.error) {
        useToastStore.getState().error(`Restore failed: ${res.error}`);
        set({ isApplying: false });
      } else {
        set({ status: res, isApplying: false });
        useToastStore.getState().success(
          `Restored default FS25 ${TARGET_LABELS[targetMode] || 'screens'}.`
        );
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
