import { create } from 'zustand';
import { useToastStore } from './useToastStore';

export const useLoadingScreenStore = create((set, get) => ({
  activeTab: 'map', // 'map' (In-game Map Loading Screen) | 'menu' (Main Menu Background)
  selectedMapId: 'all', // 'all' (Universal) | 'mapUS' | 'mapEU' | 'mapAS' | modId
  status: null,
  mapScreens: [],
  isLoading: false,
  isApplying: false,
  error: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedMapId: (id) => set({ selectedMapId: id }),

  fetchStatus: async () => {
    if (!window.api?.loadingScreen?.getStatus) return;
    set({ isLoading: true, error: null });
    try {
      const res = await window.api.loadingScreen.getStatus();
      if (res?.available) {
        set({
          status: res,
          mapScreens: res.mapScreens || [],
          isLoading: false,
          error: null,
        });
      } else {
        set({
          status: res,
          mapScreens: [],
          isLoading: false,
          error: res?.error || 'Game installation not detected',
        });
      }
    } catch (err) {
      set({ isLoading: false, error: err.message });
    }
  },

  // Map Loading Screen Actions
  applyMapLoadingScreen: async (filePath, customName) => {
    if (!window.api?.loadingScreen?.applyMapScreen) return;
    const { selectedMapId } = get();
    const applyToAll = selectedMapId === 'all';
    set({ isApplying: true });
    try {
      const res = await window.api.loadingScreen.applyMapScreen({
        mapId: selectedMapId,
        filePath,
        customName,
        applyToAll,
      });
      if (res?.error) {
        useToastStore.getState().error(`Failed to apply map screen: ${res.error}`);
        set({ isApplying: false });
      } else {
        set({
          status: res,
          mapScreens: res.mapScreens || [],
          isApplying: false,
        });
        const targetLabel = applyToAll ? 'All Maps' : selectedMapId;
        useToastStore.getState().success(`Applied custom loading screen to ${targetLabel}!`);
      }
    } catch (err) {
      useToastStore.getState().error(`Error applying map loading screen: ${err.message}`);
      set({ isApplying: false });
    }
  },

  restoreMapLoadingScreen: async () => {
    if (!window.api?.loadingScreen?.restoreMapScreen) return;
    const { selectedMapId } = get();
    const restoreAll = selectedMapId === 'all';
    set({ isApplying: true });
    try {
      const res = await window.api.loadingScreen.restoreMapScreen({
        mapId: selectedMapId,
        restoreAll,
      });
      if (res?.error) {
        useToastStore.getState().error(`Restore failed: ${res.error}`);
        set({ isApplying: false });
      } else {
        set({
          status: res,
          mapScreens: res.mapScreens || [],
          isApplying: false,
        });
        const targetLabel = restoreAll ? 'all basegame maps' : selectedMapId;
        useToastStore.getState().success(`Restored original loading screen for ${targetLabel}.`);
      }
    } catch (err) {
      useToastStore.getState().error(`Restore error: ${err.message}`);
      set({ isApplying: false });
    }
  },

  openMapFolder: (mapId) => {
    window.api?.loadingScreen?.openMapFolder?.(mapId);
  },

  // Menu Splash Actions
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
        useToastStore.getState().success(`Applied "${title || presetId}" as main menu background!`);
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
        useToastStore.getState().success('Custom main menu screen applied!');
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
        useToastStore.getState().success('Restored default FS25 title screen.');
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
