const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const { execSync } = require('child_process');

/**
 * Get the "Personal" (Documents) folder path from the Windows Registry.
 * This is the most reliable way to find the real Documents folder, even if redirected to OneDrive.
 */
function getPersonalFolderPath() {
    if (process.platform !== 'win32') return null;
    
    try {
        const stdout = execSync('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal').toString();
        const match = stdout.match(/REG_EXPAND_SZ\s+(.*)/) || stdout.match(/REG_SZ\s+(.*)/);
        if (match && match[1]) {
            let personalPath = match[1].trim();
            // Handle environment variables like %USERPROFILE%
            personalPath = personalPath.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
            return personalPath;
        }
    } catch (e) {
        console.warn('[PATH-PROVIDER] Personal folder registry check failed:', e.message);
    }
    return null;
}

/**
 * Find all potential Farming Simulator 25 data roots.
 */
function getAllFS25DataRoots() {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const roots = [];
    
    // 1. Electron's detected documents path
    try { roots.push(app.getPath('documents')); } catch (e) {}
    
    // 2. Registry path (highest priority if found)
    const regPath = getPersonalFolderPath();
    if (regPath) roots.unshift(regPath);
    
    // 3. Common fallbacks
    roots.push(path.join(home, 'Documents'));
    roots.push(path.join(home, 'OneDrive', 'Documents'));
    roots.push(home);
    
    const uniqueRoots = [...new Set(roots.filter(Boolean))];
    const results = [];
    
    for (const root of uniqueRoots) {
        if (!fs.existsSync(root)) continue;
        
        const possibleProfiles = [
            path.join(root, 'My Games', 'FarmingSimulator2025'),
            path.join(root, 'FarmingSimulator2025'),
            path.join(root, 'My Games', 'Farming Simulator 25'),
            path.join(root, 'Farming Simulator 25'),
        ];
        
        for (const profilePath of possibleProfiles) {
            if (fs.existsSync(profilePath)) {
                results.push(profilePath);
            }
        }
    }
    
    return [...new Set(results)];
}

/**
 * Get the primary Farming Simulator 25 data root.
 */
function getFS25DataRoot() {
    const roots = getAllFS25DataRoots();
    
    if (roots.length > 0) return roots[0];
    
    // Final fallback logic
    if (process.platform === 'win32') {
        return path.join(process.env.USERPROFILE || '', 'Documents', 'My Games', 'FarmingSimulator2025');
    }
    
    // macOS
    return path.join(
        process.env.HOME || '', 
        'Library', 'Containers', 'com.giants.farmingsimulator2025', 
        'Data', 'Library', 'Application Support', 'FarmingSimulator2025'
    );
}

/**
 * Get the default mods directory path.
 */
function getDefaultModsPath() {
    return path.join(getFS25DataRoot(), 'mods');
}

module.exports = {
    getPersonalFolderPath,
    getAllFS25DataRoots,
    getFS25DataRoot,
    getDefaultModsPath
};
