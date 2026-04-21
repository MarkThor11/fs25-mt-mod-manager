import { create } from 'zustand';

export const useSavegameStore = create((set) => ({
  savegames: [],
  isLoading: false,
  error: null,
  selectedSavegame: null,
  installedMods: [],
  selectedMods: new Set(),

  fetchSavegames: async () => {
    if (!window.api?.savegames) return;
    set({ isLoading: true, error: null });
    try {
      const result = await window.api.savegames.getAll();
      set({
        savegames: result.savegames || [],
        isLoading: false,
        error: result.error || null,
      });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  selectSavegame: async (savegame) => {
    if (!window.api?.savegames) return;
    set({ selectedSavegame: savegame });
    if (savegame) {
      try {
        const result = await window.api.savegames.getInstalledMods();
        const installed = result.mods || [];
        
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
