const { app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

function test() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'modhub-cache.db');
    console.log('DB PATH:', dbPath);
    try {
        const db = new Database(dbPath, { readonly: true });
        const settings = db.prepare('SELECT key, value FROM settings').all();
        console.log('--- DB SETTINGS ---');
        console.log(settings);
        console.log('--- END DB SETTINGS ---');
    } catch (e) {
        console.error('Failed to read db settings:', e);
    }
    process.exit(0);
}

app.whenReady().then(test);
