const { app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

function test() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'modhub-cache.db');
    console.log('DB PATH:', dbPath);
    try {
        const db = new Database(dbPath, { readonly: true });
        
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log('Tables in DB:', tables.map(t => t.name));
        
        for (const table of tables) {
            const count = db.prepare(`SELECT count(*) as cnt FROM ${table.name}`).get();
            console.log(`Count in ${table.name}:`, count.cnt);
        }
    } catch (e) {
        console.error('Failed to read db rows:', e);
    }
    process.exit(0);
}

app.whenReady().then(test);
