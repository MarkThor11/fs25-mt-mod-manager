const html = require('fs').readFileSync('c:\\Users\\Mark\\Desktop\\GoogleModManager\\test_modhub_download.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);
$('a').each((i, el) => {
  const t = $(el).text().trim().toLowerCase();
  if (t.includes('download')) {
    console.log('text has download', $(el).attr('href'), $(el).text().trim());
  }
});
$('*[onclick]').each((i, el) => {
  if ($(el).attr('onclick').toLowerCase().includes('download')) {
    console.log('onclick download', $(el).attr('onclick'), $(el).text().trim());
  }
});
