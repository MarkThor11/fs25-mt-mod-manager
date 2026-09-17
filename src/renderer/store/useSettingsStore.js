import { create } from 'zustand';

export const useSettingsStore = create((set) => ({
  theme: 'dark',
  modsPath: '',
  modsPaths: [],
  gamePath: '',
  autoCheckUpdates: true,
  launchPreference: 'default',
  savegameSlot: null,
  enableCheats: true,
  skipModDialog: true,
  skipIntro: true,
  autoStart: false,
  appFullscreen: true,
  rememberModHubPage: false,
  hiddenFolders: [],
  homeShowHero: true,
  heroBgType: 'default',
  heroCustomBg: '',
  heroDimmer: 50,
  heroAlignment: 'left',
  heroFont: 'modern',
  heroTextSize: 'standard',
  heroTextColor: '#ffffff',
  heroTextShadow: true,
  heroShowText: true,
  heroShowSubtitle: true,
  homeShowStats: true,
  homeShowLatest: true,
  homeShowDownloaded: true,
  homeShowUpdates: true,
  downloadSpeedLimit: 0,
  modUpdateMode: 'auto', // 'auto' or 'manual'
  hasPromptedInitialUpdate: false,
  discordRpc: true,
  lastUpdateCheck: 0,
  lastGlobalWarming: 0,
  conflictSensitivity: 'warn',
  backupRetention: '1w',
  isLoaded: false,
  hasSeenGuide: false,
  tourVersion: '0.0.0',
  cloudBackupPath: '',
  installedModsViewMode: 'grid',
  folderOrder: [],
  folderZooms: {},
  iconOnlyFolders: [],
  favouritesIconOnly: false,
  isInternalDragging: false,
  modHubIconOnly: false,
  modHubZoom: 200,
  favouritesZoom: 200,
  isOnline: navigator.onLine,
  skipDeleteConfirm: false,
  badgeDuration: '48h',
  expandedFolders: { '': true },
  showTagBar: false,
  installedTagFilter: [],
  selectiveLoading: true,
  autoDownloadMapDeps: true,
  nickname: '',
  hasPromptedConsolidation: false,

  setIsOnline: (isOnline) => set({ isOnline }),

  loadSettings: async () => {
    try {
      if (!window.api?.settings) return set({ isLoaded: true });
      const settings = await window.api.settings.getAll();
      let theme = settings.theme || 'dark';
      if (theme === 'glass') {
        theme = 'dark';
        window.api.settings.set('theme', 'dark').catch(console.error);
      }
      set({
        theme,
        modsPath: settings.modsPath || '',
        modsPaths: (() => {
          let raw = [];
          try {
            raw = settings.modsPaths ? JSON.parse(settings.modsPaths) : (settings.modsPath ? [settings.modsPath] : []);
            if (!Array.isArray(raw)) raw = [raw];
          } catch (e) {
            console.error('Failed to parse modsPaths:', e);
            raw = settings.modsPath ? [settings.modsPath] : [];
          }
          
          const deduplicated = [];
          const seen = new Set();
          for (const p of raw) {
            if (!p || typeof p !== 'string') continue;
            const norm = p.replace(/\\/g, '/').toLowerCase();
            if (!seen.has(norm)) {
              seen.add(norm);
              deduplicated.push(p);
            }
          }
          return deduplicated;
        })(),
        gamePath: settings.gamePath || '',
        autoCheckUpdates: settings.autoCheckUpdates === 'true',
        launchPreference: settings.launchPreference || 'default',
        savegameSlot: settings.savegameSlot ? parseInt(settings.savegameSlot) : null,
        enableCheats: settings.enableCheats !== 'false', // Default true
        skipModDialog: settings.skipModDialog !== 'false',
        skipIntro: settings.skipIntro !== 'false',
        autoStart: settings.autoStart === 'true',
        appFullscreen: settings.appFullscreen !== 'false',
        rememberModHubPage: settings.rememberModHubPage === 'true',
        hiddenFolders: settings.hiddenFolders ? JSON.parse(settings.hiddenFolders) : [],
        homeShowHero: settings.homeShowHero !== 'false',
        heroBgType: settings.heroBgType || 'default',
        heroCustomBg: (await (async () => {
          let bg = settings.heroCustomBg || '';
          if ((!bg || bg === 'custom_hero_banner.jpg') && window.api?.images?.getHeroBanner) {
            try {
              const diskBanner = await window.api.images.getHeroBanner();
              if (diskBanner) return diskBanner;
            } catch (_) {}
          }
          return bg;
        })()),
        heroDimmer: settings.heroDimmer !== undefined && settings.heroDimmer !== null ? parseInt(settings.heroDimmer, 10) : 50,
        heroAlignment: settings.heroAlignment || 'left',
        heroFont: settings.heroFont || 'modern',
        heroTextSize: settings.heroTextSize || 'standard',
        heroTextColor: settings.heroTextColor || '#ffffff',
        heroTextShadow: settings.heroTextShadow !== 'false',
        heroShowText: settings.heroShowText !== 'false',
        heroShowSubtitle: settings.heroShowSubtitle !== 'false',
        homeShowStats: settings.homeShowStats !== 'false',
        homeShowLatest: settings.homeShowLatest !== 'false',
        homeShowDownloaded: settings.homeShowDownloaded !== 'false',
        homeShowUpdates: settings.homeShowUpdates !== 'false',
        modUpdateMode: settings.modUpdateMode || 'auto',
        hasPromptedInitialUpdate: settings.hasPromptedInitialUpdate === 'true',
        lastUpdateCheck: parseInt(settings.lastUpdateCheck || '0'),
        lastGlobalWarming: parseInt(settings.lastGlobalWarming || '0'),
        conflictSensitivity: settings.conflictSensitivity || 'warn',
        backupRetention: settings.backupRetention || '1w',
        hasSeenGuide: settings.hasSeenGuide === 'true',
        tourVersion: settings.tourVersion || '0.0.0',
        cloudBackupPath: settings.cloudBackupPath || '',
        installedModsViewMode: (settings.installedModsViewMode === 'icons' || !settings.installedModsViewMode) ? 'grid' : settings.installedModsViewMode,
        folderOrder: settings.folderOrder ? JSON.parse(settings.folderOrder) : [],
        folderZooms: settings.folderZooms ? JSON.parse(settings.folderZooms) : {},
        iconOnlyFolders: settings.iconOnlyFolders ? JSON.parse(settings.iconOnlyFolders) : [],
        favouritesIconOnly: settings.favouritesIconOnly === 'true',
        modHubIconOnly: settings.modHubIconOnly === 'true',
        modHubZoom: settings.modHubZoom ? parseInt(settings.modHubZoom) : 200,
        favouritesZoom: settings.favouritesZoom ? parseInt(settings.favouritesZoom) : 200,
        skipDeleteConfirm: settings.skipDeleteConfirm === 'true',
        badgeDuration: settings.badgeDuration || '48h',
        expandedFolders: settings.expandedFolders ? JSON.parse(settings.expandedFolders) : { '': true },
        showTagBar: settings.showTagBar === 'true',
        selectiveLoading: settings.selectiveLoading !== 'false',
        autoDownloadMapDeps: settings.autoDownloadMapDeps !== 'false',
        nickname: settings.nickname || '',
        hasPromptedConsolidation: settings.hasPromptedConsolidation === 'true',
        isLoaded: true,
      });
    } catch (err) {
      console.error('Failed to load settings:', err);
      set({ isLoaded: true });
    }
  },

  setHasPromptedConsolidation: async (hasPromptedConsolidation) => {
    set({ hasPromptedConsolidation });
    if (window.api?.settings) await window.api.settings.set('hasPromptedConsolidation', String(hasPromptedConsolidation));
  },

  setHasPromptedInitialUpdate: async (hasPromptedInitialUpdate) => {
    set({ hasPromptedInitialUpdate });
    if (window.api?.settings) await window.api.settings.set('hasPromptedInitialUpdate', String(hasPromptedInitialUpdate));
  },

  setAutoDownloadMapDeps: async (autoDownloadMapDeps) => {
    set({ autoDownloadMapDeps });
    if (window.api?.settings) await window.api.settings.set('autoDownloadMapDeps', String(autoDownloadMapDeps));
  },

  setTheme: async (theme) => {
    set({ theme });
    if (window.api?.settings) await window.api.settings.set('theme', theme);
  },

  setModsPath: async (modsPath) => {
    set((state) => {
      if (!modsPath || typeof modsPath !== 'string') return state;
      const normPath = modsPath.replace(/\\/g, '/').toLowerCase();
      const alreadyExists = state.modsPaths.some(p => p && typeof p === 'string' && p.replace(/\\/g, '/').toLowerCase() === normPath);
      let newPaths;
      
      if (alreadyExists) {
        // Move to front (remove all versions of this path first)
        const filtered = state.modsPaths.filter(p => p && typeof p === 'string' && p.replace(/\\/g, '/').toLowerCase() !== normPath);
        newPaths = [modsPath, ...filtered];
      } else {
        // Replace index 0 (or add if empty)
        newPaths = [...state.modsPaths];
        if (newPaths.length > 0) newPaths[0] = modsPath;
        else newPaths = [modsPath];
      }

      if (window.api?.settings) {
        window.api.settings.set('modsPaths', JSON.stringify(newPaths)).catch(console.error);
        window.api.settings.set('modsPath', modsPath).catch(console.error);
      }
      return { modsPath, modsPaths: newPaths };
    });
  },

  setModsPaths: async (paths) => {
    set({ modsPaths: paths, modsPath: paths[0] || '' });
    if (window.api?.settings) {
      await window.api.settings.set('modsPaths', JSON.stringify(paths));
      if (paths[0]) await window.api.settings.set('modsPath', paths[0]);
    }
  },

  addModsPath: async (path) => {
    set((state) => {
      if (!path || typeof path !== 'string') return state;
      const normPath = path.replace(/\\/g, '/').toLowerCase();
      if (state.modsPaths.some(p => p && typeof p === 'string' && p.replace(/\\/g, '/').toLowerCase() === normPath)) return state;
      const newPaths = [...state.modsPaths, path];
      if (window.api?.settings) window.api.settings.set('modsPaths', JSON.stringify(newPaths)).catch(console.error);
      return { modsPaths: newPaths };
    });
  },

  removeModsPath: async (path) => {
    set((state) => {
      const newPaths = state.modsPaths.filter(p => p !== path);
      const primary = newPaths[0] || '';
      if (window.api?.settings) {
        window.api.settings.set('modsPaths', JSON.stringify(newPaths)).catch(console.error);
        window.api.settings.set('modsPath', primary).catch(console.error);
      }
      return { modsPaths: newPaths, modsPath: primary };
    });
  },

  setGamePath: async (gamePath) => {
    set({ gamePath });
    if (window.api?.settings) await window.api.settings.set('gamePath', gamePath);
  },

  setAutoCheckUpdates: async (val) => {
    set({ autoCheckUpdates: val });
    if (window.api?.settings) await window.api.settings.set('autoCheckUpdates', String(val));
  },

  setLaunchPreference: async (pref) => {
    set({ launchPreference: pref });
    if (window.api?.settings) await window.api.settings.set('launchPreference', pref);
  },

  setSavegameSlot: async (slot) => {
    set({ savegameSlot: slot });
    if (window.api?.settings) await window.api.settings.set('savegameSlot', slot ? String(slot) : '');
  },

  setEnableCheats: async (val) => {
    set({ enableCheats: val });
    if (window.api?.settings) await window.api.settings.set('enableCheats', String(val));
  },

  setSkipModDialog: async (val) => {
    set({ skipModDialog: val });
    if (window.api?.settings) await window.api.settings.set('skipModDialog', String(val));
  },
  
  setSkipIntro: async (val) => {
    set({ skipIntro: val });
    if (window.api?.settings) await window.api.settings.set('skipIntro', String(val));
  },

  setAutoStart: async (val) => {
    set({ autoStart: val });
    if (window.api?.settings) await window.api.settings.set('autoStart', String(val));
  },

  setAppFullscreen: async (val) => {
    set({ appFullscreen: val });
    if (window.api?.settings) await window.api.settings.set('appFullscreen', String(val));
  },

  setCloudBackupPath: async (path) => {
    set({ cloudBackupPath: path });
    if (window.api?.settings) await window.api.settings.set('cloudBackupPath', path);
  },

  setRememberModHubPage: async (val) => {
    set({ rememberModHubPage: val });
    localStorage.setItem('modhub_remember', String(val));
    if (window.api?.settings) await window.api.settings.set('rememberModHubPage', String(val));
  },

  setHomeShowHero: async (val) => {
    set({ homeShowHero: val });
    if (window.api?.settings) await window.api.settings.set('homeShowHero', String(val));
  },

  updateHeroBannerSettings: async (updates) => {
    set(updates);
    if (window.api?.settings) {
      for (const [k, v] of Object.entries(updates)) {
        await window.api.settings.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
  },

  resetHeroBannerSettings: async () => {
    const defaults = {
      heroBgType: 'default',
      heroCustomBg: '',
      heroDimmer: 50,
      heroAlignment: 'left',
      heroFont: 'modern',
      heroTextSize: 'standard',
      heroTextColor: '#ffffff',
      heroTextShadow: true,
      heroShowText: true,
      heroShowSubtitle: true
    };
    set(defaults);
    if (window.api?.settings) {
      for (const [k, v] of Object.entries(defaults)) {
        await window.api.settings.set(k, String(v));
      }
    }
  },

  setCustomHeroBanner: async (dataUrl) => {
    try {
      if (window.api?.images?.saveHeroBanner) {
        await window.api.images.saveHeroBanner(dataUrl);
      }
      set({ heroBgType: 'custom', heroCustomBg: dataUrl });
      if (window.api?.settings) {
        await window.api.settings.set('heroBgType', 'custom');
        await window.api.settings.set('heroCustomBg', 'custom_hero_banner.jpg');
      }
    } catch (err) {
      console.error('Failed to set custom hero banner:', err);
    }
  },

  setHomeShowStats: async (val) => {
    set({ homeShowStats: val });
    if (window.api?.settings) await window.api.settings.set('homeShowStats', String(val));
  },

  setHomeShowLatest: async (val) => {
    set({ homeShowLatest: val });
    if (window.api?.settings) await window.api.settings.set('homeShowLatest', String(val));
  },

  setHomeShowDownloaded: async (val) => {
    set({ homeShowDownloaded: val });
    if (window.api?.settings) await window.api.settings.set('homeShowDownloaded', String(val));
  },

  setHomeShowUpdates: async (val) => {
    set({ homeShowUpdates: val });
    if (window.api?.settings) await window.api.settings.set('homeShowUpdates', String(val));
  },

  setConflictSensitivity: async (val) => {
    set({ conflictSensitivity: val });
    if (window.api?.settings) await window.api.settings.set('conflictSensitivity', val);
  },

  setBackupRetention: async (val) => {
    set({ backupRetention: val });
    if (window.api?.settings) await window.api.settings.set('backupRetention', val);
  },

  setModUpdateMode: async (mode) => {
    set({ modUpdateMode: mode });
    if (window.api?.settings) await window.api.settings.set('modUpdateMode', mode);
    if (mode === 'auto') {
      import('./useLocalModsStore').then(s => {
        s.useLocalModsStore.getState().triggerAutoUpdateIfNeeded();
      }).catch(console.error);
    }
  },

  setLastUpdateCheck: async (timestamp) => {
    set({ lastUpdateCheck: timestamp });
    if (window.api?.settings) await window.api.settings.set('lastUpdateCheck', String(timestamp));
  },

  setLastGlobalWarming: async (timestamp) => {
    set({ lastGlobalWarming: timestamp });
    if (window.api?.settings) await window.api.settings.set('lastGlobalWarming', String(timestamp));
  },
  
  setFavouritesZoom: async (val) => {
    set({ favouritesZoom: val });
    if (window.api?.settings) await window.api.settings.set('favouritesZoom', String(val));
  },

  toggleHiddenFolder: async (folderName) => {
    set((state) => {
      const newHidden = state.hiddenFolders.includes(folderName)
        ? state.hiddenFolders.filter(f => f !== folderName)
        : [...state.hiddenFolders, folderName];
      if (window.api?.settings) {
        window.api.settings.set('hiddenFolders', JSON.stringify(newHidden)).catch(console.error);
      }
      return { hiddenFolders: newHidden };
    });
  },
  
  setHasSeenGuide: async (val) => {
    set({ hasSeenGuide: val });
    if (window.api?.settings) await window.api.settings.set('hasSeenGuide', String(val));
  },
  
  setTourVersion: async (version) => {
    set({ tourVersion: version });
    if (window.api?.settings) await window.api.settings.set('tourVersion', version);
  },
  
  setInstalledModsViewMode: async (mode) => {
    set({ installedModsViewMode: mode });
    if (window.api?.settings) await window.api.settings.set('installedModsViewMode', mode);
  },
  
  setFolderOrder: async (newOrder) => {
    set({ folderOrder: newOrder });
    if (window.api?.settings) await window.api.settings.set('folderOrder', JSON.stringify(newOrder));
  },

  setFolderZoom: async (folderName, zoom) => {
    set((state) => {
      const newZooms = { ...state.folderZooms, [folderName]: zoom };
      if (window.api?.settings) window.api.settings.set('folderZooms', JSON.stringify(newZooms)).catch(console.error);
      return { folderZooms: newZooms };
    });
  },

  setIsInternalDragging: (val) => set({ isInternalDragging: val }),

  toggleIconOnlyFolder: async (folderName) => {
    set((state) => {
      const newIconOnly = state.iconOnlyFolders.includes(folderName)
        ? state.iconOnlyFolders.filter(f => f !== folderName)
        : [...state.iconOnlyFolders, folderName];
      if (window.api?.settings) window.api.settings.set('iconOnlyFolders', JSON.stringify(newIconOnly)).catch(console.error);
      return { iconOnlyFolders: newIconOnly };
    });
  },

  setFavouritesIconOnly: async (val) => {
    set({ favouritesIconOnly: val });
    if (window.api?.settings) await window.api.settings.set('favouritesIconOnly', String(val));
  },

  setModHubZoom: async (zoom) => {
    set({ modHubZoom: zoom });
    if (window.api?.settings) await window.api.settings.set('modHubZoom', String(zoom));
  },
  
  setModHubIconOnly: async (val) => {
    set({ modHubIconOnly: val });
    if (window.api?.settings) await window.api.settings.set('modHubIconOnly', String(val));
  },

  setSkipDeleteConfirm: async (val) => {
    set({ skipDeleteConfirm: val });
    if (window.api?.settings) await window.api.settings.set('skipDeleteConfirm', String(val));
  },

  setBadgeDuration: async (val) => {
    set({ badgeDuration: val });
    if (window.api?.settings) await window.api.settings.set('badgeDuration', val);
  },

  setExpandedFolder: async (folderName, isExpanded) => {
    set((state) => {
      const newExpanded = { ...state.expandedFolders, [folderName]: isExpanded };
      if (window.api?.settings) window.api.settings.set('expandedFolders', JSON.stringify(newExpanded)).catch(console.error);
      return { expandedFolders: newExpanded };
    });
  },

  collapseAllFolders: async (allFolderNames = []) => {
    set((state) => {
      const newExpanded = { ...state.expandedFolders };
      if (Array.isArray(allFolderNames)) {
        allFolderNames.forEach(f => {
          newExpanded[f] = false;
        });
      }
      Object.keys(newExpanded).forEach(k => {
        newExpanded[k] = false;
      });
      if (window.api?.settings) window.api.settings.set('expandedFolders', JSON.stringify(newExpanded)).catch(console.error);
      return { expandedFolders: newExpanded };
    });
  },

  expandAllFolders: async (allFolderNames = []) => {
    set((state) => {
      const newExpanded = { ...state.expandedFolders };
      if (Array.isArray(allFolderNames)) {
        allFolderNames.forEach(f => {
          newExpanded[f] = true;
        });
      }
      Object.keys(newExpanded).forEach(k => {
        newExpanded[k] = true;
      });
      if (window.api?.settings) window.api.settings.set('expandedFolders', JSON.stringify(newExpanded)).catch(console.error);
      return { expandedFolders: newExpanded };
    });
  },

  setShowTagBar: async (val) => {
    set({ showTagBar: val });
    if (window.api?.settings) await window.api.settings.set('showTagBar', String(val)).catch(console.error);
  },

  setInstalledTagFilter: (tags) => set({ installedTagFilter: tags }),

  setSelectiveLoading: async (val) => {
    set({ selectiveLoading: val });
    if (window.api?.settings) await window.api.settings.set('selectiveLoading', String(val));
  },

  setNickname: async (nickname) => {
    set({ nickname });
    if (window.api?.settings) await window.api.settings.set('nickname', nickname);
  },
}));
