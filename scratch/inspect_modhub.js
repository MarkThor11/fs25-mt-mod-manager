const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://www.farming-simulator.com/mods.php?title=fs2025&filter=latest';

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        // Save raw HTML for analysis
        fs.writeFileSync(path.join(__dirname, 'modhub_raw.html'), data);
        console.log('Saved modhub_raw.html');
        
        // Find badges
        const badges = data.match(/mod-item__badge[^"]*/g);
        console.log('Found badges:', badges ? [...new Set(badges)] : 'None');
    });
}).on('error', (err) => {
    console.error('Error: ' + err.message);
});
