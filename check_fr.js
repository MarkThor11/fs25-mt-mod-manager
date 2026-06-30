const { app } = require('electron');
app.whenReady().then(async () => {
    const scraper = require('./src/main/services/scraper');
    const res = await scraper.fetchModDetail('338935', 'fr');
    console.log(res.dependencies.length, res.dependencies.map(d => d.title));
    app.quit();
});
