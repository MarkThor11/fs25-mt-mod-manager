const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db');
const db = new Database(dbPath);

const r = db.prepare("SELECT value FROM settings WHERE key = 'modCache'").get();
const mods = JSON.parse(r.value).mods;

const mCarp = mods.filter(m => (m.fileName || '').toLowerCase().includes('carpathian'));
const mPall = mods.filter(m => (m.fileName || '').toLowerCase().includes('pallegney'));

console.log('Carpathian entries in modCache:', mCarp.map(m => ({ fileName: m.fileName, filePath: m.filePath, version: m.version, modId: m.modId })));
console.log('Pallegney entries in modCache:', mPall.map(m => ({ fileName: m.fileName, filePath: m.filePath, version: m.version, modId: m.modId })));
