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
const inputBindingManager = require('./services/inputBindingManager');
const { initAppUpdater } = require('./services/appUpdater');
const CATEGORIES = require('./resources/data/categories');
const isDev = !app.isPackaged;

function debugLog(msg) {
  try {
    const userDataPath = (app && app.getPath) ? app.getPath('userData') : path.join(process.env.APPDATA, 'fs25-mt-mod-manager');
    const logPath = path.join(userDataPath, 'detection_log.txt');
    fs.appendFile(logPath, `[${new Date().toISOString()}] [MAIN] ${msg}\n`, 'utf8', () => {});
  } catch (e) {}
}

// Increase V8 JavaScript Heap allocation limit to 8GB to handle scanning thousands of large map ZIPs
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

// Enforce single-instance lock to prevent process collisions
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Register radio-proxy and mod-icon as privileged
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
  },
  { 
    scheme: 'mod-icon', 
    privileges: { 
      standard: true, 
      secure: true, 
      bypassCSP: true, 
      supportFetchAPI: true,
      corsEnabled: true 
    } 
  }
]);

// Register protocol handlers
app.whenReady().then(() => {
  if (protocol.handle) {
    // Radio stream proxy
    protocol.handle('radio-proxy', async (request) => {
      try {
        let url = request.url.replace('radio-proxy://', '');
        if (url.startsWith('https/')) url = url.replace('https/', 'https://');
        else if (url.startsWith('http/')) url = url.replace('http/', 'http://');
        
        console.log('[RADIO-PROXY] Streaming:', url);
        
        const response = await net.fetch(url, {
          headers: { 'User-Agent': 'FS25-MT-Mod-Manager/1.0.10' },
          redirect: 'follow'
        });

        return response;
      } catch (err) {
        console.error('[RADIO-PROXY] Error:', err);
        return new Response(err.message, { status: 500 });
      }
    });

    // In-memory icon buffer cache to avoid repetitive SQLite disk reads during fast scrolling
    const iconBufferCache = new Map();
    const MAX_ICON_CACHE_SIZE = 1500;

    // Mod icon local stream protocol
    protocol.handle('mod-icon', async (request) => {
      try {
        const urlObj = new URL(request.url);
        let filePath = urlObj.searchParams.get('path');
        
        if (!filePath) {
           return new Response('Not Found', { status: 404 });
        }

        // 0. Check In-Memory Fast Cache
        if (iconBufferCache.has(filePath)) {
          return new Response(iconBufferCache.get(filePath), {
            headers: { 'Content-Type': 'image/png' }
          });
        }

        // 1. Check SQLite Cache
        const cached = cache.getLocalModCache(filePath);
        if (cached && cached.icon_base64 && !cached.icon_base64.startsWith('CATEGORY:')) {
          const base64Data = cached.icon_base64.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          if (iconBufferCache.size >= MAX_ICON_CACHE_SIZE) {
            const firstKey = iconBufferCache.keys().next().value;
            iconBufferCache.delete(firstKey);
          }
          iconBufferCache.set(filePath, buffer);
          return new Response(buffer, {
            headers: { 'Content-Type': 'image/png' }
          });
        }

        // 2. Extract on the fly if not in cache (Browser lazy-loading naturally staggers this)
        const base64 = await modManager.getModIcon(filePath);
        if (base64) {
          cache.updateLocalModIcon(filePath, base64);
          if (!base64.startsWith('CATEGORY:')) {
            const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            if (iconBufferCache.size >= MAX_ICON_CACHE_SIZE) {
              const firstKey = iconBufferCache.keys().next().value;
              iconBufferCache.delete(firstKey);
            }
            iconBufferCache.set(filePath, buffer);
            return new Response(buffer, {
              headers: { 'Content-Type': 'image/png' }
            });
          }
        }
        
        return new Response('Not Found', { status: 404 });
      } catch (err) {
        console.error('[MOD-ICON] Error:', err);
        return new Response('Internal Server Error', { status: 500 });
      }
    });
  }
});

app.commandLine.appendSwitch('bypass-app-block-list');

// ── Stability Handlers ──
process.on('uncaughtException', (error) => {
  console.error('CRITICAL: Uncaught Exception:', error);
  if (!mainWindow && app && !app.isReady()) {
    try {
      dialog.showErrorBox('Critical Startup Error', `The application encountered a fatal error and could not start:\n\n${error?.stack || error?.message || error}`);
    } catch (e) {}
  }
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
    show: true,
  });

  const appFullscreen = cache.getSetting('appFullscreen') !== 'false';
  if (appFullscreen) {
    mainWindow.maximize();
  }
  mainWindow.show();

  let logBuffer = [];
  let isWritingLog = false;
  const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB cap

  const flushLogBuffer = () => {
    if (logBuffer.length === 0 || isWritingLog) return;
    isWritingLog = true;
    const chunk = logBuffer.join('');
    logBuffer = [];

    try {
      const logPath = path.join(app.getPath('userData'), 'renderer_console.log');
      fs.stat(logPath, (err, stats) => {
        const doAppend = () => {
          fs.appendFile(logPath, chunk, 'utf8', () => {
            isWritingLog = false;
            if (logBuffer.length > 0) flushLogBuffer();
          });
        };

        if (!err && stats && stats.size > MAX_LOG_SIZE) {
          fs.writeFile(logPath, '[LOG ROTATED]\n', 'utf8', doAppend);
        } else {
          doAppend();
        }
      });
    } catch (e) {
      isWritingLog = false;
    }
  };

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (isDev) {
      console.log(`[Renderer] [L${level}] [${path.basename(sourceId)}:${line}] ${message}`);
    }
    logBuffer.push(`[Renderer] [L${level}] [${path.basename(sourceId)}:${line}] ${message}\n`);
    flushLogBuffer();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.once('did-finish-load', () => {
      // Open DevTools detached
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
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

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('CRITICAL: Renderer process terminated:', details);
    debugLog(`[CRASH] Renderer process gone: ${details.reason} (exitCode: ${details.exitCode})`);
  });

  app.on('child-process-gone', (event, details) => {
    console.error('CRITICAL: Child process terminated:', details);
    debugLog(`[CRASH] Child process gone: ${details.type} - ${details.reason} (exitCode: ${details.exitCode})`);
  });

  // Set up download status broadcaster
  modManager.setBroadcastStatus((modId, status, extraData) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        if (typeof modId === 'string' && (modId === 'dependency:progress' || modId === 'move:progress')) {
          mainWindow.webContents.send(modId, status);
        } else {
          mainWindow.webContents.send('download:status', { modId, status, ...(typeof extraData === 'object' ? extraData : {}) });
        }
      }
    } catch (_) {}
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

  const fetchImage = (targetUrl) => {
    return new Promise((resolve) => {
      let timeoutId = null;
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(result);
      };

      timeoutId = setTimeout(() => {
        try { request.abort(); } catch (_) {}
        finish(targetUrl);
      }, 5000);

      const request = net.request({ url: targetUrl, method: 'GET' });
      request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
      request.setHeader('Referer', 'https://www.farming-simulator.com/');
      request.setHeader('Accept', 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');

      request.on('response', (response) => {
        if (response.statusCode >= 400) {
          finish(targetUrl);
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', () => finish(targetUrl));
        response.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const type = response.headers['content-type'] || 'image/jpeg';
            const base64 = `data:${type};base64,${buffer.toString('base64')}`;
            
            // 2. Save to Cache
            cache.setRemoteImage(targetUrl, base64);
            finish(base64);
          } catch (_) {
            finish(targetUrl);
          }
        });
      });
      request.on('error', () => finish(targetUrl));
      request.end();
    });
  };

  return await fetchImage(url);
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

ipcMain.handle('system:getDiskSpace', async (_, targetPath) => {
  try {
    if (!targetPath || !fs.existsSync(targetPath)) return null;
    const stats = fs.statfsSync(targetPath);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bfree) * Number(stats.bsize);
    const usedBytes = totalBytes - freeBytes;
    const percentUsed = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    return { totalBytes, freeBytes, usedBytes, percentUsed };
  } catch (err) {
    return null;
  }
});



// ── ModHub scraping ──
ipcMain.handle('modhub:fetchMods', async (event, params) => {
  const { filter, page = 0, bustCache = false } = params || {};
  const f = filter || 'latest';
  console.log(`[IPC] ModHub request received: FILTER=${f}, PAGE=${page}, bustCache=${bustCache}`);
  try {
    const cacheKey = `mods_${f}_${page}`;
    if (!bustCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        console.log(`[IPC] ModHub list served from cache: filter=${f}, page=${page}`);
        return cached;
      }
    }

    const result = await scraper.fetchModList(f, page, bustCache);
    
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

    // Dynamic TTL:
    // Feeds (latest, downloads, rating) update frequently; page 0/1 should never be locked for 24 hours.
    let ttl = 15 * 60 * 1000; // 15 mins default
    if (f === 'latest') {
      ttl = (page === 0) ? 3 * 60 * 1000 : (page === 1 ? 5 * 60 * 1000 : 15 * 60 * 1000);
    } else if (page === 0) {
      ttl = 5 * 60 * 1000;
    }

    cache.set(cacheKey, result, ttl);
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
      if (cached && cached.downloadUrl) {
        if (!cached.fileName) {
          cached.fileName = cached.downloadUrl.split('/').pop().split('?')[0];
          cache.set(cacheKey, cached, 7 * 24 * 60 * 60 * 1000);
        }
        return cached;
      }
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
    
    // Clear download state completely to trigger full refresh on client ONLY if not queued
    if (result && result.success && !result.queued) {
      mainWindow?.webContents.send('download:status', { 
        modId, 
        status: 'success',
        fileName: result.fileName,
        subFolder: result.subFolder
      });
      // Tell renderer to rescan
      setTimeout(() => mainWindow?.webContents.send('scanner:complete'), 1000);
    }
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

ipcMain.handle('mods:getPending', async () => {
  const pending = cache.getPendingDownloads();
  const pool = cache.getModHubMetadataPool();
  return pending
    .filter(item => item && (item.received_bytes || 0) > 0)
    .map(item => {
      let title = item.mod_title;
      const strId = String(item.mod_id);
      if (!title || title === `Mod ${strId}` || title === strId) {
        if (pool[strId]?.title) title = pool[strId].title;
      }
      return { ...item, mod_title: title };
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
    const fs = require('fs-extra');
    const path = require('path');
    const modsPath = modManager.getModsPath ? modManager.getModsPath() : null;
    const fileName = path.basename(filePath);
    const dedicatedBakPath = modsPath ? path.join(modsPath, 'backups', `${fileName}.bak`) : null;
    const legacyBakPath = filePath + '.bak';

    return (dedicatedBakPath && fs.existsSync(dedicatedBakPath)) || fs.existsSync(legacyBakPath);
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

let activeIconRequests = 0;
const iconQueue = [];

async function enqueueIconRequest(task) {
  return new Promise((resolve, reject) => {
    iconQueue.push({ task, resolve, reject });
    processIconQueue();
  });
}

async function processIconQueue() {
  if (activeIconRequests >= 2 || iconQueue.length === 0) return;
  activeIconRequests++;
  const { task, resolve, reject } = iconQueue.shift();
  try {
    // Yield to event loop to keep the Electron main thread perfectly responsive
    await new Promise(r => setTimeout(r, 15)); 
    const result = await task();
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    activeIconRequests--;
    processIconQueue();
  }
}

ipcMain.handle('mods:getIcon', async (_, { filePath, iconFile }) => {
  try {
    if (!filePath) return null;

    // CHECK CACHE FIRST (but ignore placeholders, we want the real image)
    const cached = cache.getLocalModCache(filePath);
    if (cached && cached.icon_base64 && !cached.icon_base64.startsWith('CATEGORY:')) {
      return cached.icon_base64;
    }

    // Enqueue the extraction to prevent `adm-zip` from synchronously freezing the main thread
    return enqueueIconRequest(async () => {
      const base64 = await modManager.getModIcon(filePath, iconFile);
      if (base64 && base64 !== 'CATEGORY:generic' && !base64.startsWith('CATEGORY:')) {
        // PERSIST DECODED IMAGE TO CACHE
        cache.updateLocalModIcon(filePath, base64);
      }
      return base64;
    });
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

ipcMain.handle('mods:consolidateDependencies', async () => {
  try {
    return await modManager.consolidateDependencies((progress) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.webContents.send('consolidate:progress', progress);
    });
  } catch (err) {
    console.error('[IPC] consolidateDependencies failed:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('mods:getMapDepsFolder', () => {
  return modManager.MAP_DEPENDENCIES_FOLDER;
});

ipcMain.handle('mods:moveModsToFolder', async (_, args) => {
  const { fileNames, destinationFolder, targetRootPath } = args || {};
  console.log(`[IPC] mods:moveModsToFolder: Moving ${Array.isArray(fileNames) ? fileNames.length : 0} mods to "${destinationFolder}" (Root: ${targetRootPath || 'Primary'})`);
  
  if (!Array.isArray(fileNames)) {
    console.error('[IPC] mods:moveModsToFolder: TypeError - fileNames is not an array. Received:', typeof fileNames, args);
    return { success: false, error: 'Invalid file list: expected array' };
  }
  
  return await modManager.moveModsToFolder(fileNames, destinationFolder, targetRootPath);
});

ipcMain.handle('mods:moveFolderToDrive', async (_, args) => {
  const { sourceFolderName, targetRootPath, targetFolderName, fileNames } = args || {};
  console.log(`[IPC] mods:moveFolderToDrive: Moving folder "${sourceFolderName}" to target root "${targetRootPath}" as "${targetFolderName || sourceFolderName}" (${Array.isArray(fileNames) ? fileNames.length : 0} explicit files)`);
  return await modManager.moveFolderToDrive(sourceFolderName, targetRootPath, targetFolderName, fileNames);
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

ipcMain.handle('localMods:flattenSubfolders', async () => {
  try {
    return await modManager.flattenSubfolders();
  } catch (err) {
    console.error('Failed to flatten subfolders:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('localMods:deepScanLuaConflicts', async (_, modsToScan) => {
    return await modManager.deepScanLuaConflicts(modsToScan);
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
    const result = await modManager.updateMod(modFileName, modId, (progress) => {
      const progressObj = typeof progress === 'object' ? progress : { percent: progress };
      mainWindow?.webContents.send('download:progress', { modId, progress: progressObj });
    });
    if (result && result.success) {
      mainWindow?.webContents.send('download:status', { modId, status: 'success', fileName: modFileName });
    } else {
      mainWindow?.webContents.send('download:status', { modId, status: 'error', error: result?.error || 'Update failed' });
    }
    return result;
  } catch (err) {
    console.error(`[UPDATE] Error updating ${modFileName}:`, err);
    mainWindow?.webContents.send('download:status', { modId, status: 'error', error: err.message });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('localMods:restoreVersion', async (_, { filePath }) => {
  return await modManager.restoreModVersion(filePath);
});

ipcMain.handle('localMods:getCorruptMods', async () => {
  try {
    return modManager.getCorruptMods();
  } catch (err) {
    console.error('[CORRUPT] getCorruptMods error:', err);
    return [];
  }
});

ipcMain.handle('localMods:repairCorruptMod', async (_, { fileName, modId, allPaths }) => {
  try {
    const result = await modManager.repairCorruptMod(fileName, modId, allPaths, (progress) => {
      const progressObj = typeof progress === 'object' ? progress : { percent: progress };
      mainWindow?.webContents.send('download:progress', { modId, progress: progressObj, isBackground: true });
    });
    if (result && result.success) {
      mainWindow?.webContents.send('download:status', { modId, status: 'success', fileName, isBackground: true });
    } else {
      mainWindow?.webContents.send('download:status', { modId, status: 'error', error: result?.error || 'Repair failed', isBackground: true });
    }
    return result;
  } catch (err) {
    console.error(`[REPAIR] IPC error for ${fileName}:`, err);
    mainWindow?.webContents.send('download:status', { modId, status: 'error', error: err.message, isBackground: true });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('localMods:autoInstallDependencies', async (event, { mods, subFolder, parentId }) => {
  try {
    return await modManager.autoInstallDependencies(mods, (progress) => {
      try {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('dependency:progress', progress);
        }
      } catch (_) {}
    }, subFolder, parentId);
  } catch (err) {
    console.error('[AUTO-INSTALL] Error in autoInstallDependencies IPC handler:', err);
    return { total: mods?.length || 0, installed: 0, failed: mods || [], error: err.message };
  }
});

ipcMain.handle('localMods:autoResolveMapDependencies', async (event, { mapId, targetFolder, mapTitle }) => {
  try {
    if (!mapId) return { success: false, error: 'No mapId provided' };
    const scraper = require('./services/scraper');
    const cache = require('./services/cache');
    
    // 1. Fetch live ModHub details for the map
    let webDeps = [];
    try {
      const detail = await scraper.fetchModDetail(mapId);
      if (detail && Array.isArray(detail.dependencies)) {
        webDeps = detail.dependencies;
      }
    } catch (_) {}

    // 2. Fetch local modDesc dependencies from disk cache
    let localDeps = [];
    try {
      const allLocal = cache.getAllLocalModCache() || [];
      for (const m of allLocal) {
        if (!m) continue;
        let data = {};
        try { data = typeof m.json_data === 'string' ? JSON.parse(m.json_data) : (m.json_data || {}); } catch (_) {}
        const cleanTitle = (data.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanMapTitle = (mapTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isMatch = (data.modId && String(data.modId) === String(mapId)) || 
                        (m.mod_id && String(m.mod_id) === String(mapId)) ||
                        (cleanTitle && cleanMapTitle && cleanTitle === cleanMapTitle);
        if (isMatch && data.dependencies) {
          try {
            const parsed = typeof data.dependencies === 'string' ? JSON.parse(data.dependencies) : data.dependencies;
            if (Array.isArray(parsed)) {
              localDeps = parsed;
              break;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 3. Combine both sources with deduplication
    const combinedDeps = [...webDeps];
    for (const lDep of localDeps) {
      const lTitle = typeof lDep === 'string' ? lDep : (lDep.title || lDep.modName);
      if (!lTitle) continue;
      const cleanL = lTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      const exists = combinedDeps.some(d => {
        const dTitle = typeof d === 'string' ? d : (d.title || d.modName);
        const cleanD = (dTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanD && cleanL && (cleanD === cleanL || cleanD.includes(cleanL) || cleanL.includes(cleanD));
      });
      if (!exists) {
        combinedDeps.push(lDep);
      }
    }

    if (combinedDeps.length === 0) {
      return { success: true, count: 0 };
    }

    console.log(`[AUTO-MAP-DEPS] Processing ${combinedDeps.length} dependencies (${webDeps.length} web, ${localDeps.length} modDesc) for map "${mapTitle || mapId}" into folder "${targetFolder || 'Root'}"...`);

    const result = await modManager.autoInstallDependencies(combinedDeps, (progress) => {
      try {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('dependency:progress', {
            ...progress,
            isBackground: true,
            targetFolder
          });
        }
      } catch (_) {}
    }, targetFolder, mapId);

    return { success: true, count: combinedDeps.length, result };
  } catch (err) {
    console.error('[AUTO-MAP-DEPS] Error in autoResolveMapDependencies:', err);
    return { success: false, error: err.message };
  }
});

// Dedicated handler: install Store Deliveries mod directly from known CDN URL
ipcMain.handle('savegames:downloadStoreDeliveries', async (event) => {
  try {
    const STORE_DELIVERIES_URL = 'https://cdn26.giants-software.com/modHub/storage/00307472/FS25_storeDeliveries.zip';
    const STORE_DELIVERIES_ID = '307472';
    console.log(`[STORE-DELIVERIES] Installing from hardcoded CDN URL: ${STORE_DELIVERIES_URL}`);
    const result = await modManager.installMod(
      STORE_DELIVERIES_ID,
      'Store Deliveries',
      STORE_DELIVERIES_URL,
      (progress) => { event.sender.send('download:progress', { modId: STORE_DELIVERIES_ID, progress }); },
      '',
      null // root mods folder, no subfolder
    );
    return result;
  } catch (err) {
    console.error('[STORE-DELIVERIES] Error:', err);
    return { success: false, error: err.message };
  }
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

ipcMain.handle('savegames:resetPlayerSpawn', async (_, savePath) => {
  return savegameManager.resetPlayerSpawn(savePath);
});

ipcMain.handle('savegames:getMapHomeCoordinates', async (_, savePath) => {
  return await savegames.getMapHomeCoordinates(savePath);
});
ipcMain.handle('savegames:getPlayerPosition', async (_, savePath) => {
  return savegameManager.getPlayerPosition(savePath);
});

ipcMain.handle('savegames:setPlayerPosition', async (_, args) => {
  return savegameManager.setPlayerPosition(args);
});

ipcMain.handle('savegames:getFleetPositions', async (_, { savePath, mapModName }) => {
  return savegameManager.getFleetPositions(savePath, mapModName);
});

ipcMain.handle('savegames:updateNativeEnhancement', async (_, { savePath, includeBridge, includeDeliveries }) => {
  return savegameManager.updateNativeEnhancement(savePath, includeBridge, includeDeliveries);
});

ipcMain.handle('savegames:updateFleetMaintenance', async (_, { savePath, type, value }) => {
  return savegameManager.updateFleetMaintenance(savePath, type, value);
});

ipcMain.handle('savegames:checkStoreDeliveries', async () => {
  return savegameManager.checkStoreDeliveries();
});

ipcMain.handle('savegames:ensureStoreDeliveries', async () => {
  return savegameManager.ensureStoreDeliveries();
});

ipcMain.handle('savegames:getStoreDeliveryCoordinates', async (_, savePath) => {
  return savegameManager.getStoreDeliveryCoordinates(savePath);
});

ipcMain.handle('savegames:getMapShopCoordinates', async (_, savePath) => {
  return savegameManager.getMapShopCoordinates(savePath);
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
ipcMain.handle('radio:launchSpotify', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('start spotify:', (err) => {
        if (!err) {
          return resolve({ success: true, method: 'app' });
        }
        shell.openExternal('spotify:').then(() => {
          resolve({ success: true, method: 'app' });
        }).catch(() => {
          shell.openExternal('https://open.spotify.com').then(() => {
            resolve({ success: true, method: 'web' });
          }).catch((webErr) => {
            resolve({ success: false, error: webErr.message });
          });
        });
      });
    } else {
      shell.openExternal('spotify:').then(() => {
        resolve({ success: true, method: 'app' });
      }).catch(() => {
        shell.openExternal('https://open.spotify.com').then(() => {
          resolve({ success: true, method: 'web' });
        }).catch((webErr) => {
          resolve({ success: false, error: webErr.message });
        });
      });
    }
  });
});

// ── Keybindings & Input Controls ──
ipcMain.handle('keybinds:get', async () => inputBindingManager.getInputBindings());
ipcMain.handle('keybinds:update', async (_, { actionName, deviceId, oldInput, newInput }) => inputBindingManager.updateBinding(actionName, deviceId, oldInput, newInput));
ipcMain.handle('keybinds:getBackups', async () => inputBindingManager.getBackups());
ipcMain.handle('keybinds:createBackup', async (_, { name }) => inputBindingManager.createBackup(name));
ipcMain.handle('keybinds:restoreBackup', async (_, { fileName }) => inputBindingManager.restoreBackup(fileName));
ipcMain.handle('keybinds:deleteBackup', async (_, { fileName }) => inputBindingManager.deleteBackup(fileName));
ipcMain.handle('keybinds:resetToDefaults', async () => inputBindingManager.resetToDefaults());

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

ipcMain.handle('savegames:getUsedMods', async (_, savePath) => {
  try {
    return await savegameManager.getUsedModsInSavegame(savePath);
  } catch (err) {
    return { usedModNames: [], mapModName: null, error: err.message };
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

ipcMain.handle('savegames:getEngineBackups', async (_, { slotIndex }) => {
  try {
    return await savegameManager.getEngineBackups(slotIndex);
  } catch (err) {
    return { backups: [], error: err.message };
  }
});

ipcMain.handle('savegames:restoreEngineBackup', async (_, { slotIndex, backupFolderName }) => {
  try {
    return await savegameManager.restoreEngineBackup(slotIndex, backupFolderName);
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

ipcMain.handle('savegames:isSavegame', async (_, filePath) => {
  return await savegameManager.isSavegame(filePath);
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
    let exitHandled = false;
    const handleGameExit = async (code = 0) => {
      if (exitHandled) return;
      exitHandled = true;
      console.log(`[LAUNCH] Game exit verified (code ${code}). Running post-game checks...`);

      if (options.savegameIndex) {
        try {
          // Trigger auto-harvesting immediately inside the main process
          await savegameManager.getAllSavegames();
        } catch (harvestErr) {
          console.error('[LAUNCH] Auto-harvesting failed on game exit:', harvestErr);
        }
      }

      // Notify the frontend instantly
      mainWindow?.webContents.send('game:exited', { 
        savegameIndex: options.savegameIndex,
        exitCode: code 
      });
    };

    const launchOptions = {
        ...options,
        onGameExit: () => handleGameExit(0)
    };
    
    console.log(`[LAUNCH] Launching game with mods folder: ${launchOptions.modsPath}`);
    const result = await gameLauncher.launch(launchOptions);
    
    if (result.success && result.child) {
      result.child.on('close', async (code) => {
        // Steam DRM / Detached process guard:
        // When launched via Steam, the initial spawned child often exits immediately (code 0)
        // after delegating to the running Steam client / game instance.
        // Wait briefly and verify whether the game is actually running before declaring exit.
        await new Promise(res => setTimeout(res, 2500));
        const stillRunning = await gameLauncher.isGameRunning();
        if (stillRunning) {
          console.log('[LAUNCH] Initial process detached to background game instance. Deferring exit handling.');
          return;
        }
        await handleGameExit(code);
      });
    }
    
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

ipcMain.handle('game:getStatus', async () => {
  return await gameLauncher.getGameStatus();
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
//  System 
ipcMain.handle('system:checkDevMode', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    // Only works on Windows
    if (process.platform !== 'win32') return resolve(false);
    exec('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense', (error, stdout) => {
      if (error) return resolve(false);
      // Check if it's set to 0x1 (enabled)
      resolve(stdout.includes('0x1'));
    });
  });
});

ipcMain.handle('system:enableDevMode', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ success: false, error: 'Windows only' });
    const psCommand = `Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command \\"New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -PropertyType DWORD -Force; New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock' -Name 'AllowAllTrustedApps' -Value 1 -PropertyType DWORD -Force\\""`;
    exec(psCommand, (error) => {
      if (error) return resolve({ success: false, error: error.message });
      resolve({ success: true });
    });
  });
});

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

  // Security Hardening
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = "default-src 'self' mod-icon: radio-proxy:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: mod-icon:; connect-src 'self' https: ws: radio-proxy:;";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY']
      }
    });
  });

  createWindow();

  // Background initialization tasks (non-blocking)
  setTimeout(() => {
    // Ensure modsDirectoryOverride is disabled on app startup so standalone game launches use standard mods folder
    gameLauncher.isGameRunning().then(running => {
      if (!running) {
        gameLauncher.disableModsDirectoryOverride();
      }
    }).catch(() => {});

    // Ensure all mods stored in dedicated map/category subfolders are mirrored to the primary mods directory
    try {
      const defaultMods = modManager.getDefaultModsPath();
      if (defaultMods) {
        modManager.syncMirrorLinks(defaultMods).catch(err => console.warn('[STARTUP] Subfolder mirror sync warning:', err.message));
      }
    } catch (e) {}
  }, 100);

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    gameLauncher.disableModsDirectoryOverride();
  } catch (e) {}
  cache.close();
});
