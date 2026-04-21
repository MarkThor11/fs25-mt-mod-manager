const scraper = require('./scraper');
const cache = require('./cache');

/**
 * Monitors ModHub for truly new additions by tracking seen mod IDs and their statuses.
 */

async function syncAndGetStats() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // 1. Load state from DB
    // stats: { date: string, newCount: number, updateCount: number }
    let stats = cache.get('modhub_discovery_stats') || { date: todayStr, newCount: 0, updateCount: 0 };
    // knownStatus: { [id: string]: 'new' | 'update' | 'seen' }
    let knownStatus = cache.get('modhub_known_status') || {};

    // 2. Midnight Reset
    if (stats.date !== todayStr) {
        console.log(`[DISCOVERY] New day detected (${todayStr}). Resetting daily counters.`);
        stats = { date: todayStr, newCount: 0, updateCount: 0 };
    }

    try {
        // 3. Fetch current status (First 2 pages cover most daily activity)
        const page0 = await scraper.fetchModList('latest', 0);
        const page1 = await scraper.fetchModList('latest', 1);
        const currentMods = [...(page0.mods || []), ...(page1.mods || [])];
        
        // Get true total mod count (calculates based on last page)
        const totalMods = await scraper.fetchTrueModCount();

        let changed = false;

        // 4. Identity new discoveries
        for (const mod of currentMods) {
            const id = String(mod.modId);
            const status = knownStatus[id];

            if (mod.isNew && status !== 'new') {
                stats.newCount++;
                knownStatus[id] = 'new';
                changed = true;
                console.log(`[DISCOVERY] Found NEW mod: ${mod.title} (${id})`);
            } else if (mod.isUpdate && status !== 'update') {
                stats.updateCount++;
                knownStatus[id] = 'update';
                changed = true;
                console.log(`[DISCOVERY] Found UPDATE for mod: ${mod.title} (${id})`);
            } else if (!mod.isNew && !mod.isUpdate && !status) {
                // Mod found with no badge, mark as seen so we don't treat it as new later
                knownStatus[id] = 'seen';
                changed = true;
            }
        }

        // 5. Persist if state changed
        if (changed || stats.date !== todayStr) {
            // Prune knownStatus to keep DB size manageable (keep most recent 500)
            const entries = Object.entries(knownStatus);
            if (entries.length > 500) {
                // In a real app we'd use timestamps, but for now we'll just slice
                knownStatus = Object.fromEntries(entries.slice(-500));
            }

            cache.set('modhub_discovery_stats', stats, 48 * 60 * 60 * 1000); // 2 days
            cache.set('modhub_known_status', knownStatus, 60 * 24 * 60 * 60 * 1000); // 60 days
        }

        return {
            success: true,
            totalMods,
            newCount: stats.newCount,
            updateCount: stats.updateCount,
            latestCount: (page0.mods || []).length
        };

    } catch (err) {
        console.error('[DISCOVERY] Sync failed:', err);
        return {
            success: false,
            error: err.message,
            totalMods: 0, // Fallback
            newCount: 0,
            updateCount: 0,
            latestCount: 0
        };
    }
}

module.exports = {
    syncAndGetStats
};
