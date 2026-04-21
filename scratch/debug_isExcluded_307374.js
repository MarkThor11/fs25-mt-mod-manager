const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const modId = '307374'; 
    const url = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    
    const isExcluded = (el) => {
        const container = $(el).closest('.row, .columns, section, div, ul');
        const prevText = container.prev('h2, h3').text().toLowerCase();
        const containerText = container.text().toLowerCase();
        
        console.log('Prev Heading:', prevText);
        console.log('Container Text snippet:', containerText.substring(0, 100).replace(/\n/g, ' '));
        
        const res = prevText.includes('required mods') || prevText.includes('necessary') || prevText.includes('dependency')
                    || containerText.includes('required mods') || containerText.includes('necessary') || containerText.includes('dependency');
        return res;
    };

    $('a[href*="modHub/storage"][href$=".zip"]').each((i, el) => {
        const url = $(el).attr('href');
        const exc = isExcluded(el);
        console.log(`Link: ${url} | Excluded: ${exc}`);
    });
}

test();
