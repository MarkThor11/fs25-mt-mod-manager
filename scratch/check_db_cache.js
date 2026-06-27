const path = require('path');
const Database = require('better-sqlite3');

function test() {
    const dbPath = 'C:\\Users\\Mark\\AppData\\Roaming\\fs25-mt-mod-manager\\modhub-cache.db';
    try {
        const db = new Database(dbPath, { readonly: true });
        const rows = db.prepare('SELECT file_path, store_base64, icon_base64 FROM local_mod_cache LIMIT 5').all();
        console.log('--- DB CACHE ROWS ---');
        rows.forEach(r => {
            console.log({
                path: r.file_path,
                hasStore: !!r.store_base64,
                storeStart: r.store_base64 ? r.store_base64.slice(0, 30) : null,
                hasIcon: !!r.icon_base64,
                iconStart: r.icon_base64 ? r.icon_base64.slice(0, 30) : null
            });
        });
        const nullStores = db.prepare('SELECT count(*) as cnt FROM local_mod_cache WHERE store_base64 IS NULL').get();
        console.log('Null store_base64 count:', nullStores.cnt);
        const total = db.prepare('SELECT count(*) as cnt FROM local_mod_cache').get();
        console.log('Total cache count:', total.cnt);
    } catch (e) {
        console.error('Failed to read db:', e);
    }
}

test();
