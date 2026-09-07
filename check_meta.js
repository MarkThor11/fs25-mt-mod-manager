const cheerio = require('cheerio');
const fs = require('fs');
fetch('https://www.farming-simulator.com/mod.php?mod_id=315279&title=fs2025')
  .then(res => res.text())
  .then(html => {
    const $ = cheerio.load(html);
    const metadata = {};
    $('.table-row').each((_, el) => {
      const cells = $(el).find('.table-cell');
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        metadata[label] = value;
      }
    });
    console.log(metadata);
  });
