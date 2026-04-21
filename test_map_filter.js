const scraper = require('./src/main/services/scraper');
async function test() {
    const res = await scraper.fetchModList('map', 0);
    console.log('Got mods:', res.mods.length);
    console.log('Actual Filter:', res.actualFilter);
    console.log('Total Pages:', res.pagination.total);
}
test();
