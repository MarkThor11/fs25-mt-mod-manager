const path = require('path');
const cache = require(path.join(__dirname, '../src/main/services/cache'));
const modManager = require(path.join(__dirname, '../src/main/services/modManager'));
const { compareVersions } = require(path.join(__dirname, '../src/main/services/versionManager'));

cache.init();

async function trace() {
  const scanData = await modManager.scanLocalMods();
  const localMods = scanData?.mods || [];
  const trackingMap = cache.getAllModTrackingMap();
  const pool = cache.getModHubMetadataPool();

  for (const lm of localMods) {
    if ((lm.fileName || '').toLowerCase().includes('carpathian') || (lm.fileName || '').toLowerCase().includes('pallegney')) {
      const modId = lm.modId || null;
      const cleanFileName = (lm.fileName || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
      const tracked = (modId ? trackingMap.get(`ID_${modId}`) : null) || 
                      (cleanFileName ? trackingMap.get(`FILE_${cleanFileName}`) : null);
      const effectiveModId = modId || tracked?.mod_id || null;
      const poolItem = effectiveModId ? pool[String(effectiveModId)] : null;
      const remoteVersion = tracked?.remote_version || poolItem?.version || null;
      const localVersion = lm.version || tracked?.local_version;

      console.log('--- TRACE:', lm.fileName, '---');
      console.log('   localVersion:', localVersion);
      console.log('   remoteVersion:', remoteVersion);
      console.log('   tracked local_version:', tracked?.local_version);
      console.log('   tracked remote_version:', tracked?.remote_version);
      console.log('   tracked check passed?:', !(tracked?.local_version && compareVersions(tracked.local_version, remoteVersion) <= 0));
      console.log('   hasUpdate?:', compareVersions(localVersion, remoteVersion) > 0);
    }
  }
}

trace();
