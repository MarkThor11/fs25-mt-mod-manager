import { create } from 'zustand';

export const useArchiveStore = create((set) => ({
  archives: [],
  isLoading: false,
  error: null,

  fetchArchives: async () => {
    if (!window.api?.savegames) return;
    set({ isLoading: true, error: null });
    try {
      const result = await window.api.savegames.getArchives();
      set({ archives: result.archives || [], isLoading: false });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  archiveSavegame: async (path) => {
    if (!window.api?.savegames) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.savegames.archive({ path });
      if (result.success) {
        // We'll need to refresh both archives and savegames
        const archives = await window.api.savegames.getArchives();
        set({ archives: archives.archives || [] });
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  restoreSavegame: async (archivedFolderName, slotIndex) => {
    if (!window.api?.savegames) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.savegames.restore({ archivedFolderName, slotIndex });
      if (result.success) {
        const archives = await window.api.savegames.getArchives();
        set({ archives: archives.archives || [] });
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  swapToSlot: async (archivedFolderName, slotIndex) => {
    if (!window.api?.savegames) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.savegames.swapToSlot({ archivedFolderName, slotIndex });
      if (result.success) {
        const archives = await window.api.savegames.getArchives();
        set({ archives: archives.archives || [] });
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  deleteArchive: async (archivedFolderName) => {
    if (!window.api?.savegames) return { success: false, error: 'API Offline' };
    try {
      const result = await window.api.savegames.deleteArchive({ archivedFolderName });
      if (result.success) {
        set((s) => ({ archives: s.archives.filter(a => a.folderName !== archivedFolderName) }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
}));
