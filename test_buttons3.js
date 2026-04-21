const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_modhub_download.html', 'utf8');
const m = cheerio.load(html);

console.log('--- Checking Buttons ---');
m('.button-dark-green, .button-buy, [class*="button-download"]').each((i, el) => {
    console.log('classes:', m(el).attr('class'));
    console.log('href:', m(el).attr('href'));
    console.log('text:', m(el).text().trim());
});

console.log('--- Checking all Links with zip or storage ---');
m('a').each((i, el) => {
    const href = m(el).attr('href') || '';
    if (href.includes('modHub/storage') || href.endsWith('.zip')) {
        console.log('href:', href, 'text:', m(el).text().trim());
    }
});
