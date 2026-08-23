import { create } from 'zustand';
import { useLocalModsStore } from './useLocalModsStore';
import { useModHubStore } from './useModHubStore';
import { useToastStore } from './useToastStore';

function resolveDownloadTitle(modIdStr, defaultTitle) {
  const strVal = modIdStr ? String(modIdStr).trim() : '';

  // If defaultTitle is already valid (not "Mod 123", not raw numbers, not generic FS25_mod_)
  if (defaultTitle && typeof defaultTitle === 'string') {
    const trimmed = defaultTitle.trim();
    const isGenericId = /^mod\s*\d+$/i.test(trimmed) || /^\d+$/.test(trimmed) || trimmed.startsWith('FS25_mod_');
    if (!isGenericId) {
      return trimmed;
    }
  }

  // 0. Search in active downloads store map (e.g. activeDownloads['319981'])
  try {
    const activeDownloads = useDownloadStore.getState().activeDownloads || {};
    const active = activeDownloads[strVal] || activeDownloads[modIdStr];
    if (active && active.title) {
      const trimmed = String(active.title).trim();
      const isGeneric = /^mod\s*\d+$/i.test(trimmed) || /^\d+$/.test(trimmed) || trimmed.startsWith('FS25_mod_');
      if (!isGeneric) return trimmed;
    }
  } catch (_) {}

  // 0.5. Search in sessionInstalled store map
  try {
    const sessionInstalled = useDownloadStore.getState().sessionInstalled || {};
    const sessionTitle = sessionInstalled[strVal] || sessionInstalled[modIdStr];
    if (sessionTitle) {
      const trimmed = String(sessionTitle).trim();
      const isGeneric = /^mod\s*\d+$/i.test(trimmed) || /^\d+$/.test(trimmed) || trimmed.startsWith('FS25_mod_');
      if (!isGeneric) return trimmed;
    }
  } catch (_) {}

  // 1. Search in useLocalModsStore updates
  try {
    const updates = useLocalModsStore.getState().updates || [];
    const match = updates.find(u => String(u.modId) === strVal || (u.fileName && u.fileName.toLowerCase().includes(strVal.toLowerCase())));
    if (match && (match.modhubTitle || match.title)) return match.modhubTitle || match.title;
  } catch (_) {}

  // 2. Search in useLocalModsStore local mods
  try {
    const localMods = useLocalModsStore.getState().mods || [];
    const match = localMods.find(m => String(m.modId) === strVal || (m.fileName && m.fileName.toLowerCase().includes(strVal.toLowerCase())));
    if (match && match.title) return match.title;
  } catch (_) {}

  // 3. Search in useModHubStore (modCache, searchResults, latestMods, topDownloadedMods, homeFeatured)
  try {
    const mh = useModHubStore.getState();
    if (mh.modCache && mh.modCache[strVal]?.title) return mh.modCache[strVal].title;

    const allMh = [
      ...(mh.searchResults || []),
      ...(mh.latestMods || []),
      ...(mh.topDownloadedMods || []),
      ...(mh.homeFeatured || []),
      ...(mh.homeTopDownloaded || [])
    ];
    const matchMh = allMh.find(m => String(m.modId) === strVal || (m.fileName && m.fileName.toLowerCase() === strVal.toLowerCase()));
    if (matchMh && (matchMh.title || matchMh.modTitle)) return matchMh.title || matchMh.modTitle;
  } catch (_) {}

  // 4. Format filename if strVal looks like a filename (e.g. FS25_FD_Puma_CVX_EP.zip)
  if (strVal && (strVal.toLowerCase().endsWith('.zip') || strVal.includes('_'))) {
    const cleanName = strVal.replace(/\.zip$/i, '').replace(/_/g, ' ').replace(/^FS25\s+/i, '').trim();
    if (cleanName && !/^\d+$/.test(cleanName)) return cleanName;
  }

  // 5. Fallback
  if (defaultTitle && !/^\d+$/.test(String(defaultTitle).trim())) return defaultTitle;
  return `Mod ${strVal}`;
}

export const useDownloadStore = create((set, get) => ({
  activeDownloads: {},
  batchProgress: {}, // { [parentId]: { total: number, completed: number } }
  scanTimeout: null,
  sessionInstalled: {}, // { modId: normalizedTitle }

  addDownload: (modId, title, icon = null, progress = 0, receivedBytes = null, totalBytes = null, status = 'waiting') => {
    if (modId === undefined || modId === null) return;
    const modIdStr = String(modId);
    const resolvedTitle = resolveDownloadTitle(modIdStr, title);

    set((s) => {
      const existing = s.activeDownloads[modId] || s.activeDownloads[modIdStr];
      if (existing) {
        // Do not reset an already active/downloading item back to 0 waiting!
        const currentStatus = (existing.status || '').toLowerCase();
        if (['downloading', 'connecting', 'starting', 'handshaking', 'queued'].includes(currentStatus)) {
          return s;
        }
      }

      return {
        activeDownloads: {
          ...s.activeDownloads,
          [modIdStr]: { 
            modId: modIdStr, 
            title: resolvedTitle || existing?.title || `Mod ${modIdStr}`, 
            progress: typeof progress === 'number' ? progress : (existing?.progress || 0), 
            icon: icon || existing?.icon || null, 
            receivedBytes: receivedBytes !== null ? receivedBytes : (existing?.receivedBytes || null),
            totalBytes: totalBytes !== null ? totalBytes : (existing?.totalBytes || null),
            status: status || existing?.status || 'waiting' 
          },
        },
      };
    });
  },

  loadPendingDownloads: async () => {
    try {
      if (window.api?.localMods?.getPending) {
        const pending = await window.api.localMods.getPending();
        if (Array.isArray(pending) && pending.length > 0) {
          pending.forEach(item => {
            const modIdStr = String(item.mod_id);
            const received = item.received_bytes || 0;
            const total = item.total_bytes || 0;
            const percent = total > 0 ? Math.round((received / total) * 100) : 0;
            get().addDownload(modIdStr, item.mod_title, null, percent, received, total, 'waiting');
          });
        }
      }
    } catch (e) {
      console.error('[STORE] Failed to load pending downloads:', e);
    }
  },

  registerBatch: (parentId, total) => {
    if (!parentId) return;
    set((s) => ({
      batchProgress: {
        ...s.batchProgress,
        [parentId]: { total, completed: 0, childIds: [] }
      }
    }));
  },

  updateBatchProgress: (parentId, completed, childId = null) => {
    if (!parentId || !get().batchProgress[parentId]) return;
    set((s) => {
      const batch = s.batchProgress[parentId];
      const nextChildIds = childId && !batch.childIds.includes(childId) 
        ? [...batch.childIds, childId] 
        : batch.childIds;
        
      return {
        batchProgress: {
          ...s.batchProgress,
          [parentId]: { ...batch, completed, childIds: nextChildIds }
        }
      };
    });
  },

  removeBatch: (parentId) => {
    set((s) => {
      const next = { ...s.batchProgress };
      delete next[parentId];
      return { batchProgress: next };
    });
  },

  setStatus: (targetKey, status) => {
    if (targetKey === undefined || targetKey === null) return;
    const targetStr = String(targetKey);
    const targetLower = targetStr.toLowerCase();

    set((s) => {
      const next = { ...s.activeDownloads };
      let changed = false;

      Object.keys(next).forEach((key) => {
        const item = next[key];
        if (!item) return;

        const keyStr = String(key).toLowerCase();
        const modIdStr = String(item.modId || '').toLowerCase();
        const titleStr = String(item.title || '').toLowerCase();

        if (
          key === targetKey ||
          keyStr === targetLower ||
          modIdStr === targetLower ||
          titleStr === targetLower
        ) {
          next[key] = { ...item, status };
          changed = true;
        }
      });

      if (!changed && !['success', 'completed', 'cancelled'].includes(status)) {
        next[targetStr] = {
          modId: targetStr,
          title: `Mod ${targetStr}`,
          progress: 0,
          status
        };
        changed = true;
      }

      return changed ? { activeDownloads: next } : s;
    });
  },

  setProgress: (targetKey, progressData) => {
    if (targetKey === undefined || targetKey === null) return;
    const targetStr = String(targetKey);
    const targetLower = targetStr.toLowerCase();

    set((s) => {
      const next = { ...s.activeDownloads };
      let changed = false;

      Object.keys(next).forEach((key) => {
        const item = next[key];
        if (!item) return;

        const keyStr = String(key).toLowerCase();
        const modIdStr = String(item.modId || '').toLowerCase();
        const titleStr = String(item.title || '').toLowerCase();

        if (
          key === targetKey ||
          keyStr === targetLower ||
          modIdStr === targetLower ||
          titleStr === targetLower
        ) {
          // Do NOT revert completed/terminal statuses back to downloading!
          const currentStatus = (item.status || '').toLowerCase();
          if (['success', 'completed', 'done', 'finished', 'installed', 'error', 'failed', 'cancelled'].includes(currentStatus)) {
            return;
          }

          if (progressData && typeof progressData === 'object' && progressData.status) {
            return;
          }

          const progress = typeof progressData === 'object' ? progressData.percent : progressData;
          const receivedBytes = typeof progressData === 'object' ? progressData.receivedBytes : item.receivedBytes;
          const totalBytes = typeof progressData === 'object' ? progressData.totalBytes : item.totalBytes;

          // Skip redundant state mutations if percentage, receivedBytes, and status haven't changed
          if (item.progress === progress && item.receivedBytes === receivedBytes && item.status === 'downloading') {
            return;
          }

          next[key] = {
            ...item,
            progress: typeof progress === 'number' ? progress : item.progress,
            receivedBytes,
            totalBytes,
            status: 'downloading'
          };
          changed = true;
        }
      });

      if (!changed) {
        const progress = typeof progressData === 'object' ? progressData.percent : progressData;
        const receivedBytes = typeof progressData === 'object' ? progressData.receivedBytes : null;
        const totalBytes = typeof progressData === 'object' ? progressData.totalBytes : null;

        next[targetStr] = {
          modId: targetStr,
          title: resolveDownloadTitle(targetStr, typeof progressData === 'object' ? progressData.title : null),
          progress: typeof progress === 'number' ? progress : 0,
          receivedBytes,
          totalBytes,
          status: 'downloading'
        };
        changed = true;
      }

      return changed ? { activeDownloads: next } : s;
    });
  },

  removeDownload: (targetKey) => {
    if (targetKey === undefined || targetKey === null) return;
    const targetStr = String(targetKey).toLowerCase();

    set((s) => {
      const next = { ...s.activeDownloads };
      let changed = false;

      Object.keys(next).forEach((key) => {
        const item = next[key];
        if (!item) return;

        const keyStr = String(key).toLowerCase();
        const modIdStr = String(item.modId || '').toLowerCase();
        const titleStr = String(item.title || '').toLowerCase();

        if (
          key === targetKey ||
          keyStr === targetStr ||
          modIdStr === targetStr ||
          titleStr === targetStr
        ) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? { activeDownloads: next } : s;
    });
  },

  cancelDownload: async (modId) => {
    try {
      // 1. Recursive check: If this is a parent, cancel all children first
      const batch = get().batchProgress[modId];
      if (batch && batch.childIds) {
        console.log(`[STORE] Cancelling batch ${modId} with ${batch.childIds.length} children`);
        for (const childId of batch.childIds) {
          if (get().activeDownloads[childId]) {
            if (window.api?.mods?.cancelInstall) {
               window.api.mods.cancelInstall({ modId: childId }).catch(() => {});
            }
            get().removeDownload(childId);
          }
        }
        get().removeBatch(modId);
      }

      // 2. Main cancellation
      if (window.api?.mods?.cancelInstall) {
        await window.api.mods.cancelInstall({ modId });
      }
      get().removeDownload(modId);
    } catch (err) {
      console.error('Failed to cancel download:', err);
      get().removeDownload(modId);
    }
  },

  clearFinished: () => {
    set((s) => {
      const next = { ...s.activeDownloads };
      let changed = false;

      Object.keys(next).forEach((key) => {
        const item = next[key];
        if (!item) return;

        const st = (item.status || '').toLowerCase();
        const isDoneStatus = ['success', 'completed', 'done', 'finished', 'installed', 'error', 'failed', 'cancelled'].includes(st);
        const is100 = typeof item.progress === 'number' && item.progress >= 100;
        const isNotActive = !['downloading', 'waiting', 'queued', 'connecting', 'starting', 'handshaking'].includes(st);

        if (isDoneStatus || is100 || isNotActive) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? { activeDownloads: next } : s;
    });
  },

  isDownloading: (modId) => {
    if (!modId) return false;
    const downloads = get().activeDownloads;
    const targetStr = String(modId).toLowerCase();
    return Object.keys(downloads).some(key => {
      const item = downloads[key];
      if (!item) return false;
      return key === modId || String(key).toLowerCase() === targetStr || String(item.modId || '').toLowerCase() === targetStr;
    });
  },

  getProgress: (modId) => {
    if (!modId) return 0;
    const downloads = get().activeDownloads;
    const targetStr = String(modId).toLowerCase();
    for (const key of Object.keys(downloads)) {
      const item = downloads[key];
      if (item && (key === modId || String(key).toLowerCase() === targetStr || String(item.modId || '').toLowerCase() === targetStr)) {
        return item.progress || 0;
      }
    }
    return 0;
  },

  addSessionInstalled: (modId, title) => {
    if (!modId) return;
    const normTitle = title ? title.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    if (!normTitle || /^mod\d*$/i.test(normTitle)) return;
    set(state => {
      const next = { ...state.sessionInstalled };
      next[String(modId)] = normTitle;
      return { sessionInstalled: next };
    });
  },

  triggerScan: () => {
    if (get().scanTimeout) clearTimeout(get().scanTimeout);
    const timeoutId = setTimeout(() => {
      useLocalModsStore.getState().scanMods(null, true);
      set({ scanTimeout: null });
    }, 500);

    set({ scanTimeout: timeoutId });
  }
}));

// Listen for download updates from main process
if (window.api?.on) {
  if (window.api.on.downloadProgress) {
    window.api.on.downloadProgress((data) => {
      useDownloadStore.getState().setProgress(data.modId, data.progress);
    });
  }

  if (window.api.on.downloadStatus) {
    window.api.on.downloadStatus((data) => {
      const { modId, status, title, modTitle, fileName } = data;
      if (!modId) return;
      const strId = String(modId);
      
      if (status === 'cancelled') {
        useDownloadStore.getState().removeDownload(strId);
        return;
      }
      
      if (status === 'queued') {
        useDownloadStore.getState().setStatus(strId, 'queued');
        return;
      }

      useDownloadStore.getState().setStatus(strId, status);

      const active = useDownloadStore.getState().activeDownloads[strId] || useDownloadStore.getState().activeDownloads[modId];
      const incomingTitle = title || modTitle || fileName;
      const resolvedTitle = resolveDownloadTitle(strId, incomingTitle || active?.title);

      // Complete flow: Download -> Index Library -> Display Toast
      if (status === 'success' || status === 'completed' || status === 'installed') {
        useDownloadStore.getState().addSessionInstalled(strId, resolvedTitle);
        
        // 1. Index newly downloaded mod into library first
        useLocalModsStore.getState().scanMods(null, true).then(() => {
          // 2. Resolve title from fresh indexed library state
          const displayTitle = resolveDownloadTitle(strId, incomingTitle || active?.title);
          // 3. Display success toast notification
          useToastStore.getState().success(`${displayTitle} installed successfully!`, { id: `dl-toast-${strId}` });
        }).catch(() => {
          const displayTitle = (resolvedTitle && !resolvedTitle.startsWith('Mod ')) ? resolvedTitle : (active?.title || incomingTitle || `Mod ${strId}`);
          useToastStore.getState().success(`${displayTitle} installed successfully!`, { id: `dl-toast-${strId}` });
        });

        setTimeout(() => {
          useDownloadStore.getState().removeDownload(strId);
          if (active?.title) useDownloadStore.getState().removeDownload(active.title);
        }, 1500);
      } else if (status === 'error') {
        const displayTitle = (resolvedTitle && !resolvedTitle.startsWith('Mod ')) ? resolvedTitle : (active?.title || incomingTitle || `Mod ${strId}`);
        
        useToastStore.getState().error(`Download failed: ${displayTitle}`, { id: `dl-toast-${strId}` });
        
        console.warn(`Download failed for mod ${strId}`);
        setTimeout(() => {
          useDownloadStore.getState().removeDownload(strId);
        }, 15000);
      }
    });
  }

  if (window.api.on.dependencyProgress) {
    window.api.on.dependencyProgress((data) => {
      const { type, modId, status, percent, title, parentId, modName } = data;
      const displayTitle = title || modName;
      const targetKey = modId || displayTitle;
      if (!targetKey) return;
      const strKey = String(targetKey);

      if (type === 'STATUS') {
        if (status === 'DOWNLOADING') {
          useDownloadStore.getState().addDownload(strKey, displayTitle);
          if (parentId) {
             useDownloadStore.getState().updateBatchProgress(parentId, useDownloadStore.getState().batchProgress[parentId]?.completed || 0, strKey);
          }
        } else if (status === 'success' || status === 'completed' || status === 'installed') {
          useDownloadStore.getState().setStatus(strKey, 'success');
          const active = useDownloadStore.getState().activeDownloads[strKey] || useDownloadStore.getState().activeDownloads[targetKey];
          const resolvedTitle = resolveDownloadTitle(strKey, displayTitle || active?.title);
          const finalTitle = (resolvedTitle && !resolvedTitle.startsWith('Mod ')) ? resolvedTitle : (displayTitle || `Mod ${strKey}`);

          useDownloadStore.getState().addSessionInstalled(strKey, finalTitle);
          
          if (parentId) {
            const batch = useDownloadStore.getState().batchProgress[parentId];
            if (batch) {
              const nextCompleted = batch.completed + 1;
              useDownloadStore.getState().updateBatchProgress(parentId, nextCompleted, strKey);
              if (nextCompleted >= batch.total) {
                setTimeout(() => useDownloadStore.getState().removeBatch(parentId), 3000);
              }
            }
          }

          useDownloadStore.getState().triggerScan();

          setTimeout(() => {
            useDownloadStore.getState().removeDownload(strKey);
          }, 1500);
        } else if (status === 'error' || status === 'NOT_FOUND_ON_MODHUB') {
          useDownloadStore.getState().setStatus(strKey, 'error');
          useDownloadStore.setState(state => {
            const next = { ...state.sessionInstalled };
            delete next[strKey];
            if (targetKey) delete next[String(targetKey)];
            return { sessionInstalled: next };
          });
          const active = useDownloadStore.getState().activeDownloads[strKey] || useDownloadStore.getState().activeDownloads[targetKey];
          const resolvedTitle = resolveDownloadTitle(strKey, displayTitle || active?.title);
          const finalTitle = (resolvedTitle && !resolvedTitle.startsWith('Mod ')) ? resolvedTitle : (displayTitle || `Mod ${strKey}`);

          if (!data.isBackground) {
            useToastStore.getState().error(`Download failed: ${finalTitle}`, { id: `dl-toast-${strKey}` });
          }
          
          if (parentId) {
            const batch = useDownloadStore.getState().batchProgress[parentId];
            if (batch) {
                useDownloadStore.getState().updateBatchProgress(parentId, batch.completed + 1, strKey);
            }
          }

          setTimeout(() => {
            useDownloadStore.getState().removeDownload(strKey);
          }, 15000);
        }
      } else if (type === 'PROGRESS') {
        useDownloadStore.getState().setProgress(strKey, percent);
      }
    });
  }
}
