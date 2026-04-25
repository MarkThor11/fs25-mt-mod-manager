const path = require('path');
const fs = require('fs-extra');
const nodeFs = require('fs');
const AdmZip = require('adm-zip');
const { app, BrowserWindow, ipcMain, shell, session, dialog, net } = require('electron');
const https = require('https');

// 🛠️ DIAGNOSTIC UTILITY 🛠️
const logFile = (app && typeof app.getPath === 'function') 
    ? path.join(app.getPath('userData'), 'download_debug.log')
    : path.join(process.cwd(), 'download_debug.log');
function debugLog(msg) {
    const entry = `${new Date().toISOString()} - ${msg}\n`;
    console.log(`[DEBUG] ${msg}`);
    try { nodeFs.appendFileSync(logFile, entry); } catch (e) {}
}

const cache = require('./cache');
const scraper = require('./scraper');
const crypto = require('crypto');
const gameLauncher = require('./gameLauncher');
const pathProvider = require('./pathProvider');

const activeInstalls = new Map();
const downloadQueue = [];
let activeCount = 0;
const MAX_CONCURRENT_INSTALLS = 4;
const activeBatchTasks = new Set();
const DLC_MAPPING = {
  'macDonPack.dlc': { 
    title: 'MacDon Pack', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25macdon',
    description: 'MacDon brings you next level harvesting performance, with five highlight machines included in the MacDon Pack for Farming Simulator 25! Get the M1240 Windrower, the DX140 & FD140 Headers, the PW8 pickup header, and the R216Sp disc header.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25macdon_screenshots/fs25macdon_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25macdon_screenshots/fs25macdon_screenshot2.jpg'
    ],
    techData: { hp: 240, price: 185000 }
  },
  'vredoPack.dlc': { 
    title: 'Vredo Pack', 
    author: 'GIANTS Software', 
    version: '1.2.0.0', 
    dlcId: 'fs25vredo',
    description: 'Maintain your grassland with technology from Vredo, the renowned specialist in overseeding and self-propelled slurry injection vehicles. The Vredo Pack introduces traditional Dutch manufacturer Vredo to the series for the first time.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25vredo_screenshots/fs25vredo_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25vredo_screenshots/fs25vredo_screenshot2.jpg'
    ],
    techData: { hp: 550, price: 425000 }
  },
  'extraContentWorldsFastestTractor.dlc': { 
    title: 'JCB Fastrac Two (WFT)', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25jcbwft',
    description: 'Holder of the Guinness World Records title with a top speed of 247 km/h (153 mph), this showcase of British engineering is now available to drive in Farming Simulator 25. Powered by a highly-modified six-cylinder JCB Dieselmax 7.2-litre engine.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25jcbwft_screenshots/fs25jcbwft_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25jcbwft_screenshots/fs25jcbwft_screenshot2.jpg'
    ],
    techData: { hp: 1016, price: 0 }
  },
  'extraContentNewHollandCR11.dlc': { 
    title: 'New Holland CR11 Gold Edition', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25nhcr11gold',
    description: 'Get the unique New Holland CR11 Gold Edition and operate one of the flagship combines with a unique gold paint finish. Enjoy its authentic, highly detailed digitization based on the real machine.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25nhcr11gold_screenshots/fs25nhcr11gold_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25nhcr11gold_screenshots/fs25nhcr11gold_screenshot2.jpg'
    ],
    techData: { hp: 775, price: 0 }
  },
  'highlandsFishingPack.dlc': { 
    title: 'Highlands Fishing Expansion', 
    author: 'GIANTS Software', 
    version: '1.2.0.0', 
    dlcId: 'fs25highlandsfishing',
    description: 'Farming Simulator 25 gets the fun-kind of fishy with the Highlands Fishing expansion: Build a farm and man a fishing boat in the Scotland-inspired town of Kinlaig! Includes a new map, new crops, and highland cattle.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25highlandsfishing_screenshots/fs25highlandsfishing_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25highlandsfishing_screenshots/fs25highlandsfishing_screenshot2.jpg'
    ]
  },
  'daimlerTruckPack.dlc': { 
    title: 'Daimler Truck Pack', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25mercedesbenztrucks',
    description: 'Align your farming operation with the stars of Mercedes-Benz and Daimler Truck AG! Get 17 machines, featuring the renowned manufacturer’s most iconic flagship trucks like the Actros L, Arocs, and the famous Unimog.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25mercedesbenztrucks_screenshots/fs25mercedesbenztrucks_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25mercedesbenztrucks_screenshots/fs25mercedesbenztrucks_screenshot2.jpg'
    ],
    techData: { hp: 625, price: 165000 }
  },
  'strawHarvestPack.dlc': { 
    title: 'Straw Harvest Pack', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25strawharvest',
    description: 'Extend your operation with the pellet industry and increase your straw-based productivity! Operates machinery from KRONE and Bressel und Lade, including the world\'s first mobile pellet harvester.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25strawharvest_screenshots/fs25strawharvest_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25strawharvest_screenshots/fs25strawharvest_screenshot2.jpg'
    ]
  },
  'plainsAndPrairiesPack.dlc': { 
    title: 'Plains & Prairies Pack', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25plainsandprairies',
    description: 'The Plains & Prairies Pack brings classic Ford tractors and legendary machines like the Versatile 1080 “Big Roy” and modern Fendt Rogator 900. Features over 20 vehicles and implements spanning cult classics to modern innovations.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25plainsandprairies_screenshots/fs25plainsandprairies_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25plainsandprairies_screenshots/fs25plainsandprairies_screenshot2.jpg'
    ],
    techData: { hp: 600, price: 215000 }
  },
  'precisionFarmingPack.dlc': { 
    title: 'Precision Farming 3.0', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25precisionfarming',
    description: 'Make your farm smarter and more sustainable with Precision Farming technology. Includes soil sampling, variable rate applications, and economic analysis tools to optimize your yield and environmental impact.',
    screenshots: [
      'https://www.farming-simulator.com/img/content/products/fs25/fs25precisionfarming-cover.jpg'
    ]
  },
  'nexatPack.dlc': { 
    title: 'NEXAT Pack', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25nexat',
    description: 'Cutting-edge technology on your fields: NEXAT is the world\'s first holistic crop production system offering a carrier vehicle with high working width that can be combined with powerful interchangeable modules.',
    screenshots: [
      'https://www.farming-simulator.com/img/dlc/fs25nexat_screenshots/fs25nexat_screenshot1.jpg',
      'https://www.farming-simulator.com/img/dlc/fs25nexat_screenshots/fs25nexat_screenshot2.jpg'
    ],
    techData: { hp: 1100, price: 0 }
  },
};

// Global broadcast function (will be set by index.js)
let broadcastStatus = null;
const setBroadcastStatus = (fn) => { broadcastStatus = fn; };

let activeScanPromise = null;

/**
 * Intelligent file/folder removal with retry logic for Windows EPERM/EBUSY.
 */
async function safeRemove(targetPath, retries = 10, delay = 1000) {
	for (let i = 0; i < retries; i++) {
		try {
			await fs.remove(targetPath);
			return { success: true };
		} catch (err) {
			if (i === retries - 1) throw err;
			if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'ENOTEMPTY') {
				console.warn(`[SAFE-REMOVE] ${targetPath} is locked or busy (Error: ${err.code}). Retrying (${i + 1}/${retries})...`);
				await new Promise(r => setTimeout(r, delay));
			} else {
				throw err;
			}
		}
	}
}

/**
 * Intelligent file move with retry logic for Windows EPERM/EBUSY.
 */
async function safeMove(src, dest, options = {}, retries = 10, delay = 1000) {
	for (let i = 0; i < retries; i++) {
		try {
			await fs.move(src, dest, options);
			return { success: true };
		} catch (err) {
			if (i === retries - 1) throw err;
			if (err.code === 'EPERM' || err.code === 'EBUSY') {
				console.warn(`[SAFE-MOVE] ${src} is locked or busy (Error: ${err.code}). Retrying (${i + 1}/${retries})...`);
				await new Promise(r => setTimeout(r, delay));
			} else {
				throw err;
			}
		}
	}
}

/**
 * Semantic version comparison for FS25 mods (e.g., 1.0.0.0).
 * Returns -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2.
 */
function compareVersions(v1, v2) {
	if (!v1 || !v2) return 0;
	const clean1 = v1.replace(/^v/i, '').trim();
	const clean2 = v2.replace(/^v/i, '').trim();
	
	const parts1 = clean1.split('.').map(p => parseInt(p, 10) || 0);
	const parts2 = clean2.split('.').map(p => parseInt(p, 10) || 0);
	
	const len = Math.max(parts1.length, parts2.length);
	for (let i = 0; i < len; i++) {
		const p1 = parts1[i] || 0;
		const p2 = parts2[i] || 0;
		if (p1 > p2) return 1;
		if (p1 < p2) return -1;
	}
	return 0;
}

/**
	* Get the mods directory path from settings.
*/
/**
	* Get all configured mods directory paths from settings.
	* Returns an array of paths. The first one is considered the Primary path.
*/
function getModsPaths() {
	const pathsJson = cache.getSetting('modsPaths');
	if (pathsJson) {
		try {
			const paths = JSON.parse(pathsJson);
			if (Array.isArray(paths) && paths.length > 0) return paths;
		} catch (e) {}
	}
	// Fallback to old single 'modsPath' or default
	const singlePath = cache.getSetting('modsPath') || getDefaultModsPath();
	return [singlePath];
}

/**
	* Get the primary mods directory path (for downloads/installs).
*/
function getModsPath() {
	return getModsPaths()[0];
}

async function getFolderSize(folderPath) {
	const stats = await fs.stat(folderPath);
	if (!stats.isDirectory()) return stats.size;
	const files = await fs.readdir(folderPath);
	const sizes = await Promise.all(
		files.map(async (f) => await getFolderSize(path.join(folderPath, f)))
	);
	return sizes.reduce((a, b) => a + b, 0);
}

async function prepareVirtualModsFolder(savegameIndex = null) {
	const allPaths = getModsPaths();
	const virtualPath = path.join(app.getPath('userData'), savegameIndex ? `VirtualActiveMods_Savegame${savegameIndex}` : 'VirtualActiveMods');
	
	debugLog(`[VIRTUAL] Preparing ${savegameIndex ? `Selective (Savegame ${savegameIndex})` : 'Global'} synthesis in: ${virtualPath}`);
	
	try {
		if (fs.existsSync(virtualPath)) {
			const files = await fs.readdir(virtualPath);
			// Use safeRemove for each entry to avoid crashing on locks
			await Promise.all(files.map(f => safeRemove(path.join(virtualPath, f)).catch(e => console.warn(`[VIRTUAL] Cleanup skip: ${f}`))));
		} else {
			await fs.ensureDir(virtualPath);
		}

		// Initialize as an empty set if we are in selective mode
		let activeModNames = savegameIndex !== null ? new Set() : null;
		let mapModName = null;

		if (savegameIndex) {
			const savegameManager = require('./savegameManager');
			const fs25Path = getFS25DataRoot();
			const savePath = path.join(fs25Path, `savegame${savegameIndex}`);
			
			if (fs.existsSync(savePath)) {
				try {
					const { mods: modsList } = await savegameManager.getSavegameMods(savePath);
					if (modsList) {
						modsList.forEach(m => activeModNames.add(m.modName.toLowerCase()));
					}
					
					// Try to identify the map mod
					const careerPath = path.join(savePath, 'careerSavegame.xml');
					if (fs.existsSync(careerPath)) {
						const xml = await fs.readFile(careerPath, 'utf8');
						const mapMatch = xml.match(/mapId="([^"]+)"/);
						if (mapMatch && mapMatch[1] && !['MapUS', 'MapEU', 'MapAS', 'HighlandsFishingMap'].includes(mapMatch[1])) {
							// It's likely a mod map (e.g. FS25_Riverview)
							mapModName = mapMatch[1].toLowerCase();
							activeModNames.add(mapModName);
						}
					}
				} catch (e) {
					console.warn(`[VIRTUAL] Failed to read savegame mods for slot ${savegameIndex}:`, e.message);
				}
			}
		}

		let linkedCount = 0;
		const seenFiles = new Set();

		// Iterate paths in reverse priority (first path in getModsPaths has highest priority)
		for (let i = allPaths.length - 1; i >= 0; i--) {
			const sourceDir = allPaths[i];
			if (!fs.existsSync(sourceDir)) continue;

			const entries = await fs.readdir(sourceDir, { withFileTypes: true });
			for (const entry of entries) {
				const name = entry.name;
				const modNameNoExt = name.toLowerCase().replace(/\.zip$/, '');
				
				// FILTER: If we are in selective mode, only link if it's in the active set
				if (activeModNames && !activeModNames.has(modNameNoExt)) {
					continue;
				}

				if (name.toLowerCase().endsWith('.zip') || (entry.isDirectory() && fs.existsSync(path.join(sourceDir, name, 'modDesc.xml')))) {
					const destPath = path.join(virtualPath, name);
					const srcPath = path.join(sourceDir, name);

					try {
						// Remove existing if it somehow persisted
						if (fs.existsSync(destPath)) await fs.remove(destPath);
						
						const type = entry.isDirectory() ? 'junction' : 'file';
						await fs.symlink(srcPath, destPath, type);
						linkedCount++;
						seenFiles.add(name.toLowerCase());
					} catch (e) {
						debugLog(`[VIRTUAL] Symlink failed for ${name}: ${e.message}`);
					}
				}
			}
		}

		debugLog(`[VIRTUAL] Successfully synthesized ${linkedCount} mods for launch.`);
		return virtualPath;
	} catch (err) {
		console.error('[VIRTUAL] Synthesis failed:', err);
		// Fallback to primary mods path if synthesis completely broke
		return allPaths[0]; 
	}
}

function getFS25DataRoot() {
	return pathProvider.getFS25DataRoot();
}

function getDefaultModsPath() {
	return pathProvider.getDefaultModsPath();
}

function scanDLCs(pdlcPath) {
    if (!nodeFs.existsSync(pdlcPath)) return [];
    
    try {
        const files = nodeFs.readdirSync(pdlcPath);
        const dlcFiles = files.filter(f => f.toLowerCase().endsWith('.dlc'));
        
        return dlcFiles.map(file => {
            const mapping = DLC_MAPPING[file];
            const stats = nodeFs.statSync(path.join(pdlcPath, file));
            
            // Generate a readable title from filename if not in mapping
            let cleanTitle = file.replace(/\.dlc$/i, '');
            if (!mapping) {
                // simpleCamelCase -> Simple Camel Case
                cleanTitle = cleanTitle.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
            }

            return {
                fileName: file,
                modName: file.replace(/\.dlc$/i, ''),
                filePath: path.join(pdlcPath, file),
                title: mapping?.title || cleanTitle,
                author: mapping?.author || 'GIANTS Software',
                version: mapping?.version || '1.0.0.0',
                description: mapping?.description || '',
                iconFile: null,
                isMap: !!mapping?.isMap,
                mtime: stats.mtimeMs,
                isDLC: true,
                folder: 'DLC',
                tags: ['DLC'],
                iconData: mapping?.dlcId 
                    ? `https://www.farming-simulator.com/img/content/products/fs25/${mapping.dlcId}-cover.jpg` 
                    : 'CATEGORY:pack',
                extraImages: mapping?.screenshots || [],
                techData: mapping?.techData || null
            };
        });
    } catch (e) {
        console.error('[SCAN-DLC] Failed:', e.message);
        return [];
    }
}

function getAllFS25DataRoots() {
	return pathProvider.getAllFS25DataRoots();
}

function detectPath() {
	const paths = getModsPaths();
	return { path: paths[0], type: 'Detected' };
}

async function debugProbePath(probePath) {
	try {
		const target = probePath || getModsPath();
		const exists = nodeFs.existsSync(target);
		if (!exists) return { exists: false, path: target };
		
		const stats = nodeFs.statSync(target);
		const entries = nodeFs.readdirSync(target);
		
		return {
			exists,
			isDir: stats.isDirectory(),
			fileCount: entries.length,
			sampleFiles: entries.slice(0, 5),
			path: target,
			timestamp: new Date().toISOString()
		};
	} catch (err) {
		return { exists: true, error: err.message, path: probePath };
	}
}

function detectAllModsPaths() {
	const profilePaths = getAllFS25DataRoots();
	const potentialPaths = [];
	
	for (const profilePath of profilePaths) {
		// 1. Check for gameSettings.xml override
		const settingsPath = path.join(profilePath, 'gameSettings.xml');
		if (fs.existsSync(settingsPath)) {
			try {
				const xml = fs.readFileSync(settingsPath, 'utf8');
				// Robust check for active="true" and directory path
				const activeMatch = xml.match(/<modsDirectoryOverride[^>]+active=["']true["']/i);
				const dirMatch = xml.match(/<modsDirectoryOverride[^>]+directory=["']([^"']+)["']/i);
				
				if (activeMatch && dirMatch && dirMatch[1]) {
					const overridePath = dirMatch[1].replace(/\//g, path.sep);
					if (fs.existsSync(overridePath)) {
						potentialPaths.push({ path: overridePath, type: 'Override (gameSettings.xml)' });
					}
				}
			} catch (e) {}
		}
		
		// 2. Default mods folder
		const modsPath = path.join(profilePath, 'mods');
		if (fs.existsSync(modsPath)) {
			const type = profilePath.toLowerCase().includes('onedrive') ? 'Default (OneDrive)' : 'Default';
			potentialPaths.push({ path: modsPath, type });
		}
	}
	
	// Deduplicate by path
	const seen = new Set();
	return potentialPaths.filter(p => {
		const norm = path.normalize(p.path).toLowerCase();
		if (seen.has(norm)) return false;
		seen.add(norm);
		return true;
	});
}

/**
	* Targeted recursive search for the FS25 profile folder.
*/
function findProfileRecursive(dir, depth, maxDepth) {
	if (depth > maxDepth) return null;
	
	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		
		// 1. Check direct subfolders first (BFS-like)
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const name = entry.name;
				if (name === 'FarmingSimulator2025') {
					const modsPath = path.join(dir, name, 'mods');
					if (fs.existsSync(modsPath)) return modsPath;
				}
			}
		}
		
		// 2. Go deeper
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.name.startsWith('.') && !['AppData', 'Local', 'Temp'].includes(entry.name)) {
				const found = findProfileRecursive(path.join(dir, entry.name), depth + 1, maxDepth);
				if (found) return found;
			}
		}
	} catch (e) {}
	return null;
}

/**
	* Parse modDesc.xml from a zip file or directory to extract mod metadata.
*/
function parseModDesc(modPath, zipInstance = null) {
	let xmlContent = null;
	try {
		const decodeBuffer = (buffer) => {
			if (!buffer || buffer.length < 2) return buffer ? buffer.toString('utf8') : null;
			// Check for UTF-16 BOMs
			if (buffer[0] === 0xFF && buffer[1] === 0xFE) return buffer.toString('utf16le');
			if (buffer[0] === 0xFE && buffer[1] === 0xFF) return buffer.toString('utf16be');
			// Fallback: Check for null bytes which strongly suggest UTF-16LE in FS25 modDesc.xml files
			if (buffer.includes(0x00)) {
				try { return buffer.toString('utf16le'); } catch (e) {}
			}
			return buffer.toString('utf8');
		};

		if (modPath.toLowerCase().endsWith('.zip')) {
			try {
				const zip = zipInstance || new AdmZip(modPath);
				const entries = zip.getEntries();
				const modDescEntry = entries.find(e =>
					e.entryName.toLowerCase() === 'moddesc.xml' ||
					e.entryName.toLowerCase().endsWith('/moddesc.xml')
				);
				if (modDescEntry) {
					xmlContent = decodeBuffer(modDescEntry.getData());
				} else {
					debugLog(`[PARSE ERROR] No modDesc.xml in ${path.basename(modPath)}`);
				}
			} catch (zipErr) {
				debugLog(`[PARSE ERROR] Zip corrupt or inaccessible: ${path.basename(modPath)} - ${zipErr.message}`);
			}
		} else if (nodeFs.existsSync(modPath) && nodeFs.statSync(modPath).isDirectory()) {
			const modDescPath = path.join(modPath, 'modDesc.xml');
			if (nodeFs.existsSync(modDescPath)) {
				xmlContent = decodeBuffer(nodeFs.readFileSync(modDescPath));
			}
		}
		
		if (!xmlContent) return null;
		
		// Simple XML parsing without full parser - extract key fields
		const getTag = (xml, tag) => {
			const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
			const match = xml.match(regex);
			return match ? match[1].trim() : '';
		};
		
		const getAttr = (xml, tag, attr) => {
			const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
			const match = xml.match(regex);
			return match ? match[1] : '';
		};
		
		// Extract English title or fallback
		let title = '';
		const titleBlock = getTag(xmlContent, 'title');
		if (titleBlock) {
			const enMatch = titleBlock.match(/<en>([^<]*)<\/en>/i);
			const deMatch = titleBlock.match(/<de>([^<]*)<\/de>/i);
			title = enMatch ? enMatch[1].trim() : deMatch ? deMatch[1].trim() : titleBlock.replace(/<[^>]*>/g, '').trim();
		}
		
		// Extract English description
		let description = '';
		const descBlock = getTag(xmlContent, 'description');
		if (descBlock) {
			const enMatch = descBlock.match(/<en>([^<]*)<\/en>/i);
			description = enMatch ? enMatch[1].trim() : descBlock.replace(/<[^>]*>/g, '').trim();
		}
		
		const version = getTag(xmlContent, 'version') || '1.0.0';
		const author = getTag(xmlContent, 'author') || 'Unknown';
		const modId = getTag(xmlContent, 'modId') || null;
		
		// Robust icon detection: <iconFilename>...</iconFilename> OR <icon filename="..."/>
		const iconFile = getTag(xmlContent, 'iconFilename') || getAttr(xmlContent, 'icon', 'filename') || '';
		
		// Technical Name from <modDesc name="...">
		const techName = getAttr(xmlContent, 'modDesc', 'name') || '';
		
		// Check if this mod is a map
		let isMap = false;
		let mapId = null;
		let mapTitle = null;
		
		// Improved Map Detection: FS25 maps use varied structures
		// 1. Check for <map id="..."> or <maps> tags with flexible regex
		const mapMatch = xmlContent.match(/<map\s+[^>]*id=["']([^"']+)["'][^>]*>/is) || 
		                 xmlContent.match(/<maps[^>]*>/is);
		
		// 2. Additional patterns: modType="map", <mapConfiguration>, or map .i3d references
		const hasModTypeMap = /modType\s*=\s*["']map["']/i.test(xmlContent);
		const hasMapConfiguration = /<mapConfiguration/i.test(xmlContent);
		const hasMapI3D = /filename\s*=\s*["'][^"']*map[^"']*\.i3d["']/i.test(xmlContent);
		
		if (mapMatch || hasModTypeMap || hasMapConfiguration) {
			isMap = true;
			// If we matched the <map> tag with a group, extract the ID
			if (mapMatch && mapMatch[1]) {
				mapId = mapMatch[1];
			} else {
				// Fallback: look for the first map tag inside the maps block
				const innerMapIdMatch = xmlContent.match(/<map\s+[^>]*id=["']([^"']+)["'][^>]*>/is);
				mapId = innerMapIdMatch ? innerMapIdMatch[1] : null;
			}
			
			// Try to find title in the map tag or sub-tag
			const fullMapTagMatch = xmlContent.match(/<map[\s\S]*?<\/map>/i);
			const fullMapTag = fullMapTagMatch ? fullMapTagMatch[0] : (mapMatch ? mapMatch[0] : '');
			
			// Map titles can be in a title attribute, or a <title> child tag
			// Some titles use <en> tags inside the <title> tag
			const titleAttr = fullMapTag ? (fullMapTag.match(/title=["']([^"']*)["']/i) || [])[1] : null;
			let extractedTitle = fullMapTag ? (fullMapTag.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '' : '';
			
			// If the title contains language tags, extract the one that's there
			if (extractedTitle.includes('<')) {
				const langMatch = extractedTitle.match(/<(en|de)>([^<]*)<\/\1>/i) || extractedTitle.match(/>([^<]+)</);
				extractedTitle = langMatch ? (langMatch[2] || langMatch[1]).trim() : extractedTitle.replace(/<[^>]*>/g, '').trim();
			}
			
			mapTitle = extractedTitle || titleAttr || title || mapId;
		} else if (hasMapI3D) {
			// Weaker signal: has a map .i3d file reference but no explicit <map> tag
			isMap = true;
			mapTitle = title;
		}
		
		// Dependencies
		const dependencies = [];
		const depBlock = getTag(xmlContent, 'dependencies');
		
		// Strategy: Check inside <dependencies> block first, fallback to all <dependency> tags if block missing
		const contentToSearch = depBlock || xmlContent;
		const depRegex = /<dependency\s*([^>]*)\/?>([^<]*)(?:<\/dependency>)?/gi;
		let match;
		while ((match = depRegex.exec(contentToSearch)) !== null) {
			const attrs = match[1];
			const content = (match[2] || '').trim();
			
			const modNameMatch = attrs.match(/modName=["']([^"']+)["']/i);
			const urlMatch = attrs.match(/url=["']([^"']+)["']/i);
			
			let rawName = (modNameMatch ? modNameMatch[1] : content).trim();
			let url = urlMatch ? urlMatch[1] : '';

			// Deep ID Recovery: Extract ModHub ID from URL if present
			let recoveredId = null;
			if (url) {
				const idMatch = url.match(/mod_id=(\d+)/i) || url.match(/storage\/(\d+)\//i);
				if (idMatch && idMatch[1]) {
					recoveredId = idMatch[1].replace(/^0+/, ''); // Strip leading zeros
				}
			}

			const cleanName = rawName.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim();
			if (cleanName) {
				const depObj = (url || recoveredId) ? { title: cleanName, url, modId: recoveredId } : cleanName;
				const exists = dependencies.some(d => (typeof d === 'string' ? d : d.title) === cleanName);
				if (!exists) dependencies.push(depObj);
			}
		}
		
		// ── SCRIPTS & SPECIALIZATIONS (Deep Scan) ──
		const scripts = [];
		const scriptRegex = /<extraSourceFiles>([\s\S]*?)<\/extraSourceFiles>/i;
		const scriptBlockMatch = xmlContent.match(scriptRegex);
		if (scriptBlockMatch && scriptBlockMatch[1]) {
			const sourceFileRegex = /<sourceFile\s+[^>]*filename=["']([^"']+)["'][^>]*>/gi;
			let match;
			while ((match = sourceFileRegex.exec(scriptBlockMatch[1])) !== null) {
				scripts.push(match[1].replace(/\\/g, '/'));
			}
		}

		const specializations = [];
		const specBlock = getTag(xmlContent, 'specializations');
		if (specBlock) {
			const specRegex = /<specialization\s+[^>]*name=["']([^"']+)["'][^>]*>/gi;
			let match;
			while ((match = specRegex.exec(specBlock)) !== null) {
				specializations.push(match[1]);
			}
		}

		// ── TITLE CLEANUP FOR MAPS ──
		// If it's a map, we want to prioritize the map name and clean up marketing names like "Tool (Map)"
		if (isMap) {
			const originalTitle = title;
			const bracketMatch = title.match(/\(([^)]+)\)/);
			
			if (bracketMatch && bracketMatch[1]) {
				const innerTitle = bracketMatch[1].trim();
				const lowerInner = innerTitle.toLowerCase();
				
				// Keywords that suggest the bracketed part is a dependency/info, NOT the map name itself
				const isDependencyInfo = 
					lowerInner.includes('required') || 
					lowerInner.includes('need') || 
					lowerInner.includes('dependency') ||
					lowerInner.includes('fix') ||
					lowerInner.includes('pack') ||
					lowerInner.includes('update') ||
					lowerInner.length < 3;

				if (!isDependencyInfo) {
					// Pattern: "Marketing Name (Map Name)" -> Use Map Name
					// Only swap if we have a reason to believe the inner part is the map name
					if (mapTitle && (mapTitle.toLowerCase() === lowerInner || mapTitle.length < 3)) {
						title = innerTitle;
					} else if (!mapTitle || mapTitle === mapId) {
						title = innerTitle;
					}
				} else {
					// Pattern: "Map Name (Required Tool)" -> Use Map Name (part before brackets)
					const partBefore = title.split('(')[0].trim();
					if (partBefore.length > 3) {
						title = partBefore;
					}
				}
			} else if (mapTitle && mapTitle.length > 2 && mapTitle !== title && !mapTitle.includes('map')) {
				title = mapTitle;
			}
			
			if (title !== originalTitle) {
				debugLog(`[PARSE] Cleaned map title: "${originalTitle}" -> "${title}"`);
			}
		}

		// Empty conflicts array to fix ReferenceError
		const conflicts = [];
		
		const result = {
			title,
			version,
			author,
			description,
			iconFile,
			isMap,
			modId,
			techName,
			mapId,
			dependencies,
			scripts,
			specializations,
			conflicts,
			techData: null,
		};

		// ── TECHNICAL SPECS EXTRACTION (Tractors/Vehicles) ──
		try {
			const storeItemsRegex = /<storeItem\s+[^>]*xmlFilename=["']([^"']+)["'][^>]*>/gi;
			let m;
			let vehicleXmlPath = null;
			while ((m = storeItemsRegex.exec(xmlContent)) !== null) {
				const path = m[1];
				// Skip placeables, maps, and non-vehicle XMLs
				if (!path.toLowerCase().includes('placeable') && !path.toLowerCase().includes('map') && path.toLowerCase().endsWith('.xml')) {
					vehicleXmlPath = m[1];
					break; // Just take the first one for now
				}
			}

			if (vehicleXmlPath) {
				const techData = extractVehicleSpecs(modPath, vehicleXmlPath);
				if (techData) {
					result.techData = techData;
				}
			}
		} catch (e) {
			debugLog(`[TECH-DATA] Failed to extract for ${path.basename(modPath)}: ${e.message}`);
		}
		
		if (isMap) {
			debugLog(`[MAP FOUND] ${path.basename(modPath)} -> mapId: ${mapId}, title: ${title} (Original: ${result.title})`);
			console.log(`[MAP FOUND] Identified map mod: ${title} (ID: ${mapId})`);
		}

		return result;
	} catch (err) {
		console.error(`Failed to parse modDesc for ${modPath}:`, err.message);
		debugLog(`[ERROR] Failed to parse ${path.basename(modPath)}: ${err.message}`);
		return null;
	}
}

/**
 * Extracts technical specifications from a vehicle XML file.
 */
function extractVehicleSpecs(modPath, xmlPath) {
	try {
		let xmlContent = null;
		
		const decodeBuffer = (buffer) => {
			if (!buffer || buffer.length < 2) return buffer ? buffer.toString('utf8') : null;
			if (buffer[0] === 0xFF && buffer[1] === 0xFE) return buffer.toString('utf16le');
			if (buffer[0] === 0xFE && buffer[1] === 0xFF) return buffer.toString('utf16be');
			if (buffer.includes(0x00)) return buffer.toString('utf16le');
			return buffer.toString('utf8');
		};

		if (modPath.toLowerCase().endsWith('.zip')) {
			try {
				const zip = new AdmZip(modPath);
				const normalizedPath = xmlPath.replace(/\\/g, '/');
				let entry = zip.getEntry(normalizedPath);
				if (!entry) {
					// Case-insensitive search
					entry = zip.getEntries().find(e => e.entryName.toLowerCase() === normalizedPath.toLowerCase());
				}
				if (entry) xmlContent = decodeBuffer(entry.getData());
			} catch (e) {}
		} else {
			const fullPath = path.join(modPath, xmlPath);
			if (nodeFs.existsSync(fullPath)) {
				xmlContent = decodeBuffer(nodeFs.readFileSync(fullPath));
			}
		}

		if (!xmlContent) return null;

		const techData = { hp: 0, price: 0 };

		// 1. Extract Price
		const priceMatch = xmlContent.match(/<price>(\d+)<\/price>/i);
		if (priceMatch) techData.price = parseInt(priceMatch[1], 10);

		// 2. Extract Power (HP/kW)
		// Look for <motor hp="..." /> or <motor power="..." /> or <power>...</power>
		const hpAttrMatch = xmlContent.match(/<motor[^>]+hp=["'](\d+)["']/i);
		const kwAttrMatch = xmlContent.match(/<motor[^>]+kw=["'](\d+)["']/i);
		const powerTagMatch = xmlContent.match(/<power>(\d+)<\/power>/i);

		if (hpAttrMatch) {
			techData.hp = parseInt(hpAttrMatch[1], 10);
		} else if (kwAttrMatch) {
			techData.hp = Math.round(parseInt(kwAttrMatch[1], 10) * 1.36);
		} else if (powerTagMatch) {
			techData.hp = parseInt(powerTagMatch[1], 10);
		}

		// Fallback: search for motor configuration values if not found in root motor tag
		if (techData.hp === 0) {
			const configMatch = xmlContent.match(/hp=["'](\d+)["']/i);
			if (configMatch) techData.hp = parseInt(configMatch[1], 10);
		}

		return techData.hp > 0 || techData.price > 0 ? techData : null;
	} catch (err) {
		return null;
	}
}

/**
	* Scan the local mods folder and return metadata for each mod.
*/
async function scanLocalMods(manualPaths = null, force = false) {
	if (activeScanPromise && !force) {
		debugLog('[SCAN] Scan already in progress, returning existing promise.');
		return activeScanPromise;
	}

	if (force && activeScanPromise) {
		debugLog('[SCAN] Forcing fresh scan, waiting for current one to finish first...');
		await activeScanPromise;
	}

	activeScanPromise = (async () => {
		try {
			const result = await performScan(manualPaths);
			return result;
		} finally {
			activeScanPromise = null;
		}
	})();

	return activeScanPromise;
}

async function performScan(manualPaths = null) {
	debugLog('[SCAN] Starting scan...');
	
	// Safe execution of backup pruning
	pruneBackups().catch(e => console.error('[CLEANUP] Top-level pruning error:', e));

	const modsPaths = (Array.isArray(manualPaths) && manualPaths.length > 0) ? manualPaths : getModsPaths();
	debugLog(`[SCAN] Starting scan of ${modsPaths.length} locations: ${modsPaths.join(', ')}`);
	const mods = [];
	const allFolders = [];
	const tasks = [];

	// ── SCAN DLCs ──
	const dataRoot = getFS25DataRoot();
	const pdlcPath = path.join(dataRoot, 'pdlc');
	
    // Also check game install directory for Steam/Epic DLCs
    const gameInfo = await gameLauncher.detectGamePath();
    let gamePdlcPath = null;
    if (gameInfo && gameInfo.path) {
        // gamePath is usually .../FarmingSimulator2025.exe or .../x64/FarmingSimulator2025.exe
        const gameDir = path.dirname(gameInfo.path);
        const possiblePdlc = path.join(gameDir, 'pdlc');
        const possiblePdlcRoot = path.join(path.dirname(gameDir), 'pdlc'); 
        
        if (nodeFs.existsSync(possiblePdlc)) {
            gamePdlcPath = possiblePdlc;
        } else if (nodeFs.existsSync(possiblePdlcRoot)) {
            gamePdlcPath = possiblePdlcRoot;
        }
    }

	const profileDlcs = scanDLCs(pdlcPath);
    const gameDlcs = gamePdlcPath && gamePdlcPath !== pdlcPath ? scanDLCs(gamePdlcPath) : [];
    
    // Merge without duplicates (profile folder takes priority)
    const allDlcs = [...profileDlcs];
    for (const dlc of gameDlcs) {
        if (!allDlcs.some(d => d.fileName.toLowerCase() === dlc.fileName.toLowerCase())) {
            allDlcs.push(dlc);
        }
    }

	mods.push(...allDlcs);
	if (allDlcs.length > 0) {
		allFolders.push('DLC');
	}

	const processEntry = async (modRootPath, entryName, subFolder = '') => {
		const fullPath = subFolder ? path.join(modRootPath, subFolder, entryName) : path.join(modRootPath, entryName);
		
		const isZip = entryName.toLowerCase().endsWith('.zip');
		let isModDir = false;

		// ── FAST SKIP INVALID FILENAMES ──
		if (/^[0-9]/.test(entryName)) {
			console.warn(`[SCAN] Skipping invalid mod name (must not start with a digit): ${entryName}`);
			return;
		}
		
		try {
			// Use asynchronous stat to prevent blocking, especially on NAS
			const stats = await fs.lstat(fullPath).catch(() => null);
			if (!stats) return;

			// CRITICAL: Skip symbolic links in the root folder. 
			// These are likely mirrors created by the manager. We only scan the sources.
			if (stats.isSymbolicLink() && !subFolder) {
				debugLog(`[SCAN] Skipping mirror link in root: ${entryName}`);
				return;
			}

			const mtime = stats.mtimeMs;
			let size = stats.size;
			
			if (stats.isDirectory()) {
				isModDir = await fs.pathExists(path.join(fullPath, 'modDesc.xml'));
				if (isModDir) {
					// Fallback to simple size for directories - using readdir for count
					const dirFiles = await fs.readdir(fullPath).catch(() => []);
					size = dirFiles.length * 1024; 
				}
			}
			
			if (!isZip && !isModDir) return;
			
			const cached = cache.getLocalModCache(fullPath);
			let modDesc = null;
			let fileHash = null;
			if (cached && cached.mtime === Math.floor(mtime) && cached.size === size) {
				try {
					modDesc = JSON.parse(cached.json_data);
					if (modDesc && modDesc.mapTitle === undefined) {
						modDesc = null;
					}
					fileHash = cached.file_hash;
				} catch (e) {
					modDesc = null;
				}
			}
			
			let iconBase64 = cached?.icon_base64 || null;
			let storeBase64 = cached?.store_base64 || null;
			
			// If missing icon, or if it's a placeholder, force a re-extraction
			const isPlaceholder = iconBase64 === 'CATEGORY:map' || iconBase64 === 'CATEGORY:generic' || storeBase64 === 'CATEGORY:generic';
			if (!modDesc || !iconBase64 || !storeBase64 || isPlaceholder) {
				try {
					let zipInstance = null;
					if (fullPath.toLowerCase().endsWith('.zip')) {
						try { zipInstance = new AdmZip(fullPath); } catch (e) { console.error(`[SCAN] Corrupt Zip: ${entryName}`); }
					}

					const modDescResult = parseModDesc(fullPath, zipInstance);
					if (modDescResult) {
						modDesc = modDescResult;
						// Extract images for new/changed mods
						try {
							const newIcon = await getModIcon(fullPath, modDesc.iconFile, modDesc, zipInstance, false);
							if (newIcon && newIcon !== 'CATEGORY:generic' && newIcon !== 'CATEGORY:map') {
								iconBase64 = newIcon;
							} else if (!iconBase64) {
								iconBase64 = newIcon;
							}
							
							const newStore = await getModIcon(fullPath, modDesc.iconFile, modDesc, zipInstance, true);
							if (newStore && newStore !== 'CATEGORY:generic' && newStore !== 'CATEGORY:map') {
								storeBase64 = newStore;
							} else if (!storeBase64) {
								storeBase64 = newStore;
							}
						} catch (e) {
							console.error(`[IMAGE] Failed for ${entryName}:`, e.message);
						}
						
						// CACHE the result (even if minimal) to avoid re-parsing on every refresh
						if (modDesc.title || modDesc.modId) {
							cache.setLocalModCache(fullPath, mtime, size, modDesc, iconBase64, fileHash, storeBase64);
						} else {
							// If it's truly empty, cache a "minimal" marker so we don't try again until it changes
							cache.setLocalModCache(fullPath, mtime, size, { title: entryName.replace('.zip', ''), version: 'Invalid' }, 'CATEGORY:generic', fileHash, 'CATEGORY:generic');
						}
					}
				} catch (err) {
					console.error(`[SCAN] Error parsing ${entryName}:`, err.message);
				}
				
				if (!modDesc && stats.isDirectory()) {
					return;
				}
			}
			
			// ── METADATA ENRICHMENT (Trace & Restore) ──
			let author = modDesc?.author || 'Unknown';
			let title = modDesc?.title || entryName.replace('.zip', '');
			let version = modDesc?.version || 'Unknown';

			// If basic parsing failed to find useful metadata, try the persistent pool
			if (author === 'Unknown' || title === entryName.replace('.zip', '') || version === 'Unknown') {
				const pool = cache.getModHubMetadataPool();
				
				// Try match by filename first (strongest link)
				const fileId = `file_${entryName.toLowerCase()}`;
				const remoteMod = pool[fileId] || (modDesc?.modId ? pool[String(modDesc.modId)] : null);
				
				if (remoteMod) {
					if (author === 'Unknown' && remoteMod.author) author = remoteMod.author;
					if (author === 'Unknown' && remoteMod.title && remoteMod.title.includes('by ')) {
						// Extract author from title if needed
						author = remoteMod.title.split('by ')[1].trim();
					}
					if (version === 'Unknown' && remoteMod.version) version = remoteMod.version;
					// Use the better title if the local one is just a filename
					if (title === entryName.replace('.zip', '') && remoteMod.title) title = remoteMod.title;
				}
			}

			mods.push({
				title,
				author,
				version,
				size: size,
				fileName: subFolder ? `${subFolder}/${entryName}` : entryName,
				filePath: fullPath,
				folder: subFolder, 
				isMap: modDesc?.isMap || false,
				mapId: modDesc?.mapId || null,
				mapTitle: modDesc?.mapTitle || null,
				modName: modDesc?.techName || entryName.replace('.zip', ''),
				technicalName: modDesc?.techName || '',
				dependencies: modDesc?.dependencies || [],
				conflicts: modDesc?.conflicts || [],
				scripts: modDesc?.scripts || [],
				specializations: modDesc?.specializations || [],
				techData: modDesc?.techData || null,
				modId: modDesc?.modId || (() => {
					const relativePath = subFolder ? `${subFolder}/${entryName}` : entryName;
					const tracked = cache.getModTrackingByFile(relativePath) || cache.getModTrackingByFile(entryName);
					return tracked?.mod_id || null;
				})(),
				iconFile: modDesc?.iconFile || '',
				iconData: iconBase64,
				storeData: storeBase64,
				fileHash: fileHash || '',
				tags: cached?.tags ? JSON.parse(cached.tags) : [],
			});

			// ── CONSOLIDATED MOD METADATA REFINEMENT ──
			const modObj = mods[mods.length - 1];
			const trackingInfo = allTracking.find(t => String(t.mod_id) === String(modObj.modId));
			const category = (trackingInfo?.category || '').toUpperCase();
			const isMapViaCategory = category.includes('MAP');
            
            // Ensure category is set for local maps if we detected it via icon/heuristic
            if (!modObj.category && iconBase64 === 'CATEGORY:map') {
                modObj.category = 'CATEGORY:map';
            }
			
			const isLargeFile = size > 100 * 1024 * 1024;
			const titleLower = (modObj.title || '').toLowerCase();
			const fileNameLower = modObj.fileName.toLowerCase();
			const hasMapIndicators = (titleLower + fileNameLower).match(/map|terrain|countryside|valley|river|mountain|creek|forest|wood|plain|island|coast|handshake|springs/i);
			const hasNegativeIndicators = (titleLower + fileNameLower).match(/pack|set|building|shed|tank|object|asset|prop|marker|hangar|storage|factory|production|station|barn|stable|silo|shop|market|scale|collection|prefab|kit|part/i);

			// 1. Determine Map Status (Promotion vs Absolute Demotion)
			let isActuallyMap = modObj.isMap || (isMapViaCategory && (modObj.mapId || (isLargeFile && hasMapIndicators)));
			if (hasNegativeIndicators) {
				isActuallyMap = false; // Negative indicator always wins for UI clarity
			}
			
			// 2. Globally Clean Title
			const originalTitle = modObj.title;
			modObj.isMap = isActuallyMap;
			modObj.title = cleanModTitle(originalTitle, modObj.modName, modObj.fileName, isActuallyMap);
			
			// Sync mapTitle to avoid legacy metadata overrides
			if (isActuallyMap) {
				modObj.mapTitle = modObj.title;
			} else {
				modObj.mapTitle = null;
				modObj.mapId = null;
				modObj.scripts = modObj.scripts?.filter(s => !s.toLowerCase().includes('samplemodmap')) || [];
			}
			
			// 3. Persist Corrections to Cache
			if (modObj.isMap !== (modDesc?.isMap || false) || modObj.title !== originalTitle) {
				console.log(`[SCAN] Metadata Sanitized: "${originalTitle}" -> "${modObj.title}" (isMap: ${modObj.isMap})`);
				if (modDesc) {
					modDesc.isMap = modObj.isMap;
					modDesc.title = modObj.title;
					modDesc.mapTitle = modObj.mapTitle;
					try { cache.setLocalModCache(fullPath, mtime, size, modDesc, iconBase64, fileHash); } catch (e) {}
				}
			}
		} catch (err) {
			console.error(`Failed to process mod ${fullPath}:`, err.message);
		}
	};

	const allEntries = [];
	const subfolderModNames = new Set();
	const potentialRootEntries = [];
	const folderEntries = [];

	await Promise.all(modsPaths.map(async (modsPath) => {
		if (!await fs.pathExists(modsPath)) return;
		
		try {
			const entries = await fs.readdir(modsPath, { withFileTypes: true });
			debugLog(`[SCAN] Found ${entries.length} items in ${modsPath}`);
			
			for (const entry of entries) {
				const entryName = entry.name;
				if (entryName.startsWith('.') || entryName.toLowerCase() === 'backups') continue;

				if (entry.isDirectory()) {
					const subPath = path.join(modsPath, entryName);

					// Check if the folder itself is an unzipped mod
					const isModDir = await fs.pathExists(path.join(subPath, 'modDesc.xml'));
					if (isModDir) {
						potentialRootEntries.push({ root: modsPath, name: entryName, sub: '' });
					} else {
						// Treat as organizational folder
						const subEntries = await fs.readdir(subPath, { withFileTypes: true }).catch(() => []);
						
						for (const sub of subEntries) {
							if (sub.name.toLowerCase().endsWith('.zip')) {
								folderEntries.push({ root: modsPath, name: sub.name, sub: entryName });
								subfolderModNames.add(sub.name.toLowerCase());
							} else if (sub.isDirectory()) {
								const hasModDesc = await fs.pathExists(path.join(subPath, sub.name, 'modDesc.xml'));
								if (hasModDesc) {
									folderEntries.push({ root: modsPath, name: sub.name, sub: entryName });
									subfolderModNames.add(sub.name.toLowerCase());
								}
							}
						}
						allFolders.push(entryName);
					}
				} else if ((entry.isFile() || entry.isSymbolicLink()) && entryName.toLowerCase().endsWith('.zip')) {
					potentialRootEntries.push({ root: modsPath, name: entryName, sub: '' });
				}
			}
		} catch (err) {
			console.error(`[SCAN] Failed to read ${modsPath}:`, err.message);
		}
	}));

	// Deduplicate: Only add root mods if they don't exist in any subfolder
	const rootEntries = potentialRootEntries.filter(e => !subfolderModNames.has(e.name.toLowerCase()));
	allEntries.push(...folderEntries, ...rootEntries);

	debugLog(`[SCAN] Queuing ${allEntries.length} items for processing...`);

	// Process with concurrency limit for speed
	const limit = 10;
	for (let i = 0; i < allEntries.length; i += limit) {
		const chunk = allEntries.slice(i, i + limit);
		
		try {
			cache.beginTransaction();
			await Promise.all(chunk.map(e => processEntry(e.root, e.name, e.sub)));
			cache.commitTransaction();
		} catch (e) {
			console.error('[SCAN] Transaction failed, trying to commit partial:', e.message);
			try { cache.commitTransaction(); } catch (e2) {}
		}

		// Yield slightly between chunks to keep UI responsive
		await new Promise(r => setTimeout(r, 10));
	}

	// TRIGGER MIRROR SYNC IN BACKGROUND
	syncMirrorLinks(modsPaths[0]).catch(err => console.error('[MIRROR] Background sync failed:', err));
	
	// ── FINAL DEDUPLICATION (By Identity & Filename) ──
	// We use multiple keys to catch duplicates even if the filename or version changed.
	// We ALWAYS prioritize mods in a subfolder over those in the root.
	const uniqueModsMap = new Map();
	const sortedForDedupe = [...mods].sort((a, b) => {
		const aIsRoot = !a.folder || a.folder === '';
		const bIsRoot = !b.folder || b.folder === '';
		if (!aIsRoot && bIsRoot) return -1;
		if (aIsRoot && !bIsRoot) return 1;
		return 0;
	});

	for (const m of sortedForDedupe) {
		const idKey = m.modId ? `ID_${m.modId}` : null;
		const nameKey = m.technicalName ? `NAME_${m.technicalName.toLowerCase()}` : null;
		const fileKey = `FILE_${path.basename(m.fileName).toLowerCase()}`;
		const titleKey = `TITLE_${(m.title || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;

		const keys = [idKey, nameKey, fileKey, titleKey].filter(Boolean);
		let alreadySeen = false;
		for (const k of keys) {
			if (uniqueModsMap.has(k)) {
				alreadySeen = true;
				break;
			}
		}

		if (!alreadySeen) {
			// Register all identity keys for this mod instance
			keys.forEach(k => uniqueModsMap.set(k, m));
		}
	}

	// The map now contains only one instance per mod "identity"
	const finalMods = Array.from(new Set(uniqueModsMap.values()));

	finalMods.sort((a, b) => a.title.localeCompare(b.title));
	const conflicts = detectConflicts(finalMods);
	
	// Identify missing dependencies (using the deduplicated set for lookup)
	const modNames = new Set(finalMods.map(m => m.modName.toLowerCase()));
	const missingDependencies = [];
	for (const mod of finalMods) {
		for (const dep of (mod.dependencies || [])) {
			if (!modNames.has(dep.toLowerCase())) {
				missingDependencies.push({
					mod: mod.title,
					dependency: dep,
					modPath: mod.filePath
				});
			}
		}
	}

	const resultData = { mods: finalMods, allFolders: Array.from(new Set(allFolders)).sort(), conflicts, missingDependencies };
	
	// ── BACKGROUND AUTO-RESOLVE ──
	const autoResolve = cache.getSetting('autoResolveDependencies') === 'true';
	if (autoResolve) {
		autoResolveMissingDependencies(finalMods).catch(err => {
			console.error('[AUTO-RESOLVE] Background reconciliation failed:', err);
		});
	}

	debugLog(`[SCAN] Finished. Total unique mods: ${finalMods.length} (from ${mods.length} physical files)`);
	return resultData;
}

/**
 * Detect script and specialization conflicts across a list of mods.
 */
function detectConflicts(mods) {
	const conflicts = [];
	const scriptMap = new Map(); // fileName -> [modTitle]
	const specMap = new Map();   // specName -> [modTitle]

	for (const mod of (mods || [])) {
		// 1. Script Conflicts (extraSourceFiles)
		for (const scriptPath of (mod.scripts || [])) {
			const scriptName = path.basename(scriptPath).toLowerCase();
			if (!scriptMap.has(scriptName)) scriptMap.set(scriptName, []);
			scriptMap.get(scriptName).push(mod.title);
		}

		// 2. Specialization Conflicts
		for (const specName of (mod.specializations || [])) {
			const lowerSpec = specName.toLowerCase();
			if (!specMap.has(lowerSpec)) specMap.set(lowerSpec, []);
			specMap.get(lowerSpec).push(mod.title);
		}
	}

	// Analyze maps
	scriptMap.forEach((modsWithScript, scriptName) => {
		if (modsWithScript.length > 1) {
			conflicts.push({
				type: 'script',
				name: scriptName,
				mods: Array.from(new Set(modsWithScript)),
				severity: 'warning'
			});
		}
	});

	specMap.forEach((modsWithSpec, specName) => {
		if (modsWithSpec.length > 1) {
			conflicts.push({
				type: 'specialization',
				name: specName,
				mods: Array.from(new Set(modsWithSpec)),
				severity: 'critical'
			});
		}
	});

	return conflicts;
}

/**
	* Internal function for the queue worker to run.
	*/
async function runInstallTask(task) {
	const { modId, modTitle, downloadUrl, onProgress, category, subFolder, techData, oldPath, recoveryPath } = task;
	
	broadcastStatus?.(modId, 'connecting');
	
	try {
		const result = await installModInternal(modId, modTitle, downloadUrl, onProgress, category, subFolder, techData);
		
		// ── SUCCESS CLEANUP/BACKUP ──
		if (result.success) {
			const modsPath = getModsPath();
			const backupsDir = path.join(modsPath, 'backups');
			
			if (oldPath && fs.existsSync(oldPath)) {
				const fileName = path.basename(oldPath);
				const bakPath = path.join(backupsDir, `${fileName}.bak`);
				
				if (oldPath !== result.filePath) {
					// Filename changed: Move old file to backups folder
					console.log(`[UPDATE] Filename changed. Moving old version to backup: ${fileName}`);
					try {
						await fs.ensureDir(backupsDir);
						if (fs.existsSync(bakPath)) await fs.remove(bakPath);
						await fs.move(oldPath, bakPath);
					} catch (e) { console.warn(`[UPDATE] Failed to move old mod to backup: ${e.message}`); }
				} else {
					// Filename stayed same: It was overwritten. 
					// If we have a recovery copy, move THAT to the backups folder so the user has the old version.
					if (recoveryPath && fs.existsSync(recoveryPath)) {
						console.log(`[UPDATE] Filename same (overwritten). Moving recovery copy to backup: ${fileName}`);
						try {
							await fs.ensureDir(backupsDir);
							if (fs.existsSync(bakPath)) await fs.remove(bakPath);
							await fs.move(recoveryPath, bakPath);
						} catch (e) { console.warn(`[UPDATE] Failed to move recovery copy to backup: ${e.message}`); }
					}
				}
			}

			// Final cleanup of recovery file if it still exists
			if (recoveryPath && fs.existsSync(recoveryPath)) {
				await fs.remove(recoveryPath).catch(() => {});
			}
		}

		broadcastStatus?.(modId, 'success');
		onProgress?.({ status: 'success' }); // Explicit completion for dedicated listeners
		return result;
	} catch (err) {
		console.error(`[QUEUE] Task failed for ${modTitle}:`, err);
		
		// ── ERROR RECOVERY ──
		if (recoveryPath && fs.existsSync(recoveryPath) && oldPath) {
			console.log(`[UPDATE] Installation failed. Restoring backup for: ${modTitle}`);
			try {
				await fs.ensureDir(path.dirname(oldPath));
				await fs.move(recoveryPath, oldPath, { overwrite: true });
			} catch (e) { console.error(`[UPDATE] Critical: Failed to restore backup: ${e.message}`); }
		}

		broadcastStatus?.(modId, 'error');
		onProgress?.({ status: 'error' }); // Explicit failure for dedicated listeners
		throw err;
	}

}

/**
	* Worker loop to process the queue sequentially.
	*/
async function processQueue() {
	if (activeCount >= MAX_CONCURRENT_INSTALLS || downloadQueue.length === 0) return;
	
	while (activeCount < MAX_CONCURRENT_INSTALLS && downloadQueue.length > 0) {
		const task = downloadQueue.shift();
		activeCount++;
		
		runInstallTask(task)
		.catch(err => {
			console.error(`[QUEUE] Worker caught rejection for ${task.modTitle}:`, err.message);
		})
		.finally(() => {
			activeCount--;
			processQueue();
		});
	}
}

/**
	* Entry point for the frontend to queue a download.
	*/
async function enqueueInstall(modId, modTitle, downloadUrl, onProgress, category, subFolder = null, oldPath = null, recoveryPath = null) {
	// Check if already in queue or active
	if (activeInstalls.has(modId) || downloadQueue.some(t => t.modId === modId)) {
		return { success: false, error: 'Already in progress or queued' };
	}

	// ── OPTIMIZATION: Always scrape for techData if missing ──
	let techData = null;
	if (!techData || !downloadUrl) {
		try {
			debugLog(`[QUEUE] Fetching/Completing metadata for ${modId}...`);
			const detail = await scraper.fetchModDetail(modId);
			if (!techData) techData = detail?.techData;
			if (!downloadUrl && detail?.downloadUrl) downloadUrl = detail.downloadUrl;
			if (!category && detail?.category) category = detail.category;
		} catch (e) {
			debugLog(`[QUEUE] Scraper failed for ${modId}: ${e.message}`);
		}
	}

	downloadQueue.push({ modId, modTitle, downloadUrl, onProgress, category, subFolder, techData, oldPath, recoveryPath });
	
	// Immediate broadcast so UI knows it is queued
	broadcastStatus?.(modId, 'queued');
	
	// Start processing if not already
	processQueue();

	return { success: true, queued: true };
}


/**
	* We intercept the download event from the session.
	*/
async function installModInternal(modId, modTitle, downloadUrl, onProgress, category, subFolder = null, techData = null) {
	// Clean title if it's a map
	if (category && category.toUpperCase().includes('MAP')) {
		// Strip (V1.0) or (by Author) but keep the main title for tracking
		modTitle = modTitle.replace(/\([^)]+\)/, '').trim();
		// Ensure maps always go to a subfolder named after the map
		if (!subFolder) {
			subFolder = modTitle;
			console.log(`[INSTALL] Map detected without subfolder. Auto-assigned to: ${subFolder}`);
		}
	}

	const modsPath = getModsPath();
	if (!modsPath) {
		console.error('[INSTALL] Failed to resolve mods directory path.');
		throw new Error('Mods directory not configured. Please set it in Settings.');
	}
	
	let targetDirPath = modsPath;
	if (subFolder && typeof subFolder === 'string') {
		// Better sanitization that allows path separators (for nested folders) but cleans names
		const sanitized = subFolder.split(/[\\/]/).map(part => 
			part.replace(/[^a-zA-Z0-9_\-\.\s\(\)\[\]]/g, '').trim()
		).filter(part => part && part.length > 0).join(path.sep);

		if (sanitized) {
			targetDirPath = path.join(modsPath, sanitized);
			console.log(`[INSTALL] Folder Routing: Using subfolder "${sanitized}" -> Full path: ${targetDirPath}`);
		}
	}

	try {
		fs.ensureDirSync(targetDirPath);
	} catch (err) {
		console.error(`[INSTALL] Failed to create/verify target directory ${targetDirPath}:`, err.message);
		throw new Error(`Failed to initialize download directory: ${err.message}`);
	}

	const timeoutDuration = 60000; // 60 seconds
	let timeoutId = null;

	return new Promise((resolve, reject) => {
		let hiddenWin = null;
		let timeoutId = null;

		const cleanup = () => {
			if (timeoutId) clearTimeout(timeoutId);
			if (hiddenWin && !hiddenWin.isDestroyed()) {
				hiddenWin.close();
				hiddenWin = null;
			}
		};

		const wrappedResolve = (res) => { cleanup(); resolve(res); };
		const wrappedReject = (err) => { cleanup(); reject(err); };

		const modUrl = `https://www.farming-simulator.com/mod.php?mod_id=${modId}&title=fs2025`;

		// ── Step 0: Direct Hand-off (If URL is already known) ──
		if (downloadUrl && (downloadUrl.startsWith('http') || downloadUrl.includes('storage/'))) {
			debugLog(`[INSTALL] Direct Hand-off for ${modId} (URL: ${downloadUrl})`);
			broadcastStatus?.(modId, 'starting');
			onProgress?.({ percent: 0, receivedBytes: 0, totalBytes: 0, fileName: 'Initializing...' });
			
			downloadWithNet(modId, downloadUrl, targetDirPath, modTitle, onProgress, category, 0, techData, modUrl, scraper.getPHPSESSID?.())
				.then(wrappedResolve)
				.catch(wrappedReject);
			return;
		}

		// ── Step 1: Scrape for Direct ZIP link (If URL is missing) ──
		debugLog(`[SCRAPE-FALLBACK] URL missing for ${modId}. Fetching mod page...`);
		broadcastStatus?.(modId, 'handshaking');
		
		scraper.fetchModDetail(modId).then((details) => {
			if (details && details.downloadUrl && (details.downloadUrl.endsWith('.zip') || details.downloadUrl.includes('storage/'))) {
				debugLog(`[INSTALL] Scraper found direct link: ${details.downloadUrl}`);
				broadcastStatus?.(modId, 'starting');
				onProgress?.({ percent: 0, receivedBytes: 0, totalBytes: 0, fileName: 'Initializing...' });
				
				downloadWithNet(modId, details.downloadUrl, targetDirPath, modTitle, onProgress, category, 0, details.techData || techData, modUrl, scraper.getPHPSESSID?.())
					.then(wrappedResolve)
					.catch(wrappedReject);
				return;
			}
			
			// If details were found but didn't have a download URL, proceed to last resort
			throw new Error('Could not find a valid download link on mod page');
		}).catch((err) => {
			// ── Step 2: Fallback to BrowserWindow probe (Last resort) ──
			debugLog(`[FALLBACK] Scraper failed for ${modId} (${err.message}). Launching off-screen browser...`);
			broadcastStatus?.(modId, 'handshaking');
			
			hiddenWin = new BrowserWindow({
				show: false,
				width: 100,
				height: 100,
				x: -2000,
				y: -2000,
				webPreferences: {
					partition: 'persist:modhub_install',
					nodeIntegration: false,
					contextIsolation: true,
					sandbox: true
				},
			});
			
			const ses = hiddenWin.webContents.session;
			ses.setSafeBrowsingEnabled(false);
			
			const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
			ses.webRequest.onBeforeSendHeaders({ urls: ['https://*.farming-simulator.com/*', 'https://*.giants-software.com/*'] }, (details, callback) => {
				const headers = details.requestHeaders;
				headers['User-Agent'] = chromeUA;
				headers['Referer'] = modUrl;
				headers['sec-ch-ua'] = '"Google Chrome";v="123", "Chromium";v="123", "Not A(Brand";v="24"';
				headers['sec-ch-ua-mobile'] = '?0';
				headers['sec-ch-ua-platform'] = '"Windows"';
				headers['sec-fetch-dest'] = 'document';
				headers['sec-fetch-mode'] = 'navigate';
				headers['sec-fetch-site'] = 'cross-site';
				headers['sec-fetch-user'] = '?1';
				headers['upgrade-insecure-requests'] = '1';
				callback({ cancel: false, requestHeaders: headers });
			});

			let downloadStarted = false;
			ses.on('will-download', (event, item) => {
				if (downloadStarted) return;
				downloadStarted = true;
				debugLog(`[INSTALL] Window intercepted ZIP: ${item.getFilename()}`);
				
				const fileName = item.getFilename() || `${modTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
				const savePath = path.join(targetDirPath, fileName);
				
				item.setSavePath(savePath);
				item.resume();

				activeInstalls.set(modId, { 
					type: 'window',
					window: hiddenWin,
					item: item,
					savePath,
					targetDirPath,
				});

				const totalBytes = item.getTotalBytes();
				item.on('updated', (event, state) => {
					if (state === 'progressing') {
						const receivedBytes = item.getReceivedBytes();
						onProgress?.({
							percent: totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0,
							receivedBytes,
							totalBytes,
							fileName
						});
					} else if (state === 'interrupted') {
						wrappedReject(new Error('Download interrupted.'));
					}
				});

				item.once('done', (event, state) => {
					debugLog(`[INSTALL] Window download done for ${modId}. State: ${state}`);
					if (state === 'completed') {
						try {
							const relativePath = path.relative(getModsPath(), savePath);
							cache.setModTracking(modId, { 
								localFileName: relativePath,
								modhubTitle: modTitle,
								category: category,
								techData: techData,
							});
						} catch (e) {
							console.error('[INSTALL] Failed to track mod:', e.message);
						}
						wrappedResolve({ success: true, fileName, filePath: savePath });
					} else {
						wrappedReject(new Error(`Download failed: ${state}`));
					}
					activeInstalls.delete(modId);
				});
			});

			hiddenWin.loadURL(modUrl).catch(wrappedReject);
			hiddenWin.webContents.on('dom-ready', () => {
				setTimeout(async () => {
					if (downloadStarted || hiddenWin.isDestroyed()) return;
					debugLog(`[WINDOW] Page ready. Triggering click for ${modId}...`);
					try {
						await hiddenWin.webContents.executeJavaScript(`
							(function() {
								const btn = document.querySelector('a.button-buy, a[href*="download"]');
								if (btn) {
									console.log('[WINDOW] Found button, clicking...');
									btn.click();
									setTimeout(() => { if (window.location.href !== btn.href) window.location.href = btn.href; }, 1000);
									return true;
								}
								return false;
							})();
						`);
					} catch (e) { debugLog(`[WINDOW] JS Trace Error: ${e.message}`); }
				}, 4000);
			});
		}).catch(wrappedReject);
	});
}

/**
	* Download a file directly using Electron's net module.
*/
function downloadWithNet(modId, url, modsPath, modTitle, onProgress, category, redirectCount = 0, techData = null, refererUrl = null, cookies = null) {
	if (redirectCount > 10) {
		return Promise.reject(new Error('Too many redirects.'));
	}

	// ── CHECK FOR RESUMPTION ──
	const pending = cache.getPendingDownloads().find(d => d.mod_id === String(modId));
	let startByte = 0;
	let existingFileName = pending?.file_name;
	
	if (pending && existingFileName) {
		const partPath = path.join(modsPath, existingFileName);
		if (fs.existsSync(partPath)) {
			const stats = fs.statSync(partPath);
			startByte = stats.size;
			debugLog(`[HTTPS-DL] [RESUME] Found partial file: ${existingFileName} (${(startByte/1024/1024).toFixed(2)}MB)`);
		}
	}

	return new Promise((resolve, reject) => {
		debugLog(`[HTTPS-DL] Initializing: ${modTitle} (${modId}) ${startByte > 0 ? '[RESUMING]' : ''}`);
		
		const parsedUrl = new URL(url);
		const options = {
			hostname: parsedUrl.hostname,
			path: parsedUrl.pathname + parsedUrl.search,
			method: 'GET',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
				'Referer': refererUrl || 'https://www.farming-simulator.com/'
			}
		};

		if (startByte > 0) {
			options.headers['Range'] = `bytes=${startByte}-`;
		}

		if (cookies) {
			const cookieStr = Array.isArray(cookies) ? cookies.map(c => c.split(';')[0]).join('; ') : cookies;
			options.headers['Cookie'] = cookieStr;
		}

		const request = https.get(options, (response) => {
			// Set socket timeout to prevent hanging on silent connections
			request.setTimeout(45000, () => {
				debugLog(`[HTTPS-DL] Request timed out for ${modId}`);
				request.destroy();
			});

			// Handle Redirects
			if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				const redirectUrl = response.headers.location;
				const absoluteUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).toString();
				
				let nextCookies = cookies;
				if (response.headers['set-cookie']) {
					const newCookies = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
					nextCookies = cookies ? `${cookies}; ${newCookies}` : newCookies;
				}

				debugLog(`[HTTPS-DL] Redirecting (${response.statusCode}) -> ${absoluteUrl}`);
				downloadWithNet(modId, absoluteUrl, modsPath, modTitle, onProgress, category, redirectCount + 1, techData, url, nextCookies)
					.then(resolve)
					.catch(reject);
				return;
			}

			if (response.statusCode >= 400 && response.statusCode !== 416) {
				debugLog(`[HTTPS-DL] Server error: ${response.statusCode}`);
				reject(new Error(`HTTP ${response.statusCode}`));
				return;
			}

			// Handle 416 Range Not Satisfiable (maybe file is already complete?)
			if (response.statusCode === 416) {
				debugLog(`[HTTPS-DL] [RESUME] Server returned 416. Assuming file is complete.`);
				const savePath = path.join(modsPath, existingFileName);
				resolve({ success: true, fileName: existingFileName, filePath: savePath, size: startByte });
				return;
			}

			const isPartial = response.statusCode === 206;
			const disposition = response.headers['content-disposition'];
			let fileName = existingFileName;
			if (!fileName) {
				// Sanitize title: replace spaces/specials with underscores
				let sanitized = modTitle.replace(/[^a-zA-Z0-9_]/g, '_');
				// Ensure it doesn't start with a digit (required by GIANTS engine)
				if (/^[0-9]/.test(sanitized)) {
					sanitized = `FS25_${sanitized}`;
				}
				fileName = `${sanitized}.zip`;
			}
			
			if (disposition && !existingFileName) {
				const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
				if (match) {
					let serverFileName = match[1].replace(/['"]/g, '');
					// Also sanitize server-provided filename if it starts with a digit
					if (/^[0-9]/.test(serverFileName)) {
						serverFileName = `FS25_${serverFileName}`;
					}
					fileName = serverFileName;
				}
			}

			const savePath = path.join(modsPath, fileName);
			const contentLength = parseInt(response.headers['content-length'] || '0', 10);
			const totalBytes = isPartial ? contentLength + startByte : contentLength;
			
			debugLog(`[HTTPS-DL] Starting write to: ${savePath} (Mode: ${isPartial ? 'APPEND' : 'OVERWRITE'}, Size: ${(totalBytes/1024/1024).toFixed(2)}MB)`);

			// Back up existing file ONLY IF NOT RESUMING
			if (!isPartial && fs.existsSync(savePath)) {
				const bakPath = path.join(modsPath, 'backups', `${fileName}.bak`);
				fs.ensureDirSync(path.join(modsPath, 'backups'));
				if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
				fs.renameSync(savePath, bakPath);
			}

			const fileStream = fs.createWriteStream(savePath, { 
				flags: isPartial ? 'a' : 'w',
				highWaterMark: 2 * 1024 * 1024 // 2MB buffer to prevent constant stream pausing on fast connections
			});
			let receivedBytes = isPartial ? startByte : 0;
			let lastUpdate = 0;
			let lastDbUpdate = 0;

			// Initialize tracking in DB if not already present
			if (!pending) {
				cache.savePendingDownload({
					mod_id: String(modId),
					mod_title: modTitle,
					download_url: url,
					target_dir: modsPath,
					file_name: fileName,
					total_bytes: totalBytes,
					received_bytes: 0,
					category: category,
					tech_data: techData ? JSON.stringify(techData) : null
				});
			}

			activeInstalls.set(modId, { type: 'https', request, fileStream, targetDirPath: modsPath, techData });

			response.on('data', (chunk) => {
				receivedBytes += chunk.length;
				if (!fileStream.write(chunk)) {
					response.pause();
					fileStream.once('drain', () => response.resume());
				}

				const now = Date.now();
				if (totalBytes > 0 && now - lastUpdate > 200) {
					const percent = Math.round((receivedBytes / totalBytes) * 100);
					onProgress?.({ percent, receivedBytes, totalBytes, fileName });
					lastUpdate = now;
				}

				// Throttled DB update (every 5 seconds or so)
				if (now - lastDbUpdate > 5000) {
					cache.updateDownloadProgress(String(modId), receivedBytes);
					lastDbUpdate = now;
				}
			});

			response.on('end', () => {
				fileStream.end();
			});

			response.on('error', (err) => {
				debugLog(`[HTTPS-DL] Response Stream Error: ${err.message}`);
				fileStream.destroy();
				activeInstalls.delete(modId);
				broadcastStatus?.(modId, 'error');
				reject(err);
			});

			fileStream.on('finish', () => {
				debugLog(`[HTTPS-DL] Success: ${fileName}`);
				
				// Final Tracking
				const relativePath = path.relative(getModsPath(), savePath);
				cache.setModTracking(modId, { 
					localFileName: relativePath,
					modhubTitle: modTitle,
					category: category,
					techData: techData
				});

				// Remove from pending
				cache.removePendingDownload(String(modId));
				activeInstalls.delete(modId);
				resolve({ success: true, fileName, filePath: savePath, size: receivedBytes });
			});

			fileStream.on('error', (err) => {
				debugLog(`[HTTPS-DL] Stream Error: ${err.message}`);
				fileStream.destroy();
				activeInstalls.delete(modId);
				broadcastStatus?.(modId, 'error');
				reject(err);
			});
		});

		request.on('error', (err) => {
			debugLog(`[HTTPS-DL] Request Error: ${err.message}`);
			activeInstalls.delete(modId);
			broadcastStatus?.(modId, 'error');
			reject(err);
		});

		request.setTimeout(60000, () => {
			debugLog(`[HTTPS-DL] Socket timeout for ${modTitle} (${modId})`);
			request.destroy(new Error('Connection timeout. Please try again later.'));
		});
	});
}

/**
	* Uninstall (delete) a local mod.
*/
async function uninstallMod(modFileName, folder = null) {
	// 0. Wait for active scan to finish (prevents file locks during deletion)
	if (activeScanPromise) {
		console.log(`[UNINSTALL] Waiting for active scan to complete before deleting "${modFileName}"...`);
		await activeScanPromise.catch(() => {});
	}
	const modsPath = getModsPath();
	
	// If modFileName is a relative path (e.g. "Maps/Mod.zip"), and folder is also "Maps",
	// we need to avoid doubling up. 
	let fullPath;
	if (modFileName.includes('/') || modFileName.includes('\\')) {
		// It's already relative, just join with root
		fullPath = path.join(modsPath, modFileName);
	} else {
		fullPath = folder ? path.join(modsPath, folder, modFileName) : path.join(modsPath, modFileName);
	}
	
	if (!fs.existsSync(fullPath)) {
		return { success: false, error: 'File not found' };
	}

	// 1. Check if game is running (Windows lock protection)
	if (await gameLauncher.isGameRunning()) {
		return { success: false, error: 'Cannot delete: Farming Simulator 25 is currently running. Please close the game first.' };
	}
	
	try {
		await safeRemove(fullPath);
		
		// 2. CLEANUP DB TRACKING (Prevent phantom 'already installed' states)
		const fileName = path.basename(fullPath);
		cache.removeModTrackingByFile(fileName);
		cache.removeLocalModCache(fullPath);
		
		return { success: true, fileName: modFileName };
	} catch (err) {
		console.error(`[UNINSTALL] Failed to delete ${modFileName}:`, err.message);
		return { success: false, error: `Failed to delete file: ${err.message}` };
	}
}

/**
	* Synchronize metadata for local mods that are missing categories.
	* This runs in the background and searches ModHub by modId.
*/
async function syncLibraryMetadata() {
	const { mods } = await scanLocalMods();
	// We sync any mod that has 'Other' or 'Maps' but specifically look for those without a definitive category
	const targetMods = mods.filter(m => !m.category || m.category === 'Other');
	
	console.log(`[SYNC] Starting deep discovery for ${targetMods.length} mods...`);
	if (targetMods.length === 0) return { success: true, count: 0 };
	
	let syncedCount = 0;
	for (const mod of targetMods) {
		try {
			let modId = mod.modId;
			
			// 1. If we don't have a ModId, try to find it by searching ModHub by title
			if (!modId) {
				console.log(`[SYNC] Searching ModHub for title: ${mod.title}`);
				await new Promise(r => setTimeout(r, 800)); // Respect rate limits
				const searchResult = await scraper.searchMods(mod.title);
				
				if (searchResult && searchResult.mods && searchResult.mods.length > 0) {
					// Try to find a exact or very close title match in search results
					const match = searchResult.mods.find(m => 
						m.title.toLowerCase() === mod.title.toLowerCase() ||
						m.title.toLowerCase().includes(mod.title.toLowerCase()) ||
						mod.title.toLowerCase().includes(m.title.toLowerCase())
					) || searchResult.mods[0]; // Fallback to first result
					
					if (match) {
						modId = match.modId;
						console.log(`[SYNC] Discovered ID ${modId} for ${mod.title}`);
					}
				}
			}
			
			// 2. If we now have an ID (either existing or discovered), fetch its details (category)
			if (modId) {
				await new Promise(r => setTimeout(r, 600)); // Respect rate limits
				const detail = await scraper.fetchModDetail(modId);
				
				let modhubTitle = detail?.title || mod.title;
				const targetCategory = (detail?.category || '').toUpperCase();
				const isMapResult = targetCategory.includes('MAP');

				modhubTitle = cleanModTitle(modhubTitle, mod.modName, mod.fileName, isMapResult);

				if (detail && detail.category) {
					console.log(`[SYNC] Resolved category '${detail.category}' for ${mod.title}`);
					cache.setModTracking(modId, {
						modhubTitle: modhubTitle,
						author: detail.author,
						category: detail.category,
						localFileName: mod.fileName,
						remoteVersion: detail.version,
						localVersion: mod.version,
						techData: detail.techData,
					});
					syncedCount++;
				}
			}
			} catch (err) {
			console.error(`[SYNC] Failed for mod ${mod.modName}:`, err.message);
		}
	}
	
	return { success: true, count: syncedCount };
}

/**
	* Check latest mods from ModHub and cross-reference with installed mods.
*/
async function checkForUpdates() {
	try {
		const { mods: localMods } = await scanLocalMods();
		if (localMods.length === 0) return { updates: [] };
		
		// Fetch the latest page from ModHub to detect new versions
		const latestResult = await scraper.fetchModList('latest', 0);
		const latestMods = latestResult.mods || [];
		
		const updates = [];
		
		for (const localMod of localMods) {
			// Try to find a matching mod in the latest list by fuzzy name match
			const match = latestMods.find(remote => {
				const localName = localMod.title.toLowerCase().replace(/[^a-z0-9]/g, '');
				const remoteName = remote.title.toLowerCase().replace(/[^a-z0-9]/g, '');
				return localName === remoteName || remoteName.includes(localName) || localName.includes(remoteName);
			});
			
			if (match) {
				// We found a potentially updated mod
				updates.push({
					localMod,
					remoteMod: match,
					hasUpdate: true, // Could be refined with version comparison
				});
			}
		}
		
		return { updates };
		} catch (err) {
		console.error('Update check failed:', err);
		return { updates: [], error: err.message };
	}
}

/**
	* Update a specific mod.
*/
async function updateMod(modFileName, modId, onProgress) {
	const modsPath = getModsPath();
	const currentPath = await findModPath(modFileName);
	const originalPath = currentPath || path.join(modsPath, modFileName);
	const backupPath = originalPath + '.bak';
	
	try {
		// 1. Identify subfolder for persistence
		let subFolder = null;
		if (currentPath) {
			const relative = path.relative(modsPath, currentPath);
			const parts = relative.split(path.sep);
			if (parts.length > 1) {
				subFolder = parts.slice(0, -1).join(path.sep);
				console.log(`[UPDATE] Mod is in subfolder, persisting: ${subFolder}`);
			}
		}

		// 2. Fetch direct download URL to avoid browser-scraping fallback
		const detail = await scraper.fetchModDetail(modId);
		const directUrl = detail?.downloadUrl || null;
		const category = (detail?.category || '').toUpperCase();
		
		// 3. Backup the old version
		if (fs.existsSync(originalPath)) {
			await fs.copy(originalPath, backupPath);
		}
		
		// 4. Download and install (respecting subFolder)
		// We pass originalPath and backupPath to the queue so it can handle cleanup/backup AFTER completion.
		const result = await installMod(modId, modFileName.replace('.zip', ''), directUrl, onProgress, category, subFolder, detail?.techData, originalPath, backupPath);
		
		return result;
	} catch (err) {
		// Restore backup on failure
		if (fs.existsSync(backupPath)) {
			// Ensure directory exists for restore if it was deleted
			await fs.ensureDir(path.dirname(originalPath));
			await fs.move(backupPath, originalPath, { overwrite: true });
		}
		throw err;
	}
}



/**
 * Mirror mods from subfolders to the root folder using symbolic links.
 * This ensures GIANTS Engine 10 sees all mods during discovery while preserving organization.
 */
async function syncMirrorLinks(primaryPath) {
	if (!primaryPath || !fs.existsSync(primaryPath)) return;

	try {
		const allPaths = getModsPaths();
		const subFolderMods = new Map(); // fileName -> absPath
		const existingMirrors = new Set(); // fileName

		// 1. Discover all mods in ALL configured folders and their subfolders
		for (const rootPath of allPaths) {
			if (!fs.existsSync(rootPath)) continue;
			
			const rootEntries = await fs.readdir(rootPath, { withFileTypes: true });
			
			// A. Mods in the root of THIS folder (only if it's not the primary root itself)
			if (rootPath !== primaryPath) {
				for (const entry of rootEntries) {
					const isZip = entry.isFile() && entry.name.toLowerCase().endsWith('.zip');
					let isModDir = false;
					if (entry.isDirectory()) {
						isModDir = await fs.pathExists(path.join(rootPath, entry.name, 'modDesc.xml'));
					}

					if (isZip || isModDir) {
						subFolderMods.set(entry.name, path.join(rootPath, entry.name));
					}
				}
			}

			// B. Mods in subfolders
			const subFolders = rootEntries.filter(e => e.isDirectory() && e.name.toLowerCase() !== 'backups');
			for (const folder of subFolders) {
				const subPath = path.join(rootPath, folder.name);
				const modsInFolder = await fs.readdir(subPath, { withFileTypes: true }).catch(() => []);
				for (const entry of modsInFolder) {
					const isZip = entry.isFile() && entry.name.toLowerCase().endsWith('.zip');
					let isModDir = false;
					if (entry.isDirectory()) {
						isModDir = await fs.pathExists(path.join(subPath, entry.name, 'modDesc.xml'));
					}

					if (isZip || isModDir) {
						subFolderMods.set(entry.name, path.join(subPath, entry.name));
					}
				}
			}
		}

		// 2. Identify and create missing mirrors
		for (const [modName, targetPath] of subFolderMods) {
			const mirrorPath = path.join(primaryPath, modName);
			let shouldCreate = false;

			if (!fs.existsSync(mirrorPath)) {
				shouldCreate = true;
			} else {
				const stats = await fs.lstat(mirrorPath);
				if (stats.isSymbolicLink()) {
					// Verify it points to the right place
					const currentTarget = await fs.readlink(mirrorPath);
					const absoluteTarget = path.isAbsolute(currentTarget) ? currentTarget : path.resolve(primaryPath, currentTarget);
					if (absoluteTarget !== targetPath) {
						await fs.remove(mirrorPath);
						shouldCreate = true;
					}
				} else {
					console.warn(`[MIRROR] Name conflict: Root file ${modName} exists and is NOT a link. Skipping mirror.`);
				}
			}

			if (shouldCreate) {
				try {
					const targetStats = await fs.lstat(targetPath);
					const isDir = targetStats.isDirectory();
					await fs.symlink(targetPath, mirrorPath, isDir ? 'junction' : 'file');
					console.log(`[MIRROR] Created link: ${modName} -> ${targetPath} (${isDir ? 'folder' : 'zip'})`);
				} catch (e) {
					console.error(`[MIRROR] Failed to create symlink for ${modName}: ${e.message}`);
					// Fallback: Hardlink
					try {
						await fs.link(targetPath, mirrorPath);
						console.log(`[MIRROR] Created HARDLINK fallback: ${modName}`);
					} catch (hErr) {
						console.error(`[MIRROR] Hardlink fallback failed: ${hErr.message}`);
					}
				}
			}
			existingMirrors.add(modName);
		}

		// 3. Cleanup stale mirrors
		const currentRootFiles = await fs.readdir(primaryPath, { withFileTypes: true });
		for (const rf of currentRootFiles) {
			if (rf.isSymbolicLink()) {
				const linkPath = path.join(primaryPath, rf.name);
				const isAutoMirror = subFolderMods.has(rf.name);
				
				if (!isAutoMirror) {
					const target = await fs.readlink(linkPath);
					const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(primaryPath, target);
					
					// If it points to a .zip inside any of our mods folders, but we didn't just map it, it's stale
					const isModLink = allPaths.some(p => absoluteTarget.startsWith(p)) && absoluteTarget.endsWith('.zip');
					if (isModLink) {
						await fs.remove(linkPath);
						console.log(`[MIRROR] Removed stale mirror: ${rf.name}`);
					}
				}
			}
		}
	} catch (err) {
		console.error('[MIRROR] Sync failed:', err.message);
	}
}

/**
 * Automatically find maps in the root mods folder and move them to their own subfolders.
 */
async function autoOrganizeMaps() {
	const { mods } = await scanLocalMods();
	const rootMaps = mods.filter(m => m.isMap && (m.folder === '' || !m.folder));
	
	console.log(`[ORGANIZE] Found ${rootMaps.length} maps in root to organize.`);
	
	let movedCount = 0;
	for (const map of rootMaps) {
		try {
			// Create a folder name from the clean title
			const newFolderName = (map.title || map.mapId || map.mapTitle || 'UnknownMap')
				.replace(/[^a-zA-Z0-9]/g, '_')
				.replace(/_{2,}/g, '_')
				.replace(/^_|_$/g, '');
			
			if (newFolderName) {
				await moveModsToFolder([map.fileName], newFolderName);
				movedCount++;
			}
		} catch (err) {
			console.error(`[ORGANIZE] Failed to move map ${map.fileName}:`, err.message);
		}
	}
	
	return { success: true, moved: movedCount };
}


/**
	* Exported alias for the queue entry point
*/
async function installMod(modId, modTitle, downloadUrl, onProgress, category, subFolder = null, techData = null, oldPath = null, recoveryPath = null) {
    return await enqueueInstall(modId, modTitle, downloadUrl, onProgress, category, subFolder, oldPath, recoveryPath);
}

/**
	* Cancel an active installation.
*/
async function cancelInstall(modId) {
	// 1. Check if it's in the queue but not yet active
	const queueIdx = downloadQueue.findIndex(t => t.modId === modId);
	if (queueIdx !== -1) {
		console.log(`[CANCEL] Removing from queue: ${modId}`);
		downloadQueue.splice(queueIdx, 1);
		broadcastStatus?.(modId, 'cancelled');
		return { success: true };
	}

	const task = activeInstalls.get(modId);
	
	// Also check if this is a parentId for a batch
	if (activeBatchTasks.has(modId)) {
		console.log(`[CANCEL] Terminating batch loop for parent: ${modId}`);
		activeBatchTasks.delete(modId);
		// Note: The loop itself checks this Set before each step
	}

	if (!task) {
		// Just in case it's finishing up or already gone, return success to avoid blocking UI
		broadcastStatus?.(modId, 'cancelled');
		return { success: true };
	}

	console.log(`[CANCEL] Cancelling download for mod: ${modId}`);

	try {
		if (task.type === 'window') {
			try {
				if (task.item && !task.item.isPaused()) task.item.pause(); // Pause before cancelling to stop data flow
				if (task.item) task.item.cancel();
				if (task.window && !task.window.isDestroyed()) {
					// Give Electron a tick to detach before closing
					setImmediate(() => {
						if (!task.window.isDestroyed()) task.window.close();
					});
				}
			} catch (e) {
				console.warn('[CANCEL] Window cleanup warning:', e.message);
			}
		} else if (task.type === 'net') {
			try {
				if (task.request) task.request.abort();
				if (task.response) task.response.destroy();
				if (task.fileStream) task.fileStream.destroy();
			} catch (e) {
				console.warn('[CANCEL] Net cleanup warning:', e.message);
			}
		}

		activeInstalls.delete(modId);
		broadcastStatus?.(modId, 'cancelled');

		// Clean up partial file
		if (task.savePath) {
			// Delay slightly to ensure file handle is released by OS/Electron
			setTimeout(async () => {
				try {
					if (fs.existsSync(task.savePath)) {
						await fs.remove(task.savePath);
						console.log(`[CANCEL] Cleaned up partial file: ${task.savePath}`);

						// Restore backup if it exists
						const bakPath = task.savePath + '.bak';
						if (fs.existsSync(bakPath)) {
							await fs.move(bakPath, task.savePath, { overwrite: true });
							console.log(`[CANCEL] Restored backup from .bak`);
						}
					}
				} catch (err) {
					console.error('[CANCEL] Partial file cleanup failed:', err.message);
				}
			}, 500);
		}

		// 🧪 Folder Cleanup (independent of savePath)
		if (task.targetDirPath) {
			setTimeout(async () => {
				try {
					const mainModsPath = getModsPath();
					// Only attempt cleanup if this is a subfolder, not the root mods directory
					if (task.targetDirPath !== mainModsPath && fs.existsSync(task.targetDirPath)) {
						const files = await fs.readdir(task.targetDirPath);
						if (files.length === 0) {
							await fs.remove(task.targetDirPath);
							console.log(`[CANCEL] Removed empty target folder: ${task.targetDirPath}`);
						}
					}
				} catch (err) {
					console.error('[CANCEL] Empty folder cleanup failed:', err.message);
				}
			}, 1000); // Wait slightly longer than the file cleanup
		}

		return { success: true };
	} catch (err) {
		console.error('[CANCEL] Critical error during cancellation:', err);
		return { success: false, error: err.message };
	}
}

/**
 * Move mods to a destination folder within the mods directory.
 */
async function moveModsToFolder(fileNames, destinationFolder) {
	if (!Array.isArray(fileNames)) {
		console.error('[MOVE] TypeError: fileNames is not an array. Received:', typeof fileNames, fileNames);
		return { success: false, error: 'Invalid file list' };
	}

	const allModsPaths = getModsPaths();
	const modsPath = allModsPaths[0]; // Primary
	
	if (!modsPath) {
		console.error('[MOVE] No mod paths detected!');
		return { success: false, error: 'No mod paths detected' };
	}

	// 0. Check if game is running (Windows lock protection)
	if (await gameLauncher.isGameRunning()) {
		return { success: false, error: 'Cannot move mods: Farming Simulator 25 is currently running. Please close the game first.' };
	}

	const destDir = destinationFolder === '' ? modsPath : path.join(modsPath, destinationFolder);
	debugLog(`[MOVE] Moving ${fileNames.length} mods. Primary: ${modsPath}, Dest: ${destDir}`);
	
	if (!await fs.pathExists(destDir)) {
		await fs.ensureDir(destDir);
	}
	
	// ── ROBUST CASE-INSENSITIVE INDEXING (OPTIMIZED) ──
	const locationIndex = new Map(); // Lowercase Name -> Full Path
	
	// 1. Pre-fill from Cache (Instant)
	const cachedMods = cache.getAllLocalModCache();
	if (Array.isArray(cachedMods)) {
		for (const entry of cachedMods) {
			const name = path.basename(entry.file_path);
			const lowerName = name.toLowerCase();
			if (!locationIndex.has(lowerName)) {
				// Only index if it actually exists on disk (stale cache prevention)
				if (await fs.pathExists(entry.file_path)) {
					locationIndex.set(lowerName, entry.file_path);
				}
			}
		}
	} else {
		console.warn('[MOVE] cache.getAllLocalModCache() returned non-array:', typeof cachedMods);
	}

	// 2. For missing files, try targeted lookup across all mod paths
	for (const fileName of fileNames) {
		const lower = fileName.toLowerCase();
		if (!locationIndex.has(lower)) {
			// Try as relative path first
			for (const p of allModsPaths) {
				const full = path.join(p, fileName);
				if (await fs.pathExists(full)) {
					locationIndex.set(lower, full);
					break;
				}
			}
			
			if (!locationIndex.has(lower)) {
				const found = await findModPath(path.basename(fileName));
				if (found) locationIndex.set(lower, found);
			}
		}
	}

	// 3. Fallback: Deep scan ONLY if we are still missing mods
	const missingFromIndex = fileNames.filter(f => !locationIndex.has(f.toLowerCase()));
	if (missingFromIndex.length > 0) {
		debugLog(`[MOVE] Still missing ${missingFromIndex.length} mods after cache/find. Starting fallback scan...`);
		
		const scanFolder = async (dir) => {
			try {
				const entries = await fs.readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name);
					const lowerName = entry.name.toLowerCase();

					if (entry.isFile() && lowerName.endsWith('.zip')) {
						if (!locationIndex.has(lowerName)) {
							locationIndex.set(lowerName, fullPath);
						}
					} else if (entry.isDirectory()) {
						const isModDir = await fs.pathExists(path.join(fullPath, 'modDesc.xml'));
						if (isModDir) {
							if (!locationIndex.has(lowerName)) {
								locationIndex.set(lowerName, fullPath);
							}
						} else {
							const depth = (fullPath.split(path.sep).length - modsPath.split(path.sep).length);
							if (depth <= 3) await scanFolder(fullPath);
						}
					}
				}
			} catch (e) {}
		};

		for (const p of allModsPaths) {
			await scanFolder(p);
		}
	}
	
	debugLog(`[MOVE] Preparation complete. Indexed ${locationIndex.size} mod files.`);

	let completed = 0;
	const total = fileNames.length;
	const errors = [];
	const cacheUpdates = []; // { oldLoc, newLoc, oldRel, newRel }

	if (total === 0) return { success: true, completed: 0, total: 0, errors: [] };

	// Process in chunks to handle concurrency without overloading disk I/O
	const CHUNK_SIZE = 5;
	for (let i = 0; i < total; i += CHUNK_SIZE) {
		const chunk = fileNames.slice(i, i + CHUNK_SIZE);
		
		await Promise.all(chunk.map(async (fileName) => {
			const lowerName = fileName.toLowerCase();
			const currentLoc = locationIndex.get(lowerName);
			
			if (currentLoc) {
				const baseName = path.basename(fileName);
				const destPath = path.join(destDir, baseName);
				
				// Skip if already there (normalized)
				if (currentLoc.toLowerCase() === destPath.toLowerCase()) {
					completed++;
					return;
				}

				// Calculate relative paths for tracking
				const oldRelative = path.relative(modsPath, currentLoc).replace(/\\/g, '/');
				const newRelative = destinationFolder === '' ? baseName : `${destinationFolder}/${baseName}`;
				
				try {
					// Move the file using safeMove with retries
					await safeMove(currentLoc, destPath, { overwrite: true });
					
					// Queue database update
					cacheUpdates.push({ currentLoc, destPath, oldRelative, newRelative });
					completed++;
				} catch (e) {
					console.error(`[MOVE] Failed to move ${fileName}:`, e.message);
					errors.push({ file: fileName, error: e.message });
				}
			} else {
				errors.push({ file: fileName, error: 'Not found on disk (Verify file still exists)' });
			}
		}));

		// Progress broadcast after each chunk
		if (broadcastStatus) {
			broadcastStatus('move:progress', {
				current: Math.min(completed, total),
				total: total,
				percent: Math.round((completed / total) * 100)
			});
		}
	}

	// Apply batched cache updates
	if (cacheUpdates.length > 0) {
		debugLog(`[MOVE] Applying ${cacheUpdates.length} database updates...`);
		for (const update of cacheUpdates) {
			cache.setModLocation(update.currentLoc, update.destPath, update.oldRelative, update.newRelative);
		}
	}

	const finalResult = { 
		success: errors.length < total, 
		completed, 
		total, 
		errors,
		skipped: total - completed - errors.length
	};

	debugLog(`[MOVE] Finished. Completed: ${completed}, Errors: ${errors.length}, Total: ${total}`);

	// TRIGGER MIRROR SYNC (Async)
	syncMirrorLinks(modsPath).catch(err => console.error('[MIRROR] Auto-sync failed:', err));

	return finalResult;
}

async function findModPath(fileName) {
	const allPaths = getModsPaths();
	const lowerName = fileName.toLowerCase();

	for (const modsPath of allPaths) {
		// 1. Check root
		const rootPath = path.join(modsPath, fileName);
		if (fs.existsSync(rootPath)) {
			const stats = await fs.lstat(rootPath).catch(() => null);
			// Only return if it's a real file, NOT a symlink mirror
			if (stats && !stats.isSymbolicLink()) return rootPath;
		}
		
		// 2. Check all subdirectories (shallow scan)
		try {
			const entries = await fs.readdir(modsPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					const subPath = path.join(modsPath, entry.name, fileName);
					if (fs.existsSync(subPath)) {
						const stats = await fs.lstat(subPath).catch(() => null);
						if (stats && !stats.isSymbolicLink()) return subPath;
					}
				}
			}
		} catch (e) {}
	}
	return null;
}
/**
	* Helper to get PNG or DDS dimensions from binary buffer.
	* Returns { width, height } or null.
*/
function getImageDimensions(buffer) {
    if (!buffer || buffer.length < 32) return null;
    
    // Check PNG signature
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        const width = buffer.readInt32BE(16);
        const height = buffer.readInt32BE(20);
        return { width, height, type: 'png' };
	}
    
    // Check DDS signature
    if (buffer[0] === 0x44 && buffer[1] === 0x44 && buffer[2] === 0x53 && buffer[3] === 0x20) {
        const height = buffer.readInt32LE(12);
        const width = buffer.readInt32LE(16);
        const fourCC = buffer.toString('utf8', 84, 88);
        debugLog(`[DECODER] Decoding DDS: ${width}x${height}, format=${fourCC}`);
        // Header flags for DXT detection
        const pfFlags = buffer.readUInt32LE(80); // PixelFormat flags
        const pfFourCC = buffer.toString('utf8', 84, 88); // Direct DXT indicator
        let format = 'rgba';
        if (pfFlags & 0x4) { // DDPF_FOURCC
            if (pfFourCC === 'DXT1') format = 'dxt1';
            else if (pfFourCC === 'DXT3') format = 'dxt3'; // Limited support
            else if (pfFourCC === 'DXT5') format = 'dxt5';
		}
        return { width, height, type: 'dds', format };
	}
    
    return null;
}

/**
	* Minimal DXT1/DXT5 decoder to translate binary DDS data to raw RGBA.
*/
function decodeDDS(buffer, width, height, format) {
    const rgba = Buffer.alloc(width * height * 4);
    const dataOffset = 128; // Standard DDS header size
    let offset = dataOffset;
	
    const decode565 = (val) => {
        const r = (val >> 11) & 0x1F;
        const g = (val >> 5) & 0x3F;
        const b = val & 0x1F;
        return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
	};
	
    for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
            let colors = [];
            let alphaBlocks = null;
			
            if (format === 'dxt5') {
                alphaBlocks = buffer.slice(offset, offset + 8);
                offset += 8;
			}
			
            const c0 = buffer.readUInt16LE(offset);
            const c1 = buffer.readUInt16LE(offset + 2);
            const lookup = buffer.readUInt32LE(offset + 4);
            offset += 8; // CRITICAL FIX: color block is 8 bytes in total (2x16bit + 32bit)
			
            const rgb0 = decode565(c0);
            const rgb1 = decode565(c1);
            colors[0] = [...rgb0, 255];
            colors[1] = [...rgb1, 255];
            
            if (c0 > c1) {
                colors[2] = [
                    Math.floor((2 * colors[0][0] + colors[1][0] + 1) / 3),
                    Math.floor((2 * colors[0][1] + colors[1][1] + 1) / 3),
                    Math.floor((2 * colors[0][2] + colors[1][2] + 1) / 3),
                    255
				];
                colors[3] = [
                    Math.floor((colors[0][0] + 2 * colors[1][0] + 1) / 3),
                    Math.floor((colors[0][1] + 2 * colors[1][1] + 1) / 3),
                    Math.floor((colors[0][2] + 2 * colors[1][2] + 1) / 3),
                    255
				];
				} else {
                colors[2] = [
                    Math.floor((colors[0][0] + colors[1][0]) / 2),
                    Math.floor((colors[0][1] + colors[1][1]) / 2),
                    Math.floor((colors[0][2] + colors[1][2]) / 2),
                    255
				];
                colors[3] = [0, 0, 0, 0];
			}
			
            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < 4; i++) {
                    const idx = (lookup >> (2 * (j * 4 + i))) & 0x03;
                    let pixel = colors[idx];
                    
                    if (format === 'dxt5' && alphaBlocks) {
                        const a0 = alphaBlocks[0];
                        const a1 = alphaBlocks[1];
                        const aLookup = (BigInt(alphaBlocks.readUInt32LE(2)) | (BigInt(alphaBlocks.readUInt16LE(6)) << 32n));
                        const aIdx = Number((aLookup >> BigInt(3 * (j * 4 + i))) & 0x07n);
                        let alpha = 255;
                        if (aIdx === 0) alpha = a0;
                        else if (aIdx === 1) alpha = a1;
                        else if (a0 > a1) alpha = Math.floor(((8 - aIdx) * a0 + (aIdx - 1) * a1) / 7);
                        else if (aIdx === 6) alpha = 0;
                        else if (aIdx === 7) alpha = 255;
                        else alpha = Math.floor(((6 - aIdx) * a0 + (aIdx - 5) * a1) / 5);
                        pixel = [...pixel.slice(0, 3), alpha];
					}
					
                    const px = x + i;
                    const py = y + j; // Removed Y-flip to fix inverted mod icons
                    
                    if (px < width && py >= 0 && py < height) {
						const rgbaIdx = (py * width + px) * 4;
						rgba[rgbaIdx]     = pixel[2]; // Blue (Standard raw windows bitmap choice)
						rgba[rgbaIdx + 1] = pixel[1]; // Green
						rgba[rgbaIdx + 2] = pixel[0]; // Red
						rgba[rgbaIdx + 3] = pixel[3]; // Alpha
					}

				}
			}
		}
	}
    return rgba;
}

async function getModIcon(filePath, iconFile, modDesc = null, zipInstance = null, prioritizeStore = false) {
	try {
		// ... (DLC logic stays same)
		if (filePath && !fs.existsSync(filePath) && filePath.startsWith('pdlc_')) {
			const { path: gamePath } = await gameLauncher.detectGamePath();
			if (gamePath) {
				const gameDir = path.dirname(gamePath);
				const pdlcPath = path.join(gameDir, 'pdlc', filePath + '.zip');
				if (fs.existsSync(pdlcPath)) {
					filePath = pdlcPath;
				} else {
					const x64Pdlc = path.join(gameDir, '..', 'pdlc', filePath + '.zip');
					if (fs.existsSync(x64Pdlc)) filePath = x64Pdlc;
				}
			}
		}

		if (!filePath || !fs.existsSync(filePath)) return 'CATEGORY:generic';

		const normalizedIcon = iconFile ? iconFile.replace(/\\/g, '/') : null;
		
		const getCategoryFallback = (entries = null) => {
			if (modDesc?.isMap) return 'CATEGORY:map';
			let hintSource = (modDesc?.title || filePath).toLowerCase();
			if (entries) {
				const ddsEntry = entries.find(e => {
					const lower = e.entryName.toLowerCase();
					return lower.endsWith('_icon.dds') || (lower.startsWith('icon_') && lower.endsWith('.dds'));
				});
				if (ddsEntry) hintSource += ' ' + path.basename(ddsEntry.entryName).toLowerCase();
			}
			if (hintSource.includes('tractor') || hintSource.includes('vehicle') || hintSource.includes('truck') || hintSource.includes('car') || hintSource.includes('harvester') || hintSource.includes('combine') || hintSource.includes('series') || hintSource.includes('deutz') || hintSource.includes('johndeere') || hintSource.includes('fendt')) return 'CATEGORY:vehicle';
			if (hintSource.includes('trailer') || hintSource.includes('implement') || hintSource.includes('plow') || hintSource.includes('plough') || hintSource.includes('mower') || hintSource.includes('header') || hintSource.includes('tank')) return 'CATEGORY:tool';
			if (hintSource.includes('pack')) return 'CATEGORY:pack';
			if (hintSource.includes('map') || hintSource.includes('village') || hintSource.includes('farm')) return 'CATEGORY:map';
			return 'CATEGORY:generic';
		};

		if (filePath.endsWith('.zip')) {
			const zip = zipInstance || new AdmZip(filePath);
			const entries = zip.getEntries();
			let entry = null;

			// 0. Store Priority (if enabled)
			if (prioritizeStore) {
				entry = entries.find(e => {
					const n = e.entryName.toLowerCase();
					// Root-level store_*.dds or store_*.png (User's specific pattern)
					return (n.startsWith('store_') && (n.endsWith('.dds') || n.endsWith('.png'))) && !n.includes('/');
				}) || entries.find(e => {
					const n = e.entryName.toLowerCase();
					// Standard fallbacks
					return n === 'store.png' || n === 'store.dds' || n === 'shop.png' || n === 'shop.dds';
				});
			}

			// 0.5 Icon Priority (if not store)
			if (!entry && !prioritizeStore) {
				entry = entries.find(e => {
					const n = e.entryName.toLowerCase();
					// Root-level icon_*.dds or icon_*.png (User's specific pattern)
					return (n.startsWith('icon_') && (n.endsWith('.dds') || n.endsWith('.png'))) && !n.includes('/');
				});
			}
			
			// 1. Primary: Search for exact filename (if not store priority or store not found)
			if (!entry && normalizedIcon) {
				entry = entries.find(e => e.entryName.toLowerCase() === normalizedIcon.toLowerCase());
			}
			
			// 2. Secondary: Search for basename match (ignoring extension) or matching basename anywhere
			if (!entry && normalizedIcon) {
				const iconBaseWithExt = path.basename(normalizedIcon).toLowerCase();
				const iconBaseNoExt = iconBaseWithExt.split('.')[0];
				
				// Try case-insensitive basename match with different extension
				entry = entries.find(e => {
					const name = path.basename(e.entryName).toLowerCase();
					return name === iconBaseWithExt || name === iconBaseNoExt + '.dds' || name === iconBaseNoExt + '.png' || name === iconBaseNoExt + '.jpg';
				});
				
				if (!entry) {
					// Deep search for the same basename
					entry = entries.find(e => e.entryName.toLowerCase().endsWith('/' + iconBaseWithExt) || e.entryName.toLowerCase().endsWith('/' + iconBaseNoExt + '.dds'));
				}
			}
			
			// 3. Last Resort: Search for common icon filenames
			if (!entry) {
				entry = entries.find(e => {
					const name = e.entryName.toLowerCase();
					return (
						name === 'modicon.png' || 
						name === 'icon.png' || 
						name === 'mod_icon.png' ||
						name === 'icon.jpg' ||
						name === 'store.png' ||
						name === 'store.dds' ||
						name === 'mod_store.png' ||
						name === 'mod_store.dds' ||
						name.endsWith('/modicon.png') ||
						name.endsWith('/icon.png') ||
						name.endsWith('/mod_icon.png') ||
						name.endsWith('/icon.jpg') ||
						name.endsWith('/store.png') ||
						name.endsWith('/store.dds')
					);
				});
			}
			
			// 4. MAP-SPECIFIC AGGRESSIVE SEARCH (Prioritize overview/preview for maps)
			if (!entry && modDesc?.isMap) {
				const mapCandidates = entries.filter(e => {
					const name = e.entryName.toLowerCase();
					const isImg = (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.dds'));
					const isOverview = name.includes('overview') || name.includes('preview') || name.includes('map') || name.includes('mapalt') || name.includes('loading');
					// Deep search for maps: Increase to 5 levels deep as large maps often bury overview images
					const depth = (name.match(/\//g) || []).length;
					return isImg && isOverview && depth <= 5 && !name.includes('textures');
				});
				if (mapCandidates.length > 0) {
					// Priority order: PNG/JPG over DDS, root/shallow over deep
					mapCandidates.sort((a, b) => {
						const aDDS = a.entryName.toLowerCase().endsWith('.dds') ? 1 : 0;
						const bDDS = b.entryName.toLowerCase().endsWith('.dds') ? 1 : 0;
						if (aDDS !== bDDS) return aDDS - bDDS;
						return (a.entryName.match(/\//g) || []).length - (b.entryName.match(/\//g) || []).length;
					});
					entry = mapCandidates[0];
				}
			}


			// 5. GENERAL AGGRESSIVE SEARCH & RESOLUTION CHECK
			if (!entry) {
				const candidates = entries.filter(e => {
					const name = e.entryName.toLowerCase();
					const isImg = (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.dds'));
					// Only root or one-level deep
					const depth = (name.match(/\//g) || []).length;
					return isImg && depth <= 1 && !name.includes('textures');
				});
				
				if (candidates.length > 0) {
					// Priority 1: Check for 512x512 resolution (User's specific request)
					let bestMatch = null;
					for (const cand of candidates) {
						try {
							const buffer = cand.getData();
							const dims = getImageDimensions(buffer);
							if (dims && dims.width === 512 && dims.height === 512) {
								bestMatch = cand;
								break;
							}
						} catch (e) {}
					}
					
					if (bestMatch) {
						entry = bestMatch;
						} else {
						// Fallback to "store" or "brand" names, then first candidate
						entry = candidates.find(e => e.entryName.toLowerCase().includes('store') || e.entryName.toLowerCase().includes('brand') || e.entryName.toLowerCase().includes('logo')) 
						|| candidates[0];
					}
				}
			}
			
			if (entry) {
				const buffer = entry.getData();
				const info = getImageDimensions(buffer);
				if (info && info.type === 'dds' && (info.format === 'dxt1' || info.format === 'dxt5')) {
					try {
						// DECODE DDS AND CONVERT TO PNG Base64
						const { nativeImage } = require('electron');
						const rgba = decodeDDS(buffer, info.width, info.height, info.format);
						let img = nativeImage.createFromBitmap(rgba, { width: info.width, height: info.height });
						
						// ── AGGRESSIVE DOWNSCALING ──
						// Map previews can be 2048x2048, which creates massive base64 strings.
						// We resize to 512x512 max to keep the IPC payload and cache light.
						const size = img.getSize();
						if (size.width > 512 || size.height > 512) {
							img = img.resize({ width: 512, height: 512, quality: 'good' });
						}
						
						return img.toDataURL();
						} catch (e) {
						console.error('[DDS] Render failed:', e);
					}
				}
				
				const ext = path.extname(entry.entryName).replace('.', '').toLowerCase() || 'png';
				if (ext === 'dds') return getCategoryFallback(entries); 
				// Don't return tiny images (likely textures) unless it's the named icon
				if (buffer.length < 5000 && !entry.entryName.toLowerCase().includes('icon')) return getCategoryFallback(entries);
				
				try {
					const { nativeImage } = require('electron');
					let img = nativeImage.createFromBuffer(buffer);
					const size = img.getSize();
					if (size.width > 512 || size.height > 512) {
						img = img.resize({ width: 512, height: 512, quality: 'good' });
					}
					return img.toDataURL();
				} catch (e) {
					return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`;
				}
			}
		} else {
			// It's a directory
			let fullIconPath = null;
			const dirFiles = fs.readdirSync(filePath);
			const lowerFiles = dirFiles.map(f => f.toLowerCase());

			// 0. Store Priority (Directories)
			if (prioritizeStore) {
				const storeMatch = dirFiles.find(f => {
					const low = f.toLowerCase();
					return (low.startsWith('store_') && (low.endsWith('.dds') || low.endsWith('.png'))) || low === 'store.png' || low === 'store.dds' || low === 'shop.png' || low === 'shop.dds';
				});
				if (storeMatch) fullIconPath = path.join(filePath, storeMatch);
			}

			// 0.5 Icon Priority (Directories)
			if (!fullIconPath && !prioritizeStore) {
				const iconMatch = dirFiles.find(f => {
					const low = f.toLowerCase();
					return (low.startsWith('icon_') && (low.endsWith('.dds') || low.endsWith('.png')));
				});
				if (iconMatch) fullIconPath = path.join(filePath, iconMatch);
			}
			
			// 1. Primary: Search for exact filename (modDesc)
			if (!fullIconPath && normalizedIcon) {
				const match = dirFiles.find(f => f.toLowerCase() === normalizedIcon.toLowerCase());
				if (match) fullIconPath = path.join(filePath, match);
				else {
					// Check if normalizedIcon includes a subpath
					const candidatePath = path.join(filePath, normalizedIcon);
					if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
						fullIconPath = candidatePath;
					}
				}
			}

			// 2. Secondary: If still not found, try common names at root
			if (!fullIconPath) {
				const commonMatch = dirFiles.find(f => {
					const low = f.toLowerCase();
					return low === 'modicon.png' || low === 'icon.png' || low === 'mod_icon.png' || low === 'icon.jpg' || low === 'store.png' || low === 'store.dds';
				});
				if (commonMatch) fullIconPath = path.join(filePath, commonMatch);
			}
			
			if (!fullIconPath || !fs.existsSync(fullIconPath)) {
				// Fallback: search root for common icons
				try {
					const files = fs.readdirSync(filePath);
					const match = files.find(f => {
						const low = f.toLowerCase();
						return (
							low === 'modicon.png' || 
							low === 'icon.png' || 
							low === 'mod_icon.png' || 
							low === 'icon.jpg' ||
							low === 'store.png' ||
							low === 'store.dds'
						);
					});
					if (match) fullIconPath = path.join(filePath, match);
				} catch (e) {}
			}
			
			// 4. MAP-SPECIFIC AGGRESSIVE SEARCH (Directories)
			if ((!fullIconPath || !fs.existsSync(fullIconPath)) && modDesc?.isMap) {
				try {
					// Deep recursive search for directories too
					const recursiveFiles = [];
					const getFiles = (dir, depth = 0) => {
						if (depth > 3) return;
						const entries = fs.readdirSync(dir, { withFileTypes: true });
						for (const e of entries) {
							const res = path.resolve(dir, e.name);
							if (e.isDirectory()) getFiles(res, depth + 1);
							else recursiveFiles.push(res);
						}
					};
					getFiles(filePath);

					const candidates = recursiveFiles.filter(f => {
						const name = f.toLowerCase();
						const isImg = (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.dds'));
						const isOverview = name.includes('overview') || name.includes('preview') || name.includes('map') || name.includes('mapalt');
						return isImg && isOverview && !name.includes('textures');
					});
					
					if (candidates.length > 0) {
						candidates.sort((a, b) => {
							const aDDS = a.toLowerCase().endsWith('.dds') ? 1 : 0;
							const bDDS = b.toLowerCase().endsWith('.dds') ? 1 : 0;
							return aDDS - bDDS;
						});
						fullIconPath = candidates[0];
					}
				} catch (e) {}
			}

			// 5. GENERAL AGGRESSIVE SEARCH for directory with resolution check
			if (!fullIconPath || !fs.existsSync(fullIconPath)) {
				try {
					const rootFiles = fs.readdirSync(filePath).map(f => path.join(filePath, f));
					const candidates = rootFiles.filter(f => {
						const name = f.toLowerCase();
						return (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.dds')) && !name.includes('textures');
					});
					
					if (candidates.length > 0) {
						// Priority 1: Check for 512x512 resolution
						let bestMatch = null;
						for (const cand of candidates) {
							try {
								const buffer = fs.readFileSync(cand);
								const dims = getImageDimensions(buffer);
								if (dims && dims.width === 512 && dims.height === 512) {
									bestMatch = cand;
									break;
								}
							} catch (e) {}
						}
						
						if (bestMatch) {
							fullIconPath = bestMatch;
							} else {
							fullIconPath = candidates.find(f => f.toLowerCase().includes('store') || f.toLowerCase().includes('brand') || f.toLowerCase().includes('logo')) 
							|| candidates[0];
						}
					}
				} catch (e) {}
			}
			
			if (fullIconPath && fs.existsSync(fullIconPath)) {
				const stats = fs.statSync(fullIconPath);
				if (stats.isFile()) {
					const buffer = fs.readFileSync(fullIconPath);
					const info = getImageDimensions(buffer);
					
					if (info && info.type === 'dds' && (info.format === 'dxt1' || info.format === 'dxt5')) {
						try {
							const { nativeImage } = require('electron');
							const rgba = decodeDDS(buffer, info.width, info.height, info.format);
							let img = nativeImage.createFromBitmap(rgba, { width: info.width, height: info.height });
							
							const size = img.getSize();
							if (size.width > 512 || size.height > 512) {
								img = img.resize({ width: 512, height: 512, quality: 'good' });
							}
							
							return img.toDataURL();
						} catch (e) {}
					}
					
					const ext = path.extname(fullIconPath).replace('.', '').toLowerCase() || 'png';
					if (ext === 'dds') {
						// If we couldn't decode it above, and it's not a zip, we can try to fall back to the modDesc icon
						// if it's different from the one we just tried.
						if (normalizedIcon && !fullIconPath.toLowerCase().endsWith(normalizedIcon.toLowerCase())) {
							const secondChance = path.join(filePath, normalizedIcon);
							if (fs.existsSync(secondChance)) {
								fullIconPath = secondChance;
								// We continue the loop/logic to process this secondChance
								const secondBuffer = fs.readFileSync(fullIconPath);
								const secondExt = path.extname(fullIconPath).replace('.', '').toLowerCase();
								try {
									const { nativeImage } = require('electron');
									let img = nativeImage.createFromBuffer(secondBuffer);
									return img.toDataURL();
								} catch (e) {}
							}
						}
						return getCategoryFallback(hints);
					}
					
					try {
						const { nativeImage } = require('electron');
						let img = nativeImage.createFromBuffer(buffer);
						const size = img.getSize();
						if (size.width > 512 || size.height > 512) {
							img = img.resize({ width: 512, height: 512, quality: 'good' });
						}
						return img.toDataURL();
					} catch (e) {
						return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`;
					}
				}
			}
			// For unzipped folders, provide hints to getCategoryFallback
			let hints = null;
			try {
				const files = fs.readdirSync(filePath);
				hints = files.map(f => ({ entryName: f }));
			} catch (e) {}
			
			return getCategoryFallback(hints);
		}
	} catch (err) {
		console.error('Failed to get mod icon:', err);
	}
	return 'CATEGORY:generic';
}

/**
	* Calculate MD5 hash of a file for the GIANTS engine 'fileHash' field.
*/
async function calculateFileHash(filePath) {
	return new Promise((resolve) => {
		try {
			const hash = crypto.createHash('md5');
			const input = fs.createReadStream(filePath);
			input.on('data', (chunk) => {
				hash.update(chunk);
			});
			input.on('end', () => {
				resolve(hash.digest('hex'));
			});
			input.on('error', (err) => {
				console.error('Hashing failed:', err);
				resolve('');
			});
			} catch (e) {
			console.error('Hashing throw:', e);
			resolve('');
		}
	});
}

/**
	* Install local mods (from drag and drop)
*/
async function installLocalMods(filePaths) {
	const modsPath = getModsPath();
	const results = {
		success: [],
		failed: [],
		total: 0
	};
	
	if (!fs.existsSync(modsPath)) {
		await fs.ensureDir(modsPath);
	}
	
	// Queue items with a depth tracking
	const queue = filePaths.map(p => ({ path: p, depth: 0 }));
	
	while(queue.length > 0) {
		const current = queue.shift();
		const filePath = current.path;
		const depth = current.depth;

		try {
			const fileName = path.basename(filePath);
			const ext = path.extname(filePath).toLowerCase();
			
			let isDirectory = false;
			try {
				isDirectory = fs.statSync(filePath).isDirectory();
			} catch (e) {}

			if (!isDirectory && ext !== '.zip') {
				if (depth === 0) results.failed.push({ path: filePath, error: 'Not a ZIP file or Mod Folder' });
				continue;
			}

			if (isDirectory) {
				const modDescPath = path.join(filePath, 'modDesc.xml');
				if (!fs.existsSync(modDescPath)) {
					// It's a folder, but not a mod folder itself. Treat as a container.
					if (depth > 2) {
						if (depth === 0) results.failed.push({ path: filePath, error: 'Container folder depth too high' });
						continue;
					}
					try {
						const children = fs.readdirSync(filePath).map(c => ({ 
							path: path.join(filePath, c), 
							depth: depth + 1 
						}));
						queue.push(...children);
					} catch(err) {
						if (depth === 0) results.failed.push({ path: filePath, error: 'Failed to read container folder: ' + err.message });
					}
					continue; // Do not copy the container itself
				}
			}
			
			results.total++;
			const destPath = path.join(modsPath, fileName);
			
			// If file exists, we could check version, but for now we just copy it over
			await fs.copy(filePath, destPath);
			
			// Try to get some metadata for the toast
			let title = fileName;
			try {
				const meta = parseModDesc(destPath);
				if (meta && meta.title) title = meta.title;
			} catch (e) {}
			
			results.success.push({ path: filePath, title });
		} catch (err) {
			console.error(`Failed to install local mod ${filePath}:`, err);
			results.failed.push({ path: filePath, error: err.message });
		}
	}
	
	return results;
}

/**
 * Restore a mod to its previous version (.bak)
 */
async function restoreModVersion(filePath) {
	const bakPath = filePath + '.bak';
	if (!fs.existsSync(bakPath)) return { success: false, error: 'No previous version found' };

	try {
		// Swap current with backup
		const tempPath = filePath + '.tmp';
		if (fs.existsSync(filePath)) fs.renameSync(filePath, tempPath);
		fs.renameSync(bakPath, filePath);
		if (fs.existsSync(tempPath)) fs.renameSync(tempPath, bakPath);
		
		return { success: true };
	} catch (err) {
		return { success: false, error: err.message };
	}
}

/**
 * Batch install mods from a list of IDs.
 * Used for Multiplayer Mod Cluster imports.
 */
async function batchInstallMods(modList, onProgress) {
  const results = { success: [], failed: [] };
  let completed = 0;
  
  console.log(`[BATCH] Starting batch install for ${modList.length} mods.`);
  
  // 1. Pre-register all in the UI as 'queued'
  for (const mod of modList) {
    broadcastStatus?.(mod.modId, 'queued');
  }

  // 2. Queue them sequentially to the background worker
  for (const mod of modList) {
    try {
      const result = await installMod(mod.modId, mod.modTitle, mod.downloadUrl || null, (prog) => {
        onProgress?.({
          currentMod: mod.modTitle,
          currentIndex: completed + 1,
          total: modList.length,
          ...prog
        });
      }, mod.category, mod.subFolder);
      results.success.push(result);
    } catch (err) {
      console.error(`[BATCH] Failed to queue ${mod.modTitle}:`, err.message);
      results.failed.push({ modTitle: mod.modTitle, error: err.message });
      broadcastStatus?.(mod.modId, 'error');
    }
    completed++;
  }
  
  return results;
}



async function createFolder(folderName) {
	const modsPath = getModsPath();
	const folderPath = path.join(modsPath, folderName);
	if (!fs.existsSync(folderPath)) {
		await fs.mkdirp(folderPath);
	}
	return { success: true };
}

/**
 * Automate the search and installation of missing dependencies from ModHub.
 * @param {Array} modNames - Names of mods to search and install.
 * @param {Function} onProgress - Callback for download progress.
 * @param {String} subFolder - Optional subfolder for installation.
 * @param {String} parentId - Optional ID of the mod that triggered this batch.
 */
async function autoInstallDependencies(mods, onProgress, subFolder = null, parentId = null) {
	if (parentId) {
		activeBatchTasks.add(parentId);
	}

	// ── ROBUST FOLDER RESOLUTION ──
	// If subFolder is missing but parentId is provided, resolve the parent's current folder
	if (!subFolder && parentId) {
		// 1. Check if the parent is CURRENTLY being installed
		const activeTask = activeInstalls.get(parentId);
		if (activeTask && activeTask.subFolder) {
			subFolder = activeTask.subFolder;
			console.log(`[AUTO-INSTALL] Resolved subfolder "${subFolder}" from active parent install ${parentId}`);
		} else {
			// 2. Check if the parent is already in the database
			const parentMod = cache.getModHubMetadataPool()[parentId];
			if (parentMod && parentMod.folder) {
				subFolder = parentMod.folder;
				console.log(`[AUTO-INSTALL] Resolved subfolder "${subFolder}" from cached parent mod ${parentId}`);
			}
		}
	}

	const results = {
		total: mods.length,
		installed: 0,
		failed: []
	};

	console.log(`[AUTO-INSTALL] Starting batch install for ${mods.length} mods:`, mods);

	// Fetch pool of currently installed mods to check for duplicates
	const localPool = cache.getModHubMetadataPool();

	for (const modObj of mods) {
		// CHECK FOR CANCELLATION
		if (parentId && !activeBatchTasks.has(parentId)) {
			console.log(`[AUTO-INSTALL] Batch ${parentId} was cancelled. Aborting loop.`);
			break;
		}

		const modName = modObj.title;
		const modUrl = modObj.url;
		
		try {
			let modId = null;
			let downloadUrl = null;
			let modTitle = modName;

			// 0. Resolve ID from URL if possible (High reliability)
			if (modUrl) {
				const idMatch = modUrl.match(/mod_id=(\d+)/) || modUrl.match(/storage\/(\d+)\//);
				if (idMatch) modId = idMatch[1];
			}

			// 0.5 REGISTRY CHECK: Is this mod currently being installed or in queue?
			// This prevents race conditions in batch installs.
			const isCurrentlyInstalling = (modId && activeInstalls.has(modId)) || 
										 downloadQueue.some(q => (modId && q.modId === modId) || ultraNormalize(q.modTitle) === ultraNormalize(modName));
			
			if (isCurrentlyInstalling) {
				console.log(`[AUTO-INSTALL] Skipping ${modName} - Already in download queue/active installs.`);
				continue;
			}

			// 1. SMART CHECK: Is this mod already installed anywhere?
			// Refresh local pool for every mod to handle ones that finished during the loop
			const currentLocalPool = cache.getModHubMetadataPool();
			let alreadyInstalled = false;
			let localMod = null;

			if (modId && currentLocalPool[modId]) {
				localMod = currentLocalPool[modId];
				alreadyInstalled = true;
			} else {
				// Aggressive Title-based search in local pool
				const normName = ultraNormalize(modName);
				localMod = Object.values(currentLocalPool).find(m => {
					const localTitle = ultraNormalize(m.title || m.modhubTitle || '');
					const localName = ultraNormalize(m.modName || '');
					return normName && (normName === localTitle || normName === localName);
				});
				if (localMod) alreadyInstalled = true;
			}

			// 1.5 VERIFY FILE EXISTS (Safety check against stale tracking)
			if (alreadyInstalled && localMod) {
				let filePath = localMod.filePath;
				if (!filePath && localMod.fileName) {
					filePath = path.join(getModsPath(), localMod.fileName);
				}
				
				if (filePath && !nodeFs.existsSync(filePath)) {
					console.warn(`[AUTO-INSTALL] SmartCheck hit stale entry for ${modName}. File missing at ${filePath}. Proceeding with fresh download.`);
					alreadyInstalled = false;
					// Cleanup stale tracking while we are here
					if (modId) cache.removeModTracking(modId);
					if (localMod.fileName) cache.removeModTrackingByFile(localMod.fileName);
				}
			}

			// Version Contingency: If we have a required version, check if local meets it
			if (alreadyInstalled && localMod && modObj.version) {
				const vComp = compareVersions(localMod.version, modObj.version);
				if (vComp < 0) {
					console.log(`[AUTO-INSTALL] Version mismatch for ${modName}: Local ${localMod.version} < Required ${modObj.version}. Triggering upgrade.`);
					alreadyInstalled = false; // Force re-download/update
				} else {
					console.log(`[AUTO-INSTALL] VersCheck: ${modName} ${localMod.version} >= ${modObj.version}. OK.`);
				}
			}

			if (alreadyInstalled) {
				// If it's already installed but NOT in the requested subfolder, move it there
				// This respects the user's desire for folder isolation even for existing mods.
				if (subFolder && localMod && localMod.folder !== subFolder) {
					console.log(`[AUTO-INSTALL] Moving existing mod ${modName} from "${localMod.folder || 'MAIN'}" to "${subFolder}"`);
					try {
						await moveModsToFolder([localMod.fileName], subFolder, localMod.folder);
					} catch (moveErr) {
						console.warn(`[AUTO-INSTALL] Failed to move ${modName} to subfolder:`, moveErr.message);
					}
				}

				results.installed++;
				console.log(`[AUTO-INSTALL] Mod ${modName} is already available.`);
				onProgress?.({ type: 'STATUS', modId: modId || 'Local', modName, status: 'success', title: modName, parentId });
				continue; // Skip download
			}


			// 2. Proceed with Download Logic if NOT installed
			if (modUrl && modUrl.toLowerCase().includes('modhub/storage/')) {
				// Detect ModHub ID even from CDN Storage links (Absolute ID Extraction)
				const idMatch = modUrl.match(/storage\/(\d+)\//i);
				if (idMatch && idMatch[1]) {
					modId = idMatch[1].replace(/^0+/, ''); // Strip leading zeros
					console.log(`[AUTO-INSTALL] Extracted ModHub ID ${modId} from CDN link: ${modUrl}`);
				}
				
				if (modUrl.toLowerCase().endsWith('.zip')) {
					downloadUrl = modUrl;
					modId = modId || Buffer.from(modUrl).toString('hex').slice(-10);
					console.log(`[AUTO-INSTALL] Using direct ZIP link for ${modName}: ${downloadUrl}`);
				}
			}

			// 3. Fallback to Search if no ID found or if we only had a title
			if (!modId) {
				const searchQueries = [
					modName, // 1. Original
					modName.replace(/^(fs\d{2}_?|dlc_|pdlc_|mod_|fendt_|jcb_|caseih_|newholland_|massey_)/i, ''), // 2. Prefix-less
					modName.replace(/\[[^\]]*\]/g, '').trim(), // 3. Tag-less
					modName.split(/[\(\[\-]/)[0].trim() // 4. Deep Clean (Name only, no versions/info)
				];
				
				// Unique queries only
				const uniqueQueries = [...new Set(searchQueries)].filter(q => q && q.length > 2);

				for (const query of uniqueQueries) {
					console.log(`[AUTO-INSTALL] Searching ModHub for "${query}" (Attempt ${uniqueQueries.indexOf(query) + 1}/${uniqueQueries.length})...`);
					onProgress?.({ type: 'STATUS', modName, status: 'SEARCHING', parentId });
					
					await new Promise(r => setTimeout(r, 600)); // Rate limit safety
					
					// Try FS25 strictly (Absolute FS25 requirement)
					let search = await scraper.searchMods(query, 0, 'fs2025');


					let bestMatch = null;

					if (search.mods && search.mods.length > 0) {
						const normTarget = ultraNormalize(query);
						const normModName = ultraNormalize(modName);
						
						// Strategy A: Exact title match or normalized match to modName
						bestMatch = search.mods.find(m => {
							const mTitle = m.title.toLowerCase();
							const mNorm = ultraNormalize(m.title);
							return mTitle === modName.toLowerCase() || mNorm === normModName || mNorm === normTarget;
						});

						// Strategy B: Lenient Fuzzy overlap if normalization is close
						if (!bestMatch) {
							bestMatch = search.mods.find(m => {
								const mNorm = ultraNormalize(m.title);
								
								// Check for containment in either direction
								const isOverlap = normTarget.length > 3 && (mNorm.includes(normTarget) || normTarget.includes(mNorm));
								
								// Check for word-by-word similarity
								const targetWords = query.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 2);
								const resultWords = m.title.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 2);
								const matchingWords = targetWords.filter(tw => resultWords.some(rw => rw.includes(tw) || tw.includes(rw)));
								const isSimilar = targetWords.length > 0 && (matchingWords.length / targetWords.length) > 0.7;

								return isOverlap || isSimilar;
							});
						}
					}

					if (bestMatch) {
						modId = bestMatch.modId;
						modTitle = bestMatch.title;
						console.log(`[AUTO-INSTALL] Found match via search: "${modTitle}" (ID: ${modId})`);
						break; // Found it!
					}
				}
			}

			if (modId) {
				// 4. Fetch Detail if we don't have direct download link yet
				let category = 'Unknown';
				if (!downloadUrl) {
					const detail = await scraper.fetchModDetail(modId);
					modTitle = detail?.title || modTitle;
					downloadUrl = detail?.downloadUrl;
					category = (detail?.category || 'Unknown').toUpperCase();
				}

				// 5. Trigger Install
				onProgress?.({ type: 'STATUS', modId, modName, status: 'DOWNLOADING', title: modTitle, parentId });
				
				const installResult = await installMod(
					modId,
					modTitle,
					downloadUrl, 
					(p) => {
					    onProgress?.({ 
                            type: p.status ? 'STATUS' : 'PROGRESS', 
                            modId, 
                            modName, 
                            parentId, 
                            ...p 
                        });
				    },
					category,
					subFolder || modObj.subFolder // Inherit from parent if this is a dependency call
				);

				if (installResult.success) {
					results.installed++;
					console.log(`[AUTO-INSTALL] Successfully installed ${modName}`);
				} else {
					throw new Error(installResult.error || 'Install failed');
				}
			} else {
				console.warn(`[AUTO-INSTALL] Could not find ${modName} on ModHub`);
				results.failed.push({ modName, reason: 'NOT_FOUND_ON_MODHUB' });
				// Explicitly notify UI of failure so it doesn't hang in SEARCHING
				onProgress?.({ type: 'STATUS', modName, status: 'NOT_FOUND_ON_MODHUB', parentId });
			}
		} catch (err) {
			console.error(`[AUTO-INSTALL] Failed for ${modName}:`, err.message);
			results.failed.push({ modName, reason: err.message });
			onProgress?.({ type: 'STATUS', modName, status: 'error', parentId });
		}

		// Sequential delay
		await new Promise(r => setTimeout(r, 1000));
	}

	if (parentId) {
		activeBatchTasks.delete(parentId);
	}

	return results;
}



async function renameFolder(oldName, newName) {
	const allPaths = getModsPaths();
	let oldPath = null;
	let newPath = null;
	
	// Find which root contains this folder
	for (const p of allPaths) {
		const target = path.join(p, oldName);
		if (fs.existsSync(target)) {
			oldPath = target;
			newPath = path.join(p, newName);
			break;
		}
	}

	if (!oldPath) {
		debugLog(`[RENAME] Source folder "${oldName}" not found in any mod location.`);
		throw new Error('Folder not found');
	}
	if (fs.existsSync(newPath)) throw new Error('Destination folder already exists');
	
	debugLog(`[RENAME] Moving folder: ${oldPath} -> ${newPath}`);
	
	try {
		await fs.rename(oldPath, newPath);
		
		// SYNC DATABASE for all mods inside
		try {
			const files = await fs.readdir(newPath);
			for (const fileName of files) {
				const oldFileFull = path.join(oldPath, fileName);
				const newFileFull = path.join(newPath, fileName);
				const oldRelative = `${oldName}/${fileName}`;
				const newRelative = `${newName}/${fileName}`;
				
				cache.updateLocalModCachePath(oldFileFull, newFileFull);
				cache.updateModTrackingFileInfo(oldRelative, newRelative);
			}
		} catch (e) {
			console.error('[DATABASE] Rename sync failed:', e);
		}
		
		return { success: true };
	} catch (err) {
		console.error(`[RENAME-FOLDER] Failed:`, err.message);
		throw new Error(`Failed to rename folder: ${err.message}`);
	}
}

async function deleteFolder(folderName) {
	// 0. Wait for active scan to finish (prevents file locks during deletion)
	if (activeScanPromise) {
		debugLog(`[DELETE] Waiting for active scan to complete before deleting "${folderName}"...`);
		await activeScanPromise.catch(() => {});
	}
	
	const allPaths = getModsPaths();
	let folderPath = null;
	
	// Search in all mod locations for the folder
	for (const p of allPaths) {
		const target = path.join(p, folderName);
		if (fs.existsSync(target)) {
			folderPath = target;
			break;
		}
	}
	
	if (!folderPath) {
		debugLog(`[DELETE] Folder "${folderName}" not found in any of: ${allPaths.join(', ')}`);
		throw new Error('Folder not found in any mod location');
	}

	// 1. Check if game is running (Windows lock protection)
	if (await gameLauncher.isGameRunning()) {
		throw new Error('Cannot delete: Farming Simulator 25 is currently running. Please close the game first.');
	}
	
	debugLog(`[DELETE] Permanently removing folder: ${folderPath}`);
	
	try {
		// 1.5 FIND ALL MODS IN FOLDER FOR TRACKING CLEANUP
		const files = await fs.promises.readdir(folderPath).catch(() => []);
		for (const file of files) {
			if (file.toLowerCase().endsWith('.zip')) {
				const trackerName = `${folderName}/${file}`;
				cache.removeModTrackingByFile(trackerName);
				cache.removeModTrackingByFile(file); 
				const fullFilePath = path.join(folderPath, file);
				cache.removeLocalModCache(fullFilePath);
			}
		}

		await safeRemove(folderPath);
		debugLog(`[DELETE] Success: "${folderName}" deleted.`);
		return { success: true };
	} catch (err) {
		console.error(`[DELETE-FOLDER] Failed to delete ${folderName}:`, err.message);
		throw new Error(`Failed to delete folder: ${err.message}`);
	}
}

/**
 * Prune old backup files (.bak) from the mods folder and subdirectories.
 * Uses the 'backupRetention' setting from the cache.
 */
async function pruneBackups() {
	const policy = cache.getSetting('backupRetention') || '1w';
	if (policy === 'forever') return;

	const modsPath = getModsPath();
	if (!modsPath || !fs.existsSync(modsPath)) return;

	try {
		const now = Date.now();
		let msThreshold = 0;
		
		if (policy === 'never') msThreshold = -1; // Specific flag to delete all
		else if (policy === '1w') msThreshold = 7 * 24 * 60 * 60 * 1000;
		else if (policy === '2w') msThreshold = 14 * 24 * 60 * 60 * 1000;
		else if (policy === '1m') msThreshold = 30 * 24 * 60 * 60 * 1000;

		let prunedCount = 0;

		// Local recursive scanner
		const walkAndPrune = async (dir) => {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (!entry.name.startsWith('.')) {
						await walkAndPrune(fullPath);
					}
				} else if (entry.isFile() && (entry.name.endsWith('.bak') || entry.name.endsWith('.backup'))) {
					try {
						const stats = await fs.stat(fullPath);
						if (msThreshold === -1 || (now - stats.mtimeMs > msThreshold)) {
							await fs.remove(fullPath);
							prunedCount++;
						}
					} catch (statErr) {
						// Skip files that might have been processed by another task
					}
				}
			}
		};

		await walkAndPrune(modsPath);
		
		if (prunedCount > 0) {
			console.log(`[CLEANUP] Pruned ${prunedCount} old mod backups (Policy: ${policy})`);
		}
	} catch (e) {
		console.error('[CLEANUP] Backup pruning failed:', e.message);
	}
}

/**
 * Ultra normalization for internal mod matching/deduplication.
 * Strips noise, author tags, and version strings.
 */
function ultraNormalize(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\[[^\]]*\]/g, '') // Strip [Tags]
        .replace(/\([^)]*\)/g, '') // Strip (By Author) or (v1.0)
        .replace(/^(?:fs\d{2}|dlc|pdlc|mod|fendt|jcb|caseih|newholland|massey|farming\s*simulator(?:\s*\d{2})?)(?:[\s_\.]+)/gi, '') // Common prefixes
        .replace(/[\s_\.]+(?:by\s+.*|author:.*|pack|package|dlc|mod|map|expansion|set|kit|collection|building|shed|v\d+.*)\s*$/gi, '') // Trailing noise
        .replace(/[^a-z0-9]/g, ''); // Squash everything else
}

// Auto-prune on startup removed to prevent launch hang.
// Now called inside scanLocalMods() for better safety.

function looksLikeMap(modDesc) {
    if (!modDesc || !modDesc.title) return false;
    const title = (modDesc.title || '').toLowerCase();
    const fileName = (modDesc.fileName || '').toLowerCase();
    
    // Negative keywords: things that suggest it's a placeable, production, or pack
    const negativeKeywords = ['pack', 'set', 'building', 'shed', 'tank', 'object', 'asset', 'prop', 'marker', 'hangar', 'storage', 'factory', 'production', 'station', 'barn', 'stable', 'silo', 'shop', 'market', 'scale', 'collection', 'prefab'];
    if (negativeKeywords.some(kw => title.includes(kw) || fileName.includes(kw))) return false;
    
    // Must contain map indicators or explicit mapId
    const hasMapIndicator = title.includes('map') || fileName.includes('map') || fileName.includes('valley') || fileName.includes('river') || fileName.includes('mountain') || fileName.includes('creek') || fileName.includes('countryside') || fileName.includes('terrain') || fileName.includes('wood') || fileName.includes('plain') || fileName.includes('island') || fileName.includes('coast') || fileName.includes('springs');
    return (modDesc.mapId && modDesc.mapId.length > 0) || hasMapIndicator;
}

/**
 * Clean mod titles by removing redundant information in brackets.
 * Handles cases like "Name (Name)" or "Mod (AssociatedMap)" for non-maps.
 */
function cleanModTitle(title, modName, fileName, isMap = false) {
    if (!title) return title;

    // Unescape XML entities
    let clean = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

    // First, flatten newlines and extra spaces
    clean = clean.replace(/[\r\n\t]+/g, ' ').replace(/\s\s+/g, ' ').trim();

    // Utility to normalize for comparison (removes non-word chars and underscores)
    const normalize = (s) => (s || '').toLowerCase().replace(/[\W_]+/g, '');

    // Loop to strip nested or multiple bracket patterns
    let changed = true;
    while (changed && clean.includes('(')) {
        changed = false;
        // Match the text and the last bracket pair: "Title (Descriptor)"
        const match = clean.match(/^(.+?)\s*\(([^)]+)\)$/s);
        if (match) {
            const outer = match[1].trim();
            const inner = match[2].trim();
            const lowerOuter = outer.toLowerCase();
            const lowerInner = inner.toLowerCase();
            
            const normOuter = normalize(outer);
            const normInner = normalize(inner);
            const lowerModName = (modName || '').toLowerCase();
            const lowerFileName = (fileName || '').toLowerCase();

            let shouldStrip = false;

            // 1. Redundant repetition or similarity
            // Catches "Geistal (Geistal)" and "Gülzow (G_Izow)"
            if (lowerOuter === lowerInner || normOuter === normInner || lowerInner === lowerModName || lowerFileName.includes(lowerInner)) {
                shouldStrip = true;
            }

            // 2. Strip Map-Associations from non-maps
            const locationTerms = ['valley', 'map', 'river', 'terrain', 'mountain', 'creek', 'forest', 'wood', 'plain', 'island', 'coast', 'springs', 'village', 'kolonia', 'farm', 'mountain'];
            if (!isMap && locationTerms.some(kw => lowerInner.includes(kw))) {
                shouldStrip = true;
            }

            // 3. Keep versioning OR descriptor for maps but strip generic marketing
            if (isMap) {
                const looksLikeMapName = locationTerms.some(kw => lowerInner.includes(kw));
                if (looksLikeMapName && !lowerOuter.includes('map') && !lowerOuter.includes('valley')) {
                    clean = inner; // Use the specific map name if outer is generic
                    changed = true;
                    continue;
                }
                // Strip redundant "MAP" or "V1.0" if outer is already descriptive
                const isGenericInfo = lowerInner.includes('map') || (lowerInner.startsWith('v') && lowerInner.match(/v\d/)) || lowerInner.includes('final') || lowerInner.includes('beta');
                if (isGenericInfo && lowerOuter.length > 3) {
                    shouldStrip = true;
                }
            } else {
                // For non-maps, strip generic descriptors or internal codes
                const isMetaDescriptor = lowerInner.length < 3 || lowerInner.includes('req') || lowerInner.includes('mod') || lowerInner.includes('dep') || lowerInner.includes('pack');
                if (isMetaDescriptor) shouldStrip = true;
            }

            if (shouldStrip) {
                clean = outer;
                changed = true;
            }
        }
    }

    return clean;
}

/**
 * Perform a deep scan of all local mods to ensure icons are extracted and cached.
 * This is useful for fixing missing or incorrectly extracted icons after updates.
 */
async function deepScanModIcons(onProgress) {
	try {
		const { mods } = await scanLocalMods();
		console.log(`[ICON SCAN] Deep scan starting for ${mods.length} mods...`);
		
		let processed = 0;
		for (const mod of mods) {
			try {
				// Re-extract icon focusing on quality and correct format
				const iconData = await getModIcon(mod.filePath, mod.iconFile, mod);
                
                // Ensure category is set for local maps if we detected it via icon/heuristic
                if (!mod.category && iconData === 'CATEGORY:map') {
                    mod.category = 'CATEGORY:map';
                }
				
				if (iconData && !iconData.startsWith('CATEGORY:')) {
					// Update cache specifically with the extracted icon data
					const stats = nodeFs.statSync(mod.filePath);
					cache.setLocalModCache(mod.filePath, stats.mtimeMs, stats.size, {
						...mod,
						iconData: iconData
					}, iconData, mod.fileHash);
				}
				
				processed++;
				if (onProgress) {
					onProgress({
						percent: Math.round((processed / mods.length) * 100),
						processed,
						total: mods.length,
						currentFile: mod.fileName
					});
				}
			} catch (err) {
				console.error(`[ICON SCAN] Failed for ${mod.fileName}:`, err.message);
			}
		}
		
		console.log(`[ICON SCAN] Deep scan completed. Processed ${processed} mods.`);
		return { success: true, count: processed };
	} catch (err) {
		console.error('[ICON SCAN] Deep scan failed:', err);
		throw err;
	}
}

/**
 * Background service to silently fix missing map dependencies.
 * Exported at bottom for use by other services.
 */
async function autoResolveMissingDependencies(mods) {
	// Use global ultraNormalize


	const maps = mods.filter(m => m.isMap);
	if (maps.length === 0) {
		return;
	}

	const allMissing = [];
	const mapToFolderMap = {};

	for (const map of maps) {
		if (!map.dependencies || map.dependencies.length === 0) continue;
		
		for (const dep of map.dependencies) {
			const depTitle = typeof dep === 'string' ? dep : dep.title;
			const depId = typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\d+)/)?.[1] || dep.url.match(/storage\/(\d+)\//)?.[1]) : null;
			const normalizedDep = ultraNormalize(depTitle);

			const found = mods.some(lm => {
				if (depId && lm.modId && String(lm.modId) === String(depId)) return true;
				const localUltraTitle = ultraNormalize(lm.title || '');
				const localUltraName = ultraNormalize(lm.modName || '');
				const localUltraFile = ultraNormalize(lm.fileName || '');
				return localUltraTitle === normalizedDep || localUltraName === normalizedDep || localUltraFile === normalizedDep;
			});

			if (!found) {
				const depObj = typeof dep === 'object' ? dep : { title: depTitle, url: null };
				const alreadyQueued = allMissing.some(d => d.title === depTitle);
				if (!alreadyQueued) {
					allMissing.push(depObj);
					mapToFolderMap[depTitle] = (map.folder || '');
				}
			}
		}
	}

	if (allMissing.length === 0) return;
	
	console.log(`[AUTO-RESOLVE] Found ${allMissing.length} missing dependencies. Starting background processing...`);
	
	for (const dep of allMissing) {
		const targetFolder = mapToFolderMap[dep.title];
		try {
			await autoInstallDependencies([dep], (progress) => {
				if (broadcastStatus) {
					broadcastStatus('dependency:progress', {
						...progress,
						isBackground: true,
						targetFolder
					});
				}
			}, targetFolder);
		} catch (err) {
			console.error(`[AUTO-RESOLVE] Failed: ${dep.title}`, err.message);
		}
	}
}

/**
 * Automatically resume any pending downloads found in the database.
 */
async function resumePendingDownloads(onProgress) {
	const pending = cache.getPendingDownloads();
	if (pending.length === 0) return { success: true, count: 0 };
	
	console.log(`[RESUME] Found ${pending.length} interrupted downloads. Resuming...`);
	
	const results = [];
	for (const item of pending) {
		try {
			const techData = item.tech_data ? JSON.parse(item.tech_data) : null;
			// We use installModInternal to handle the actual logic
			const promise = installModInternal(
				item.mod_id, 
				item.mod_title, 
				item.download_url, 
				(progress) => onProgress?.(item.mod_id, progress),
				item.category,
				item.target_dir.split(path.sep).pop(), // simplified subfolder extraction
				techData
			);
			results.push(promise);
		} catch (err) {
			console.error(`[RESUME] Failed to start resumption for ${item.mod_id}:`, err.message);
		}
	}
	
	return { success: true, count: results.length };
}

module.exports = {
	getModsPaths,
	getModsPath,
	getFS25DataRoot,
	getAllFS25DataRoots,
	scanLocalMods,
	installMod,
	enqueueInstall,
	cancelInstall,
	setBroadcastStatus,
	uninstallMod,
	syncLibraryMetadata,
	checkForUpdates,
	getModIcon,
	detectPath,
	debugProbePath,
	detectAllModsPaths,
	getPersonalFolderPath: pathProvider.getPersonalFolderPath,
	pruneBackups,
	createFolder,
	renameFolder,
	deleteFolder,
	moveModsToFolder,
	getDefaultModsPath,
	installLocalMods,
	restoreModVersion,
	batchInstallMods,
	deepScanModIcons,
	updateMod,
	autoInstallDependencies,
	looksLikeMap,
    getFolderSize,
	resumePendingDownloads,
	prepareVirtualModsFolder,
};
