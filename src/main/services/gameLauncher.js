const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const pathProvider = require('./pathProvider');
const systemOptimizer = require('./systemOptimizer');

let activePlayingSlot = null;
let lastLaunchedSlot = null;

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

  // Ensure radio settings and base game music.xml override are applied
  try {
    const radioManager = require('./radioManager');
    const radioSettings = await radioManager.getRadioSettings();
    await radioManager.applyGameMusicOverride(radioSettings.overrideBuiltins);
  } catch (rErr) {
    console.warn('[LAUNCH] Failed to apply radio music override:', rErr.message);
  }

  const args = [];

  // ── OPTIMIZED MODS PATH ──
  // If no specific modsPath is provided (Normal Launch), we synthesize a virtual folder 
  // that contains symlinks to all mods across all active mod paths.
  let targetModsPath = options.modsPath;
  const modManager = require('./modManager');

  if (options.savegameIndex) {
    try {
      const savegameManager = require('./savegameManager');
      const fs25Path = pathProvider.getFS25DataRoot();
      const savePath = path.join(fs25Path, `savegame${options.savegameIndex}`);
      await savegameManager.cleanupBridgeModFromSavegame(savePath);
    } catch (e) {
      console.error('[LAUNCH] Failed to pre-process savegame files:', e.message);
    }
  }

  if (!targetModsPath) {
    // Check if this savegame is a dedicated multiplayer server save
    if (options.savegameIndex) {
      try {
        const fs25Path = pathProvider.getFS25DataRoot();
        const savePath = path.join(fs25Path, `savegame${options.savegameIndex}`);
        const serverMetaPath = path.join(savePath, 'server_meta.json');
        const savegameManager = require('./savegameManager');

        if (fs.existsSync(serverMetaPath)) {
          const serverPrep = await savegameManager.prepareServerModsFolder(options.savegameIndex, savePath);
          if (serverPrep && serverPrep.success && serverPrep.targetFolder) {
            targetModsPath = serverPrep.targetFolder;
            console.log(`[LAUNCH] Dedicated Server Save detected (Slot ${options.savegameIndex}). Using isolated mods folder: ${targetModsPath}`);
          }
          // Automatically stash single player saves into quarantine so in-game Host Game menu ONLY displays multiplayer saves
          console.log(`[LAUNCH] Quarantining Single Player saves so in-game multiplayer menu only lists MP saves...`);
          await savegameManager.stashSinglePlayerSaves();
        } else {
          // Single player save: restore any stashed single player saves
          await savegameManager.restoreStashedSinglePlayerSaves().catch(e => console.warn('[LAUNCH] Auto-restore stashed saves warning:', e.message));
        }
      } catch (srvErr) {
        console.warn('[LAUNCH] Server save mods preparation warning:', srvErr.message);
      }
    }

    if (!targetModsPath) {
      const cache = require('./cache');
      const isSelectiveEnabled = cache.getSetting('selectiveLoading') !== 'false';
      const effectiveIndex = isSelectiveEnabled ? options.savegameIndex : null;
      
      console.log(`[LAUNCH] ${effectiveIndex ? `Selective (Savegame ${effectiveIndex})` : 'Global'} Mod Synthesis...`);
      targetModsPath = await modManager.prepareVirtualModsFolder(effectiveIndex);
    }
  }

  // ── ENFORCE MENU MUSIC OVERRIDE IN GAMESETTINGS.XML ──
  const fs25DataRoot = pathProvider.getFS25DataRoot();
  const gameSettingsPath = path.join(fs25DataRoot, 'gameSettings.xml');
  if (fs.existsSync(gameSettingsPath)) {
    let settingsXml = fs.readFileSync(gameSettingsPath, 'utf8');
    if (/<music>[^<]*<\/music>/i.test(settingsXml)) {
      settingsXml = settingsXml.replace(/<music>[^<]*<\/music>/ig, '<music>0.000000</music>');
    } else if (settingsXml.includes('<volume>')) {
      settingsXml = settingsXml.replace('<volume>', '<volume>\n        <music>0.000000</music>');
    }
    fs.writeFileSync(gameSettingsPath, settingsXml, 'utf8');
  }

  const defaultModsPath = modManager.getDefaultModsPath();
  
  if (targetModsPath && targetModsPath.toLowerCase() !== defaultModsPath.toLowerCase()) {
    if (fs.existsSync(gameSettingsPath)) {
      let settingsXml = fs.readFileSync(gameSettingsPath, 'utf8');
      const overrideRegex = /<modsDirectoryOverride[^>]*\/>/i;
      const newTag = `<modsDirectoryOverride active="true" directory="${targetModsPath.replace(/\\/g, '/')}"/>`;
      
      if (overrideRegex.test(settingsXml)) {
        settingsXml = settingsXml.replace(overrideRegex, newTag);
      } else {
        settingsXml = settingsXml.replace(/(<gameSettings[^>]*>)/i, `$1\n    ${newTag}`);
      }
      fs.writeFileSync(gameSettingsPath, settingsXml, 'utf8');
      console.log('[LAUNCH] Enabled modsDirectoryOverride in gameSettings.xml:', targetModsPath);
    }
  } else {
    if (fs.existsSync(gameSettingsPath)) {
      let settingsXml = fs.readFileSync(gameSettingsPath, 'utf8');
      settingsXml = settingsXml.replace(/<modsDirectoryOverride[^>]*\/>/ig, '<modsDirectoryOverride active="false" directory=""/>');
      fs.writeFileSync(gameSettingsPath, settingsXml, 'utf8');
      console.log('[LAUNCH] Disabled modsDirectoryOverride in gameSettings.xml');
    }
  }

  // ── DYNAMIC INITIALIZATION HANDSHAKE ──
  // Check if this savegame is valid to launch
  let needsManualInit = false;
  if (options.savegameIndex !== undefined) {
    activePlayingSlot = parseInt(options.savegameIndex, 10) || null;
    if (activePlayingSlot) {
      lastLaunchedSlot = activePlayingSlot;
    }
    const fs25Path = pathProvider.getFS25DataRoot();
    const savePath = path.join(fs25Path, `savegame${options.savegameIndex}`);
    const farmsFile = path.join(savePath, 'farms.xml');
    const careerFile = path.join(savePath, 'careerSavegame.xml');
    const serverMetaPath = path.join(savePath, 'server_meta.json');
    const isServerSave = fs.existsSync(serverMetaPath);
    let isValidSavegame = fs.existsSync(farmsFile) && fs.existsSync(careerFile) && !isServerSave;
    
    if (isServerSave) {
      console.log(`[LAUNCH] Savegame ${options.savegameIndex} is a Multiplayer Server save. Bypassing singleplayer autoStart so game launches to Multiplayer menu.`);
    } else if (!isValidSavegame) {
      console.log(`[LAUNCH] Savegame ${options.savegameIndex} does not have valid savegame XML files. Bypassing autoStart.`);
      needsManualInit = true;
    } else {
      console.log(`[LAUNCH] Target savegame ${options.savegameIndex} is valid. Enabling Auto-Start into map.`);
      args.push('-autoStartSavegameId', String(options.savegameIndex));
      if (!args.includes('-autoStart')) {
        args.push('-autoStart');
      }

      // Ensure careerSavegame.xml is completely clean of internal helper mod entries
      try {
        await savegameManager.cleanInternalHelperModsFromSavegame(savePath);
      } catch (e) {
        console.warn('[LAUNCH] Helper mods cleanup warning:', e.message);
      }
    }
  }

  if (options.autoStart && !args.includes('-autoStart')) {
    args.push('-autoStart');
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

    // Start background exit monitor to restore gameSettings.xml when player quits game
    monitorGameExitAndRestore(options.onGameExit);

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
 * Disables modsDirectoryOverride in gameSettings.xml so that launching the game
 * standalone (directly from desktop/Steam) reads directly from the standard mods directory.
 */
function disableModsDirectoryOverride() {
  try {
    const fs25DataRoot = pathProvider.getFS25DataRoot();
    const gameSettingsPath = path.join(fs25DataRoot, 'gameSettings.xml');

    if (fs.existsSync(gameSettingsPath)) {
      let settingsXml = fs.readFileSync(gameSettingsPath, 'utf8');
      if (/<modsDirectoryOverride\s+active=["']true["']/i.test(settingsXml) || /<modsDirectoryOverride[^>]*directory=["'][^"']+["']/i.test(settingsXml)) {
        settingsXml = settingsXml.replace(/<modsDirectoryOverride[^>]*\/>/ig, '<modsDirectoryOverride active="false" directory=""/>');
        fs.writeFileSync(gameSettingsPath, settingsXml, 'utf8');
        console.log('[LAUNCH] Disabled modsDirectoryOverride in gameSettings.xml (standalone launch ready)');
      }
    }
  } catch (err) {
    console.error('[LAUNCH] Failed to disable modsDirectoryOverride:', err.message);
  }
}

/**
 * Restore gameSettings.xml to default (active="false") when player quits game.
 * This ensures launching outside the manager passes through normal menus and shows ALL mods directly without interference.
 */
async function restoreGlobalGameSettings() {
  disableModsDirectoryOverride();
  try {
    const savegameManager = require('./savegameManager');
    await savegameManager.restoreStashedSinglePlayerSaves();
  } catch (e) {
    console.error('[LAUNCH] Failed to restore stashed saves on game exit:', e.message);
  }
}

let isMonitoringExit = false;

/**
 * Monitors the FS25 process and resets modsDirectoryOverride to Global Synthesis when game exits.
 */
function monitorGameExitAndRestore(onExitCallback = null) {
  if (isMonitoringExit) return;
  isMonitoringExit = true;

  console.log('[LAUNCH] Started monitoring game process exit to restore global gameSettings.xml...');

  let hasSeenGameRunning = false;
  let checksCount = 0;
  let consecutiveNotRunning = 0;

  const interval = setInterval(async () => {
    try {
      const running = await isGameRunning();
      checksCount++;

      if (running) {
        hasSeenGameRunning = true;
        consecutiveNotRunning = 0;
      } else if (hasSeenGameRunning) {
        consecutiveNotRunning++;
        // Require at least 2 consecutive checks (8 seconds) of not running to prevent false triggers during process handoff
        if (consecutiveNotRunning >= 2) {
          clearInterval(interval);
          isMonitoringExit = false;
          console.log('[LAUNCH] Game process exit detected. Restoring global gameSettings.xml in 2 seconds...');
          if (typeof onExitCallback === 'function') {
            try { onExitCallback(); } catch (e) {}
          }
          setTimeout(() => {
            restoreGlobalGameSettings();
          }, 2000);
        }
      } else if (checksCount > 90) {
        // Fallback: 6 minutes elapsed without detecting the game running (e.g. cancelled launch)
        clearInterval(interval);
        isMonitoringExit = false;
        console.log('[LAUNCH] Game did not launch within 6 minutes. Restoring global gameSettings.xml...');
        restoreGlobalGameSettings();
      }
    } catch (e) {
      console.error('[LAUNCH] Error monitoring game exit:', e.message);
    }
  }, 4000);
}

/**
 * Check if the game is currently running.
 */
async function isGameRunning() {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);

  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('tasklist /NH');
      // On Windows, tasklist /NH truncates image names longer than 25 chars (e.g. FarmingSimulator2025Game.)
      // Regex matches lines starting with FarmingSimulator2025 to cover both launcher and game exe
      return /^\s*FarmingSimulator2025/im.test(stdout);
    } else {
      const { stdout } = await execAsync('pgrep -f "FarmingSimulator2025"');
      return stdout.trim().length > 0;
    }
  } catch (e) {
    return false;
  }
}

/**
 * Detect active savegame slot from gameSettings.xml override or log.txt
 */
function detectActiveSlotFromGame() {
  // 1. First check gameSettings.xml for active virtual mods override
  try {
    const settingsPath = pathProvider.getGameSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const xml = fs.readFileSync(settingsPath, 'utf8');
      const match = xml.match(/VirtualActiveMods_Savegame(\d+)/i);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }
  } catch (e) {}

  // 2. Check log.txt for explicit savegame start / densityMap / load markers
  try {
    const fs25Root = pathProvider.getFS25DataRoot();
    const logPath = path.join(fs25Root, 'log.txt');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      
      // Check start parameter or autoStart message: e.g. "Auto start local savegame (Id: 5)" or "autoStartSavegameId 5"
      const autoStartMatches = [...content.matchAll(/Auto start local savegame\s*\(Id:\s*(\d+)\)|autoStartSavegameId\s+(\d+)/gi)];
      if (autoStartMatches.length > 0) {
        const lastMatch = autoStartMatches[autoStartMatches.length - 1];
        const slotId = lastMatch[1] || lastMatch[2];
        if (slotId) return parseInt(slotId, 10);
      }

      // Check for loaded density maps or savegame files: e.g. ".../savegame5/densityMap..."
      const saveFileMatches = [...content.matchAll(/savegame(\d+)[\\/](?:densityMap|farms|careerSavegame|vehicles|placeables)\./gi)];
      if (saveFileMatches.length > 0) {
        return parseInt(saveFileMatches[saveFileMatches.length - 1][1], 10);
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Get comprehensive game status including which save slot is actively running
 */
async function getGameStatus() {
  const isRunning = await isGameRunning();
  let slot = null;
  if (isRunning) {
    // If we launched a specific slot, stick firmly to that slot while the game is running
    slot = activePlayingSlot || lastLaunchedSlot || detectActiveSlotFromGame();
    if (slot) {
      activePlayingSlot = slot;
      lastLaunchedSlot = slot;
    }
  } else {
    slot = activePlayingSlot || lastLaunchedSlot || detectActiveSlotFromGame();
    activePlayingSlot = null;
  }
  return { isRunning, playingSlot: slot };
}

module.exports = { detectGamePath, launch, isGameRunning, getGameStatus, restoreGlobalGameSettings, disableModsDirectoryOverride };



