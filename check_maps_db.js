const cache = require('./src/main/services/cache');
const path = require('path');

async function check() {
    try {
        const tracking = cache.getAllModTracking();
        console.log("--- Tracking Database ---");
        tracking.forEach(t => {
            if (t.category && t.category.toUpperCase().includes('MAP')) {
                console.log(`[MAP_CAT] ID: ${t.mod_id}, Title: ${t.modhubTitle}, Category: ${t.category}, File: ${t.local_file_name}`);
            }
        });
        
        console.log("\n--- Local Cache ---");
        // We can't easily iterate the local cache without knowing the keys, 
        // but we can check the database directly if it's SQLite
    } catch (e) {
        console.error(e);
    }
}

check();
