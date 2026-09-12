const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    // Let's try some known Krone mods
    const modIds = ['320141', '321350', '319758']; 
    
    for (const modId of modIds) {
        console.log(`\nInspecting Mod ID: ${modId}`);
        const url = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;
        try {
            const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $ = cheerio.load(data);
            
            console.log('All ZIP links:');
            $('a[href$=".zip"]').each((i, el) => {
                console.log(`- ${$(el).attr('href')} | Text: ${$(el).text().trim()}`);
            });

            const downloadSection = $('.mod-detail-download');
            if (downloadSection.length) {
                console.log('Download section found!');
                console.log('Buttons in section:', downloadSection.find('a').length);
            } else {
                console.log('Download section NOT found!');
            }
        } catch (e) {
            console.error(`Error fetching ${modId}: ${e.message}`);
        }
    }
}

test();
