const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const url = 'https://www.farming-simulator.com/mod.php?mod_id=320608&title=fs2025';
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    
    const headings = $('h3, h4, h2');
    const requiredHeading = headings.filter((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
        return /required.*mods|necessary.*mods|nécessaires|erforderliche|benötigte|necessary/i.test(text);
    }).first();

    if (requiredHeading.length) {
        console.log('Found Heading:', requiredHeading.text());
        console.log('Parent HTML:', requiredHeading.parent().html());
        
        let foundHeading = false;
        requiredHeading.parent().contents().each((_, node) => {
            if (node === requiredHeading[0]) {
                foundHeading = true;
                return;
            }
            if (!foundHeading) return;
            
            if (node.type === 'tag' && /^h[1-6]$/i.test(node.tagName)) {
                foundHeading = false;
                return;
            }

            const $node = $(node);
            const rawText = (node.type === 'text') ? node.data : $node.text();
            console.log('Node Type:', node.type, 'Tag:', node.tagName, 'Text:', rawText.trim());
        });
    } else {
        console.log('No required mods heading found');
    }
}

test();
