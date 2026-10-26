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
 * Checks if a given folder looks like an FS25 profile root directory.
 */
function isLikelyFS25DataRoot(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') return false;
    try {
        if (!fs.existsSync(dirPath)) return false;
        if (fs.existsSync(path.join(dirPath, 'gameSettings.xml'))) return true;
        if (fs.existsSync(path.join(dirPath, 'inputBinding.xml'))) return true;
        if (fs.existsSync(path.join(dirPath, 'savegame1'))) return true;
        if (fs.existsSync(path.join(dirPath, 'mods'))) return true;
        const base = path.basename(dirPath).toLowerCase();
        if (base === 'farmingsimulator2025' || base === 'farming simulator 25') return true;
    } catch (_) {}
    return false;
}

/**
 * Checks configured mod paths from cache settings to deduce the active FS25 data root.
 * If user configured/selected a mods folder (e.g. .../FarmingSimulator2025/mods),
 * its parent directory is the definitive data root.
 */
function getConfiguredModDataRoots() {
    const roots = [];
    try {
        const cache = require('./cache');
        const rawPaths = cache.getSetting('modsPaths');
        const singlePath = cache.getSetting('modsPath');
        const candidatePaths = [];
        if (rawPaths) {
            try {
                const parsed = JSON.parse(rawPaths);
                if (Array.isArray(parsed)) candidatePaths.push(...parsed);
            } catch (_) {}
        }
        if (singlePath) candidatePaths.push(singlePath);

        for (const p of candidatePaths) {
            if (!p || typeof p !== 'string') continue;
            const norm = path.normalize(p.trim());
            const parent = path.dirname(norm);
            if (isLikelyFS25DataRoot(parent)) {
                roots.push(parent);
            }
            if (isLikelyFS25DataRoot(norm)) {
                roots.push(norm);
            }
        }
    } catch (_) {}
    return roots;
}

/**
 * Scan Linux Steam Proton compatdata prefixes for Farming Simulator 25 (AppId 2300320).
 */
function getLinuxProtonDataRoots() {
    if (process.platform !== 'linux') return [];
    const roots = [];
    const home = process.env.HOME || '';
    const steamBases = [
        path.join(home, '.local', 'share', 'Steam'),
        path.join(home, '.steam', 'steam'),
        path.join(home, '.steam', 'root'),
        path.join(home, '.steam'),
        path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
        path.join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam')
    ];

    const libraryPaths = new Set(steamBases.filter(b => fs.existsSync(b)));

    // Parse libraryfolders.vdf from all detected Steam installations
    for (const base of steamBases) {
        const vdfPath = path.join(base, 'steamapps', 'libraryfolders.vdf');
        if (fs.existsSync(vdfPath)) {
            try {
                const vdfContent = fs.readFileSync(vdfPath, 'utf8');
                const matches = vdfContent.matchAll(/"path"\s+"([^"]+)"/g);
                for (const m of matches) {
                    if (m[1] && fs.existsSync(m[1])) {
                        libraryPaths.add(m[1]);
                    }
                }
            } catch (_) {}
        }
    }

    for (const lib of libraryPaths) {
        const compatPfx = path.join(lib, 'steamapps', 'compatdata', '2300320', 'pfx', 'drive_c', 'users');
        if (fs.existsSync(compatPfx)) {
            try {
                const users = fs.readdirSync(compatPfx);
                for (const u of users) {
                    const userDir = path.join(compatPfx, u);
                    const subProfiles = [
                        path.join(userDir, 'My Documents', 'My Games', 'FarmingSimulator2025'),
                        path.join(userDir, 'Documents', 'My Games', 'FarmingSimulator2025'),
                        path.join(userDir, 'My Games', 'FarmingSimulator2025'),
                        path.join(userDir, 'My Documents', 'My Games', 'Farming Simulator 25'),
                        path.join(userDir, 'Documents', 'My Games', 'Farming Simulator 25')
                    ];
                    for (const sp of subProfiles) {
                        if (fs.existsSync(sp)) {
                            roots.push(sp);
                        }
                    }
                }
            } catch (_) {}
        }
    }

    return roots;
}

/**
 * Find all potential Farming Simulator 25 data roots.
 */
function getAllFS25DataRoots() {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const results = [];

    // 0. Highest priority: configured mod paths in settings (parent directory of mods folder)
    const configuredRoots = getConfiguredModDataRoots();
    for (const cr of configuredRoots) {
        if (fs.existsSync(cr)) results.push(cr);
    }

    // 1. Linux Proton / Wine Steam paths
    if (process.platform === 'linux') {
        const protonRoots = getLinuxProtonDataRoots();
        for (const pr of protonRoots) {
            if (fs.existsSync(pr)) results.push(pr);
        }

        // Also check relative to configured gamePath
        try {
            const cache = require('./cache');
            const customGame = cache.getSetting('gamePath');
            if (customGame && typeof customGame === 'string') {
                const gDir = path.dirname(customGame.trim());
                const steamappsDir = path.resolve(gDir, '..', '..');
                if (path.basename(steamappsDir).toLowerCase() === 'steamapps') {
                    const compatPfx = path.join(steamappsDir, 'compatdata', '2300320', 'pfx', 'drive_c', 'users');
                    if (fs.existsSync(compatPfx)) {
                        const users = fs.readdirSync(compatPfx);
                        for (const u of users) {
                            const candidates = [
                                path.join(compatPfx, u, 'My Documents', 'My Games', 'FarmingSimulator2025'),
                                path.join(compatPfx, u, 'Documents', 'My Games', 'FarmingSimulator2025'),
                                path.join(compatPfx, u, 'My Games', 'FarmingSimulator2025')
                            ];
                            for (const c of candidates) {
                                if (fs.existsSync(c)) results.push(c);
                            }
                        }
                    }
                }
            }
        } catch (_) {}
    }

    const roots = [];
    
    // 2. Electron's detected documents path
    try { roots.push(app.getPath('documents')); } catch (e) {}
    
    // 3. Registry path (highest priority on Windows if found)
    const regPath = getPersonalFolderPath();
    if (regPath) roots.unshift(regPath);
    
    // 4. Common fallbacks
    roots.push(path.join(home, 'Documents'));
    roots.push(path.join(home, 'OneDrive', 'Documents'));
    roots.push(home);
    
    const uniqueRoots = [...new Set(roots.filter(Boolean))];
    
    for (const root of uniqueRoots) {
        if (!fs.existsSync(root)) continue;
        
        const possibleProfiles = [
            path.join(root, 'My Games', 'FarmingSimulator2025'),
            path.join(root, 'FarmingSimulator2025'),
            path.join(root, 'My Games', 'Farming Simulator 25'),
            path.join(root, 'Farming Simulator 25'),
            path.join(root, 'Library', 'Application Support', 'FarmingSimulator2025'),
            path.join(root, 'Library', 'Containers', 'com.giants.farmingsimulator2025', 'Data', 'Library', 'Application Support', 'FarmingSimulator2025'),
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

    if (process.platform === 'linux') {
        const home = process.env.HOME || '';
        return path.join(
            home,
            '.local', 'share', 'Steam', 'steamapps', 'compatdata', '2300320', 'pfx', 'drive_c', 'users', 'steamuser', 'My Documents', 'My Games', 'FarmingSimulator2025'
        );
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

/**
 * Get the path to gameSettings.xml in the active FS25 data root.
 */
function getGameSettingsPath() {
    return path.join(getFS25DataRoot(), 'gameSettings.xml');
}

/**
 * Reads gameSettings.xml to check if the user has an active <modsDirectoryOverride>.
 * If active="true" and directory is a non-virtual user path, returns that directory path.
 */
function getGameSettingsModsOverride() {
    try {
        const settingsPath = getGameSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const xml = fs.readFileSync(settingsPath, 'utf8');
            const activeMatch = xml.match(/<modsDirectoryOverride[^>]+active=["']true["']/i);
            const dirMatch = xml.match(/<modsDirectoryOverride[^>]+directory=["']([^"']+)["']/i);
            if (activeMatch && dirMatch && dirMatch[1]) {
                let dir = dirMatch[1].replace(/\//g, path.sep).trim();
                // If on Linux and the override path has Z: drive prefix (from Wine/Proton), strip it
                if (process.platform === 'linux' && /^z:[\\/]/i.test(dir)) {
                    dir = dir.replace(/^z:[\\/]/i, '/');
                }
                // Filter out app's temporary virtual folders
                if (dir && !dir.includes('.fs25_virtual_mods') && !dir.includes('VirtualActiveMods')) {
                    if (fs.existsSync(dir)) {
                        return dir;
                    }
                }
            }
        }
    } catch (_) {}
    return null;
}

module.exports = {
    getPersonalFolderPath,
    getAllFS25DataRoots,
    getFS25DataRoot,
    getDefaultModsPath,
    getGameSettingsPath,
    getGameSettingsModsOverride
};
