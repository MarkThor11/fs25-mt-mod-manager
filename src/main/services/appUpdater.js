const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

function initAppUpdater(mainWindow) {
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

  // autoUpdater.autoDownload = false; // We want to control when it downloads

  autoUpdater.on('checking-for-update', () => {
    console.log('[UPDATER] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[UPDATER] Update available:', info.version);
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

  // IPC Handlers
  ipcMain.handle('app:check-for-update', async () => {
    try {
      return await autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('[UPDATER] Check failed:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('app:download-update', async () => {
    try {
      return await autoUpdater.downloadUpdate();
    } catch (err) {
      console.error('[UPDATER] Download failed:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('app:install-update', () => {
    autoUpdater.quitAndInstall();
  });
}

module.exports = { initAppUpdater };
