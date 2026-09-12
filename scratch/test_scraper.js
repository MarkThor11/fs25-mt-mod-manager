const scraper = require('../src/main/services/scraper');
scraper.__testFetchModDetail = async () => {
  const result = await scraper.fetchModDetail('320608');
  console.log(result.downloadUrl);
};
scraper.__testFetchModDetail();
