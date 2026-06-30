const { app } = require('electron');
app.whenReady().then(async () => {
    const cache = require('./src/main/services/cache');
    await cache.init();
    const modManager = require('./src/main/services/modManager');
    const { mods } = await modManager.scanLocalMods();
    const map = mods.find(m => m.modName === 'FS25_Monteriggioni' || String(m.title).includes('Monteriggioni'));
    console.log('Monteriggioni modId:', map?.modId);
    console.log('Monteriggioni Dependencies:', map?.dependencies?.length);
    app.quit();
});
