const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_modhub_download.html', 'utf8');
const m = cheerio.load(html);

console.log('--- Forms ---');
m('form').each((i, el) => {
    console.log('action:', m(el).attr('action'));
    console.log('html:', m(el).html().trim());
});

console.log('--- Elements with download text ---');
m('*').each((i, el) => {
    const text = m(el).clone().children().remove().end().text().trim().toLowerCase();
    if (text === 'download') {
        console.log('element:', el.tagName, 'attr:', m(el).attr());
        console.log('parent html:', m(el).parent().html());
    }
});
