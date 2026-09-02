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
        // 3. Fetch latest page from ModHub
        const page0 = await scraper.fetchModList('latest', 0);
        const latestMods = page0.mods || [];
        
        // Get true total player mod count (excluding official DLCs)
        const totalMods = await scraper.fetchTrueModCount();

        // Accurately count badges directly from latest feed
        const newCount = latestMods.filter(m => m.isNew).length;
        const updateCount = latestMods.filter(m => m.isUpdate).length;

        // Keep mods_latest_0 hot in cache with fresh page data
        cache.set('mods_latest_0', page0, 3 * 60 * 1000);

        return {
            success: true,
            totalMods,
            newCount,
            updateCount,
            latestCount: latestMods.length
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
