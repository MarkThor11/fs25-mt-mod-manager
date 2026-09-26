import { create } from 'zustand';
import { useLocalModsStore } from './useLocalModsStore';

export const useSavegameStore = create((set) => ({
  savegames: [],
  isLoading: false,
  error: null,
  selectedSavegame: null,
  installedMods: [],
  selectedMods: new Set(),
  playingSlot: null,
  isGameRunning: false,
  launchGraceUntil: 0,
  recentlyExitedSlots: {},

  markSlotExited: (slotIndex) => {
    const num = Number(slotIndex);
    if (!num) return;
    set((s) => ({
      recentlyExitedSlots: {
        ...s.recentlyExitedSlots,
        [num]: Date.now(),
      }
    }));
  },

  loadCache: async () => {
    if (!window.api?.settings) return;
    try {
      const cached = await window.api.settings.get('savegamesCache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          set({ savegames: parsed });
        }
      }
    } catch (e) {
      console.error("[SAVEGAMES-STORE] Failed to load cache:", e);
    }
  },

  fetchSavegames: async () => {
    if (!window.api?.savegames) return;
    const currentSaves = useSavegameStore.getState().savegames;
    // Only set global isLoading if we don't already have cached savegames displaying
    if (!currentSaves || currentSaves.length === 0) {
      set({ isLoading: true, error: null });
    }
    try {
      const result = await window.api.savegames.getAll();
      const freshSavegames = result.savegames || [];
      set({
        savegames: freshSavegames,
        isLoading: false,
        error: result.error || null,
      });
      // Save to cache asynchronously
      if (window.api?.settings && freshSavegames.length > 0) {
        window.api.settings.set('savegamesCache', JSON.stringify(freshSavegames)).catch(() => {});
      }
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  selectSavegame: async (savegame) => {
    if (!window.api?.savegames) return;
    set({ selectedSavegame: savegame });
    if (savegame) {
      try {
        const installed = useLocalModsStore.getState().mods || [];
        
        // Setup initial selected set from the savegame's existing mods
        const initialSelected = new Set(
          (savegame.mods || []).map(m => m.modName)
        );

        set({ installedMods: installed, selectedMods: initialSelected });
      } catch (err) {
        console.error('Failed to load installed mods for savegame view:', err);
      }
    }
  },

  renameSavegame: async (savegamePath, newName) => {
    if (!window.api?.savegames) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.savegames.rename({ savegamePath, newName });
      if (result.success) {
        set((s) => ({
          savegames: s.savegames.map((sg) =>
            sg.path === savegamePath ? { ...sg, farmName: newName } : sg
          ),
        }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  toggleModActive: (modName) => {
    set((s) => {
      const next = new Set(s.selectedMods);
      if (next.has(modName)) next.delete(modName);
      else next.add(modName);
      return { selectedMods: next };
    });
  },

  setAllModsSelected: (selected) => {
    set((s) => {
      if (selected) {
        return { selectedMods: new Set(s.installedMods.map(m => m.modName)) };
      }
      return { selectedMods: new Set() };
    });
  },

  saveSavegameMods: async () => {
    if (!window.api?.savegames) return { success: false, error: 'API Offline' };
    const { selectedSavegame, installedMods, selectedMods } = useSavegameStore.getState();
    if (!selectedSavegame) return;
    
    // Map selected mod names back to full mod objects that the backend array expects
    const modsToSave = installedMods.filter(m => selectedMods.has(m.modName));

    try {
      const result = await window.api.savegames.setMods({
        savegamePath: selectedSavegame.path,
        mods: modsToSave,
      });
      if (result.success) {
        // Update local state without full reload
        set((s) => ({
          savegames: s.savegames.map((sg) =>
            sg.path === selectedSavegame.path ? { ...sg, mods: modsToSave, modCount: modsToSave.length } : sg
          ),
          selectedSavegame: { ...s.selectedSavegame, mods: modsToSave, modCount: modsToSave.length }
        }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  deleteSavegame: async (path) => {
    if (!window.api?.savegames) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.savegames.delete({ path });
      if (result.success) {
        set((s) => ({
          savegames: s.savegames.filter(sg => sg.path !== path),
          selectedSavegame: s.selectedSavegame?.path === path ? null : s.selectedSavegame
        }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
}));
