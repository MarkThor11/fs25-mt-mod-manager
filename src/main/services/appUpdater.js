const { app, ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cache = require('./cache');

let updaterInitialized = false;
let autoUpdaterInstance = null;
let latestMacUpdateInfo = null;
let downloadedMacDmgPath = null;

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

async function resolveMacDmgUrl() {
  const version = latestMacUpdateInfo?.version
    ? String(latestMacUpdateInfo.version).replace(/^v/i, '')
    : null;

  // 1. Try GitHub releases API first for exact asset URL and size
  try {
    const { releases } = await getAppReleases();
    if (Array.isArray(releases) && releases.length > 0) {
      const match = version
        ? releases.find(r => r.version === version && r.downloadUrl && r.downloadUrl.endsWith('.dmg'))
        : releases.find(r => r.downloadUrl && r.downloadUrl.endsWith('.dmg'));
      const chosen = match || releases[0];
      if (chosen && chosen.downloadUrl && chosen.downloadUrl.endsWith('.dmg')) {
        return {
          url: chosen.downloadUrl,
          size: chosen.assetSize || 0,
          version: chosen.version,
          fileName: chosen.assetName || `FS25-MT-Mod-Manager-Setup-${chosen.version}.dmg`
        };
      }
    }
  } catch (e) {
    console.warn('[UPDATER] Fallback to latestMacUpdateInfo URL resolution:', e.message);
  }

  // 2. Fallback to constructing URL from latest-mac.yml info
  if (version) {
    const fileName = latestMacUpdateInfo?.path
      || latestMacUpdateInfo?.files?.[0]?.url
      || `FS25-MT-Mod-Manager-Setup-${version}.dmg`;
    const size = latestMacUpdateInfo?.files?.[0]?.size || 0;
    const candidateUrls = [
      `https://github.com/MarkThor11/fs25-mt-mod-manager-for-mac/releases/download/${version}/${fileName}`,
      `https://github.com/MarkThor11/fs25-mt-mod-manager-for-mac/releases/download/v${version}/${fileName}`
    ];
    for (const candidate of candidateUrls) {
      try {
        const head = await fetch(candidate, {
          method: 'HEAD',
          headers: { 'User-Agent': 'fs25-mt-mod-manager' }
        });
        if (head.ok) {
          return { url: candidate, size, version, fileName };
        }
      } catch (_) {}
    }
    return { url: candidateUrls[0], size, version, fileName };
  }

  throw new Error('Could not determine macOS update DMG download URL.');
}

async function downloadMacUpdate(mainWindow) {
  const { url, size, version, fileName } = await resolveMacDmgUrl();
  const tempDir = app?.getPath ? app.getPath('temp') : '/tmp';
  const destPath = path.join(tempDir, fileName || `FS25-MT-Mod-Manager-Setup-${version || 'latest'}.dmg`);

  console.log('[UPDATER] Downloading macOS DMG update from:', url);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'fs25-mt-mod-manager' }
  });

  if (!res.ok || !res.body) {
    throw new Error(`Failed to download macOS update (${res.status} ${res.statusText})`);
  }

  const totalBytes = Number(res.headers.get('content-length')) || size || 0;
  let transferred = 0;
  const startTime = Date.now();
  let lastEmit = 0;

  const fileStream = fs.createWriteStream(destPath);
  const reader = res.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        transferred += value.byteLength;
        fileStream.write(Buffer.from(value));

        const now = Date.now();
        if (now - lastEmit >= 200 || (totalBytes && transferred >= totalBytes)) {
          lastEmit = now;
          const elapsedSec = Math.max((now - startTime) / 1000, 0.1);
          const bytesPerSecond = Math.round(transferred / elapsedSec);
          const percent = totalBytes > 0 ? Math.min(100, (transferred / totalBytes) * 100) : 50;
          mainWindow?.webContents.send('app:update-progress', {
            percent,
            bytesPerSecond,
            transferred,
            total: totalBytes
          });
        }
      }
    }
  } finally {
    await new Promise((resolve) => fileStream.end(resolve));
  }

  const stat = fs.statSync(destPath);
  if (stat.size < 10 * 1024 * 1024) {
    throw new Error('Downloaded macOS update file is incomplete or invalid.');
  }

  downloadedMacDmgPath = destPath;
  console.log('[UPDATER] macOS DMG downloaded to:', downloadedMacDmgPath);
  mainWindow?.webContents.send('app:update-downloaded', latestMacUpdateInfo || { version });
  return { downloadedFile: downloadedMacDmgPath };
}

function buildMacUpdaterScript() {
  return `#!/bin/bash
DMG_PATH="$1"
TARGET_APP="$2"
APP_PID="$3"
LOG_FILE="/tmp/fs25_mac_updater.log"

echo "[$(date)] Starting FS25 MT Mod Manager macOS auto-update" > "$LOG_FILE"
echo "DMG_PATH: $DMG_PATH" >> "$LOG_FILE"
echo "TARGET_APP: $TARGET_APP" >> "$LOG_FILE"
echo "APP_PID: $APP_PID" >> "$LOG_FILE"

# 1. Wait for the running app process to exit
if [ -n "$APP_PID" ]; then
  for i in $(seq 1 30); do
    if ! kill -0 "$APP_PID" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
fi

# 2. Mount the DMG silently
MOUNT_DIR=$(mktemp -d /tmp/fs25_dmg_mount.XXXXXX)
echo "Mounting DMG to $MOUNT_DIR..." >> "$LOG_FILE"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_DIR" -nobrowse -quiet -noautoopen >> "$LOG_FILE" 2>&1

SOURCE_APP=$(find "$MOUNT_DIR" -maxdepth 2 -name "*.app" -type d | head -n 1)
if [ -z "$SOURCE_APP" ]; then
  echo "ERROR: No .app bundle found inside mounted DMG" >> "$LOG_FILE"
  hdiutil detach "$MOUNT_DIR" -force -quiet 2>/dev/null
  rm -rf "$MOUNT_DIR"
  exit 1
fi
echo "Found .app inside DMG: $SOURCE_APP" >> "$LOG_FILE"

# 3. Stage the new .app in /tmp, strip quarantine flags, and apply ad-hoc signature
STAGE_DIR=$(mktemp -d /tmp/fs25_app_stage.XXXXXX)
APP_NAME=$(basename "$TARGET_APP")
STAGED_APP="$STAGE_DIR/$APP_NAME"

ditto "$SOURCE_APP" "$STAGED_APP" >> "$LOG_FILE" 2>&1
xattr -cr "$STAGED_APP" >> "$LOG_FILE" 2>&1
codesign --force --deep --sign - "$STAGED_APP" >> "$LOG_FILE" 2>&1

# 4. Unmount the DMG
hdiutil detach "$MOUNT_DIR" -force -quiet >> "$LOG_FILE" 2>&1
rm -rf "$MOUNT_DIR"

# 5. Replace the target .app in /Applications (or user's install path)
rm -rf "$TARGET_APP" >> "$LOG_FILE" 2>&1
if ditto "$STAGED_APP" "$TARGET_APP" >> "$LOG_FILE" 2>&1; then
  echo "Replaced $TARGET_APP directly." >> "$LOG_FILE"
else
  echo "Direct replacement failed; requesting administrator privileges via osascript..." >> "$LOG_FILE"
  osascript -e "do shell script \\"rm -rf '$TARGET_APP' && ditto '$STAGED_APP' '$TARGET_APP' && xattr -cr '$TARGET_APP' && codesign --force --deep --sign - '$TARGET_APP'\\" with administrator privileges" >> "$LOG_FILE" 2>&1
fi

# 6. Final quarantine strip & ad-hoc sign on target path
xattr -cr "$TARGET_APP" >> "$LOG_FILE" 2>&1
codesign --force --deep --sign - "$TARGET_APP" >> "$LOG_FILE" 2>&1

# 7. Cleanup temporary files
rm -rf "$STAGE_DIR"
rm -f "$DMG_PATH"

# 8. Relaunch the updated app
echo "Relaunching $TARGET_APP..." >> "$LOG_FILE"
open -n "$TARGET_APP" >> "$LOG_FILE" 2>&1
exit 0
`;
}

function installMacUpdateAndRestart() {
  if (!downloadedMacDmgPath || !fs.existsSync(downloadedMacDmgPath)) {
    throw new Error('Downloaded macOS update DMG not found.');
  }

  const exePath = app?.getPath ? app.getPath('exe') : '';
  const appMatch = exePath.match(/^(.+?\.app)\/Contents\/MacOS\//);
  let targetAppPath = appMatch ? appMatch[1] : '/Applications/FS25 MT Mod Manager.app';
  if (targetAppPath.startsWith('/Volumes/')) {
    targetAppPath = '/Applications/FS25 MT Mod Manager.app';
  }

  const tempDir = app?.getPath ? app.getPath('temp') : '/tmp';
  const scriptPath = path.join(tempDir, 'fs25_mac_updater.sh');
  fs.writeFileSync(scriptPath, buildMacUpdaterScript(), { encoding: 'utf8', mode: 0o755 });

  console.log('[UPDATER] Spawning macOS installer script for target:', targetAppPath);
  const child = spawn('/bin/bash', [scriptPath, downloadedMacDmgPath, targetAppPath, String(process.pid)], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  setTimeout(() => {
    app.exit(0);
  }, 200);
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
    if (process.platform === 'darwin') {
      latestMacUpdateInfo = info;
    }
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
        if (process.platform === 'darwin') {
          latestMacUpdateInfo = result.updateInfo;
        }
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
      if (process.platform === 'darwin') {
        return await downloadMacUpdate(mainWindow);
      }
      const updater = getAutoUpdater();
      if (!updater) return { error: 'Updater not available' };
      return await updater.downloadUpdate();
    } catch (err) {
      console.error('[UPDATER] Download failed:', err);
      mainWindow?.webContents.send('app:update-error', err.message);
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

    if (process.platform === 'darwin') {
      try {
        installMacUpdateAndRestart();
        return;
      } catch (err) {
        console.error('[UPDATER] macOS install failed:', err);
        return { error: err.message };
      }
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

module.exports = { initAppUpdater, getAppReleases, isVersionIgnored, resolveMacDmgUrl, buildMacUpdaterScript };
