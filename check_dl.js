const cheerio = require('cheerio');

async function checkUrl(url) {
  const res = await fetch(url);
  const html = await res.text();
  console.log('Contains download.php:', html.includes('download.php'));
  const $ = cheerio.load(html);
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href && (href.includes('.zip') || href.includes('download'))) {
      console.log('Found link:', href);
    }
  });
}

checkUrl('https://www.farming-simulator.com/mod.php?mod_id=315279&title=fs2025');
