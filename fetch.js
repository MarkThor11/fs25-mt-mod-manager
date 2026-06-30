const https = require('https');
https.get('https://www.farming-simulator.com/mod.php?mod_id=338935', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const regex = /class="table-mod-req"[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/g;
    let match;
    const titles = [];
    while ((match = regex.exec(data)) !== null) {
      titles.push(match[2]);
    }
    console.log(titles);
  });
});
