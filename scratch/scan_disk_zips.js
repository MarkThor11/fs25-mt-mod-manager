const fs = require('fs');
const path = require('path');

const folders = ["F:\\mods4", "C:\\Users\\Mark\\Documents\\My Games\\FarmingSimulator2025\\mods", "D:\\mods", "E:\\mods"];

let totalZipsOnDisk = 0;
const allDiskZips = [];

folders.forEach(dir => {
  if (fs.existsSync(dir)) {
    const list = fs.readdirSync(dir);
    const zips = list.filter(f => f.toLowerCase().endsWith('.zip'));
    console.log(`Directory ${dir}: ${zips.length} zips`);
    totalZipsOnDisk += zips.length;
    zips.forEach(f => allDiskZips.push(path.join(dir, f)));
  } else {
    console.log(`Directory ${dir} DOES NOT EXIST`);
  }
});

console.log('Total zip files on disk across all folders:', totalZipsOnDisk);
