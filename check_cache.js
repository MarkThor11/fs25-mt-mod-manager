const { app } = require('electron');

app.whenReady().then(async () => {
    const cache = require('./src/main/services/cache');
    await cache.init();
    
    // Check ModHub cache
    const db = cache.getDb ? cache.getDb() : null;
    let row;
    try {
        row = db.prepare('SELECT value FROM cache WHERE key = ?').get('modDetail_338935');
    } catch(e) {}
    
    if (row) {
        const data = JSON.parse(row.value);
        console.log("CACHE HAS", data.dependencies ? data.dependencies.length : 0, "DEPENDENCIES");
        console.log("DEPENDENCIES:", data.dependencies.map(d => d.title));
    } else {
        console.log("CACHE IS EMPTY FOR MONTERIGGIONI!");
    }
    
    app.quit();
});
