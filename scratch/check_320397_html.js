const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const modId = '320397'; 
    const url = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    
    console.log('Page Title:', $('title').text());
    console.log('Download area HTML:', $('.mod-detail-download').html());
    console.log('All links on page (first 10):');
    $('a').slice(0, 10).each((i, el) => {
        console.log($(el).attr('href'), '| Text:', $(el).text().trim());
    });
}

test();
