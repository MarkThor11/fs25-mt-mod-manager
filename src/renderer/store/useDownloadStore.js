import { create } from 'zustand';
import { useLocalModsStore } from './useLocalModsStore';
import { useToastStore } from './useToastStore';

export const useDownloadStore = create((set, get) => ({
  activeDownloads: {},
  batchProgress: {}, // { [parentId]: { total: number, completed: number } }
  scanTimeout: null,
  sessionInstalled: {}, // { modId: normalizedTitle }

  addDownload: (modId, title, icon = null, progress = 0, receivedBytes = null, totalBytes = null, status = 'waiting') => {
    if (modId === undefined || modId === null) return;
    const modIdStr = String(modId);

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
            title: title || existing?.title || `Mod ${modIdStr}`, 
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
          title: `Mod ${targetStr}`,
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
    set(state => {
      const next = { ...state.sessionInstalled };
      const normTitle = title ? title.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
      next[String(modId)] = normTitle;
      return { sessionInstalled: next };
    });
  },

  triggerScan: () => {
    if (get().scanTimeout) clearTimeout(get().scanTimeout);
    const timeoutId = setTimeout(() => {
      useLocalModsStore.getState().scanMods();
      set({ scanTimeout: null });
    }, 200);
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
      const { modId, status } = data;
      if (!modId) return;
      
      if (status === 'cancelled') {
        useDownloadStore.getState().removeDownload(modId);
        return;
      }
      
      if (status === 'queued') {
        useDownloadStore.getState().setStatus(modId, 'queued');
        return;
      }

      useDownloadStore.getState().setStatus(modId, status);

      // Auto-clear successful downloads after 1.5s delay
      if (status === 'success' || status === 'completed' || status === 'installed') {
        const active = useDownloadStore.getState().activeDownloads[modId];
        if (active) {
            useToastStore.getState().success(`${active.title || 'Mod'} installed successfully!`);
        }
        
        useDownloadStore.getState().addSessionInstalled(modId, active?.title);
        useDownloadStore.getState().triggerScan();

        setTimeout(() => {
          useDownloadStore.getState().removeDownload(modId);
          if (active?.title) useDownloadStore.getState().removeDownload(active.title);
        }, 1500);
      } else if (status === 'error') {
        const active = useDownloadStore.getState().activeDownloads[modId];
        if (active) {
            useToastStore.getState().error(`Download failed: ${active.title || modId}`);
        }
        console.warn(`Download failed for mod ${modId}`);
        setTimeout(() => {
          useDownloadStore.getState().removeDownload(modId);
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

      if (type === 'STATUS') {
        if (status === 'DOWNLOADING') {
          useDownloadStore.getState().addDownload(targetKey, displayTitle);
          if (parentId) {
             useDownloadStore.getState().updateBatchProgress(parentId, useDownloadStore.getState().batchProgress[parentId]?.completed || 0, targetKey);
          }
        } else if (status === 'success' || status === 'completed' || status === 'installed') {
          useDownloadStore.getState().setStatus(targetKey, 'success');
          useDownloadStore.getState().addSessionInstalled(targetKey, displayTitle);
          
          if (parentId) {
            const batch = useDownloadStore.getState().batchProgress[parentId];
            if (batch) {
              const nextCompleted = batch.completed + 1;
              useDownloadStore.getState().updateBatchProgress(parentId, nextCompleted, targetKey);
              if (nextCompleted >= batch.total) {
                setTimeout(() => useDownloadStore.getState().removeBatch(parentId), 3000);
              }
            }
          }

          useDownloadStore.getState().triggerScan();

          setTimeout(() => {
            useDownloadStore.getState().removeDownload(targetKey);
          }, 1500);
        } else if (status === 'error' || status === 'NOT_FOUND_ON_MODHUB') {
          useDownloadStore.getState().setStatus(targetKey, 'error');
          
          if (parentId) {
            const batch = useDownloadStore.getState().batchProgress[parentId];
            if (batch) {
                useDownloadStore.getState().updateBatchProgress(parentId, batch.completed + 1, targetKey);
            }
          }

          setTimeout(() => {
            useDownloadStore.getState().removeDownload(targetKey);
          }, 15000);
        }
      } else if (type === 'PROGRESS') {
        useDownloadStore.getState().setProgress(targetKey, percent);
      }
    });
  }
}
