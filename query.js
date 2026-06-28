const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, 'GoogleModManager', 'manager.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) { console.error(err); return; }
    db.all("SELECT dependencies FROM modhub_cache WHERE title = 'Monteriggioni'", (err, rows) => {
        if (err) console.error(err);
        else console.log('Dependencies:', rows.length > 0 ? rows[0].dependencies : 'Not found');
    });
});
