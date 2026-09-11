const cheerio = require('cheerio');

async function testUrl(url) {
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);
  
  console.log('--- Testing URL:', url);
  let downloadUrl = '';
  // Same logic as scraper.js
  const mainDownloadBtn = $('.button-buy, .button-dark-green, [class*="button-download"], .btn-download, a:contains("DOWNLOAD"), a:contains("ZIP")').filter((i, el) => {
      const h = $(el).attr('href');
      return h && (h.includes('storage/') || h.includes('.zip'));
  }).first();

  if (mainDownloadBtn.length) {
    downloadUrl = mainDownloadBtn.attr('href');
    console.log('Found main button:', downloadUrl);
  } else {
    $('a[href*="/storage/"][href*=".zip"]').each((i, el) => {
      downloadUrl = $(el).attr('href');
      console.log('Found via storage:', downloadUrl);
    });
  }
  
  if (!downloadUrl) {
      $('a[href*=".zip"]').each((i, el) => {
          console.log('Found via broad fallback:', $(el).attr('href'));
      });
  }
}

testUrl('https://www.farming-simulator.com/mod.php?mod_id=315475&title=fs2025'); // Komatsu (Official)
testUrl('https://www.farming-simulator.com/mod.php?mod_id=315279&title=fs2025'); // Silverrun (Official)
testUrl('https://www.farming-simulator.com/mod.php?mod_id=352501&title=fs2025'); // Typical mod
