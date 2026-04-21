const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');

// Mock electron app for testing
const mockApp = {
    getPath: (name) => {
        const home = process.env.USERPROFILE || process.env.HOME || '';
        if (name === 'documents') return path.join(home, 'Documents');
        return '';
    }
};

function getFS25DataRoot() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const roots = [];

  // 1. Collect potential profile roots
  try { roots.push(mockApp.getPath('documents')); } catch (e) {}
  
  roots.push(path.join(home, 'Documents'));
  roots.push(path.join(home, 'OneDrive', 'Documents'));
  roots.push(home);

  // Registry check for "Personal" folder
  try {
    const { execSync } = require('child_process');
    const stdout = execSync('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal').toString();
    const match = stdout.match(/REG_EXPAND_SZ\s+(.*)/) || stdout.match(/REG_SZ\s+(.*)/);
    if (match) {
      let regPath = match[1].trim().replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
      if (regPath) roots.unshift(regPath);
    }
  } catch (e) {}

  const uniqueRoots = [...new Set(roots.filter(Boolean))];
  console.log('Unique roots to check:', uniqueRoots);

  for (const root of uniqueRoots) {
    if (!fs.existsSync(root)) {
        console.log(`Root does not exist: ${root}`);
        continue;
    }
    
    const possibleProfiles = [
      path.join(root, 'My Games', 'FarmingSimulator2025'),
      path.join(root, 'FarmingSimulator2025'),
      path.join(root, 'My Games', 'Farming Simulator 25'),
      path.join(root, 'Farming Simulator 25'),
    ];

    for (const profilePath of possibleProfiles) {
      if (fs.existsSync(profilePath)) {
        console.log(`FOUND PROFILE PATH: ${profilePath}`);
        return profilePath;
      }
    }
  }

  return 'NOT_FOUND';
}

const detected = getFS25DataRoot();
console.log(`FINAL DETECTED PATH: ${detected}`);

if (detected !== 'NOT_FOUND') {
    const save1 = path.join(detected, 'savegame1');
    console.log(`Checking for savegame1 at: ${save1}`);
    console.log(`Exists? ${fs.existsSync(save1)}`);
    
    if (fs.existsSync(save1)) {
        const files = fs.readdirSync(save1);
        console.log(`Files in savegame1: ${files.join(', ')}`);
    }
}
