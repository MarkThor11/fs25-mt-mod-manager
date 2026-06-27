const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');

app.whenReady().then(async () => {
    try {
        console.log('App ready. Testing teleport coordinates...');
        const savegameManager = require('../src/main/services/savegameManager');
        const savePath = path.join(app.getPath('documents'), 'My Games', 'FarmingSimulator2025', 'savegame1');
        
        console.log('\n--- 1. Testing getStoreDeliveryCoordinates ---');
        const customCoords = await savegameManager.getStoreDeliveryCoordinates(savePath);
        console.log('Custom Coords:', customCoords);
        
        console.log('\n--- 2. Testing getMapShopCoordinates ---');
        const shopCoords = await savegameManager.getMapShopCoordinates(savePath);
        console.log('Shop Coords:', shopCoords);
        
        console.log('\n--- 3. Testing setPlayerPosition ---');
        console.log('Before set:');
        const beforePos = await savegameManager.getPlayerPosition(savePath);
        console.log('Player Pos:', beforePos);
        
        const testPos = { x: 100.123, y: 50.456, z: -200.789 };
        console.log('Setting to:', testPos);
        const setRes = await savegameManager.setPlayerPosition({ savePath, x: testPos.x, y: testPos.y, z: testPos.z });
        console.log('Set Result:', setRes);
        
        console.log('After set:');
        const afterPos = await savegameManager.getPlayerPosition(savePath);
        console.log('Player Pos:', afterPos);
        
        // Restore original position
        if (beforePos) {
            console.log('Restoring original position...');
            await savegameManager.setPlayerPosition({ savePath, x: beforePos.x, y: beforePos.y, z: beforePos.z });
        }
    } catch (e) {
        console.error('Error:', e);
    }
    app.quit();
});
