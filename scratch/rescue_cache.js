const fs = require('fs-extra');
const path = require('path');

const BUNDLED_CACHE_PATH = path.join(__dirname, '..', 'src', 'main', 'resources', 'bundled_cache.json');
const MAP_DEPS_PATH = path.join(__dirname, '..', 'map_deps.json');

async function run() {
    console.log('--- Cache Patch & Cleanup Started ---');

    if (!fs.existsSync(BUNDLED_CACHE_PATH)) {
        console.error('Bundled cache not found!');
        return;
    }

    if (!fs.existsSync(MAP_DEPS_PATH)) {
        console.error('map_deps.json not found!');
        return;
    }

    const mapDeps = await fs.readJson(MAP_DEPS_PATH);
    console.log(`Loaded ${mapDeps.length} maps for patching.`);

    try {
        console.log('Reading and fixing bundled_cache.json...');
        const rawBuffer = fs.readFileSync(BUNDLED_CACHE_PATH);
        let content = rawBuffer.toString('utf8');

        // 1. Remove BOM and wrapper backticks (if they exist)
        content = content.replace(/^\uFEFF/, '').trim();
        if (content.startsWith('`')) content = content.substring(1).trim();
        if (content.endsWith('`')) content = content.substring(0, content.length - 1).trim();

        // 2. Fix corrupted double-backslash escapes
        content = content.replace(/\\\\"/g, '\\"');

        // 3. Try to parse
        let bundledData;
        try {
            bundledData = JSON.parse(content);
            console.log('Bundled cache successfully parsed.');
        } catch (e) {
            console.error('Parsing still failed:', e.message);
            // Emergency fallback: Create a fresh cache if it's too broken
            console.log('Creating a fresh cache structure due to corruption...');
            bundledData = {};
        }

        // 4. Transform and Merge Map Dependencies (with Scanner FIX)
        const now = Date.now();
        let patchCount = 0;
        
        for (const map of mapDeps) {
            if (!map.modId) continue;
            
            const modId = map.modId;
            const key = `modDetail_${modId}`;

            // Resolve dependencies
            const deps = (map.dependencies || []).map(d => {
                let url = d.url;
                const idMatch = url.match(/storage\/(\d+)/);
                if (idMatch) {
                    url = `https://www.farming-simulator.com/mod.php?mod_id=${parseInt(idMatch[1], 10)}&title=fs2025`;
                }
                return { title: d.title, url: url };
            });

            // Create detail entry WITH SCANNER FIX
            bundledData[key] = {
                modId: modId,
                title: map.title,
                author: "ModHub Scraper",
                description: "Map dependency information pre-cached from ModHub.",
                image: `https://cdn18.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`,
                candidates: [
                    `https://cdn16.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`,
                    `https://cdn18.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`,
                    `https://cdn20.giants-software.com/modHub/storage/${modId.padStart(8, '0')}/iconBig.jpg`
                ],
                rating: 0,
                downloads: 0,
                url: map.url,
                isMap: true,
                dependencies: deps,
                // ADDING TECHDATA TO STOP CONTINUOUS SCANNING
                techData: {
                    price: 0,
                    hp: 0,
                    capacity: 0,
                    hpIsRequirement: false
                },
                timestamp: now
            };
            patchCount++;
        }

        // 5. Save as Clean JSON (Final overwrite)
        await fs.outputJson(BUNDLED_CACHE_PATH, bundledData, { spaces: 0 });
        console.log(`Successfully patched ${patchCount} maps. Scanner loop should now be resolved.`);
        
    } catch (err) {
        console.error('Fatal error during patch:', err.message);
    }

    console.log('--- Process Complete ---');
}

run();
