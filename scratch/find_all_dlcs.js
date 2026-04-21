const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function findDlcs() {
    console.log('--- DLC FILE DISCOVERY ---');
    
    // 1. Check Profile Path
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const profilePdlc = path.join(home, 'Documents', 'My Games', 'FarmingSimulator2025', 'pdlc');
    if (fs.existsSync(profilePdlc)) {
        console.log(`Profile PDLC: ${profilePdlc}`);
        fs.readdirSync(profilePdlc).filter(f => f.endsWith('.dlc')).forEach(f => console.log(`  [P] ${f}`));
    }

    // 2. Check Registry for Game Path
    try {
        const cmd = 'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GIANTS Software\\FarmingSimulator2025" /v InstallPath';
        const stdout = execSync(cmd).toString();
        const match = stdout.match(/REG_SZ\s+(.*)/);
        if (match) {
            const gamePath = match[1].trim();
            const gamePdlc = path.join(gamePath, 'pdlc');
            console.log(`Game PDLC: ${gamePdlc}`);
            if (fs.existsSync(gamePdlc)) {
                fs.readdirSync(gamePdlc).filter(f => f.endsWith('.dlc')).forEach(f => console.log(`  [G] ${f}`));
            }
        }
    } catch (e) {
        console.log('Registry check failed (Steam/Epic might use different keys)');
    }

    // 3. Fallback: Search all drives for pdlc folders? Too slow. 
    // Try steam path
    try {
        const steamCmd = 'reg query "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v SteamPath';
        const steamPath = execSync(steamCmd).toString().match(/REG_SZ\s+(.*)/)[1].trim();
        const common = path.join(steamPath, 'steamapps', 'common', 'Farming Simulator 25', 'pdlc');
        if (fs.existsSync(common)) {
            console.log(`Steam PDLC: ${common}`);
            fs.readdirSync(common).filter(f => f.endsWith('.dlc')).forEach(f => console.log(`  [S] ${f}`));
        }
    } catch (e) {}
}

findDlcs();
