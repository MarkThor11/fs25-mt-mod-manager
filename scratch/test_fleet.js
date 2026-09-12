const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');

app.whenReady().then(async () => {
    try {
        console.log('App ready. Testing getFleetPositions...');
        const savegameManager = require('../src/main/services/savegameManager');
        const savePath = path.join(app.getPath('documents'), 'My Games', 'FarmingSimulator2025', 'savegame1');
        console.log('Testing with path:', savePath);
        
        const result = await savegameManager.getFleetPositions(savePath, 'MapUS');
        console.log('Result items count:', result.items ? result.items.length : 0);
        if (result.items) {
            result.items.forEach((item, index) => {
                console.log(`[${index}] Brand: ${item.brand}, Name: ${item.name}, Coordinates: ${item.x.toFixed(1)}, ${item.y.toFixed(1)}, ${item.z.toFixed(1)}`);
            });
        }
    } catch (e) {
        console.error('Error:', e);
    }
    app.quit();
});
