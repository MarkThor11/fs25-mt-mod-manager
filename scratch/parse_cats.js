const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('modhub_page.html', 'utf8');
const $ = cheerio.load(html);

$('a').each((i, el) => {
  const href = $(el).attr('href') || '';
  if (href.includes('filter=')) {
    console.log(`${$(el).text().trim()} ==> ${href}`);
  }
});
