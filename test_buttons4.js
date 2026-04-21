const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_modhub_download.html', 'utf8');
const m = cheerio.load(html);

console.log('--- HTML around buttons ---');
m('.button-buy.button-small').each((i, el) => {
    console.log(m(el).parent().html());
});
