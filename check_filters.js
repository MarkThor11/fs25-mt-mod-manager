const axios = require('axios');
const cheerio = require('cheerio');

const filters = [
    'pallets',
    'bigbags',
    'ibc',
    'objectMisc',
    'objectAnimal',
    'weights',
    'bigbagPallets',
    'bales'
];

async function checkFilters() {
    for (const filter of filters) {
        try {
            const url = `https://www.farming-simulator.com/mods.php?title=fs2025&filter=${filter}`;
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const $ = cheerio.load(response.data);
            const activeFilter = $('.modhub-filter .active').text().trim().toLowerCase() ||
                                $('.modhub-navigation-filter-active').text().trim().toLowerCase();
            
            // Look for the header text too
            const headerText = $('.section-title').text().trim();
            
            console.log(`Filter: ${filter} -> URL: ${response.request.res.responseUrl}`);
            console.log(`  Active Item: ${activeFilter}`);
            console.log(`  Header: ${headerText}`);
            
            if (response.request.res.responseUrl.includes('filter=latest') || headerText.includes('Latest')) {
                console.log(`  [!] REDIRECTED TO LATEST`);
            }
        } catch (err) {
            console.error(`  Error checking ${filter}: ${err.message}`);
        }
    }
}

checkFilters();
