const scraper = require('./scraper');
const cache = require('./cache');

/**
 * Checks if a date string ("DD.MM.YYYY") represents today's date
 * in either local user time or Central European Time (GIANTS server time).
 */
function isDateToday(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const parts = dateStr.trim().split('.');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;

    const now = new Date();
    // 1. Check local date
    if (
        now.getDate() === day &&
        (now.getMonth() + 1) === month &&
        now.getFullYear() === year
    ) {
        return true;
    }

    // 2. Check Central European Time (GIANTS Software HQ in Germany)
    try {
        const cetFormatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Berlin',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const cetFormatted = cetFormatter.format(now); // "DD/MM/YYYY"
        const [cDay, cMonth, cYear] = cetFormatted.split('/').map(Number);
        if (cDay === day && cMonth === month && cYear === year) {
            return true;
        }
    } catch (_) {}

    return false;
}

/**
 * Checks if a date string ("DD.MM.YYYY") represents a date strictly in the past
 * (before today in both local time and Central European Time).
 */
function isDateOlderThanToday(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const parts = dateStr.trim().split('.');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;

    const modTime = new Date(year, month - 1, day).getTime();
    const now = new Date();
    const startOfLocalToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (modTime < startOfLocalToday) {
        // If local check says older, also confirm against CET start of today to avoid false cutoff
        try {
            const cetFormatter = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Europe/Berlin',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const [cDay, cMonth, cYear] = cetFormatter.format(now).split('/').map(Number);
            const startOfCetToday = new Date(cYear, cMonth - 1, cDay).getTime();
            return modTime < startOfCetToday;
        } catch (_) {
            return true;
        }
    }

    return false;
}

let inMemoryStats = null;

/**
 * Monitors ModHub for additions and updates strictly released on today's date.
 */
async function syncAndGetStats() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Check fast in-memory cache first (valid for 10 minutes)
    if (inMemoryStats && inMemoryStats.date === todayStr && (Date.now() - inMemoryStats.timestamp < 10 * 60 * 1000)) {
        return inMemoryStats.data;
    }

    // Check persistent DB cache (cached for 10 minutes)
    const cachedStats = cache.get('modhub_discovery_stats');
    if (cachedStats && cachedStats.date === todayStr && cachedStats.success) {
        inMemoryStats = { date: todayStr, timestamp: Date.now(), data: cachedStats };
        return cachedStats;
    }

    try {
        // 1. Fetch latest page from ModHub
        const page0 = await scraper.fetchModList('latest', 0);
        const latestMods = page0.mods || [];

        // 2. Fetch true player mod count
        const totalMods = await scraper.fetchTrueModCount();

        let newCount = 0;
        let updateCount = 0;

        // 3. Inspect items in latestMods (in descending chronological order)
        for (let i = 0; i < latestMods.length; i++) {
            const m = latestMods[i];
            if (!m || !m.modId) continue;

            // Check cache for mod detail
            const cacheKey = `modDetail_${m.modId}`;
            let detail = cache.get(cacheKey);

            // For updates, or if not cached / missing releasedDate, fetch fresh detail
            if (!detail || !detail.releasedDate || m.isUpdate) {
                try {
                    detail = await scraper.fetchModDetail(m.modId);
                    if (detail && detail.releasedDate) {
                        cache.set(cacheKey, detail, 7 * 24 * 60 * 60 * 1000);
                    }
                } catch (fetchErr) {
                    console.warn(`[DISCOVERY] Failed to fetch details for mod ${m.modId}:`, fetchErr.message);
                }
            }

            const releaseDate = detail ? detail.releasedDate : null;

            // Stop early: because the feed is chronologically sorted, once an older date appears,
            // all subsequent mods will also be from yesterday or older.
            if (isDateOlderThanToday(releaseDate)) {
                break;
            }

            if (isDateToday(releaseDate)) {
                if (m.isNew) {
                    newCount++;
                } else if (m.isUpdate) {
                    updateCount++;
                }
            }
        }

        // Keep mods_latest_0 hot in cache with fresh page data
        cache.set('mods_latest_0', page0, 3 * 60 * 1000);

        const result = {
            success: true,
            date: todayStr,
            totalMods,
            newCount,
            updateCount,
            latestCount: latestMods.length
        };

        // Cache stats for 10 minutes
        inMemoryStats = { date: todayStr, timestamp: Date.now(), data: result };
        cache.set('modhub_discovery_stats', result, 10 * 60 * 1000);

        return result;
    } catch (err) {
        console.error('[DISCOVERY] Sync failed:', err);
        return {
            success: false,
            error: err.message,
            totalMods: 0,
            newCount: 0,
            updateCount: 0,
            latestCount: 0
        };
    }
}

module.exports = {
    syncAndGetStats,
    isDateToday,
    isDateOlderThanToday
};

