const path = require('path');
const cache = require(path.join(__dirname, '../src/main/services/cache'));

cache.init();
const pool = cache.getModHubMetadataPool();
console.log('Pool keys count:', Object.keys(pool).length);

const uniqueIds = new Set();
Object.values(pool || {}).forEach(m => {
  if (m && m.modId && m.title && m.title !== 'Error: Mod not found' && !m.title.toLowerCase().includes('not found')) {
    uniqueIds.add(String(m.modId).replace(/^0+/, ''));
  }
});
console.log('uniqueIds in pool:', uniqueIds.size);
