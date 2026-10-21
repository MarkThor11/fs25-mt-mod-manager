const { app, ipcMain, BrowserWindow } = require('electron');
const cache = require('./cache');

let updaterInitialized = false;
let autoUpdaterInstance = null;

function getAutoUpdater() {
  if (!autoUpdaterInstance) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdaterInstance = autoUpdater;
    } catch (e) {
      console.error('[UPDATER] Could not load electron-updater:', e.message);
    }
  }
  return autoUpdaterInstance;
}

function isVersionIgnored(version) {
  try {
    const raw = cache.getSetting('ignoredAppVersions');
    const ignored = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ignored) || !version) return false;
    const cleanVer = String(version).trim().replace(/^v/i, '');
    return ignored.some(v => String(v).trim().replace(/^v/i, '') === cleanVer);
  } catch (err) {
    console.error('[UPDATER] Failed to check ignored versions:', err);
    return false;
  }
}

async function getAppReleases() {
  const isMac = process.platform === 'darwin';
  const owner = 'MarkThor11';
  const repo = isMac ? 'fs25-mt-mod-manager-for-mac' : 'fs25-mt-mod-manager';
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'fs25-mt-mod-manager',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return { releases: [], error: 'Invalid response from GitHub' };
    }

    const currentVersion = app?.getVersion ? app.getVersion() : require('../../../package.json').version;
    const cleanCurrent = (currentVersion || '').replace(/^v/i, '');

    const releases = data.map(rel => {
      const tag = rel.tag_name || '';
      const version = tag.replace(/^v/i, '');
      const isCurrent = version === cleanCurrent;

      // Find best installer asset
      let targetAsset = null;
      if (Array.isArray(rel.assets)) {
        if (isMac) {
          targetAsset = rel.assets.find(a => a.name.endsWith('.dmg')) || rel.assets.find(a => a.name.endsWith('.zip'));
        } else {
          targetAsset = rel.assets.find(a => a.name.endsWith('.exe') && !a.name.endsWith('.blockmap'));
        }
        if (!targetAsset && rel.assets.length > 0) {
          targetAsset = rel.assets[0];
        }
      }

      return {
        id: rel.id,
        tagName: tag,
        version,
        name: rel.name || tag,
        body: rel.body || '',
        publishedAt: rel.published_at,
        prerelease: Boolean(rel.prerelease),
        htmlUrl: rel.html_url,
        downloadUrl: targetAsset ? targetAsset.browser_download_url : rel.html_url,
        assetName: targetAsset ? targetAsset.name : null,
        assetSize: targetAsset ? targetAsset.size : null,
        isCurrent,
        isIgnored: isVersionIgnored(version)
      };
    });

    return { releases, currentVersion: cleanCurrent };
  } catch (err) {
    console.error('[UPDATER] Failed to fetch releases:', err);
    return { releases: [], error: err.message };
  }
}

function initAppUpdater(mainWindow, onBeforeQuit) {
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    console.warn('[UPDATER] Auto-updater unavailable in this environment.');
    return;
  }

  // On macOS, updates are hosted in the dedicated Mac releases repo
  if (process.platform === 'darwin') {
    try {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'MarkThor11',
        repo: 'fs25-mt-mod-manager-for-mac'
      });
      console.log('[UPDATER] Feed URL configured for macOS: MarkThor11/fs25-mt-mod-manager-for-mac');
    } catch (e) {
      console.error('[UPDATER] Failed to set macOS feed URL:', e);
    }
  }

  // Ensure autoDownload is false so users control when updates are downloaded
  autoUpdater.autoDownload = false;

  autoUpdater.removeAllListeners('checking-for-update');
  autoUpdater.removeAllListeners('update-available');
  autoUpdater.removeAllListeners('update-not-available');
  autoUpdater.removeAllListeners('error');
  autoUpdater.removeAllListeners('download-progress');
  autoUpdater.removeAllListeners('update-downloaded');

  autoUpdater.on('checking-for-update', () => {
    console.log('[UPDATER] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[UPDATER] Update available:', info.version);
    if (isVersionIgnored(info.version)) {
      console.log(`[UPDATER] Update v${info.version} is ignored by user preference. Skipping popup.`);
      return;
    }
    mainWindow?.webContents.send('app:update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[UPDATER] Update not available.');
  });

  autoUpdater.on('error', (err) => {
    console.error('[UPDATER] Error:', err);
    mainWindow?.webContents.send('app:update-error', err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log('[UPDATER] Download progress:', progressObj.percent);
    mainWindow?.webContents.send('app:update-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[UPDATER] Update downloaded.');
    mainWindow?.webContents.send('app:update-downloaded', info);
  });

  if (updaterInitialized) return;
  updaterInitialized = true;

  // IPC Handlers
  ipcMain.handle('app:check-for-update', async () => {
    try {
      const updater = getAutoUpdater();
      if (!updater) return { error: 'Updater not available' };
      const result = await updater.checkForUpdates();
      if (result && result.updateInfo) {
        return {
          ...result,
          isIgnored: isVersionIgnored(result.updateInfo.version)
        };
      }
      return result;
    } catch (err) {
      console.error('[UPDATER] Check failed:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('app:download-update', async () => {
    try {
      const updater = getAutoUpdater();
      if (!updater) return { error: 'Updater not available' };
      return await updater.downloadUpdate();
    } catch (err) {
      console.error('[UPDATER] Download failed:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('app:install-update', async () => {
    console.log('[UPDATER] Preparing to install update and restart...');
    try {
      if (typeof onBeforeQuit === 'function') {
        await onBeforeQuit();
      }
    } catch (err) {
      console.error('[UPDATER] Cleanup before update failed:', err);
    }

    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        if (!win.isDestroyed()) {
          win.destroy();
        }
      } catch (_) {}
    }

    // Call quitAndInstall with isSilent = false, isForceRunAfter = true
    setTimeout(() => {
      const updater = getAutoUpdater();
      if (updater) {
        updater.quitAndInstall(false, true);
      }
    }, 200);
  });

  ipcMain.handle('app:get-releases', async () => {
    return await getAppReleases();
  });
}

module.exports = { initAppUpdater, getAppReleases, isVersionIgnored };
