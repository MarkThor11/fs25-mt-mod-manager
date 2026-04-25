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
  homeShowStats: true,
  homeShowLatest: true,
  homeShowDownloaded: true,
  homeShowUpdates: true,
  modUpdateMode: 'manual', // 'manual' or 'auto'
  lastUpdateCheck: 0,
  lastGlobalWarming: 0,
  conflictSensitivity: 'warn',
  backupRetention: '1w',
  isLoaded: false,
  hasSeenGuide: false,
  tourVersion: '0.0.0',
  cloudBackupPath: '',
  installedModsViewMode: 'list',
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
  selectiveLoading: true,
  nickname: '',

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
        homeShowStats: settings.homeShowStats !== 'false',
        homeShowLatest: settings.homeShowLatest !== 'false',
        homeShowDownloaded: settings.homeShowDownloaded !== 'false',
        homeShowUpdates: settings.homeShowUpdates !== 'false',
        modUpdateMode: settings.modUpdateMode || 'manual',
        lastUpdateCheck: parseInt(settings.lastUpdateCheck || '0'),
        lastGlobalWarming: parseInt(settings.lastGlobalWarming || '0'),
        conflictSensitivity: settings.conflictSensitivity || 'warn',
        backupRetention: settings.backupRetention || '1w',
        hasSeenGuide: settings.hasSeenGuide === 'true',
        tourVersion: settings.tourVersion || '0.0.0',
        cloudBackupPath: settings.cloudBackupPath || '',
        installedModsViewMode: settings.installedModsViewMode || 'list',
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
        selectiveLoading: settings.selectiveLoading !== 'false',
        nickname: settings.nickname || '',
        isLoaded: true,
      });
    } catch (err) {
      console.error('Failed to load settings:', err);
      set({ isLoaded: true });
    }
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

  setSelectiveLoading: async (val) => {
    set({ selectiveLoading: val });
    if (window.api?.settings) await window.api.settings.set('selectiveLoading', String(val));
  },

  setNickname: async (nickname) => {
    set({ nickname });
    if (window.api?.settings) await window.api.settings.set('nickname', nickname);
  },
}));
