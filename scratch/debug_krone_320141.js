const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const modId = '320141'; // Krone BigPack 1270 VC
    const url = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    
    let downloadUrl = '';

    const isExcluded = (el) => {
        const closestContainer = $(el).closest('.row, .columns, section, div, ul');
        const prevHeading = closestContainer.prev('h2, h3').text().toLowerCase();
        const containerText = closestContainer.text().toLowerCase();
        
        console.log('--- Checking Exclusion ---');
        console.log('Heading:', prevHeading);
        // console.log('Container Text (short):', containerText.substring(0, 100));

        const isExc = prevHeading.includes('required mods') || prevHeading.includes('necessary') || prevHeading.includes('dependency');
        console.log('Is Excluded?', isExc);
        return isExc;
    };

    $('a[href*="modHub/storage"][href$=".zip"]').each((i, el) => {
        if (downloadUrl || isExcluded(el)) return;
        downloadUrl = $(el).attr('href');
        console.log('Found URL:', downloadUrl);
    });

    if (!downloadUrl) {
        console.log('Searching via buttons...');
        $('.button-buy, .button-dark-green, [class*="button-download"]').each((i, el) => {
            if (downloadUrl || isExcluded(el)) return;
            const href = $(el).attr('href');
            console.log('Button Href:', href);
            if (href && (href.includes('modHub/storage') || href.endsWith('.zip'))) {
                downloadUrl = href;
                console.log('Found URL via button:', downloadUrl);
            }
        });
    }

    console.log('Final Download URL:', downloadUrl);
}

test();
