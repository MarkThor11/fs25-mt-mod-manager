const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const cacheEntries = db.prepare('SELECT key, length(value) as len FROM cache').all();
console.log('Cache keys in cache table:');
cacheEntries.forEach(c => console.log('Key:', c.key, 'length:', c.len));

const discovery = db.prepare("SELECT value FROM cache WHERE key = 'modhub_discovery'").get();
if (discovery) {
  try {
    const parsed = JSON.parse(discovery.value);
    console.log('modhub_discovery type:', Array.isArray(parsed) ? 'Array' : typeof parsed);
    if (Array.isArray(parsed)) {
      console.log('Online ModHub count in cache table:', parsed.length);
    } else if (parsed && parsed.mods) {
      console.log('Online ModHub count in cache table (mods property):', parsed.mods.length);
    } else {
      console.log('Keys in parsed:', Object.keys(parsed));
    }
  } catch (e) {
    console.log('Parse error:', e.message);
  }
}
