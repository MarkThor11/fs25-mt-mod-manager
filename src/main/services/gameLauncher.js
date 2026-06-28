const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const pathProvider = require('./pathProvider');
const systemOptimizer = require('./systemOptimizer');

/**
 * Common Farming Simulator 25 install paths.
 */
const COMMON_PATHS = {
  win32: [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Farming Simulator 25\\x64\\FarmingSimulator2025Game.exe',
    'C:\\Program Files\\Steam\\steamapps\\common\\Farming Simulator 25\\x64\\FarmingSimulator2025Game.exe',
    'D:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25\\x64\\FarmingSimulator2025Game.exe',
    'E:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25\\x64\\FarmingSimulator2025Game.exe',
    'C:\\Program Files (x86)\\Farming Simulator 2025\\x64\\FarmingSimulator2025Game.exe',
    'C:\\Program Files\\Farming Simulator 2025\\x64\\FarmingSimulator2025Game.exe',
  ],
  darwin: [
    '/Applications/Farming Simulator 2025.app',
    path.join(process.env.HOME || '', 'Applications/Farming Simulator 2025.app'),
  ],
};

/**
 * Try to find the game path from Windows Registry.
 */
async function getRegistryPath() {
  if (process.platform !== 'win32') return null;
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);

  const keys = [
    { key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Giants Software\\FarmingSimulator25', val: 'InstallPath' },
    { key: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Farming Simulator 25', val: 'InstallLocation' },
    { key: 'HKEY_CURRENT_USER\\Software\\Giants Software\\FarmingSimulator25', val: 'InstallPath' },
  ];

  for (const k of keys) {
    try {
      const { stdout } = await execAsync(`reg query "${k.key}" /v "${k.val}"`);
      const match = stdout.match(/REG_SZ\s+(.*)/);
      if (match && match[1]) {
        const installDir = match[1].trim();
        const exePath = path.join(installDir, 'x64', 'FarmingSimulator2025Game.exe');
        if (fs.existsSync(exePath)) return exePath;
        // Fallback to launcher if game.exe missing
        const launcherPath = path.join(installDir, 'FarmingSimulator2025.exe');
        if (fs.existsSync(launcherPath)) return launcherPath;
      }
    } catch (e) { /* ignore single key fail */ }
  }
  return null;
}

/**
 * Try to find the game path from Epic Games manifest.
 */
async function getEpicPath() {
  if (process.platform !== 'win32') return null;
  const manifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  if (!fs.existsSync(manifestDir)) return null;

  try {
    const files = await fs.readdir(manifestDir);
    for (const file of files) {
      if (file.endsWith('.item')) {
        const content = await fs.readJson(path.join(manifestDir, file));
        if (content.DisplayName === 'Farming Simulator 25' || content.MandatoryAppFolderName === 'FarmingSimulator25') {
          const installDir = content.InstallLocation;
          const exePath = path.join(installDir, 'x64', 'FarmingSimulator2025Game.exe');
          if (fs.existsSync(exePath)) return exePath;
          const launcherPath = path.join(installDir, 'FarmingSimulator2025.exe');
          if (fs.existsSync(launcherPath)) return launcherPath;
        }
      }
    }
  } catch (e) {
    console.error('Epic detection error:', e.message);
  }
  return null;
}

/**
 * Try to find the game path from Steam.
 */
function getSteamPath() {
  if (process.platform !== 'win32') return null;
  try {
    const { execSync } = require('child_process');
    const stdout = execSync('reg query "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v "SteamPath"').toString();
    const match = stdout.match(/REG_SZ\s+(.*)/);
    if (match && match[1]) {
      const steamDir = match[1].trim().replace(/\//g, '\\');
      // Check default location
      const exePath = path.join(steamDir, 'steamapps', 'common', 'Farming Simulator 25', 'x64', 'FarmingSimulator2025Game.exe');
      if (fs.existsSync(exePath)) return exePath;
      const launcherPath = path.join(steamDir, 'steamapps', 'common', 'Farming Simulator 25', 'FarmingSimulator2025.exe');
      if (fs.existsSync(launcherPath)) return launcherPath;
    }
  } catch (e) {}
  return null;
}

/**
 * Detect the game installation path.
 */
async function detectGamePath() {
  // 1. Check if user has set a custom path
  const cache = require('./cache');
  let customPath = cache.getSetting('gamePath');
  if (customPath && fs.existsSync(customPath)) {
    // AUTO-CORRECTION: If the user selected the launcher, upgrade it to the actual game exe
    if (customPath.toLowerCase().endsWith('farmingsimulator2025.exe')) {
      const x64Path = path.join(path.dirname(customPath), 'x64', 'FarmingSimulator2025Game.exe');
      if (fs.existsSync(x64Path)) {
        console.log('[LAUNCH] Auto-correcting custom path to x64 Game executable');
        customPath = x64Path;
      }
    }
    return { path: customPath, source: 'settings' };
  }

  // 2. Try Registry detection (Giants/Retail)
  const regPath = await getRegistryPath();
  if (regPath) return { path: regPath, source: 'registry' };

  // 3. Try Epic detection
  const epicPath = await getEpicPath();
  if (epicPath) return { path: epicPath, source: 'epic' };

  // 4. Try Steam detection
  const steamGamePath = getSteamPath();
  if (steamGamePath) {
    return { path: steamGamePath, source: 'steam' };
  }

  // 5. Check common paths
  const platform = process.platform;
  const paths = COMMON_PATHS[platform] || [];
  
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return { path: p, source: 'common' };
    }
  }

  return { path: null, source: null };
}

/**
 * Launch the game.
 * @param {Object} options 
 * @param {string} options.gamePath - Override game path
 * @param {number} options.savegameIndex - Savegame index to load
 */
async function launch(options = {}) {
  const gamePath = options.gamePath || (await detectGamePath()).path;
  
  // ── AUTOMATED SYSTEM OPTIMIZATION ──
  const cache = require('./cache');
  if (cache.getSetting('autoOptimize') !== 'false') {
    try {
      console.log('[LAUNCH] Auto-Optimizing game settings...');
      await systemOptimizer.optimize();
    } catch (e) {
      console.error('[LAUNCH] Optimization skipped:', e.message);
    }
  }
  
  if (!gamePath) {
    return { 
      success: false, 
      error: 'Game not found. Please set the game path in Settings.' 
    };
  }

  if (!fs.existsSync(gamePath)) {
    return {
      success: false,
      error: `Game executable not found at: ${gamePath}`,
    };
  }

  const args = [];

  // ── OPTIMIZED MODS PATH ──
  // If no specific modsPath is provided (Normal Launch), we synthesize a virtual folder 
  // that contains symlinks to all mods across all active mod paths.
  let targetModsPath = options.modsPath;
  const modManager = require('./modManager');

  if (!targetModsPath) {
    const cache = require('./cache');
    const isSelectiveEnabled = cache.getSetting('selectiveLoading') !== 'false';
    const effectiveIndex = isSelectiveEnabled ? options.savegameIndex : null;
    
    console.log(`[LAUNCH] ${effectiveIndex ? `Selective (Savegame ${effectiveIndex})` : 'Global'} Mod Synthesis...`);
    targetModsPath = await modManager.prepareVirtualModsFolder(effectiveIndex);
  }

  const defaultModsPath = modManager.getDefaultModsPath();
  
  if (targetModsPath && targetModsPath.toLowerCase() !== defaultModsPath.toLowerCase()) {
    args.push('-mods', targetModsPath);
  }

  // ── DYNAMIC INITIALIZATION HANDSHAKE ──
  // Check if this savegame is "Officialized" (initialized by the engine)
  let needsManualInit = false;
  if (options.savegameIndex !== undefined) {
    const fs25Path = pathProvider.getFS25DataRoot();
    const savePath = path.join(fs25Path, `savegame${options.savegameIndex}`);
    const initFile = path.join(savePath, 'terrain.heightmap.png');
    const isInitialized = fs.existsSync(initFile);

    if (isInitialized) {
      console.log(`[LAUNCH] Target savegame ${options.savegameIndex} is already initialized. Enabling Auto-Start.`);
      args.push('-autoStartSavegameId', String(options.savegameIndex));
      args.push('-autoStart');
    } else {
      console.log(`[LAUNCH] Target savegame ${options.savegameIndex} is NOT initialized. Omitting Auto-Start for manual first load.`);
      needsManualInit = true;
    }
  }

  if (options.cheats) {
    args.push('-cheats');
  }

  if (options.skipModUpdateDialog !== false) {
    args.push('-skipModUpdateDialog');
  }

  if (options.skipIntro !== false) {
    args.push('-skipStartVideos');
  }

  // Skip the Giants Update Server check to prevent the popup box
  args.push('-skipUpdateCheck');

  // Add any custom extra args
  if (options.extraArgs && Array.isArray(options.extraArgs)) {
    args.push(...options.extraArgs);
  }

  try {
    let child;
    
    if (process.platform === 'darwin') {
      child = spawn('open', ['-a', gamePath, '--args', ...args], { stdio: 'ignore' });
    } else {
      // STEAM BYPASS: Use Environment Variables
      // This is the cleanest way to bypass prompts without causing 'No License' errors.
      console.log(`[LAUNCH] Spawning ${gamePath} directly with args:`, args);
      child = spawn(gamePath, args, {
        stdio: 'ignore',
        cwd: path.dirname(gamePath),
        detached: true,
        env: {
          ...process.env,
          SteamAppId: '2300320',
          SteamAppID: '2300320',
          SteamGameId: '2300320'
        }
      });
    }

    // Unref the child so we don't wait for it
    if (child && child.unref) child.unref();

    return { 
      success: true, 
      gamePath, 
      args, 
      pid: child.pid, 
      child,
      needsManualInit 
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Check if the game is currently running.
 */
async function isGameRunning() {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);

  const exeName = 'FarmingSimulator2025.exe';
  const processName = 'Farming Simulator 2025';

  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq FarmingSimulator2025.exe" /NH');
      return stdout.includes(exeName);
    } else {
      const { stdout } = await execAsync(`pgrep -f "${processName}"`);
      return stdout.length > 0;
    }
  } catch (e) {
    return false;
  }
}

module.exports = { detectGamePath, launch, isGameRunning };
