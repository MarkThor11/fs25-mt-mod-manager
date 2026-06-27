const path = require('path');
const Database = require('better-sqlite3');

function test() {
    const dbPath = 'C:\\Users\\Mark\\AppData\\Roaming\\fs25-mt-mod-manager\\modhub-cache.db';
    console.log('REAL DB PATH:', dbPath);
    try {
        const db = new Database(dbPath, { readonly: true });
        
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log('Tables in DB:', tables.map(t => t.name));
        
        for (const table of tables) {
            const count = db.prepare(`SELECT count(*) as cnt FROM ${table.name}`).get();
            console.log(`Count in ${table.name}:`, count.cnt);
        }
        
        const settings = db.prepare('SELECT key, value FROM settings').all();
        console.log('--- REAL DB SETTINGS ---');
        console.log(settings);
    } catch (e) {
        console.error('Failed to read real db:', e);
    }
}

test();
