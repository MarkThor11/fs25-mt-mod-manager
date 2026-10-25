const path = require('path');
const cache = require(path.join(__dirname, '../src/main/services/cache'));
cache.init();
const pool = cache.getModHubMetadataPool();

console.log('Pool 349449:', pool['349449'] ? { title: pool['349449'].title, version: pool['349449'].version, fileName: pool['349449'].fileName } : null);
console.log('Pool 311930:', pool['311930'] ? { title: pool['311930'].title, version: pool['311930'].version, fileName: pool['311930'].fileName } : null);
