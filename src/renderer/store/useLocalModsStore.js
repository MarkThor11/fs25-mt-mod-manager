import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';

export const useLocalModsStore = create((set, get) => ({
  mods: [],
  allFolders: [],
  isLoading: false,
  isCheckingUpdates: false,
  isSyncing: false,
  error: null,
  updates: [],
  conflicts: [],
  lastUpdateCheck: 0,
  isResolving: false,
  resolvingStatus: null, // { modName, status, progress }

  loadCache: async () => {
    if (!window.api?.settings) return;
    try {
      const cached = await window.api.settings.get('modCache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.mods) && parsed.mods.length > 0) {
          set({ mods: parsed.mods, allFolders: parsed.allFolders || [] });
        }
      }
    } catch (e) {
      console.error("Failed to parse mod cache", e);
    }
  },

  scanMods: async (manualPaths = null, force = false) => {
    // Prevent multiple concurrent scans unless forced
    if (get().isLoading && !force && get().mods.length > 0) return;

    const hasCachedData = get().mods.length > 0;
    if (!hasCachedData) {
      set({ isLoading: true, error: null });
    } else {
      set({ isLoading: true, error: null }); // Still set loading but keep existing data
    }

    try {
      if (!window.api?.localMods) {
        set({ isLoading: false });
        return;
      }
      
      const { mods, allFolders, conflicts, missingDependencies, error } = await window.api.localMods.scan(force);
      
      set({
        mods: mods || [],
        allFolders: allFolders || [],
        conflicts: conflicts || [],
        missingDependencies: missingDependencies || [],
        isLoading: false,
        error: error || null,
      });
      
      // Persist fresh data for next launch (keep icons for instant load)
      try {
        await window.api.settings.set('modCache', JSON.stringify({
            mods: mods || [],
            allFolders: allFolders || []
        }));
      } catch (_) {}

    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  initListeners: () => {
    if (!window.api?.on) return;
    
    // Listen for background dependency resolution progress
    const removeListener = window.api.on.dependencyProgress((data) => {
        if (data.isBackground) {
            set((s) => ({
                isResolving: data.status !== 'success' && data.status !== 'error',
                resolvingStatus: data.status === 'success' || data.status === 'error' ? null : {
                    modName: data.modName,
                    status: data.status,
                    progress: data.percent || 0
                }
            }));
            
            // Refresh library once a background mod finishes successfully
            if (data.status === 'success') {
                get().scanMods();
            }
        }
    });
    
    return removeListener;
  },

  toggleAutoResolve: async () => {
    const current = await window.api.settings.get('autoResolveDependencies') === 'true';
    const next = !current;
    await window.api.settings.set('autoResolveDependencies', String(next));
    return next;
  },

  checkUpdates: async (force = false) => {
    const { isCheckingUpdates, lastUpdateCheck } = get();
    const now = Date.now();
    
    // Guard: Only check if not already checking, and last check > 5 min ago (unless forced)
    if (isCheckingUpdates) return;
    if (!force && now - lastUpdateCheck < 5 * 60 * 1000) return;

    set({ isCheckingUpdates: true, error: null });
    try {
      if (!window.api?.localMods) {
        set({ isCheckingUpdates: false });
        return;
      }
      const result = await window.api.localMods.checkUpdates();
      // result is now the array of update objects directly
      set({
        updates: result || [],
        isCheckingUpdates: false,
        lastUpdateCheck: now,
      });
    } catch (err) {
      set({ isCheckingUpdates: false, error: err.message });
      console.error('Update check failed:', err);
    }
  },

  uninstallMod: async (modFileName, folder = null) => {
    try {
      if (!window.api?.mods) return { success: false, error: 'Bridge not available' };
      const result = await window.api.mods.uninstall({ modFileName, folder });
      if (result.success) {
        set((s) => ({
          mods: s.mods.filter((m) => m.fileName !== modFileName),
        }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  bulkUninstallMods: async (modsList) => {
    set({ isLoading: true });
    try {
      if (!window.api?.mods) return { success: false };
      
      const fileNamesToRemove = modsList.map(m => m.fileName);
      set(s => ({
          mods: s.mods.filter(m => !fileNamesToRemove.includes(m.fileName))
      }));
      
      const promises = modsList.map(m => window.api.mods.uninstall({ modFileName: m.fileName, folder: m.folder }));
      await Promise.allSettled(promises);
      return { success: true };
    } finally {
      set({ isLoading: false });
    }
  },

  updateMod: async (modFileName, modId) => {
    try {
      if (!window.api?.localMods) return { success: false, error: 'Bridge not available' };
      const result = await window.api.localMods.updateMod({ modFileName, modId });
      if (result.success) {
        // Re-scan after update
        await get().scanMods();
        // Clear the specific update flag immediately
        set((state) => ({
          updates: state.updates.filter((u) => u.fileName !== modFileName),
        }));
      }
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  
  syncMetadata: async () => {
    set({ isSyncing: true });
    try {
      if (!window.api?.mods) return { success: false, error: 'Bridge not available' };
      const res = await window.api.mods.syncMetadata();
      await get().scanMods();
      return res;
    } finally {
      set({ isSyncing: false });
    }
  },

  createFolder: async (folderName) => {
    if (!window.api?.mods) return;
    await window.api.mods.createFolder(folderName);
    await get().scanMods(null, true);
  },

  renameFolder: async (oldName, newName) => {
    set({ isLoading: true });
    try {
      if (!window.api?.mods) return { success: false, error: 'Bridge not available' };
      const res = await window.api.mods.renameFolder(oldName, newName);
      if (res.success) {
        const { folderOrder, setFolderOrder } = useSettingsStore.getState();
        if (folderOrder.includes(oldName)) {
            const newOrder = folderOrder.map(f => f === oldName ? newName : f);
            setFolderOrder(newOrder);
        }
      }
      await get().scanMods(null, true);
      return res;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteFolder: async (folderName) => {
    set({ isLoading: true });
    try {
      if (!window.api?.mods) return { success: false, error: 'Bridge not available' };
      const res = await window.api.mods.deleteFolder(folderName);
      if (res.success) {
        const { folderOrder, setFolderOrder } = useSettingsStore.getState();
        if (folderOrder.includes(folderName)) {
            const newOrder = folderOrder.filter(f => f !== folderName);
            setFolderOrder(newOrder);
        }
        set(state => ({
            allFolders: state.allFolders.filter(f => f !== folderName),
            mods: state.mods.filter(m => (m.folder || '') !== folderName)
        }));
      }
      return res;
    } finally {
      set({ isLoading: false });
    }
  },

  moveModsToFolder: async (fileNames, destinationFolder) => {
    set({ isLoading: true });
    try {
      if (!window.api?.mods) return { success: false, error: 'Bridge not available' };
      const result = await window.api.mods.moveModsToFolder({ fileNames, destinationFolder });
      
      // Force a fresh scan after move to ensure UI sync
      await get().scanMods(null, true);
      
      return result;
    } catch (err) {
      console.error('[STORE] Move error:', err);
      return { success: false, error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  installLocalMods: async (filePaths) => {
    set({ isLoading: true });
    try {
      if (!window.api?.mods) return { success: [], failed: [], total: filePaths.length };
      const result = await window.api.mods.installLocal(filePaths);
      await get().scanMods(null, true);
      return result;
    } finally {
      set({ isLoading: false });
    }
  },

  setModTags: async (identifier, tags) => {
    if (!window.api?.mods) return { success: false, error: 'Bridge not available' };
    try {
      await window.api.mods.setTags(identifier, tags);
      // Update local state immediately
      set((state) => ({
        mods: state.mods.map((m) => {
          if (m.fileName === identifier || m.modId === identifier) {
            return { ...m, tags };
          }
          return m;
        }),
      }));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  restoreModVersion: async (filePath) => {
    if (!window.api?.localMods) return { success: false, error: 'Bridge not available' };
    const result = await window.api.localMods.restoreVersion({ filePath });
    if (result.success) {
      await get().scanMods();
    }
    return result;
  },

  exportCollection: (selectedModIds = []) => {
    const list = get().mods
      .filter(m => m.modId && (selectedModIds.length === 0 || selectedModIds.includes(m.modId)))
      .map(m => ({ modId: m.modId, modTitle: m.title }));
    
    if (list.length === 0) return null;
    return btoa(JSON.stringify(list));
  },

  importCollection: async (key) => {
    try {
      const modList = JSON.parse(atob(key));
      if (!Array.isArray(modList)) throw new Error('Invalid collection key');
      
      if (!window.api?.mods) return { success: false, error: 'Bridge not available' };
      const result = await window.api.mods.batchInstall(modList);
      set({ batchProgress: null });
      await get().scanMods(null, true);
      return result;
    } catch (err) {
      set({ batchProgress: null });
      return { success: false, error: err.message };
    }
  },
  
  autoOrganizeMaps: async () => {
    set({ isLoading: true });
    try {
      if (!window.api?.localMods) return { success: false, error: 'Bridge not available' };
      const result = await window.api.localMods.autoOrganizeMaps();
      await get().scanMods(); // Reload mods to see new folders
      return result;
    } catch (err) {
      set({ isLoading: false });
      return { success: false, error: err.message };
    }
  },
}));

