import { create } from 'zustand';
import { useLocalModsStore } from './useLocalModsStore';

export const useDownloadStore = create((set, get) => ({
  activeDownloads: {},
  batchProgress: {}, // { [parentId]: { total: number, completed: number } }
  scanTimeout: null,
  sessionInstalled: {}, // { modId: normalizedTitle }

  addDownload: (modId, title, icon = null) => {
    set((s) => ({
      activeDownloads: {
        ...s.activeDownloads,
        [modId]: { modId, title, progress: 0, icon, status: 'waiting' },
      },
    }));
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

  setStatus: (modId, status) => {
    const active = get().activeDownloads[modId];
    if (!active) return;

    set((s) => ({
      activeDownloads: {
        ...s.activeDownloads,
        [modId]: { ...active, status },
      },
    }));
  },

  setProgress: (modId, progressData) => {
    const active = get().activeDownloads[modId];
    if (!active) return;

    const progress = typeof progressData === 'object' ? progressData.percent : progressData;
    const receivedBytes = typeof progressData === 'object' ? progressData.receivedBytes : active.receivedBytes;
    const totalBytes = typeof progressData === 'object' ? progressData.totalBytes : active.totalBytes;

    set((s) => ({
      activeDownloads: {
        ...s.activeDownloads,
        [modId]: { 
          ...active, 
          progress: typeof progress === 'number' ? progress : active.progress, 
          receivedBytes, 
          totalBytes,
          status: 'downloading' 
        },
      },
    }));
  },

  removeDownload: (modId) => {
    set((s) => {
      const next = { ...s.activeDownloads };
      delete next[modId];
      return { activeDownloads: next };
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
            // Internal call to avoid recursive batch lookups
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
    }
  },

  clearFinished: () => {
    set((s) => {
      const next = { ...s.activeDownloads };
      Object.keys(next).forEach(modId => {
        if (next[modId].status === 'success' || next[modId].status === 'error') {
          delete next[modId];
        }
      });
      return { activeDownloads: next };
    });
  },

  isDownloading: (modId) => {
    return !!get().activeDownloads[modId];
  },

  getProgress: (modId) => {
    return get().activeDownloads[modId]?.progress || 0;
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
    }, 1000);
    set({ scanTimeout: timeoutId });
  }
}));

// Listen for download updates from main process
if (window.api?.on) {
  if (window.api.on.downloadProgress) {
    window.api.on.downloadProgress((data) => {
      // Data contains { modId, progress: { percent, receivedBytes, totalBytes, fileName } }
      useDownloadStore.getState().setProgress(data.modId, data.progress);
    });
  }

  if (window.api.on.downloadStatus) {
    window.api.on.downloadStatus((data) => {
      const { modId, status } = data;
      
      if (status === 'cancelled') {
        useDownloadStore.getState().removeDownload(modId);
        return;
      }
      
      if (status === 'queued') {
        useDownloadStore.getState().setStatus(modId, 'queued');
        return;
      }

      useDownloadStore.getState().setStatus(modId, status);

      // Auto-clear successful downloads after a delay
      if (status === 'success') {
        // Trigger a re-scan and optimistic UI update
        useDownloadStore.getState().addSessionInstalled(modId);
        useDownloadStore.getState().triggerScan();

        setTimeout(() => {
          useDownloadStore.getState().removeDownload(modId);
        }, 3000);
      } else if (status === 'error') {
        // Keep it in the store so UI shows 'FAILED' for a while
        console.warn(`Download failed for mod ${modId}`);
        setTimeout(() => {
          useDownloadStore.getState().removeDownload(modId);
        }, 15000); // 15 seconds for errors
      }
    });
  }


  if (window.api.on.dependencyProgress) {
    window.api.on.dependencyProgress((data) => {
      const { type, modId, status, percent, title, parentId } = data;
      if (!modId) return;

      if (type === 'STATUS') {
        if (status === 'DOWNLOADING') {
          useDownloadStore.getState().addDownload(modId, title);
          if (parentId) {
             useDownloadStore.getState().updateBatchProgress(parentId, useDownloadStore.getState().batchProgress[parentId]?.completed || 0, modId);
          }
        } else if (status === 'success') {
          // Atomic update: Status + Session Cache + Scan Trigger
          set(state => {
            const nextActive = { ...state.activeDownloads };
            if (nextActive[modId]) {
              nextActive[modId] = { ...nextActive[modId], status: 'success' };
            }
            
            const nextSession = { ...state.sessionInstalled };
            const normTitle = title ? title.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
            nextSession[String(modId)] = normTitle;
            
            return { 
              activeDownloads: nextActive,
              sessionInstalled: nextSession 
            };
          });

          // Update Batch Progress if part of a group
          if (parentId) {
            const batch = get().batchProgress[parentId];
            if (batch) {
              const nextCompleted = batch.completed + 1;
              get().updateBatchProgress(parentId, nextCompleted, modId);
              if (nextCompleted >= batch.total) {
                setTimeout(() => get().removeBatch(parentId), 5000);
              }
            }
          }

          get().triggerScan();

          setTimeout(() => {
            get().removeDownload(modId);
          }, 3000);
        } else if (status === 'error' || status === 'NOT_FOUND_ON_MODHUB') {
          useDownloadStore.getState().setStatus(modId || title, 'error');
          
          // Still increment batch so the parent doesn't hang forever, but it will show failed deps
          if (parentId) {
            const batch = useDownloadStore.getState().batchProgress[parentId];
            if (batch) {
                // For NOT_FOUND_ON_MODHUB, title is often the name itself as modId might be null
                useDownloadStore.getState().updateBatchProgress(parentId, batch.completed + 1, modId || title);
            }
          }
          if (status === 'error') {
            console.error(`Dependency ${modId} (Title: ${title}) failed to install for parent ${parentId}`);
          } else {
            console.warn(`Dependency ${title} not found on ModHub for parent ${parentId}`);
          }

          // Auto-clear failed dependencies after a delay
          setTimeout(() => {
            useDownloadStore.getState().removeDownload(modId || title);
          }, 15000); // 15 seconds for errors
        }
      } else if (type === 'PROGRESS') {
        useDownloadStore.getState().setProgress(modId, percent);
      }
    });
  }
}
