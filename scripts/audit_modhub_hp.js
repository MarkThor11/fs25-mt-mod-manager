const { fetchModList, fetchModDetail } = require('../src/main/services/scraper');
const fs = require('fs');
const path = require('path');

const CATEGORIES = [
    // Tools (Requesters)
    'plows', 'cultivators', 'discHarrows', 'powerHarrows', 'subsoilers', 'spaders', 'stonePickers', 'mulchers',
    'seeders', 'planters', 'seedTanks', 'sprayers', 'fertilizerSpreaders', 'slurryTools', 'manureSpreaders',
    'weeders', 'rollers', 'mowers', 'tedders', 'windrowers', 'loaderWagons', 'grasslandCare',
    'balersSquare', 'balersRound', 'baleWrappers', 'balingMisc', 'forageMixers', 'barrels', 'strawBlowers',
    'beetLoading', 'potatoPlanting', 'potatoHarvesting', 'vegetablePlanters', 'vineyardEquipment', 'grapeTools',
    'forestryMulchers', 'forestryWinches', 'forestryPlanters', 'forestryStumpCutters', 'weights', 'winterEquipment',
    'frontLoaders', 'frontLoaderTools', 'teleLoaderTools', 'wheelLoaderTools', 'skidSteerTools',
    
    // Vehicles (Providers)
    'tractorsS', 'tractorsM', 'tractorsL', 'trucks', 'cars', 'miscDrivables',
    'frontLoaderVehicles', 'teleLoaderVehicles', 'wheelLoaderVehicles', 'skidSteerVehicles', 'forklifts',
    'harvesters', 'forageHarvesters', 'beetHarvesters', 'potatoHarvesting', 'vegetableHarvesters',
    'riceHarvesters', 'sugarcaneHarvesters', 'cottonHarvesters', 'grapeHarvesters', 'oliveHarvesters',
    'forestryHarvesters', 'forestryForwarders', 'forestryExcavators'
];

async function deepScan(modDetail) {
    const hpValues = [];
    let hpIsReq = false;

    // 1. Scan Metadata (Table)
    Object.entries(modDetail.metadata || {}).forEach(([k, v]) => {
        const key = k.toLowerCase();
        const val = (v || '').toString().toLowerCase();

        if (key.includes('power') || key.includes('hp') || key.includes('perf') || key.includes('cv') || key.includes('ps') || key.includes('output') || key.includes('leist') || key.includes('puiss') || key.includes('requirement')) {
            // Pattern 1: Number(s) + Unit (e.g. 150-200 hp)
            const unitMatches = val.match(/(\d+(?:\s*(?:-|–|to)\s*\d+)?)\s*(hp|cv|ps|pk|ch|kw|bhp)/gi);
            if (unitMatches) {
                unitMatches.forEach(m => {
                    const low = m.toLowerCase();
                    const nums = low.match(/\d+/g);
                    if (nums) {
                        nums.forEach(n => {
                            let p = parseInt(n, 10);
                            if (low.includes('kw')) p = Math.round(p * 1.36);
                            if (p > 0 && !hpValues.includes(p)) hpValues.push(p);
                        });
                    }
                });
            } else {
                // Pattern 2: Leading Title + Number(s) (e.g. Power: 150-200)
                const leadMatch = val.match(/(?:horsepower|power|performance|requirement|required|leistung|puissance|output)[:\-\s]*(\d+(?:\s*(?:-|–|to)\s*\d+)?)/i);
                if (leadMatch) {
                    const nums = leadMatch[1].match(/\d+/g);
                    if (nums) {
                        nums.forEach(n => {
                            const parsed = parseInt(n, 10);
                            if (parsed > 0 && !hpValues.includes(parsed)) hpValues.push(parsed);
                        });
                    }
                } else {
                    // Fallback: Number only
                    const numOnly = val.match(/^\s*\d+\s*$/);
                    if (numOnly) {
                        const parsed = parseInt(numOnly[0], 10);
                        if (parsed > 0 && !hpValues.includes(parsed)) hpValues.push(parsed);
                    }
                }
            }
            if (key.includes('required') || key.includes('requirement')) hpIsReq = true;
        }
    });

    // 2. Scan Description
    if (modDetail.description) {
        const descClean = modDetail.description.replace(/<[^>]*>/g, ' ').toLowerCase(); 
        const matches = descClean.match(/(\d+(?:(?:\s*,\s*|\s*and\s*|\s*&\s*|\s*\/\s*|\s*-\s*|\s*–\s*|\s*to\s*)\d+)*)\s*(hp|cv|ps|pk|ch|kw|bhp)/gi);
        if (matches) {
            matches.forEach(m => {
                const v = m.toLowerCase();
                const nums = v.match(/\d+/g);
                if (nums) {
                    nums.forEach(n => {
                        let p = parseInt(n, 10);
                        if (v.includes('kw')) p = Math.round(p * 1.36);
                        if (p > 0 && !hpValues.includes(p)) hpValues.push(p);
                    });
                }
            });
        }
        const leadPatterns = [
            /(?:horsepower|power|performance|requirement|required|leistung|puissance|output)[:\-\s]*(\d+(?:(?:\s*,\s*|\s*and\s*|\s*&\s*|\s*\/\s*|\s*-\s*|\s*–\s*|\s*to\s*)\d+)*)/gi,
            /(\d+(?:(?:\s*,\s*|\s*and\s*|\s*&\s*|\s*\/\s*|\s*-\s*|\s*–\s*|\s*to\s*)\d+)*)\s*(?:hp|cv|ps|pk|ch|kw|bhp)/gi
        ];
        leadPatterns.forEach(pattern => {
            const found = descClean.matchAll(pattern);
            for (const match of found) {
                const nums = match[1].match(/\d+/g);
                if (nums) {
                    nums.forEach(n => {
                        const hp = parseInt(n, 10);
                        if (hp > 0 && !hpValues.includes(hp)) hpValues.push(hp);
                    });
                }
            }
        });
    }

    hpValues.sort((a,b) => a-b);
    let hpMin = hpValues.length > 0 ? hpValues[0] : 0;
    let hpMax = hpValues.length > 0 ? hpValues[hpValues.length-1] : 0;

    // 3. Fallback Recommendation (Price/Width based)
    let isRec = false;
    let recommendedHp = 0;
    
    if (hpMax === 0) {
        let width = 0;
        Object.entries(modDetail.metadata || {}).forEach(([k, v]) => {
            if (k.toLowerCase().includes('width')) {
                const m = (v || '').toString().match(/(\d+(?:\.\d+)?)/);
                if (m) width = parseFloat(m[1]);
            }
        });

        const filter = (modDetail.filter || '').toLowerCase();
        const price = parseInt((modDetail.metadata?.['Price'] || '0').replace(/\D/g, '')) || 0;
        
        // Identify if it's a vehicle or regular tool
        const isVehicle = [
            'tractorsS', 'tractorsM', 'tractorsL', 'trucks', 'cars', 'miscDrivables',
            'frontLoaderVehicles', 'teleLoaderVehicles', 'wheelLoaderVehicles', 'skidSteerVehicles', 'forklifts',
            'harvesters', 'forageHarvesters', 'beetHarvesters', 'potatoHarvesting', 'vegetableHarvesters',
            'riceHarvesters', 'sugarcaneHarvesters', 'cottonHarvesters', 'grapeHarvesters', 'oliveHarvesters',
            'forestryHarvesters', 'forestryForwarders', 'forestryExcavators'
        ].some(v => filter.toLowerCase() === v.toLowerCase());

        const isWeight = filter.includes('weight');
        const isTool = !isVehicle && !isWeight;

        if (isTool) {
            if (width > 0) {
                if (filter.includes('plow') || filter.includes('harrow') || filter.includes('subsoiler')) {
                    recommendedHp = Math.round(width * 55); 
                } else if (filter.includes('cultivator') || filter.includes('disc')) {
                    recommendedHp = Math.round(width * 45);
                } else if (filter.includes('seeder') || filter.includes('planter')) {
                    recommendedHp = Math.round(width * 40);
                } else if (filter.includes('mower') || filter.includes('tedder') || filter.includes('windrow')) {
                    recommendedHp = Math.round(width * 20);
                } else {
                    recommendedHp = Math.round(width * 30);
                }
                isRec = true;
            } else if (price > 0) {
                recommendedHp = Math.max(10, Math.round(price / 600));
                isRec = true;
            }
        } else if (isVehicle) {
            if (price > 0) {
                recommendedHp = Math.max(15, Math.round(price / 700));
                isRec = true;
            } else {
                if (filter.includes('tractorss')) recommendedHp = 100;
                else if (filter.includes('tractorsm')) recommendedHp = 250;
                else if (filter.includes('tractorsl')) recommendedHp = 450;
                else if (filter.includes('trucks')) recommendedHp = 500;
                
                if (recommendedHp > 0) isRec = true;
            }
        } else if (isWeight) {
            recommendedHp = 1;
            isRec = true;
        }
    }

    if (isRec) {
        hpMin = recommendedHp;
        hpMax = recommendedHp;
    }

    return {
        hpValues: isRec ? [recommendedHp] : hpValues,
        hpMin,
        hpMax,
        hpIsRequirement: hpIsReq || modDetail.techData?.hpIsRequirement,
        isRecommendation: isRec
    };
}

async function runAudit() {
    const report = {
        scanTime: new Date().toISOString(),
        totalMods: 0,
        failures: [],
        categories: {}
    };

    console.log(`[AUDIT] Starting horsepower data audit for ${CATEGORIES.length} categories...`);

    for (const cat of CATEGORIES) {
        console.log(`[AUDIT] --- Category: ${cat} ---`);
        report.categories[cat] = { total: 0, fail: 0 };

        try {
            const listData = await fetchModList(cat, 0);
            const mods = listData.mods;
            report.totalMods += mods.length;
            report.categories[cat].total = mods.length;

            // Fetch in chunks of 5
            for (let i = 0; i < mods.length; i += 5) {
                const chunk = mods.slice(i, i + 5);
                await Promise.all(chunk.map(async (mod) => {
                    try {
                        const detail = await fetchModDetail(mod.modId);
                        const scanData = await deepScan(detail);

                        if (scanData.hpMax === 0) {
                            console.log(`[AUDIT] FAIL: ${mod.title}`);
                            report.failures.push({
                                modId: mod.modId,
                                title: mod.title,
                                category: cat,
                                url: mod.url,
                                author: mod.author
                            });
                            report.categories[cat].fail++;
                        } else {
                            console.log(`[AUDIT] OK: ${mod.title} (${scanData.hpMin}-${scanData.hpMax} HP)`);
                        }
                    } catch (e) {
                        console.log(`[AUDIT] ERROR: ${mod.title} (Fetch)`);
                    }
                }));
            }
        } catch (e) {
            console.error(`[AUDIT] Error fetching list for ${cat}: ${e.message}`);
        }
    }

    // Write JSON log
    const jsonPath = path.join(__dirname, 'audit_results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`[AUDIT] Complete! JSON data saved to: ${jsonPath}`);

    // Generate Markdown Report
    generateMarkdownReport(report);
}

function generateMarkdownReport(report) {
    let md = `# ModHub Horsepower Audit Report\n\n`;
    md += `**Date:** ${new Date(report.scanTime).toLocaleString()}\n`;
    md += `**Total Mods Audited:** ${report.totalMods}\n`;
    md += `**Failures (No HP Found):** ${report.failures.length} (${((report.failures.length / report.totalMods) * 100).toFixed(1)}%)\n\n`;

    md += `## Failures by Category\n`;
    md += `| Category | Total Checked | Failures | % |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    Object.entries(report.categories).forEach(([cat, stats]) => {
        const pct = stats.total > 0 ? ((stats.fail / stats.total) * 100).toFixed(0) : 0;
        md += `| ${cat} | ${stats.total} | ${stats.fail} | ${pct}% |\n`;
    });

    md += `\n## List of Problematic Mods\n`;
    md += `Mods where no horsepower data could be retrieved from metadata or descriptions:\n\n`;
    
    report.failures.forEach(f => {
        md += `- [${f.title}](${f.url}) (Cat: ${f.category}, Author: ${f.author})\n`;
    });

    const mdPath = path.join(__dirname, 'hp_audit_report.md');
    fs.writeFileSync(mdPath, md);
    console.log(`[AUDIT] Markdown report generated: ${mdPath}`);
}

runAudit().catch(console.error);
