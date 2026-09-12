const fs = require('fs');
const path = require('path');
const scraper = require('../src/main/services/scraper');

async function scrapeMaps() {
    console.log('--- MODHUB MAP DEPENDENCY SCRAPER ---');
    console.log('Targeting FS25 Map Categories...');

    const filters = ['mapEurope', 'mapNorthAmerica', 'mapSouthAmerica', 'mapOthers'];
    const allMaps = [];
    const seenIds = new Set();

    // 1. Fetch all map listings from all categories
    for (const filter of filters) {
        let currentPage = 0;
        let totalPages = 1;

        console.log(`\nScanning category: ${filter}...`);

        while (currentPage < totalPages) {
            // EXPLICITLY Adding lang and country to bypass regional redirects
            const url = `https://www.farming-simulator.com/mods.php?title=fs2025&filter=${filter}&page=${currentPage}&lang=en&country=gb`;
            console.log(`  Fetching ${filter} page ${currentPage + 1}...`);
            
            try {
                // Use throttledFetch directly to ensure our custom URL is used
                // Wait, scraper.fetchModList doesn't take a full URL.
                // I'll patch the fetchModList behavior by passing the full filter string with params
                // Actually, fetchModList appends to MODS_URL.
                // Let's just use the scraper.fetchModList but pass a "dirty" filter string
                const result = await scraper.fetchModList(`${filter}&lang=en&country=gb`, currentPage);
                
                if (result.mods.length === 0) {
                    console.log(`  [INFO] No mods found or end of category reached.`);
                    break;
                }

                let newInThisBatch = 0;
                result.mods.forEach(m => {
                    if (!seenIds.has(m.modId)) {
                        seenIds.add(m.modId);
                        allMaps.push(m);
                        newInThisBatch++;
                    }
                });

                console.log(`  [OK] Added ${newInThisBatch} new maps (Total: ${allMaps.length})`);

                totalPages = result.pagination.total;
                currentPage++;
                
                if (currentPage > 20) break; // Absolute safety

            } catch (err) {
                console.error(`  [ERROR] Failed to fetch ${filter} page ${currentPage + 1}:`, err.message);
                break;
            }
        }
    }

    if (allMaps.length === 0) {
        console.log('\n[CRITICAL] No maps found! Attempting fallback to search "map"...');
        const searchResult = await scraper.searchMods('map', 0);
        searchResult.mods.forEach(m => {
            if (!seenIds.has(m.modId)) {
                seenIds.add(m.modId);
                allMaps.push(m);
            }
        });
    }

    console.log(`\nFound ${allMaps.length} unique maps. Now extracting dependencies...`);
    
    const results = [];
    
    // 2. Fetch details for each map
    for (let i = 0; i < allMaps.length; i++) {
        const map = allMaps[i];
        process.stdout.write(`[${i + 1}/${allMaps.length}] ${map.title.padEnd(45)} `);
        
        try {
            const detail = await scraper.fetchModDetail(map.modId);
            if (detail.dependencies && detail.dependencies.length > 0) {
                console.log(`=> Found ${detail.dependencies.length} dependencies`);
                results.push({
                    title: map.title,
                    modId: map.modId,
                    url: map.url,
                    dependencies: detail.dependencies
                });
            } else {
                console.log(`=> No direct ModHub dependencies`);
                results.push({
                    title: map.title,
                    modId: map.modId,
                    url: map.url,
                    dependencies: []
                });
            }
        } catch (err) {
            console.log(`=> [FAILED] ${err.message}`);
        }
    }

    // 3. Save JSON
    fs.writeFileSync('map_deps.json', JSON.stringify(results, null, 2));
    
    // 4. Generate Markdown
    console.log('\nGenerating report...');
    let md = '# ModHub Map Dependency Report (FS25)\n\n';
    md += `**Date:** ${new Date().toLocaleString()}\n`;
    md += `**Total Maps Scanned:** ${results.length}\n\n`;
    md += 'This report lists all required mods for every map discovered on the official FS25 ModHub regional categories.\n\n';
    
    md += '| Map Name | Required Mods |\n';
    md += '| :--- | :--- |\n';
    
    results.sort((a,b) => a.title.localeCompare(b.title)).forEach(m => {
        const deps = m.dependencies.length > 0 
            ? m.dependencies.map(d => `• [${d.title}](${d.url})`).join('<br>')
            : '*None listed*';
        md += `| [${m.title}](${m.url}) | ${deps} |\n`;
    });
    
    fs.writeFileSync('map_dependencies_report.md', md);
    console.log('\n--- TASK COMPLETE ---');
}

scrapeMaps();
