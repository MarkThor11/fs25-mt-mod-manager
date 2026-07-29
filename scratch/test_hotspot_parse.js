const fs = require('fs');

const xml1 = '<hotspot type="SHOP" linkNode="hotspotNode" teleportNode="teleportNode" worldPosition="-263 44" teleportWorldPosition="-263 60 44"/>';
const match = xml1.match(/teleportWorldPosition="([^"]+)"/i);
console.log('Parsed:', match ? match[1].split(/\s+/).map(parseFloat) : null);
