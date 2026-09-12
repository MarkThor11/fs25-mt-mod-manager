const fs = require('fs-extra');
const path = require('path');
const Database = require('better-sqlite3');

// Config
const MAP_DEPS_PATH = path.join(__dirname, '..', 'map_deps.json');
const BUNDLED_CACHE_PATH = path.join(__dirname, '..', 'src', 'main', 'resources', 'bundled_cache.json');
const APPDATA = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');

// Found via scan: C:\Users\Mark\AppData\Roaming\fs25-mt-mod-manager\modhub-cache.db
const DB_PATHS = [
    path.join(APPDATA, 'fs25-mt-mod-manager', 'modhub-cache.db'),
    path.join(APPDATA, 'fs25-modhub-manager', 'modhub-cache.db'),
    path.join(APPDATA, 'FS25 MT Mod Manager', 'modhub-cache.db')
];

async function run() {
    console.log('--- Map Cache Ingestion Started ---');

    if (!fs.existsSync(MAP_DEPS_PATH)) {
        console.error('Error: map_deps.json not found!');
        return;
    }

    const mapDeps = await fs.readJson(MAP_DEPS_PATH);
    console.log(`Loaded ${mapDeps.length} maps from map_deps.json`);

    // 1. Prepare transformed data
    const now = Date.now();
    const ttl = 30 * 24 * 60 * 60 * 1000; // 30 days
    const expiresAt = now + ttl;

    const cacheEntries = {};

    for (const map of mapDeps) {
        if (!map.modId) continue;

        const modId = map.modId;
        const key = `modDetail_${modId}`;

        // Transform dependencies
        const transformedDeps = (map.dependencies || []).map(dep => {
            let url = dep.url;
            // Convert CDN to ModHub ID link if possible
            // Matches storage/00311932 or similar
            const idMatch = url.match(/storage\/(\d+)/);
            if (idMatch) {
                const depId = parseInt(idMatch[1], 10);
                url = `https://www.farming-simulator.com/mod.php?mod_id=${depId}&title=fs2025`;
            }
            return {
                title: dep.title,
                url: url
            };
        });

        // Basic modDetail structure
        const detail = {
            modId: modId,
            title: map.title,
            author: "ModHub Scraper",
            image: `https://cdn18.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`,
            candidates: [
                `https://cdn16.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`,
                `https://cdn17.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`,
                `https://cdn18.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`,
                `https://cdn19.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`,
                `https://cdn20.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`
            ],
            rating: 0,
            downloads: 0,
            url: map.url,
            isMap: true,
            dependencies: transformedDeps,
            timestamp: now
        };

        cacheEntries[key] = detail;
    }

    // 2. Update SQLite
    let dbUpdated = false;
    for (const dbPath of DB_PATHS) {
        if (fs.existsSync(dbPath)) {
            try {
                console.log(`Attempting to open database: ${dbPath}`);
                const db = new Database(dbPath);
                // Ensure table exists (safeguard)
                db.exec(`CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT, expires_at INTEGER, created_at INTEGER)`);
                
                const insert = db.prepare('INSERT OR REPLACE INTO cache (key, value, expires_at, created_at) VALUES (?, ?, ?, ?)');
                
                const transaction = db.transaction((entries) => {
                    let count = 0;
                    for (const [key, val] of Object.entries(entries)) {
                        insert.run(key, JSON.stringify(val), expiresAt, now);
                        count++;
                    }
                    return count;
                });

                const inserted = transaction(cacheEntries);
                console.log(`Successfully injected ${inserted} entries into ${path.basename(dbPath)}`);
                db.close();
                dbUpdated = true;
            } catch (err) {
                console.error(`Failed to update SQLite at ${dbPath}:`, err.message);
            }
        }
    }
    if (!dbUpdated) {
        console.warn('No active application database was found to update.');
    }

    // 3. Update Bundled Cache
    if (fs.existsSync(BUNDLED_CACHE_PATH)) {
        try {
            console.log(`Updating bundled cache: ${BUNDLED_CACHE_PATH}`);
            const rawBuffer = fs.readFileSync(BUNDLED_CACHE_PATH);
            let content = rawBuffer.toString('utf8');
            
            // Robust cleaning: Find first { and last }
            const start = content.indexOf('{');
            const end = content.lastIndexOf('}');
            
            if (start === -1 || end === -1) {
                console.error('Could not find JSON object boundaries in bundled_cache.json');
                return;
            }
            
            const cleanJson = content.substring(start, end + 1);
            const bundledData = JSON.parse(cleanJson);
            
            // Merge new entries
            Object.assign(bundledData, cacheEntries);

            // Save as CLEAN, VALID JSON (fix the corruption)
            await fs.outputJson(BUNDLED_CACHE_PATH, bundledData, { spaces: 0 });
            console.log(`Successfully merged and cleaned ${Object.keys(cacheEntries).length} entries in bundled_cache.json`);
        } catch (err) {
            console.error('Failed to update bundled cache:', err.message);
        }
    } else {
        console.error('Bundled cache not found!');
    }

    console.log('--- Ingestion Complete ---');
}

run();
