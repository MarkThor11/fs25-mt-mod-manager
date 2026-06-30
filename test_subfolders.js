const { app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
app.setPath('userData', path.join(process.env.APPDATA, 'fs25-mt-mod-manager'));

app.whenReady().then(async () => {
    const modManager = require('./src/main/services/modManager');
    const { mods } = await modManager.scanLocalMods();
    const shed = mods.find(m => m.fileName.includes('FS25_Average_Wooden_Shelter') || m.fileName.includes('FS25_SmallWoodenShed'));
    
    mods.filter(m => m.fileName.includes('Average_Wooden') || m.fileName.includes('SmallWoodenShed')).forEach(m => {
        console.log("Match:", m.title, m.fileName, m.modName);
    });
    
    app.quit();
});
