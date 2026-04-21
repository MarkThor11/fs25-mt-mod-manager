const https = require('https');
const cheerio = require('cheerio');
const scraper = require('./src/main/services/scraper');

async function debugSearch() {
    const query = 'John Deere';
    const url = `https://www.farming-simulator.com/mods.php?title=fs2025&searchMod=${encodeURIComponent(query)}&page=0&lang=en&country=gb`;
    
    console.log(`FETCHING: ${url}`);
    
    https.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            const $ = cheerio.load(data);
            const firstItem = $('.mod-item').first();
            console.log('\n--- FIRST MOD ITEM HTML ---');
            console.log(firstItem.html());
            console.log('--- END HTML ---\n');
            
            const results = scraper.searchMods(query); // It's async but we just want to see if it works
        });
    });
}

debugSearch();
