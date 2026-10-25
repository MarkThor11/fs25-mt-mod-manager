const path = require('path');
const versionManager = require(path.join(__dirname, '../src/main/services/versionManager'));
const cache = require(path.join(__dirname, '../src/main/services/cache'));

cache.init();

async function run() {
  const updates = await versionManager.checkAllUpdates();
  console.log('Total updates found by versionManager:', updates.length);
  const foundCarp = updates.filter(u => (u.fileName || '').toLowerCase().includes('carpathian'));
  const foundPall = updates.filter(u => (u.fileName || '').toLowerCase().includes('pallegney'));
  console.log('Carpathian updates:', foundCarp);
  console.log('Pallegney updates:', foundPall);
}

run();
