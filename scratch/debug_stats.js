const axios = require('axios');
const cheerio = require('cheerio');

async function debugStats() {
    const MODS_URL = 'https://www.farming-simulator.com/mods.php';
    const url = `${MODS_URL}?title=fs2025&filter=latest&page=0`;
    
    console.log(`Fetching: ${url}`);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        const mods = [];
        
        console.log('Body length:', response.data.length);
        
        $('.mod-item').each((i, el) => {
            const $el = $(el);
            const title = $el.find('.mod-item__content h4').text().trim();
            const isNew = $el.find('.mod-label-new, .label-new, [data-label="new"]').length > 0;
            const isUpdate = $el.find('.mod-label-update, .label-update, [data-label="update"]').length > 0;
            
            if (i < 5) {
               console.log(`Mod ${i}: "${title}" - New: ${isNew}, Update: ${isUpdate}`);
               // Console log HTML of label wrapper if found
               if (isNew || isUpdate) {
                   console.log('Label found!');
               } else {
                   // Log first 100 chars of mod-item text to see if we can find keywords
                   // console.log('Snippet:', $el.text().substring(0, 100).replace(/\s+/g, ' '));
               }
            }
            
            mods.push({ title, isNew, isUpdate });
        });
        
        const newCount = mods.filter(m => m.isNew).length;
        const updateCount = mods.filter(m => m.isUpdate).length;
        
        let totalPages = 1;
        $('.pagination a, a[href*="page="]').each((_, el) => {
            const text = $(el).text().trim();
            const pageNum = parseInt(text, 10);
            if (!isNaN(pageNum) && pageNum > totalPages) {
                totalPages = pageNum;
            }
        });

        console.log('\n--- Results ---');
        console.log('Total Mods Found on Page 0:', mods.length);
        console.log('New Count:', newCount);
        console.log('Update Count:', updateCount);
        console.log('Total Pages detected:', totalPages);
        
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

debugStats();
