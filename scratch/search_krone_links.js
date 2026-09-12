const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const query = 'krone';
    const searchUrl = `https://www.farming-simulator.com/mods.php?title=fs2025&searchMod=${query}`;
    console.log(`Searching: ${searchUrl}`);
    
    const { data: searchHtml } = await axios.get(searchUrl);
    const $search = cheerio.load(searchHtml);
    
    const mods = [];
    $search('.mod-item').each((i, el) => {
        const title = $search(el).find('.mod-item__title').text().trim();
        const href = $search(el).find('.mod-item__title a').attr('href');
        const modId = href ? href.match(/mod_id=(\d+)/)?.[1] : null;
        if (title && modId) mods.push({ title, modId });
    });

    console.log(`Found ${mods.length} mods.`);
    for (const mod of mods.slice(0, 5)) {
        console.log(`\nInspecting: ${mod.title} (${mod.modId})`);
        const detailUrl = `https://www.farming-simulator.com/mod.php?mod_id=${mod.modId}&title=fs2025`;
        const { data: detailHtml } = await axios.get(detailUrl);
        const $detail = cheerio.load(detailHtml);
        
        let downloadUrl = '';
        
        // Try the logic from scraper.js
        $detail('a[href*="modHub/storage"][href$=".zip"]').each((i, el) => {
            if (downloadUrl) return;
            downloadUrl = $detail(el).attr('href');
        });

        if (!downloadUrl) {
            $detail('.button-buy, .button-dark-green, [class*="button-download"]').each((i, el) => {
                if (downloadUrl) return;
                const href = $detail(el).attr('href');
                if (href && (href.includes('modHub/storage') || href.endsWith('.zip'))) {
                    downloadUrl = href;
                }
            });
        }

        if (!downloadUrl) {
            // New fallback logic
            $detail('a[href$=".zip"]').each((i, el) => {
                if (downloadUrl) return;
                downloadUrl = $detail(el).attr('href');
            });
        }

        console.log(`- Download URL: ${downloadUrl || 'NOT FOUND'}`);
        if (!downloadUrl) {
            console.log('  DEBUG: Button classes found:', $detail('.mod-detail-download a').attr('class'));
            console.log('  DEBUG: All links in mod-detail-download:');
            $detail('.mod-detail-download a').each((i, el) => {
                console.log(`    ${$detail(el).attr('href')} | ${$detail(el).text().trim()}`);
            });
        }
    }
}

test();
