import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';

function computeModCount(mods) {
  if (!Array.isArray(mods)) return 0;
  return mods.filter(m => {
    if (!m || m.isVirtual) return false;
    if (m.isDLC) return false;
    if (m.folder === 'DLC') return false;
    const fn = (m.fileName || '').toLowerCase();
    if (fn.endsWith('.dlc') || fn.startsWith('pdlc_')) return false;
    if (Array.isArray(m.tags) && m.tags.includes('DLC')) return false;
    return true;
  }).length;
}

function reconcileUpdates(currentUpdates, localMods) {
  if (!Array.isArray(currentUpdates) || currentUpdates.length === 0) return [];
  if (!Array.isArray(localMods) || localMods.length === 0) return currentUpdates;

  return currentUpdates.filter(u => {
    const local = localMods.find(m => m.fileName === u.fileName || (m.modId && String(m.modId) === String(u.modId)));
    if (!local) return true;
    if (!u.remoteVersion || !local.version) return true;

    const parts1 = String(local.version).split(/[.-]/).map(p => parseInt(p, 10) || 0);
    const parts2 = String(u.remoteVersion).split(/[.-]/).map(p => parseInt(p, 10) || 0);
    const maxLen = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLen; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return true;  // Local is older, update needed
      if (p1 > p2) return false; // Local is newer, update complete
    }
    return false; // Same version, update complete
  });
}

export const useLocalModsStore = create((set, get) => ({
  mods: [],
  modCount: 0,
  allFolders: [],
  isLoading: false,
  isCheckingUpdates: false,
  isSyncing: false,
  error: null,
  updates: (() => {
    try {
      return JSON.parse(localStorage.getItem('mod_updates') || '[]');
    } catch (_) {
      return [];
    }
  })(),
  conflicts: [],
  lastUpdateCheck: parseInt(localStorage.getItem('last_update_check') || '0', 10),
  lastScanTime: 0,
  isResolving: false,
  resolvingStatus: null, // { modName, status, progress }
  showOnlyUpdates: false,

  isScanning: false,

  loadCache: async () => {
    if (!window.api?.settings) return;
    try {
      const cached = await window.api.settings.get('modCache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.mods) && parsed.mods.length > 0) {
          const modArray = parsed.mods;
          const cleanUpdates = reconcileUpdates(get().updates, modArray);
          set({ mods: modArray, modCount: computeModCount(modArray), allFolders: parsed.allFolders || [], updates: cleanUpdates, lastScanTime: 0 });
          try { localStorage.setItem('mod_updates', JSON.stringify(cleanUpdates)); } catch (_) {}
        }
      }
    } catch (e) {
      console.error("Failed to parse mod cache", e);
    }
  },

  scanMods: async (manualPaths = null, force = false) => {
    const now = Date.now();
    const { isScanning, lastScanTime, mods: currentMods } = get();

    // Prevent duplicate parallel scans if already scanning
    if (isScanning) return;

    // Cooldown check for unforced scans when we already have scanned mods
    if (!force && currentMods.length > 0 && lastScanTime > 0 && (now - lastScanTime < 300000)) return;

    set({ isScanning: true, isLoading: currentMods.length === 0, error: null });

    try {
      if (!window.api?.localMods) {
        set({ isLoading: false, isScanning: false });
        return;
      }
      
      const { mods, allFolders, conflicts, missingDependencies, error } = await window.api.localMods.scan(force);
      const modArray = mods || [];
      const cleanUpdates = reconcileUpdates(get().updates, modArray);

      set({
        mods: modArray,
        modCount: computeModCount(modArray),
        allFolders: allFolders || [],
        conflicts: conflicts || [],
        missingDependencies: missingDependencies || [],
        updates: cleanUpdates,
        isLoading: false,
        isScanning: false,
        lastScanTime: Date.now(),
        error: error || null,
      });

      try { localStorage.setItem('mod_updates', JSON.stringify(cleanUpdates)); } catch (_) {}
      
      // Persist fresh data for next launch (keep essential properties for instant load)
      try {
        const lightweightMods = (mods || []).map(m => ({
          title: m.title,
          author: m.author,
          version: m.version,
          category: m.category,
          size: m.size,
          fileName: m.fileName,
          filePath: m.filePath,
          folder: m.folder,
          isDLC: m.isDLC,
          isMap: m.isMap,
          mapId: m.mapId,
          mapTitle: m.mapTitle,
          modName: m.modName,
          technicalName: m.technicalName,
          dependencies: m.dependencies,
          modId: m.modId,
          iconData: m.iconData,
          tags: m.tags
        }));

        await window.api.settings.set('modCache', JSON.stringify({
            mods: lightweightMods,
            allFolders: allFolders || []
        }));
      } catch (_) {}

    } catch (err) {
      set({ error: err.message, isLoading: false });
      import('./useToastStore').then(m => {
        m.useToastStore.getState().error('Scan failed: ' + err.message);
      }).catch(() => {});
    }
  },

  flattenSubfolders: async () => {
    if (!window.api?.localMods?.flattenSubfolders) return { success: false, error: 'API unavailable' };
    set({ isLoading: true });
    try {
      const res = await window.api.localMods.flattenSubfolders();
      if (res.success) {
        await get().scanMods(null, true);
      }
      set({ isLoading: false });
      return res;
    } catch (err) {
      set({ isLoading: false });
      return { success: false, error: err.message };
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
            
            // Refresh library once a background mod finishes successfully (debounced)
            if (data.status === 'success' || data.status === 'installed') {
                import('./useDownloadStore').then(d => {
                    d.useDownloadStore.getState().triggerScan();
                }).catch(() => {
                    get().scanMods();
                });
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
    const { isCheckingUpdates, lastUpdateCheck, updates: currentUpdates, mods: currentMods } = get();
    const now = Date.now();
    
    // Always reconcile existing updates list against current installed mods on disk
    const reconciled = reconcileUpdates(currentUpdates, currentMods);
    if (reconciled.length !== currentUpdates.length) {
      set({ updates: reconciled });
      try { localStorage.setItem('mod_updates', JSON.stringify(reconciled)); } catch (_) {}
    }

    // Guard: Only fetch remote updates if not already checking, and last check > 24 hours ago (unless forced)
    if (isCheckingUpdates) return;
    if (!force && now - lastUpdateCheck < 24 * 60 * 60 * 1000) return;

    set({ isCheckingUpdates: true, error: null });
    try {
      if (!window.api?.localMods) {
        set({ isCheckingUpdates: false });
        return;
      }
      const result = await window.api.localMods.checkUpdates();
      const rawUpdatesList = result || [];
      const updatesList = reconcileUpdates(rawUpdatesList, get().mods);
      set({
        updates: updatesList,
        isCheckingUpdates: false,
        lastUpdateCheck: now,
      });
      try {
        localStorage.setItem('mod_updates', JSON.stringify(updatesList));
        localStorage.setItem('last_update_check', String(now));
      } catch (_) {}

      // If modUpdateMode is set to 'auto', trigger background installation of found updates
      if (updatesList.length > 0) {
        setTimeout(() => {
          get().triggerAutoUpdateIfNeeded();
        }, 500);
      }
    } catch (err) {
      set({ isCheckingUpdates: false, error: err.message });
      console.error('Update check failed:', err);
    }
  },

  triggerAutoUpdateIfNeeded: async () => {
    const { modUpdateMode } = useSettingsStore.getState();
    if (modUpdateMode !== 'auto') return;
    await get().updateAllMods();
  },

  updateAllMods: async (customUpdatesList = null) => {
    const { updates, updateMod, mods } = get();
    const targetUpdates = customUpdatesList || updates;

    if (!Array.isArray(targetUpdates) || targetUpdates.length === 0) return;

    if (window.api?.game?.isRunning) {
      try {
        const isRunning = await window.api.game.isRunning();
        if (isRunning) {
          console.log('[AUTO-UPDATE] Game is running. Deferring background updates.');
          return;
        }
      } catch (_) {}
    }

    const modsToUpdate = targetUpdates.filter(update => {
      const localMod = mods.find(m => m.fileName === update.fileName);
      return !(localMod && (localMod.tags || []).includes('lock-updates'));
    });

    if (modsToUpdate.length === 0) return;

    import('./useToastStore').then(t => {
      t.useToastStore.getState().info(`Queueing ${modsToUpdate.length} mod update${modsToUpdate.length > 1 ? 's' : ''}...`);
    }).catch(() => {});

    // Dispatch all updates concurrently into backend download queue (with skipScan = true for batch)
    const updatePromises = modsToUpdate.map(update => {
      const titleToUse = update.modhubTitle || update.title || update.fileName.replace(/\.zip$/i, '');
      import('./useDownloadStore').then(d => {
        d.useDownloadStore.getState().addDownload(update.modId || update.fileName, titleToUse, null, 0, null, null, 'downloading');
      }).catch(() => {});

      return updateMod(update.fileName, update.modId, true);
    });

    await Promise.allSettled(updatePromises);
  },

  uninstallMod: async (modFileName, folder = null) => {
    try {
      if (!window.api?.mods) return { success: false, error: 'Bridge not available' };
      const result = await window.api.mods.uninstall({ modFileName, folder });
      if (result.success) {
        set((s) => {
          const nextMods = s.mods.filter((m) => m.fileName !== modFileName);
          return { mods: nextMods, modCount: computeModCount(nextMods) };
        });
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
      set(s => {
        const nextMods = s.mods.filter(m => !fileNamesToRemove.includes(m.fileName));
        return { mods: nextMods, modCount: computeModCount(nextMods) };
      });
      
      const promises = modsList.map(m => window.api.mods.uninstall({ modFileName: m.fileName, folder: m.folder }));
      await Promise.allSettled(promises);
      return { success: true };
    } finally {
      set({ isLoading: false });
    }
  },

  updateMod: async (modFileName, modId, skipScan = false) => {
    try {
      if (!window.api?.localMods) return { success: false, error: 'Bridge not available' };
      const titleToUse = modFileName.replace(/\.zip$/i, '');
      import('./useDownloadStore').then(d => {
        d.useDownloadStore.getState().addDownload(modId || modFileName, titleToUse, null, 0, null, null, 'downloading');
      }).catch(() => {});

      const result = await window.api.localMods.updateMod({ modFileName, modId });
      if (result.success) {
        // Re-scan after single update if not in a batch
        if (!skipScan) {
          await get().scanMods(null, false);
        }
        // Clear the specific update flag immediately from state AND localStorage
        const remaining = (get().updates || []).filter((u) => u.fileName !== modFileName && String(u.modId) !== String(modId));
        set({ updates: remaining });
        try {
          localStorage.setItem('mod_updates', JSON.stringify(remaining));
        } catch (_) {}
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
      await get().scanMods(null, true);
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
        set(state => {
          const nextMods = state.mods.filter(m => (m.folder || '') !== folderName);
          return {
            allFolders: state.allFolders.filter(f => f !== folderName),
            mods: nextMods,
            modCount: computeModCount(nextMods)
          };
        });
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
      
      if (result.success && (!result.errors || result.errors.length === 0)) {
        // Optimistic update: Update local state instead of re-scanning everything
        set(state => ({
            mods: state.mods.map(m => {
                if (fileNames.includes(m.fileName)) {
                    const baseName = m.fileName.includes('/') ? m.fileName.split('/').pop() : m.fileName;
                    const newFileName = destinationFolder ? `${destinationFolder}/${baseName}` : baseName;
                    return { ...m, folder: destinationFolder, fileName: newFileName };
                }
                return m;
            })
        }));
      } else {
        // If there were partial errors, a full scan is safer to ensure UI consistency
        await get().scanMods(null, true);
      }
      
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
          const mBasename = m.fileName ? m.fileName.split(/[/\\]/).pop().toLowerCase() : '';
          const idBasename = String(identifier).split(/[/\\]/).pop().toLowerCase();
          if (m.fileName === identifier || (mBasename && mBasename === idBasename) || (m.modId && String(m.modId) === String(identifier))) {
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

  setShowOnlyUpdates: (val) => set({ showOnlyUpdates: val }),
}));

