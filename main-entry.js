// Universal Electron main bootstrap
require('bytenode');
const fs = require('fs');
const path = require('path');

const { app } = require('electron');
const distMainEntry = path.join(__dirname, 'dist-main', 'index.js');

if ((app && app.isPackaged) && fs.existsSync(distMainEntry)) {
  require(distMainEntry);
} else {
  require('./src/main/index.js');
}
