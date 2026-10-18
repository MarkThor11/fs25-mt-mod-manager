const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');
const pathProvider = require('./pathProvider');
const systemOptimizer = require('./systemOptimizer');

let activePlayingSlot = null;
let lastLaunchedSlot = null;

/**
 * Given any detected path (directory, launcher exe, or x64 exe), resolves to the real 64-bit game executable.
 */
function resolveRealGameExecutable(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return null;
  const clean = inputPath.trim().replace(/^"(.*)"$/, '$1');

  // Candidate paths in order of preference
  const candidates = [];

  const stat = (() => {
    try { return fs.statSync(clean); } catch (_) { return null; }
  })();

  if (stat && stat.isDirectory()) {
    candidates.push(path.join(clean, 'x64', 'FarmingSimulator2025Game.exe'));
    candidates.push(path.join(clean, 'FarmingSimulator2025Game.exe'));
    candidates.push(path.join(clean, 'FarmingSimulator2025.exe'));
  } else {
    // If input is an executable path
    const dir = path.dirname(clean);
    const base = path.basename(clean).toLowerCase();

    if (base === 'farmingsimulator2025game.exe' && fs.existsSync(clean)) {
      return clean;
    }

    // Try x64 subfolder relative to launcher
    candidates.push(path.join(dir, 'x64', 'FarmingSimulator2025Game.exe'));
    candidates.push(path.join(dir, 'FarmingSimulator2025Game.exe'));

    // Check if path is in "Program Files (x86)" and also check "Program Files"
    if (dir.toLowerCase().includes('program files (x86)')) {
      const p64Dir = dir.replace(/program files \(x86\)/i, 'Program Files');
      candidates.push(path.join(p64Dir, 'x64', 'FarmingSimulator2025Game.exe'));
      candidates.push(path.join(p64Dir, 'FarmingSimulator2025Game.exe'));
      candidates.push(path.join(p64Dir, 'FarmingSimulator2025.exe'));
    }

    // Fallback: the input file itself if it exists
    if (fs.existsSync(clean)) {
      candidates.push(clean);
    }
  }

  for (const cand of candidates) {
    if (cand && fs.existsSync(cand)) {
      return cand;
    }
  }

  return clean;
}

/**
 * Common Farming Simulator 25 install paths.
 */
const COMMON_PATHS = {
  win32: [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Farming Simulator 25\\x64\\FarmingSimulator2025Game.exe',
    'C:\\Program Files\\Steam\\steamapps\\common\\Farming Simulator 25\\x64\\FarmingSimulator2025Game.exe',
    'D:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25\\x64\\FarmingSimulator2025Game.exe',
    'E:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25\\x64\\FarmingSimulator2025Game.exe',
    'C:\\Program Files\\Farming Simulator 2025\\x64\\FarmingSimulator2025Game.exe',
    'C:\\Program Files (x86)\\Farming Simulator 2025\\x64\\FarmingSimulator2025Game.exe',
    'C:\\Program Files\\Farming Simulator 2025\\FarmingSimulator2025.exe',
    'C:\\Program Files (x86)\\Farming Simulator 2025\\FarmingSimulator2025.exe',
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
        const resolved = resolveRealGameExecutable(installDir);
        if (resolved && fs.existsSync(resolved)) return resolved;
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
  if (customPath) {
    const resolved = resolveRealGameExecutable(customPath);
    if (resolved && fs.existsSync(resolved)) {
      return { path: resolved, source: 'settings' };
    }
    if (fs.existsSync(customPath)) {
      return { path: customPath, source: 'settings' };
    }
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
    const resolved = resolveRealGameExecutable(p);
    if (resolved && fs.existsSync(resolved)) {
      return { path: resolved, source: 'common' };
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
  let gamePath = options.gamePath || (await detectGamePath()).path;
  if (gamePath) {
    const resolved = resolveRealGameExecutable(gamePath);
    if (resolved && fs.existsSync(resolved)) {
      gamePath = resolved;
    }
  }
  
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

  try {
    const savegameManager = require('./savegameManager');
    if (options.savegameIndex) {
      const fs25Path = pathProvider.getFS25DataRoot();
      const savePath = path.join(fs25Path, `savegame${options.savegameIndex}`);
      await savegameManager.cleanupBridgeModFromSavegame(savePath);
      await savegameManager.ensureSavegameDensityMaps(savePath);
    }
    // Ensure savegame.png preview image is verified for ALL active save slots before game launches
    await savegameManager.getAllSavegames().catch(() => {});
    // Ensure all savegame mod bridges are up-to-date in the primary mods directory
    await modManager.syncSavegameModBridges().catch(e => console.warn('[LAUNCH] Mod bridge sync warning:', e.message));
  } catch (e) {
    console.error('[LAUNCH] Failed to pre-process savegame files:', e.message);
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
      const effectiveIndex = options.savegameIndex || null;
      
      console.log(`[LAUNCH] ${effectiveIndex ? `Selective (Savegame ${effectiveIndex})` : 'Global'} Mod Synthesis...`);
      targetModsPath = await modManager.prepareVirtualModsFolder(effectiveIndex);
    }
  }

  // ── AUTO-COMPILE MOD KEYBINDS INTO INPUTBINDING.XML ──
  try {
    const inputBindingManager = require('./inputBindingManager');
    if (targetModsPath && fs.existsSync(targetModsPath)) {
      const entries = fs.readdirSync(targetModsPath);
      const activeModPaths = entries
        .filter(e => e.toLowerCase().endsWith('.zip') || fs.statSync(path.join(targetModsPath, e)).isDirectory())
        .map(e => path.join(targetModsPath, e));
      await inputBindingManager.compileModKeybinds(activeModPaths);
    }
  } catch (kbErr) {
    console.warn('[LAUNCH] Keybinding compilation warning:', kbErr.message);
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
    const savegameManager = require('./savegameManager');
    const fs25Path = pathProvider.getFS25DataRoot();
    const savePath = path.join(fs25Path, `savegame${options.savegameIndex}`);
    const farmsFile = path.join(savePath, 'farms.xml');
    const careerFile = path.join(savePath, 'careerSavegame.xml');
    const heightmapFile = path.join(savePath, 'terrain.heightmap.png');
    const densityFruitsFile = path.join(savePath, 'densityMap_fruits.gdm');
    const densityGroundFile = path.join(savePath, 'densityMap_ground.gdm');
    const guidedTourFile = path.join(savePath, 'guidedTour.xml');
    const isServerSave = fs.existsSync(path.join(savePath, 'server_meta.json'));

    const hasCoreXml = fs.existsSync(farmsFile) && fs.existsSync(careerFile);
    const hasEngineTerrain = fs.existsSync(heightmapFile);
    needsManualInit = !hasEngineTerrain;

    // Detect pending settings (uninitialized slot)
    const pendingSettingsPath = path.join(savePath, '.mm_pending_settings.json');
    if (fs.existsSync(pendingSettingsPath)) {
      console.log(`[LAUNCH] Detected pending settings for slot ${options.savegameIndex}. Forcing manual init.`);
      needsManualInit = true;
      // The selected map + mods are linked into the virtual mods folder by
      // modManager.prepareVirtualModsFolder (reads .mm_pending_settings.json).
    }


    if (isServerSave) {
      console.log(`[LAUNCH] Savegame ${options.savegameIndex} is a Multiplayer Server save. Bypassing singleplayer autoStart so game launches to Multiplayer menu.`);
    } else if (needsManualInit) {
      console.log(`[LAUNCH] Savegame ${options.savegameIndex} is pre-populated for first launch. Opening game directly to Career selection menu.`);
      args.push('-startState', 'career');
    } else {
      console.log(`[LAUNCH] Target savegame ${options.savegameIndex} auto-starting into map.`);
      if (options.autoStart !== false) {
        args.push('-autoStartSavegameId', String(options.savegameIndex));
        if (!args.includes('-autoStart')) {
          args.push('-autoStart');
        }
      }

      // Ensure careerSavegame.xml is completely clean of internal helper mod entries
      try {
        await savegameManager.cleanInternalHelperModsFromSavegame(savePath);
      } catch (e) {
        console.warn('[LAUNCH] Helper mods cleanup warning:', e.message);
      }
    }
  }

  if (options.autoStart && !needsManualInit && !args.includes('-autoStart')) {
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
      const dirMatch = settingsXml.match(/<modsDirectoryOverride[^>]+directory=["']([^"']+)["']/i);
      const currentDir = dirMatch && dirMatch[1] ? dirMatch[1] : '';

      // Only disable if the override points to the app's internal virtual mods directory.
      // If the user configured their own custom mods folder in gameSettings.xml, preserve it!
      const isVirtualFolder = currentDir.includes('.fs25_virtual_mods') || currentDir.includes('VirtualActiveMods');
      if (isVirtualFolder) {
        settingsXml = settingsXml.replace(/<modsDirectoryOverride[^>]*\/>/ig, '<modsDirectoryOverride active="false" directory=""/>');
        fs.writeFileSync(gameSettingsPath, settingsXml, 'utf8');
        console.log('[LAUNCH] Disabled virtual modsDirectoryOverride in gameSettings.xml (standalone launch ready)');
      } else if (currentDir) {
        console.log('[LAUNCH] Preserving user-configured custom modsDirectoryOverride in gameSettings.xml:', currentDir);
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

  // Restore gameSettings.xml menu music setting if it was muted
  try {
    const fs25DataRoot = pathProvider.getFS25DataRoot();
    const gameSettingsPath = path.join(fs25DataRoot, 'gameSettings.xml');
    if (fs.existsSync(gameSettingsPath)) {
      let settingsXml = fs.readFileSync(gameSettingsPath, 'utf8');
      if (/<music>\s*0(?:\.0+)?\s*<\/music>/i.test(settingsXml)) {
        settingsXml = settingsXml.replace(/<music>\s*0(?:\.0+)?\s*<\/music>/ig, '<music>0.700000</music>');
        fs.writeFileSync(gameSettingsPath, settingsXml, 'utf8');
        console.log('[LAUNCH] Restored default menu music in gameSettings.xml');
      }
    }
  } catch (e) {
    console.warn('[LAUNCH] Failed to restore menu music setting:', e.message);
  }

  // Restore game.xml graphics settings from backup if an original was saved
  try {
    const systemOptimizer = require('./systemOptimizer');
    const dataRoot = pathProvider.getFS25DataRoot();
    const backupGameXml = path.join(dataRoot, 'game.xml.original');
    if (fs.existsSync(backupGameXml)) {
      await systemOptimizer.optimizeRevert();
      console.log('[LAUNCH] Restored game.xml from original backup');
    }
  } catch (e) {
    // Ignore if not present
  }

  try {
    const savegameManager = require('./savegameManager');
    await savegameManager.restoreStashedSinglePlayerSaves();
  } catch (e) {
    console.error('[LAUNCH] Failed to restore stashed saves on game exit:', e.message);
  }
  try {
    const modManager = require('./modManager');
    const defaultMods = modManager.getDefaultModsPath();
    if (defaultMods) {
      await modManager.syncMirrorLinks(defaultMods);
    }
    await modManager.syncSavegameModBridges().catch(() => {});
  } catch (e) {
    console.error('[LAUNCH] Failed to sync mirror/mod links on game exit:', e.message);
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
        if (consecutiveNotRunning >= 1) {
          clearInterval(interval);
          isMonitoringExit = false;
          console.log('[LAUNCH] Game process exit detected. Restoring global gameSettings.xml...');
          if (typeof onExitCallback === 'function') {
            try { onExitCallback(); } catch (e) {}
          }
          setTimeout(() => {
            restoreGlobalGameSettings();
          }, 500);
        }
      } else if (checksCount > 120) {
        // Fallback: 3 minutes elapsed without detecting the game running
        clearInterval(interval);
        isMonitoringExit = false;
        console.log('[LAUNCH] Game did not launch within timeout. Restoring global gameSettings.xml...');
        restoreGlobalGameSettings();
      }
    } catch (e) {
      console.error('[LAUNCH] Error monitoring game exit:', e.message);
    }
  }, 1500);
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



