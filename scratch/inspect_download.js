const https = require('https');
const zlib = require('zlib');
const cheerio = require('cheerio');

https.get('https://www.farming-simulator.com/mod.php?mod_id=320608&title=fs2025', {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    'Accept-Encoding': 'gzip, deflate'
  }
}, res => {
  let s = res;
  if (res.headers['content-encoding'] === 'gzip') s = res.pipe(zlib.createGunzip());
  let d = '';
  s.on('data', c => d+=c);
  s.on('end', () => {
    const $ = cheerio.load(d);
    const btn = $('.button-buy').first();
    let p = btn.parent();
    while(p.length && p[0].tagName !== 'body') {
        console.log(p[0].tagName, p.attr('class'));
        p = p.parent();
    }
  });
});
