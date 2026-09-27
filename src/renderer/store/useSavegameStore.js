import { create } from 'zustand';
import { useLocalModsStore } from './useLocalModsStore';
import { useToastStore } from './useToastStore';

export const useSavegameStore = create((set, get) => ({
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
    // Explicitly clear recentlyExitedSlots and trigger re-render after 4 seconds so badge never hangs
    setTimeout(() => {
      set((s) => {
        const next = { ...s.recentlyExitedSlots };
        delete next[num];
        return { recentlyExitedSlots: next };
      });
    }, 4000);
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

  deleteSavegame: async (saveTarget) => {
    if (!window.api?.savegames) return { success: false, error: 'API Offline' };
    
    // Resolve target whether it's a path, an index, or an object
    const targetPath = typeof saveTarget === 'string' ? saveTarget : (saveTarget?.path || (typeof saveTarget === 'number' ? `savegame${saveTarget}` : ''));
    const targetIndex = typeof saveTarget === 'number' 
      ? saveTarget 
      : (saveTarget?.index || (typeof targetPath === 'string' ? parseInt((targetPath.match(/savegame(\d+)/i) || [])[1], 10) : null));

    // Optimistically update UI state immediately
    const remaining = get().savegames.filter(sg => {
      if (targetPath && sg.path === targetPath) return false;
      if (targetIndex && sg.index === targetIndex) return false;
      return true;
    });

    set((s) => ({
      savegames: remaining,
      selectedSavegame: (s.selectedSavegame?.path === targetPath || s.selectedSavegame?.index === targetIndex) ? null : s.selectedSavegame
    }));

    // Instantly persist cache so deleted save does not flash on reload
    if (window.api?.settings) {
      window.api.settings.set('savegamesCache', JSON.stringify(remaining)).catch(() => {});
    }

    try {
      const payload = typeof saveTarget === 'object' ? saveTarget : { path: targetPath, slotIndex: targetIndex };
      const result = await window.api.savegames.delete(payload);
      if (!result?.success) {
        useToastStore.getState().error(result?.error || 'Failed to delete savegame from disk');
        get().fetchSavegames();
      } else {
        useToastStore.getState().success(targetIndex ? `Slot ${targetIndex} cleared.` : 'Savegame deleted.');
        // Re-fetch to guarantee complete disk sync
        get().fetchSavegames();
      }
      return result;
    } catch (err) {
      useToastStore.getState().error(`Deletion error: ${err.message}`);
      get().fetchSavegames();
      return { success: false, error: err.message };
    }
  },
}));
