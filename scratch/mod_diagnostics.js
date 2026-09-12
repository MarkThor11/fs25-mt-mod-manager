const path = require('path');
const fs = require('fs-extra');
const modManager = require('../src/main/services/modManager');

async function debugScan() {
    const modsPath = 'C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods_old';
    if (!fs.existsSync(modsPath)) {
        console.error('mods_old not found!');
        return;
    }

    const entries = fs.readdirSync(modsPath);
    console.log(`Scanning ${entries.length} items in mods_old...`);

    const results = [];

    for (const entry of entries) {
        const fullPath = path.join(modsPath, entry);
        if (!entry.endsWith('.zip') && !fs.statSync(fullPath).isDirectory()) continue;

        const start = Date.now();
        try {
            // We use a timeout to detect hanging/slow mods
            const result = await Promise.race([
                (async () => {
                    const meta = modManager.parseModDesc(fullPath);
                    return meta;
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000))
            ]);
            const duration = Date.now() - start;
            
            if (duration > 200) {
                console.log(`[SLOW] ${entry} took ${duration}ms`);
            }
            
            results.push({ entry, duration, success: !!result });
        } catch (err) {
            console.log(`[FAILED] ${entry}: ${err.message}`);
            results.push({ entry, duration: Date.now() - start, success: false, error: err.message });
        }
    }

    console.log('\n--- SCAN SUMMARY ---');
    const slow = results.filter(r => r.duration > 500).sort((a, b) => b.duration - a.duration);
    const failed = results.filter(r => !r.success);

    console.log(`Total Slow (>500ms): ${slow.length}`);
    slow.forEach(s => console.log(`  - ${s.entry} (${s.duration}ms)`));

    console.log(`Total Failed: ${failed.length}`);
    failed.forEach(f => console.log(`  - ${f.entry} (${f.error})`));
}

debugScan();
