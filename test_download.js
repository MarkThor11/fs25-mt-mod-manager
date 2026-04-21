const fs = require('fs');
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function test() {
  const html = await fetch('https://www.farming-simulator.com/mod.php?mod_id=302196&title=fs2025&lang=en&country=gb');
  fs.writeFileSync('c:\\Users\\Mark\\Desktop\\GoogleModManager\\test_modhub_download.html', html);
  
  // Find download links
  const downloadLinks = html.match(/<a[^>]*href="[^"]*download[^"]*"[^>]*>/gi);
  console.log("Download Links:", downloadLinks);
  
  const zipLinks = html.match(/<a[^>]*href="[^"]*\.zip"[^>]*>/gi);
  console.log("ZIP Links:", zipLinks);

  const buttonClasses = html.match(/<a[^>]*class="[^"]*button[^"]*"[^>]*>/gi);
  console.log("Button Links:", buttonClasses?.filter(c => c.toLowerCase().includes('download')));
}
test();
