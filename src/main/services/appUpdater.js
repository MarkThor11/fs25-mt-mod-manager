const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

function initAppUpdater(mainWindow) {
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
