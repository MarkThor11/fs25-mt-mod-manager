const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const modId = '320608'; 
    const url = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    
    const isExcluded = (el) => {
        const container = $(el).closest('.row, .columns, section, div, ul');
        const prevHeading = container.prev('h2, h3').text().toLowerCase();
        const containerText = container.text().toLowerCase();
        
        console.log('\n--- Link:', $(el).text().trim(), '---');
        console.log('Prev Heading:', prevHeading);
        console.log('Container Text snippet:', containerText.substring(0, 100).replace(/\n/g, ' '));
        
        const res = prevHeading.includes('required mods') || prevHeading.includes('necessary') || prevHeading.includes('dependency')
                    || containerText.includes('required mods') || containerText.includes('necessary') || containerText.includes('dependency');
        console.log('Is Excluded?', res);
        return res;
    };

    $('a[href$=".zip"]').each((i, el) => {
        isExcluded(el);
    });
}

test();
