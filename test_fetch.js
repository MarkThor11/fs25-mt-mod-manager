const scraper = require('./src/main/services/scraper');
scraper.fetchModDetail('338935').then(res => console.log(res.dependencies));
