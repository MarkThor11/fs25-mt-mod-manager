const path = require('path');
const fs = require('fs');

function getPersonalFolderPath() {
    if (process.platform !== 'win32') return null;
    const { execSync } = require('child_process');
    try {
        const stdout = execSync('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal').toString();
        const match = stdout.match(/REG_EXPAND_SZ\s+(.*)/) || stdout.match(/REG_SZ\s+(.*)/);
        if (match && match[1]) {
            let personalPath = match[1].trim();
            personalPath = personalPath.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
            return personalPath;
        }
    } catch (e) {}
    return null;
}

const home = process.env.USERPROFILE || process.env.HOME || '';
const roots = [
    getPersonalFolderPath(),
    path.join(home, 'Documents'),
    path.join(home, 'OneDrive', 'Documents')
].filter(Boolean);

for (const root of roots) {
    const logPath = path.join(root, 'My Games', 'FarmingSimulator2025', 'log.txt');
    if (fs.existsSync(logPath)) {
        console.log(`LOG_PATH: ${logPath}`);
        const content = fs.readFileSync(logPath, 'utf8');
        console.log('--- LOG CONTENT START ---');
        console.log(content.slice(0, 4000)); // First 4000 chars
        console.log('--- LOG CONTENT END ---');
        process.exit(0);
    }
}

console.log('Log file not found.');
