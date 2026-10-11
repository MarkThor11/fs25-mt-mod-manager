const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const BUNDLED_PATH = path.join(__dirname, '..', 'src', 'main', 'resources', 'bundled_cache.json');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = `https://www.farming-simulator.com${redirectUrl}`;
        }
        return fetchUrl(redirectUrl).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

function parseModItem($, el) {
  const $el = $(el);
  const href = $el.find('a').attr('href') || '';
  const modIdMatch = href.match(/mod_id=(\d+)/i);
  if (!modIdMatch) return null;
  const modId = modIdMatch[1];
  const cleanId = String(modId).replace(/^0+/, '');

  const title = $el.find('.mod-item__title, h4, .title').text().trim();
  const author = $el.find('.mod-item__author, .author').text().replace(/^by\s+/i, '').trim();

  // Platforms
  const platformText = $el.find('.mod-item__subtitle, .platforms, .platform').text().trim() || $el.text();

  return {
    modId: cleanId,
    title: title || `Mod #${cleanId}`,
    author: author || 'GIANTS Software',
    platformText
  };
}

async function run() {
  console.log('=== SYNCING BUNDLED CACHE WITH MODHUB ===');
  
  if (!fs.existsSync(BUNDLED_PATH)) {
    console.error('Error: bundled_cache.json not found at:', BUNDLED_PATH);
    return;
  }

  const bundled = fs.readJsonSync(BUNDLED_PATH);
  const initialCount = Object.keys(bundled).length;
  console.log(`Initial bundled cache count: ${initialCount}`);

  // Fetch page 0 to get total pages
  const baseUrl = 'https://www.farming-simulator.com/mods.php?title=fs2025&page=';
  const html0 = await fetchUrl(`${baseUrl}0`);
  const $0 = cheerio.load(html0);

  let maxPage = 0;
  $0('.pagination a, .pagination-item a').each((_, el) => {
    const href = $0(el).attr('href') || '';
    const match = href.match(/page=(\d+)/);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      if (pageNum > maxPage) maxPage = pageNum;
    }
  });

  console.log(`Detected total pages on ModHub: ${maxPage + 1}`);

  let newModsCount = 0;
  for (let p = 0; p <= maxPage; p++) {
    try {
      const pageHtml = await fetchUrl(`${baseUrl}${p}`);
      const $ = cheerio.load(pageHtml);
      
      $('.mod-item').each((_, el) => {
        const item = parseModItem($, el);
        if (item && item.modId) {
          if (!bundled[item.modId]) {
            bundled[item.modId] = {
              modId: item.modId,
              title: item.title,
              author: item.author,
              category: 'Miscellaneous - Miscellaneous',
              metadata: {
                Game: 'Farming Simulator 25',
                Platform: item.platformText || 'PC/MAC, PS5, XBS, S2'
              }
            };
            newModsCount++;
          }
        }
      });

      if (p % 20 === 0 || p === maxPage) {
        console.log(`Processed page ${p}/${maxPage}... Found ${newModsCount} new mods so far.`);
      }

      // Small delay to prevent rate limits
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.warn(`Warning: Failed to fetch page ${p}: ${err.message}`);
    }
  }

  const finalCount = Object.keys(bundled).length;
  console.log(`Final bundled cache count: ${finalCount} (Added ${newModsCount} new mods)`);

  fs.writeJsonSync(BUNDLED_PATH, bundled, { spaces: 2 });
  console.log('Successfully saved updated bundled_cache.json!');
}

run().catch(console.error);
