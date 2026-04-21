const axios = require('axios');
const cheerio = require('cheerio');

async function verifyLastPage() {
    const MODS_URL = 'https://www.farming-simulator.com/mods.php';
    
    // 1. Get total pages from first page
    const firstPageUrl = `${MODS_URL}?title=fs2025&filter=latest&page=0`;
    console.log(`Checking first page for total pages: ${firstPageUrl}`);
    
    try {
        const res = await axios.get(firstPageUrl);
        const $ = cheerio.load(res.data);
        
        let lastPageNum = 0;
        $('.pagination a, a[href*="page="]').each((_, el) => {
            const text = $(el).text().trim();
            const pageNum = parseInt(text, 10);
            if (!isNaN(pageNum) && pageNum > lastPageNum) {
                lastPageNum = pageNum;
            }
        });
        
        console.log(`Last page number detected: ${lastPageNum}`);
        
        // 2. Fetch the last page (0-indexed, so page number is lastPageNum - 1)
        const lastPageUrl = `${MODS_URL}?title=fs2025&filter=latest&page=${lastPageNum - 1}`;
        console.log(`Fetching last page: ${lastPageUrl}`);
        
        const lastRes = await axios.get(lastPageUrl);
        const $last = cheerio.load(lastRes.data);
        const lastPageMods = [];
        $last('.mod-item').each(() => lastPageMods.push(1));
        
        console.log(`Number of mods on last page: ${lastPageMods.length}`);
        
        const trueTotal = ((lastPageNum - 1) * 24) + lastPageMods.length;
        console.log(`Calculated True Total: ${trueTotal}`);
        
    } catch (err) {
        console.error('Failed to verify last page:', err.message);
    }
}

verifyLastPage();
