const https = require('https');
const zlib = require('zlib');
const page = process.argv[2] || '0';

https.get(`https://www.farming-simulator.com/mods.php?title=fs2025&filter=latest&page=${page}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Encoding': 'gzip, deflate, br'
  }
}, res => {
  let bodyStream = res;
  if (res.headers['content-encoding'] === 'gzip') {
    bodyStream = res.pipe(zlib.createGunzip());
  } else if (res.headers['content-encoding'] === 'deflate') {
    bodyStream = res.pipe(zlib.createInflate());
  }
  let d = '';
  bodyStream.on('data', chunk => d += chunk);
  bodyStream.on('end', () => {
    const navMatch = d.match(/<ul class="pagination.*?>([\s\S]*?)<\/ul>/);
    if (navMatch) console.log(navMatch[0]);
    else console.log('no match');
  });
}).on('error', err => console.error(err));
