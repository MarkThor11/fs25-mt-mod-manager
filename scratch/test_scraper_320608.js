const axios = require('axios');
const cheerio = require('cheerio');

function resolveUrl(href) {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return 'https:' + href;
    return 'https://www.farming-simulator.com/' + (href.startsWith('/') ? href.slice(1) : href);
}

async function test() {
    const url = 'https://www.farming-simulator.com/mod.php?mod_id=320608&title=fs2025';
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    
    const dependencies = [];
    const seenUrls = new Set();
    const seenTitles = new Set();

    const headings = $('h3, h4, h2');
    const requiredHeading = headings.filter((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
        return /required.*mods|necessary.*mods|nécessaires|erforderliche|benötigte|necessary/i.test(text);
    }).first();

    if (requiredHeading.length) {
        let foundHeading = false;
        requiredHeading.parent().contents().each((_, node) => {
            if (node === requiredHeading[0]) {
                foundHeading = true;
                return;
            }
            if (!foundHeading) return;
            
            if (node.type === 'tag' && /^h[1-6]$/i.test(node.tagName)) {
                foundHeading = false;
                return;
            }

            const $node = $(node);

            // Strategy A
            if (node.type === 'tag' && node.tagName === 'a') {
                const dTitle = $node.text().trim();
                const dHref = $node.attr('href') || '';
                if (dTitle && dHref && dTitle.length > 2) {
                    const resolved = resolveUrl(dHref);
                    if (!seenUrls.has(resolved)) {
                        dependencies.push({ title: dTitle, url: resolved });
                        seenUrls.add(resolved);
                        seenTitles.add(dTitle.toLowerCase());
                    }
                }
            } 
            // Strategy B
            else if (node.type === 'tag') {
                $node.find('a').each((_, el) => {
                    const dTitle = $(el).text().trim();
                    const dHref = $(el).attr('href') || '';
                    if (dTitle && dHref && dTitle.length > 2) {
                        const resolved = resolveUrl(dHref);
                        if (!seenUrls.has(resolved)) {
                            dependencies.push({ title: dTitle, url: resolved });
                            seenUrls.add(resolved);
                            seenTitles.add(dTitle.toLowerCase());
                        }
                    }
                });
            }

            // Strategy C
            const rawText = (node.type === 'text') ? node.data : $node.text();
            if (rawText && rawText.trim().length > 3) {
                const lines = rawText.split(/,|\n|;|•|\|/);
                lines.forEach(line => {
                    let clean = line.trim()
                        .replace(/^[•\-\+]\s*/, '') // Remove bullets
                        .replace(/\(By:.*?\)/i, '') // Remove author info
                        .trim();
                    
                    if (clean && clean.length > 3 && clean.length < 100 &&
                        !seenTitles.has(clean.toLowerCase()) && 
                        !clean.toLowerCase().includes('required mods') &&
                        !clean.toLowerCase().includes('necessary') &&
                        !clean.toLowerCase().includes('included')) {
                        dependencies.push({ title: clean, url: '' });
                        seenTitles.add(clean.toLowerCase());
                    }
                });
            }
        });
    }

    console.log('Final Dependencies:', JSON.stringify(dependencies, null, 2));
}

test();
