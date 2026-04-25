const { app, BrowserWindow, ipcMain, shell, session, dialog, net, protocol, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const scraper = require('./services/scraper');
const cache = require('./services/cache');
const modManager = require('./services/modManager');
const savegameManager = require('./services/savegameManager');
const gameLauncher = require('./services/gameLauncher');
const profileManager = require('./services/profileManager');
const versionManager = require('./services/versionManager');
const externalTracker = require('./services/externalTracker');
const discovery = require('./services/discovery');
const { getSystemSpecs, optimize, optimizeRevert, setHighPerformancePlan } = require('./services/systemOptimizer');
const radioManager = require('./services/radioManager');
const { initAppUpdater } = require('./services/appUpdater');
const CATEGORIES = require('./resources/data/categories');
const isDev = !app.isPackaged;

// Register radio-proxy as privileged
protocol.registerSchemesAsPrivileged([
  { 
    scheme: 'radio-proxy', 
    privileges: { 
      standard: true, 
      secure: true, 
      bypassCSP: true, 
      stream: true, 
      supportFetchAPI: true,
      corsEnabled: true 
    } 
  }
]);

// Register radio-proxy protocol handler
app.whenReady().then(() => {
  if (protocol.handle) {
    protocol.handle('radio-proxy', async (request) => {
      try {
        let url = request.url.replace('radio-proxy://', '');
        if (url.startsWith('https/')) url = url.replace('https/', 'https://');
        else if (url.startsWith('http/')) url = url.replace('http/', 'http://');
        
        console.log('[RADIO-PROXY] Streaming:', url);
        
        const response = await net.fetch(url, {
          headers: { 'User-Agent': 'FS25-MT-Mod-Manager/1.0.9' },
          redirect: 'follow'
        });

        return response;
      } catch (err) {
        console.error('[RADIO-PROXY] Error:', err);
        return new Response(err.message, { status: 500 });
      }
    });
  }
});

app.commandLine.appendSwitch('bypass-app-block-list');

// ── Stability Handlers ──
process.on('uncaughtException', (error) => {
  console.error('CRITICAL: Uncaught Exception:', error);
  try {
    dialog.showErrorBox('Critical Startup Error', `The application encountered a fatal error and could not start:\n\n${error.stack || error.message}`);
  } catch (e) {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      sandbox: true,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });
  
  const appFullscreen = cache.getSetting('appFullscreen') !== 'false';
  if (appFullscreen) {
    mainWindow.maximize();
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Disable DevTools in production
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
    
    // Packaged path: app.asar/src/main/index.js -> dist is at app.asar/dist
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    if (!fs.existsSync(indexPath)) {
      dialog.showErrorBox('Missing Files', `Critical application files are missing.\n\nPath: ${indexPath}\n\nPlease reinstall the application.`);
      app.quit();
      return;
    }
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set up download status broadcaster
  modManager.setBroadcastStatus((modId, status) => {
    mainWindow?.webContents.send('download:status', { modId, status });
  });

  // Initialize App Auto-Updater (Production only)
  if (!isDev) {
    initAppUpdater(mainWindow);

    // Check for updates after 5 seconds
    setTimeout(() => {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify().catch(err => console.error('[UPDATER] Init check failed:', err));
    }, 5000);
  }
}

// ── Window controls ──
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
  return mainWindow?.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());

// ── Images: Proxy for hotlink protection ──
ipcMain.handle('images:proxy', async (_, url) => {
  if (!url || (!url.includes('giants-software.com') && !url.includes('farming-simulator.com'))) return url;
  
  // 1. Check Cache
  const cached = cache.getRemoteImage(url);
  if (cached) return cached;

  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    request.setHeader('Referer', 'https://www.farming-simulator.com/');
    request.on('response', (response) => {
      if (response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const type = response.headers['content-type'] || 'image/jpeg';
        const base64 = `data:${type};base64,${buffer.toString('base64')}`;
        
        // 2. Save to Cache
        cache.setRemoteImage(url, base64);
        
        resolve(base64);
      });
    });
    request.on('error', reject);
    request.end();
  });
});

// ── Categories ──
ipcMain.handle('categories:getAll', () => {
  console.log(`[IPC] Serving ${CATEGORIES.length} categories to renderer.`);
  return CATEGORIES;
});

// ── System Optimization ──
ipcMain.handle('system:getSpecs', async () => {
  return await getSystemSpecs();
});

ipcMain.handle('system:optimizeGraphics', async () => {
  return await optimize();
});

ipcMain.handle('system:optimizeRevert', async () => {
  return await optimizeRevert();
});

ipcMain.handle('system:setHighPerformancePlan', async () => {
  return await setHighPerformancePlan();
});

// ── ModHub scraping ──
ipcMain.handle('modhub:fetchMods', async (event, params) => {
  const { filter, page = 0 } = params || {};
  const f = filter || 'latest';
  console.log(`[IPC] ModHub request received: FILTER=${f}, PAGE=${page}`);
  try {
    const cacheKey = `mods_${f}_${page}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[IPC] ModHub list served from cache: filter=${f}, page=${page}`);
      return cached;
    }

    const result = await scraper.fetchModList(f, page);
    
    // ── INSTANT ENRICHMENT ──
    // Look up each mod in the persistent cache to provide dependencies/techData immediately
    if (result.mods && Array.isArray(result.mods)) {
      result.mods = result.mods.map(m => {
        const detailKey = `modDetail_${m.modId}`;
        const cached = cache.get(detailKey);
        if (cached) {
          // Merge cached details into the listing mod object
          return { ...m, ...cached };
        }
        return m;
      });
    }

    cache.set(cacheKey, result, 24 * 60 * 60 * 1000); // 24hr TTL
    return result;
  } catch (err) {
    console.error('Failed to fetch mods:', err);
    return { mods: [], totalPages: 0, error: err.message };
  }
});

ipcMain.handle('modhub:fetchModDetail', async (_, { modId, bustCache }) => {
  try {
    const cacheKey = `modDetail_${modId}`;
    if (!bustCache) {
      const cached = cache.get(cacheKey);
      // Automatically invalidate the cache if downloadUrl is missing to recover from previous scraper bugs
      if (cached && cached.downloadUrl) return cached;
    }

    const result = await scraper.fetchModDetail(modId);
    cache.set(cacheKey, result, 7 * 24 * 60 * 60 * 1000); // 7 day TTL
    return result;
  } catch (err) {
    console.error('Failed to fetch mod detail:', err);
    return { error: err.message };
  }
});

ipcMain.handle('modhub:getStats', async () => {
  try {
    return await discovery.syncAndGetStats();
  } catch (err) {
    console.error('Failed to fetch ModHub stats:', err);
    return { 
      success: false, 
      error: err.message,
      totalMods: 0,
      newCount: 0,
      updateCount: 0,
      latestCount: 0
    };
  }
});

ipcMain.handle('modhub:fetchByAuthor', async (_, { authorId, page = 0 }) => {
  try {
    const result = await scraper.fetchModsByAuthor(authorId, page);
    return result;
  } catch (err) {
    console.error('Fetch by author failed:', err);
    return { mods: [], totalPages: 0, error: err.message };
  }
});

ipcMain.handle('modhub:fetch', async (_, { filter, page, bustCache }) => {
  try {
    const result = await scraper.fetchModList(filter, page, bustCache);
    return {
      success: true,
      mods: result.mods,
      actualFilter: result.actualFilter, // Pass through the detected actual filter
      pagination: result.pagination
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('modhub:search', async (_, { query, page = 0 }) => {
  console.log(`[IPC] ModHub SEARCH request: QUERY="${query}", PAGE=${page}`);
  try {
    const result = await scraper.searchMods(query, page);
    return result;
  } catch (err) {
    console.error('Search failed:', err);
    return { mods: [], totalPages: 0, error: err.message };
  }
});

ipcMain.handle('modhub:openInBrowser', async (_, modId) => {
  const url = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;
  shell.openExternal(url);
});

ipcMain.handle('modhub:getBatchDetails', async (_, modIds) => {
  if (!Array.isArray(modIds)) return {};
  const results = {};
  modIds.forEach(id => {
    const cached = cache.get(`modDetail_${id}`);
    if (cached) results[id] = cached;
  });
  return results;
});

// ── ModHub Persistent Cache (Transition from localStorage) ──
ipcMain.handle('modhub:getPersistentCache', async () => {
  try {
    // 1. Get the comprehensive metadata pool from SQLite
    const pool = cache.getModHubMetadataPool();
    
    // 2. If it's mostly empty, try to load the bundled seed as fallback
    if (Object.keys(pool).length < 20) {
      const bundledPath = path.join(app.getAppPath(), 'src/main/resources/bundled_cache.json');
      if (fs.existsSync(bundledPath)) {
        console.log('[CACHE] Merging bundled seed cache into pool...');
        const bundledData = await fs.readJson(bundledPath);
        return { ...bundledData, ...pool };
      }
    }

    return pool;
  } catch (err) {
    console.error('Failed to get persistent cache:', err);
    return {};
  }
});

ipcMain.handle('modhub:setPersistentCache', async (_, data) => {
  try {
    // Save to SQLite cache with long TTL
    cache.set('modhub_details_full_cache', data, 30 * 24 * 60 * 60 * 1000); // 30 days
    return { success: true };
  } catch (err) {
    console.error('Failed to set persistent cache:', err);
    return { success: false, error: err.message };
  }
});

// ── Mod Installation ──
ipcMain.handle('mods:install', async (event, { modId, modTitle, downloadUrl, category, subFolder }) => {
  try {
    const result = await modManager.installMod(modId, modTitle, downloadUrl, (progress) => {
      mainWindow?.webContents.send('download:progress', { modId, progress });
    }, category, subFolder);
    return result;
  } catch (err) {
    console.error('Install failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('mods:cancelInstall', async (_, { modId }) => {
  return await modManager.cancelInstall(modId);
});

ipcMain.handle('mods:resumePending', async () => {
  return await modManager.resumePendingDownloads((modId, progress) => {
    mainWindow?.webContents.send('download:progress', { modId, progress });
  });
});

ipcMain.handle('mods:batchInstall', async (_, modList) => {
  return await modManager.batchInstallMods(modList, (progress) => {
    mainWindow?.webContents.send('mods:batchProgress', progress);
  });
});

ipcMain.handle('mods:uninstall', async (_, { modFileName, folder }) => {
  try {
    return await modManager.uninstallMod(modFileName, folder);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('mods:checkBakExists', async (_, filePath) => {
  try {
    const bakPath = filePath + '.bak';
    const fs = require('fs-extra');
    return fs.existsSync(bakPath);
  } catch {
    return false;
  }
});

ipcMain.handle('mods:setCustomCategory', async (_, { modId, category }) => {
  return cache.setCustomCategory(modId, category);
});

ipcMain.handle('mods:setTags', async (_, { identifier, tags }) => {
  return cache.setModTags(identifier, tags);
});

ipcMain.handle('mods:getIcon', async (_, { filePath, iconFile }) => {
  try {
    if (!filePath) return null;

    // ── CHECK CACHE FIRST ──
    const cached = cache.getLocalModCache(filePath);
    if (cached && cached.icon_base64) {
      return cached.icon_base64;
    }

    return await modManager.getModIcon(filePath, iconFile);
  } catch (err) {
    console.error('Failed to get mod icon:', err);
    return null;
  }
});

ipcMain.handle('mods:clearCache', async () => {
  try {
    cache.clearLocalModCache();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('mods:syncMetadata', async () => {
  return await modManager.syncLibraryMetadata();
});

ipcMain.handle('mods:createFolder', async (_, folderName) => {
  return await modManager.createFolder(folderName);
});

ipcMain.handle('mods:renameFolder', async (_, { oldName, newName }) => {
  try {
    return await modManager.renameFolder(oldName, newName);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('mods:deleteFolder', async (_, folderName) => {
  try {
    return await modManager.deleteFolder(folderName);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('mods:moveModsToFolder', async (_, args) => {
  const { fileNames, destinationFolder } = args || {};
  console.log(`[IPC] mods:moveModsToFolder: Moving ${Array.isArray(fileNames) ? fileNames.length : 0} mods to "${destinationFolder}"`);
  
  if (!Array.isArray(fileNames)) {
    console.error('[IPC] mods:moveModsToFolder: TypeError - fileNames is not an array. Received:', typeof fileNames, args);
    return { success: false, error: 'Invalid file list: expected array' };
  }
  
  return await modManager.moveModsToFolder(fileNames, destinationFolder);
});

ipcMain.handle('mods:detectPath', async () => {
  try {
    const path = await modManager.getDefaultModsPath();
    return { path, source: 'auto' };
  } catch (err) {
    return { path: null, error: err.message };
  }
});

ipcMain.handle('mods:detectAllPaths', async () => {
  try {
    const paths = await modManager.detectAllModsPaths();
    return { paths };
  } catch (err) {
    return { paths: [], error: err.message };
  }
});

ipcMain.handle('mods:installLocal', async (_, filePaths) => {
  try {
    return await modManager.installLocalMods(filePaths);
  } catch (err) {
    return { success: [], failed: [{ error: err.message }], total: filePaths.length };
  }
});

// ── Local Mods ──
ipcMain.handle('localMods:scan', async (_, force = false) => {
  try {
    return await modManager.scanLocalMods(null, force);
  } catch (err) {
    console.error('Scan failed:', err);
    return { mods: [], error: err.message };
  }
});

ipcMain.handle('localMods:checkUpdates', async () => {
  try {
    return await versionManager.checkAllUpdates();
  } catch (err) {
    console.error('Update check failed:', err);
    return { updates: [], error: err.message };
  }
});

ipcMain.handle('localMods:updateMod', async (_, { modFileName, modId }) => {
  try {
    return await modManager.updateMod(modFileName, modId, (progress) => {
      mainWindow?.webContents.send('download:progress', { modId, progress });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('localMods:restoreVersion', async (_, { filePath }) => {
  return await modManager.restoreModVersion(filePath);
});

ipcMain.handle('localMods:autoInstallDependencies', async (event, { mods, subFolder, parentId }) => {
  return await modManager.autoInstallDependencies(mods, (progress) => {
    event.sender.send('dependency:progress', progress);
  }, subFolder, parentId);
});

ipcMain.handle('localMods:autoOrganizeMaps', async () => {
  return await modManager.autoOrganizeMaps();
});

// ── Third Party Tracker ──
ipcMain.handle('thirdParty:checkUrl', async (_, { url }) => {
  return await externalTracker.checkUrl(url);
});

ipcMain.handle('thirdParty:findDownloadUrl', async (_, { url }) => {
  return await externalTracker.findDownloadUrl(url);
});



// ── Savegames ──
ipcMain.handle('savegames:getAll', async () => {
  try {
    return await savegameManager.getAllSavegames();
  } catch (err) {
    console.error('Savegame scan failed:', err);
    return { savegames: [], error: err.message };
  }
});

ipcMain.handle('savegames:rename', async (_, { savegamePath, newName }) => {
  try {
    return await savegameManager.renameSavegame(savegamePath, newName);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegames:delete', async (_, { path }) => {
  try {
    return await savegameManager.deleteSavegame(path);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegame:adoptTemplate', async (_, saveIndex) => {
  return savegameManager.adoptSaveAsTemplate(saveIndex);
});

ipcMain.handle('savegames:updateAttribute', async (_, { savePath, fileType, attribute, value }) => {
  return savegameManager.updateSavegameAttribute(savePath, fileType, attribute, value);
});

ipcMain.handle('savegames:updateFleetMaintenance', async (_, { savePath, type, value }) => {
  return savegameManager.updateFleetMaintenance(savePath, type, value);
});

ipcMain.handle('savegames:getTransferData', async (_, { savePath }) => {
  return savegameManager.getSavegameTransferData(savePath);
});

ipcMain.handle('savegames:executeTransfer', async (_, { sourcePath, destPath, options }) => {
  return savegameManager.executeTransfer(sourcePath, destPath, options);
});

ipcMain.handle('savegames:syncToCloud', async (_, { savePath, cloudPath }) => {
  try {
    const fsExtra = require('fs-extra');
    const folderName = path.basename(savePath);
    const destPath = path.join(cloudPath, folderName);
    
    // Check if dest exists, backup old if needed
    if (fs.existsSync(destPath)) {
      const backupPath = `${destPath}_backup_${Date.now()}`;
      fs.renameSync(destPath, backupPath);
    }
    
    await fsExtra.copy(savePath, destPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Map Library ──
ipcMain.handle('maps:getTemplates', async () => {
  return savegameManager.getMapTemplates();
});

ipcMain.handle('maps:deleteTemplate', async (_, folderName) => {
  return savegameManager.deleteMapTemplate(folderName);
});

ipcMain.handle('maps:checkTemplate', async (_, mapId, mapTitle, modName) => {
  return savegameManager.hasMapTemplate(mapId, mapTitle, modName);
});

// ── Radio Manager ──
ipcMain.handle('radio:getRadios', async () => radioManager.getRadios());
ipcMain.handle('radio:add', async (_, station) => radioManager.addRadio(station));
ipcMain.handle('radio:remove', async (_, url) => radioManager.removeRadio(url));
ipcMain.handle('radio:search', async (_, query) => radioManager.searchStations(query));

// ── Mod management ──
ipcMain.handle('savegames:getMods', async (_, { savegamePath }) => {
  try {
    return await savegameManager.getSavegameMods(savegamePath);
  } catch (err) {
    return { mods: [], error: err.message };
  }
});

ipcMain.handle('savegames:setMods', async (_, { savegamePath, mods }) => {
  try {
    return await savegameManager.setSavegameMods(savegamePath, mods);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegames:create', async (_, params) => {
  try {
    const { savegameIndex, savegameName, selectedMods, ...opts } = params;
    return await savegameManager.createSavegameWithMods(savegameIndex, savegameName, selectedMods, opts);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegames:getInstalledMods', async () => {
  try {
    return await savegameManager.getInstalledMods();
  } catch (err) {
    return { mods: [], error: err.message };
  }
});

ipcMain.handle('savegames:archive', async (_, { path }) => {
  try {
    return await savegameManager.archiveSavegame(path);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegames:getArchives', async () => {
  try {
    return await savegameManager.getArchivedSavegames();
  } catch (err) {
    return { archives: [], error: err.message };
  }
});

ipcMain.handle('savegames:restore', async (_, { archivedFolderName, slotIndex }) => {
  try {
    return await savegameManager.restoreSavegame(archivedFolderName, slotIndex);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegames:swapToSlot', async (_, { archivedFolderName, slotIndex }) => {
  try {
    return await savegameManager.swapArchiveToSlot(archivedFolderName, slotIndex);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegames:deleteArchive', async (_, { archivedFolderName }) => {
  try {
    return await savegameManager.deleteArchivedSavegame(archivedFolderName);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegames:import', async (_, { sourcePath, targetIndex }) => {
  return await savegameManager.importSavegame(sourcePath, targetIndex);
});

ipcMain.handle('savegames:renameArchive', async (_, { archivedFolderName, newName }) => {
  try {
    return await savegameManager.renameArchivedSavegame(archivedFolderName, newName);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('savegames:ingest', async () => {
  try {
    await savegameManager.ingestActiveSaves();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Profiles ──
ipcMain.handle('profiles:get', async () => await profileManager.getProfiles());
ipcMain.handle('profiles:create', async (_, { name, mods, options }) => await profileManager.createProfile(name, mods, options));
ipcMain.handle('profiles:update', async (_, { id, name, mods, options }) => await profileManager.updateProfile(id, name, mods, options));
ipcMain.handle('profiles:delete', async (_, { id }) => await profileManager.deleteProfile(id));

ipcMain.handle('profiles:export', async (_, { id }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Game Template',
    defaultPath: `Profile_${id}.fmp`,
    filters: [{ name: 'Farming Mod Profile', extensions: ['fmp', 'json'] }]
  });
  
  if (result.canceled || !result.filePath) return { canceled: true };
  return await profileManager.exportProfile(id, result.filePath);
});

ipcMain.handle('profiles:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Game Template',
    properties: ['openFile'],
    filters: [{ name: 'Farming Mod Profile', extensions: ['fmp', 'json'] }]
  });
  
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return await profileManager.importProfile(result.filePaths[0]);
});

// ── Game Launch ──
ipcMain.handle('game:launch', async (_, options) => {
  try {
    // Automatically include the active mods folder if not provided
    const launchOptions = {
        ...options,
        modsPath: options.modsPath || modManager.getModsPath()
    };
    
    console.log(`[LAUNCH] Launching game with mods folder: ${launchOptions.modsPath}`);
    const result = await gameLauncher.launch(launchOptions);
    return { 
      success: result.success, 
      error: result.error, 
      pid: result.pid,
      needsManualInit: result.needsManualInit 
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('game:isRunning', async () => {
  return await gameLauncher.isGameRunning();
});

ipcMain.handle('game:detectPath', async () => {
  try {
    return await gameLauncher.detectGamePath();
  } catch (err) {
    return { path: null, error: err.message };
  }
});

// ── Settings ──
ipcMain.handle('settings:get', (_, key) => cache.getSetting(key));
ipcMain.handle('settings:set', (_, { key, value }) => cache.setSetting(key, value));
ipcMain.handle('settings:getAll', () => cache.getAllSettings());

// ── Shell ──
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
ipcMain.handle('shell:showItemInFolder', (_, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('shell:openPath', (_, dirPath) => shell.openPath(dirPath));
ipcMain.handle('clipboard:writeText', (_, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
});

ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'dontAddToRecent'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:selectFile', async (_, { filters } = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'dontAddToRecent'],
    filters: filters || [],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── Cache ──
ipcMain.handle('cache:clear', () => {
  cache.clearAll();
  cache.clearLocalModCache();
  return { success: true };
});

ipcMain.handle('mods:probePath', async (event, path) => {
  return await modManager.debugProbePath(path);
});

// ── App lifecycle ──
app.whenReady().then(() => {
  cache.init();

  if (cache.get('mods_best_0')) {
    console.log('[CACHE] Purging stale Top Rated cache...');
    cache.set('mods_best_0', null);
  }

  // APP STARTUP
  // (Removed automated ingestion for native 20-slot system)
  // ── Security Hardening ──
  
  // 1. Content Security Policy (Hardened for Production)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Tightened CSP: removed unsafe-inline where possible, kept fonts/images from trusted sources
    const csp = isDev 
      ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https: ws:;"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:;";
    
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY']
      }
    });
  });

  // 2. Deny all permission requests (Camera, Mic, Location, etc.)
  const ses = session.defaultSession;
  if (ses.setPermissionHandler) {
    ses.setPermissionHandler((webContents, permission, callback) => {
      console.warn(`[SECURITY] Permission denied: ${permission}`);
      callback(false);
    });
  } else if (ses.setPermissionRequestHandler) {
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      console.warn(`[SECURITY] Permission request denied: ${permission}`);
      callback(false);
    });
  }

  // 3. Navigation Restrictions
  app.on('web-contents-created', (event, contents) => {
    // Block all in-app navigation to external sites
    contents.on('will-navigate', (event, navigationUrl) => {
      try {
        const parsedUrl = new URL(navigationUrl);
        // Only allow localhost (dev) or file:// (prod)
        if (parsedUrl.origin !== 'http://localhost:5173' && !navigationUrl.startsWith('file://')) {
          event.preventDefault();
          console.warn(`[SECURITY] Blocked navigation to: ${navigationUrl}`);
          shell.openExternal(navigationUrl);
        }
      } catch (e) {
        event.preventDefault();
        console.error('[SECURITY] Malformed navigation URL blocked:', navigationUrl);
      }
    });

    // Handle link clicks (Open in default browser)
    contents.setWindowOpenHandler(({ url }) => {
      console.log(`[SECURITY] Opening external link: ${url}`);
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // ── Context Menu (Copy/Paste/Cut/SelectAll) ──
    contents.on('context-menu', (event, params) => {
      const menu = new Menu();
      
      // Basic text editing
      if (params.isEditable) {
        menu.append(new MenuItem({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut }));
        menu.append(new MenuItem({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy }));
        menu.append(new MenuItem({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll }));
      } else if (params.selectionText && params.selectionText.trim() !== '') {
        // Just copying from non-editable areas
        menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
      } else {
        // No text context, don't show menu
        return;
      }

      menu.popup({ window: BrowserWindow.fromWebContents(contents) });
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  cache.close();
});
