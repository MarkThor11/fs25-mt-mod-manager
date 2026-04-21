const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // Images
  images: {
    proxy: (url) => ipcRenderer.invoke('images:proxy', url),
  },

  // Categories
  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
  },

  // ModHub
  modhub: {
    fetchMods: (params) => ipcRenderer.invoke('modhub:fetchMods', params),
    fetchModDetail: (params) => ipcRenderer.invoke('modhub:fetchModDetail', params),
    fetch: (params) => ipcRenderer.invoke('modhub:fetch', params),
    search: (params) => ipcRenderer.invoke('modhub:search', params),
    fetchByAuthor: (params) => ipcRenderer.invoke('modhub:fetchByAuthor', params),
    openInBrowser: (modId) => ipcRenderer.invoke('modhub:openInBrowser', modId),
    getStats: () => ipcRenderer.invoke('modhub:getStats'),
    getPersistentCache: () => ipcRenderer.invoke('modhub:getPersistentCache'),
    setPersistentCache: (data) => ipcRenderer.invoke('modhub:setPersistentCache', data),
    getBatchDetails: (modIds) => ipcRenderer.invoke('modhub:getBatchDetails', modIds),
  },

  // Mod Installation
  mods: {
    install: (params) => ipcRenderer.invoke('mods:install', params),
    uninstall: (params) => ipcRenderer.invoke('mods:uninstall', params),
    getIcon: (data) => ipcRenderer.invoke('mods:getIcon', data),
    setCustomCategory: (modId, category) => ipcRenderer.invoke('mods:setCustomCategory', { modId, category }),
    syncMetadata: () => ipcRenderer.invoke('mods:syncMetadata'),
    createFolder: (folderName) => ipcRenderer.invoke('mods:createFolder', folderName),
    renameFolder: (oldName, newName) => ipcRenderer.invoke('mods:renameFolder', { oldName, newName }),
    deleteFolder: (folderName) => ipcRenderer.invoke('mods:deleteFolder', folderName),
    moveModsToFolder: (data) => ipcRenderer.invoke('mods:moveModsToFolder', data),
    detectPath: () => ipcRenderer.invoke('mods:detectPath'),
    detectAllPaths: () => ipcRenderer.invoke('mods:detectAllPaths'),
    installLocal: (filePaths) => ipcRenderer.invoke('mods:installLocal', filePaths),
    clearCache: () => ipcRenderer.invoke('mods:clearCache'),
    setTags: (identifier, tags) => ipcRenderer.invoke('mods:setTags', { identifier, tags }),
    batchInstall: (modList) => ipcRenderer.invoke('mods:batchInstall', modList),
    probePath: (path) => ipcRenderer.invoke('mods:probePath', path),
    checkBakExists: (filePath) => ipcRenderer.invoke('mods:checkBakExists', filePath),
  },

  // Local Mods
  localMods: {
    scan: (force = false) => ipcRenderer.invoke('localMods:scan', force),
    checkUpdates: () => ipcRenderer.invoke('localMods:checkUpdates'),
    updateMod: (params) => ipcRenderer.invoke('localMods:updateMod', params),
    restoreVersion: (params) => ipcRenderer.invoke('localMods:restoreVersion', params),
    autoInstallDependencies: (params) => ipcRenderer.invoke('localMods:autoInstallDependencies', params),
  },

  // Radio
  radio: {
    getRadios: () => ipcRenderer.invoke('radio:getRadios'),
    add: (href) => ipcRenderer.invoke('radio:add', href),
    remove: (href) => ipcRenderer.invoke('radio:remove', href),
    search: (query) => ipcRenderer.invoke('radio:search', query),
  },

  // Savegames
  savegames: {
    getAll: () => ipcRenderer.invoke('savegames:getAll'),
    rename: (params) => ipcRenderer.invoke('savegames:rename', params),
    getMods: (params) => ipcRenderer.invoke('savegames:getMods', params),
    setMods: (params) => ipcRenderer.invoke('savegames:setMods', params),
    create: (params) => ipcRenderer.invoke('savegames:create', params),
    delete: (params) => ipcRenderer.invoke('savegames:delete', params),
    getInstalledMods: () => ipcRenderer.invoke('savegames:getInstalledMods'),
    archive: (params) => ipcRenderer.invoke('savegames:archive', params),
    getArchives: () => ipcRenderer.invoke('savegames:getArchives'),
    restore: (params) => ipcRenderer.invoke('savegames:restore', params),
    swapToSlot: (params) => ipcRenderer.invoke('savegames:swapToSlot', params),
    deleteArchive: (params) => ipcRenderer.invoke('savegames:deleteArchive', params),
    renameArchive: (params) => ipcRenderer.invoke('savegames:renameArchive', params),
    ingest: () => ipcRenderer.invoke('savegames:ingest'),
    adoptTemplate: (saveIndex) => ipcRenderer.invoke('savegame:adoptTemplate', saveIndex),
    updateAttribute: (params) => ipcRenderer.invoke('savegames:updateAttribute', params),
    updateFleetMaintenance: (params) => ipcRenderer.invoke('savegames:updateFleetMaintenance', params),
    getTransferData: (params) => ipcRenderer.invoke('savegames:getTransferData', params),
    executeTransfer: (params) => ipcRenderer.invoke('savegames:executeTransfer', params),
    syncToCloud: (params) => ipcRenderer.invoke('savegames:syncToCloud', params),
    import: (params) => ipcRenderer.invoke('savegames:import', params),
  },

  // Profiles
  profiles: {
    get: () => ipcRenderer.invoke('profiles:get'),
    create: (params) => ipcRenderer.invoke('profiles:create', params),
    update: (params) => ipcRenderer.invoke('profiles:update', params),
    delete: (params) => ipcRenderer.invoke('profiles:delete', params),
    export: (id) => ipcRenderer.invoke('profiles:export', { id }),
    import: () => ipcRenderer.invoke('profiles:import'),
  },

  // Game
  game: {
    launch: (options) => ipcRenderer.invoke('game:launch', options),
    detectPath: () => ipcRenderer.invoke('game:detectPath'),
    isRunning: () => ipcRenderer.invoke('game:isRunning'),
  },

  // Maps
  maps: {
    getTemplates: () => ipcRenderer.invoke('maps:getTemplates'),
    deleteTemplate: (folderName) => ipcRenderer.invoke('maps:deleteTemplate', folderName),
    checkTemplate: (mapId, mapTitle, modName) => ipcRenderer.invoke('maps:checkTemplate', mapId, mapTitle, modName),
  },

  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // Shell
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  },

  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  },

  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    selectFile: (params) => ipcRenderer.invoke('dialog:selectFile', params),
  },

  // Cache
  cache: {
    clear: () => ipcRenderer.invoke('cache:clear'),
  },
  
  // System
  system: {
    getSpecs: () => ipcRenderer.invoke('system:getSpecs'),
    optimizeGraphics: () => ipcRenderer.invoke('system:optimizeGraphics'),
    optimizeRevert: () => ipcRenderer.invoke('system:optimizeRevert'),
    setHighPerformancePlan: () => ipcRenderer.invoke('system:setHighPerformancePlan'),
  },

  // Event listeners
  on: {
    downloadProgress: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('download:progress', handler);
      return () => ipcRenderer.removeListener('download:progress', handler);
    },
    gameExited: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('game:exited', handler);
      return () => ipcRenderer.removeListener('game:exited', handler);
    },
    dependencyProgress: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('dependency:progress', handler);
      return () => ipcRenderer.removeListener('dependency:progress', handler);
    },
    downloadStatus: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('download:status', handler);
      return () => ipcRenderer.removeListener('download:status', handler);
    },
    moveProgress: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('move:progress', handler);
      return () => ipcRenderer.removeListener('move:progress', handler);
    },
    appUpdateAvailable: (callback) => {
      const handler = (_, info) => callback(info);
      ipcRenderer.on('app:update-available', handler);
      return () => ipcRenderer.removeListener('app:update-available', handler);
    },
    appUpdateDownloaded: (callback) => {
      const handler = (_, info) => callback(info);
      ipcRenderer.on('app:update-downloaded', handler);
      return () => ipcRenderer.removeListener('app:update-downloaded', handler);
    },
    appUpdateProgress: (callback) => {
      const handler = (_, progress) => callback(progress);
      ipcRenderer.on('app:update-progress', handler);
      return () => ipcRenderer.removeListener('app:update-progress', handler);
    },
    appUpdateError: (callback) => {
      const handler = (_, error) => callback(error);
      ipcRenderer.on('app:update-error', handler);
      return () => ipcRenderer.removeListener('app:update-error', handler);
    },
  },

  // App Update Methods
  appUpdate: {
    check: () => ipcRenderer.invoke('app:check-for-update'),
    download: () => ipcRenderer.invoke('app:download-update'),
    install: () => ipcRenderer.invoke('app:install-update'),
  },
});
