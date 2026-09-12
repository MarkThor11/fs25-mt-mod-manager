const cheerio = require('cheerio');
const html = `
<ul class="pagination text-center clearfix" role="navigation" aria-label="Pagination">
    <li class="current">
        <span class="show-for-sr">You're on page</span> 1
    </li>
    <li>
        <a href="mods.php?title=fs2025&filter=latest&page=1" aria-label="Page 2">2</a>
    </li>
    <li>
        <a href="mods.php?title=fs2025&filter=latest&page=230" aria-label="Page 231">231</a>
    </li>
</ul>
`;
const $ = cheerio.load(html);
let totalPages = 1;
$('.pagination a, a[href*="page="]').each((_, el) => {
    const text = $(el).text().trim();
    const pageNum = parseInt(text, 10);
    if (!isNaN(pageNum) && pageNum > totalPages) {
        totalPages = pageNum;
    }
});
console.log(totalPages);
