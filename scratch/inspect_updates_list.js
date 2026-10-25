const path = require('path');
const versionManager = require(path.join(__dirname, '../src/main/services/versionManager'));
const cache = require(path.join(__dirname, '../src/main/services/cache'));

cache.init();

async function check() {
  const updates = await versionManager.checkAllUpdates();
  console.log('Total updates returned by versionManager:', updates.length);
  updates.forEach(u => {
    console.log('Update:', u.fileName, '| modId:', u.modId, '| title:', u.title || u.modhubTitle, '| hasUpdate:', u.hasUpdate, '| isDelisted:', u.isDelisted, '| isRemoved:', u.isRemoved);
  });
}

check();
