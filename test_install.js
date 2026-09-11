const modManager = require('./src/main/services/modManager');

modManager.installMod('315279', null, 'scratch', 'Silverrun Forest', (prog) => {
    if (prog.percent > 0) {
        console.log('Download started successfully!');
        process.exit(0);
    }
}).then(res => console.log('SUCCESS')).catch(err => console.error('FAILED:', err));
