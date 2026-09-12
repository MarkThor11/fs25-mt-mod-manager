const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const modId = '320397'; 
    const url = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    
    console.log('ZIP links:');
    $('a[href$=".zip"]').each((i, el) => {
        console.log(`- ${$(el).attr('href')} | Text: ${$(el).text().trim()}`);
    });
}

test();
