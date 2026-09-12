const cheerio = require('cheerio');
const html = `
<ul class="pagination text-center clearfix" role="navigation" aria-label="Pagination">
    <li>
        <a href="mods.php?title=fs2025&filter=latest&page=0" aria-label="Page 1">1</a>
    </li>
    <li>
        <span class="dots">...</span>
    </li>
    <li>
        <a href="mods.php?title=fs2025&filter=latest&page=229" aria-label="Page 230">230</a>
    </li>
    <li class="current">
        <span class="show-for-sr">You're on page</span> 231
    </li>
</ul>
`;
const $ = cheerio.load(html);
let totalPages = 1;
$('.pagination li').each((_, el) => {
    // some text might be "You're on page 231"
    // text() returns "You're on page 231"
    const text = $(el).text().replace(/[^\d]/g, '').trim();
    if (text) {
        const pageNum = parseInt(text, 10);
        if (!isNaN(pageNum) && pageNum > totalPages) {
            totalPages = pageNum;
        }
    }
});
console.log(totalPages);
