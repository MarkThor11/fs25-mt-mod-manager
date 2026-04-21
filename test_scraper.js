const https = require('https');
const cheerio = require('cheerio');

const url = 'https://www.farming-simulator.com/mods.php?title=fs2025&filter=mapEurope&page=0';
console.log(`FETCHING: ${url}`);

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.farming-simulator.com/mods.php?title=fs2025'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', (d) => { data += d; });
  res.on('end', () => {
    // Save to file for manual inspection
    const fs = require('fs');
    fs.writeFileSync('response.html', data);
    console.log('Saved response.html for inspection.');

    const $ = cheerio.load(data);
    const mods = [];
    $('.mod-item').each((_, el) => {
      const title = $(el).find('.mod-item__title').text().trim();
      if (title) mods.push(title);
    });

    console.log(`Found ${mods.length} mods.`);
    mods.slice(0, 10).forEach((m, i) => console.log(`${i+1}. ${m}`));
    
    if (mods.length === 0) {
      console.log('DEBUG: The .mod-item class was not found. Character length of HTML:', data.length);
      console.log('FIRST 500 chars of HTML:', data.substring(0, 500));
    }
  });
}).on('error', (e) => {
  console.error(e);
});
