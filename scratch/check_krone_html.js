const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const modId = '320141'; // Krone BigPack 1270 VC
    const url = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    
    console.log('Download Section HTML:');
    console.log($('.mod-detail-download').html());
    
    console.log('\nAll ZIP links on page:');
    $('a[href$=".zip"]').each((i, el) => {
        console.log($(el).attr('href'), '| Text:', $(el).text().trim());
    });
}

test();
