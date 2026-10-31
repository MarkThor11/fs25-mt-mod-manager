// Universal Electron main bootstrap
require('bytenode');
const fs = require('fs');
const path = require('path');

const distMainEntry = path.join(__dirname, 'dist-main', 'index.js');

if (fs.existsSync(distMainEntry)) {
  require(distMainEntry);
} else {
  require('./src/main/index.js');
}
