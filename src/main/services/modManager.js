const path = require('path');
const fs = require('fs-extra');
const nodeFs = require('fs');
const zlib = require('zlib');
const AdmZip = require('adm-zip');
const { app, BrowserWindow, ipcMain, shell, session, dialog, net } = require('electron');
const https = require('https');

// 🛠️ DIAGNOSTIC UTILITY 🛠️
const logFile = (app && typeof app.getPath === 'function') 
    ? path.join(app.getPath('userData'), 'download_debug.log')
    : path.join(process.cwd(), 'download_debug.log');
function debugLog(msg) {
    const entry = `${new Date().toISOString()} - ${msg}\n`;
    try { nodeFs.appendFile(logFile, entry, 'utf8', () => {}); } catch (e) {}
}

const cache = require('./cache');
const scraper = require('./scraper');
const crypto = require('crypto');
const gameLauncher = require('./gameLauncher');
const pathProvider = require('./pathProvider');
const dependencyResolver = require('./dependencyResolver');

const activeInstalls = new Map();
const downloadQueue = [];
let activeCount = 0;
const MAX_CONCURRENT_INSTALLS = 1;
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
  'jcbFastrac4220.dlc': { 
    title: 'JCB Fastrac 4220 iCON', 
    author: 'GIANTS Software', 
    version: '1.0.0.0', 
    dlcId: 'fs25jcbwft',
    description: 'The JCB Fastrac 4220 iCON edition bonus tractor for Farming Simulator 25.',
    screenshots: [],
    techData: { hp: 235, price: 216500 }
  },
  'highlandsFishingPack.dlc': { 
    title: 'Highlands Fishing Expansion', 
    author: 'GIANTS Software', 
    version: '1.2.0.0', 
    dlcId: 'fs25highlandsfishing',
    description: 'Farming Simulator 25 gets the fun-kind of fishy with the Highlands Fishing expansion: Build a farm and man a fishing boat in the Scotland-inspired town of Kinlaig! Includes a new map, new crops, and highland cattle.',
    isMap: true,
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
	const isFile = (await fs.pathExists(src)) && (await fs.stat(src)).isFile();
	const tempDest = isFile ? `${dest}.tmp` : dest;

	for (let i = 0; i < retries; i++) {
		try {
			await fs.move(src, tempDest, options);
			if (isFile) {
				if (await fs.pathExists(dest)) await fs.remove(dest);
				await fs.rename(tempDest, dest);
			}
			return { success: true };
		} catch (err) {
			if (isFile && await fs.pathExists(tempDest)) {
				await fs.remove(tempDest).catch(() => {});
			}
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
 * Perform a safe, atomic copy to prevent creating corrupted/truncated files if the app is closed midway.
 * It copies to a .tmp extension first, then atomically renames to the destination.
 */
async function atomicCopyFile(src, dest) {
	const tempDest = `${dest}.tmp`;
	try {
		// Clean up any stale temp file
		if (await fs.pathExists(tempDest)) {
			await fs.remove(tempDest);
		}
		// Copy to the temporary location
		await fs.copyFile(src, tempDest);
		
		// Atomically rename .tmp -> destination
		if (await fs.pathExists(dest)) {
			await fs.remove(dest); // Ensure destination doesn't exist
		}
		await fs.rename(tempDest, dest);
	} catch (err) {
		// If anything fails, clean up the temp file
		if (await fs.pathExists(tempDest)) {
			await fs.remove(tempDest).catch(() => {});
		}
		throw err;
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
 * High-performance, streaming zero-memory ZIP entry reader with full Zip64 and standard ZIP support.
 * Extracts specific files (like modDesc.xml or icon.dds) without loading multi-gigabyte archives into RAM.
 */
function readEntryFromZip(zipPath, targetEntryName) {
	let fd = null;
	try {
		if (!nodeFs.existsSync(zipPath)) return null;
		const stats = nodeFs.statSync(zipPath);
		if (stats.size < 22) return null;
		fd = nodeFs.openSync(zipPath, 'r');

		// 1. Find EOCD (End of Central Directory Record) in last 65KB
		const searchLen = Math.min(stats.size, 65536 + 22);
		const endBuf = Buffer.alloc(searchLen);
		nodeFs.readSync(fd, endBuf, 0, searchLen, stats.size - searchLen);

		let eocdOffsetInBuf = -1;
		for (let i = searchLen - 22; i >= 0; i--) {
			if (endBuf[i] === 0x50 && endBuf[i+1] === 0x4b && endBuf[i+2] === 0x05 && endBuf[i+3] === 0x06) {
				eocdOffsetInBuf = i;
				break;
			}
		}

		if (eocdOffsetInBuf === -1) {
			return null;
		}

		let cdSize = endBuf.readUInt32LE(eocdOffsetInBuf + 12);
		let cdOffset = endBuf.readUInt32LE(eocdOffsetInBuf + 16);

		// Check for Zip64 Locator (20 bytes before EOCD)
		if (cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF || eocdOffsetInBuf >= 20) {
			const locatorOffset = eocdOffsetInBuf - 20;
			if (locatorOffset >= 0 && endBuf[locatorOffset] === 0x50 && endBuf[locatorOffset+1] === 0x4b && endBuf[locatorOffset+2] === 0x06 && endBuf[locatorOffset+3] === 0x07) {
				const zip64EOCDOffset = Number(endBuf.readBigUInt64LE(locatorOffset + 8));
				if (zip64EOCDOffset < stats.size) {
					const zip64Header = Buffer.alloc(56);
					nodeFs.readSync(fd, zip64Header, 0, 56, zip64EOCDOffset);
					if (zip64Header.readUInt32LE(0) === 0x06064b50) {
						cdSize = Number(zip64Header.readBigUInt64LE(40));
						cdOffset = Number(zip64Header.readBigUInt64LE(48));
					}
				}
			}
		}

		if (cdSize > 100 * 1024 * 1024 || cdOffset + cdSize > stats.size) {
			return null;
		}

		// 2. Read Central Directory
		const cdBuf = Buffer.alloc(cdSize);
		nodeFs.readSync(fd, cdBuf, 0, cdSize, cdOffset);

		const targetLower = targetEntryName.toLowerCase();
		let cdPos = 0;
		let targetEntry = null;

		while (cdPos <= cdSize - 46) {
			const sig = cdBuf.readUInt32LE(cdPos);
			if (sig !== 0x02014b50) break;

			const method = cdBuf.readUInt16LE(cdPos + 10);
			let compSize = cdBuf.readUInt32LE(cdPos + 20);
			let uncompSize = cdBuf.readUInt32LE(cdPos + 24);
			const nameLen = cdBuf.readUInt16LE(cdPos + 28);
			const extraLen = cdBuf.readUInt16LE(cdPos + 30);
			const commentLen = cdBuf.readUInt16LE(cdPos + 32);
			let localOffset = cdBuf.readUInt32LE(cdPos + 42);

			const entryName = cdBuf.toString('utf8', cdPos + 46, cdPos + 46 + nameLen);
			const entryNameLower = entryName.toLowerCase();

			// Check for Zip64 extra field if sizes or offset are 0xFFFFFFFF
			if (extraLen > 0 && (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF || localOffset === 0xFFFFFFFF)) {
				let extraPos = cdPos + 46 + nameLen;
				const extraEnd = extraPos + extraLen;
				while (extraPos <= extraEnd - 4) {
					const headerId = cdBuf.readUInt16LE(extraPos);
					const dataSize = cdBuf.readUInt16LE(extraPos + 2);
					if (headerId === 0x0001) {
						let offsetInExtra = extraPos + 4;
						if (uncompSize === 0xFFFFFFFF && offsetInExtra + 8 <= extraEnd) {
							uncompSize = Number(cdBuf.readBigUInt64LE(offsetInExtra));
							offsetInExtra += 8;
						}
						if (compSize === 0xFFFFFFFF && offsetInExtra + 8 <= extraEnd) {
							compSize = Number(cdBuf.readBigUInt64LE(offsetInExtra));
							offsetInExtra += 8;
						}
						if (localOffset === 0xFFFFFFFF && offsetInExtra + 8 <= extraEnd) {
							localOffset = Number(cdBuf.readBigUInt64LE(offsetInExtra));
							offsetInExtra += 8;
						}
						break;
					}
					extraPos += 4 + dataSize;
				}
			}

			if (entryNameLower === targetLower || entryNameLower === `/${targetLower}` || entryNameLower.endsWith(`/${targetLower}`)) {
				targetEntry = {
					entryName,
					method,
					compSize,
					uncompSize,
					localOffset
				};
				break;
			}

			cdPos += 46 + nameLen + extraLen + commentLen;
		}

		if (!targetEntry || targetEntry.uncompSize > 100 * 1024 * 1024) {
			return null;
		}

		// 3. Read Local Header to find exact data offset
		const localHeader = Buffer.alloc(30);
		nodeFs.readSync(fd, localHeader, 0, 30, targetEntry.localOffset);
		if (localHeader.readUInt32LE(0) !== 0x04034b50) {
			return null;
		}
		const localNameLen = localHeader.readUInt16LE(26);
		const localExtraLen = localHeader.readUInt16LE(28);
		const dataOffset = targetEntry.localOffset + 30 + localNameLen + localExtraLen;

		// 4. Read compressed data
		const compData = Buffer.alloc(targetEntry.compSize);
		nodeFs.readSync(fd, compData, 0, targetEntry.compSize, dataOffset);

		if (targetEntry.method === 0) {
			return compData;
		} else if (targetEntry.method === 8) {
			return zlib.inflateRawSync(compData);
		}
	} catch (err) {
		return null;
	} finally {
		if (fd !== null) {
			try { nodeFs.closeSync(fd); } catch (_) {}
		}
	}
	return null;
}

/**
 * Lists all file entries in a ZIP archive by reading only the central directory (< 500KB total).
 */
function listZipEntries(zipPath) {
	let fd = null;
	try {
		if (!nodeFs.existsSync(zipPath)) return [];
		const stats = nodeFs.statSync(zipPath);
		if (stats.size < 22) return [];
		fd = nodeFs.openSync(zipPath, 'r');

		// 1. Find EOCD
		const searchLen = Math.min(stats.size, 65536 + 22);
		const endBuf = Buffer.alloc(searchLen);
		nodeFs.readSync(fd, endBuf, 0, searchLen, stats.size - searchLen);

		let eocdOffsetInBuf = -1;
		for (let i = searchLen - 22; i >= 0; i--) {
			if (endBuf[i] === 0x50 && endBuf[i+1] === 0x4b && endBuf[i+2] === 0x05 && endBuf[i+3] === 0x06) {
				eocdOffsetInBuf = i;
				break;
			}
		}

		if (eocdOffsetInBuf === -1) return [];

		let cdSize = endBuf.readUInt32LE(eocdOffsetInBuf + 12);
		let cdOffset = endBuf.readUInt32LE(eocdOffsetInBuf + 16);

		// Check for Zip64 Locator
		if (cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF || eocdOffsetInBuf >= 20) {
			const locatorOffset = eocdOffsetInBuf - 20;
			if (locatorOffset >= 0 && endBuf[locatorOffset] === 0x50 && endBuf[locatorOffset+1] === 0x4b && endBuf[locatorOffset+2] === 0x06 && endBuf[locatorOffset+3] === 0x07) {
				const zip64EOCDOffset = Number(endBuf.readBigUInt64LE(locatorOffset + 8));
				if (zip64EOCDOffset < stats.size) {
					const zip64Header = Buffer.alloc(56);
					nodeFs.readSync(fd, zip64Header, 0, 56, zip64EOCDOffset);
					if (zip64Header.readUInt32LE(0) === 0x06064b50) {
						cdSize = Number(zip64Header.readBigUInt64LE(40));
						cdOffset = Number(zip64Header.readBigUInt64LE(48));
					}
				}
			}
		}

		if (cdSize > 100 * 1024 * 1024 || cdOffset + cdSize > stats.size) return [];

		// 2. Read Central Directory
		const cdBuf = Buffer.alloc(cdSize);
		nodeFs.readSync(fd, cdBuf, 0, cdSize, cdOffset);

		const entries = [];
		let cdPos = 0;

		while (cdPos <= cdSize - 46) {
			const sig = cdBuf.readUInt32LE(cdPos);
			if (sig !== 0x02014b50) break;

			const method = cdBuf.readUInt16LE(cdPos + 10);
			let compSize = cdBuf.readUInt32LE(cdPos + 20);
			let uncompSize = cdBuf.readUInt32LE(cdPos + 24);
			const nameLen = cdBuf.readUInt16LE(cdPos + 28);
			const extraLen = cdBuf.readUInt16LE(cdPos + 30);
			const commentLen = cdBuf.readUInt16LE(cdPos + 32);
			let localOffset = cdBuf.readUInt32LE(cdPos + 42);

			const entryName = cdBuf.toString('utf8', cdPos + 46, cdPos + 46 + nameLen);

			if (extraLen > 0 && (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF || localOffset === 0xFFFFFFFF)) {
				let extraPos = cdPos + 46 + nameLen;
				const extraEnd = extraPos + extraLen;
				while (extraPos <= extraEnd - 4) {
					const headerId = cdBuf.readUInt16LE(extraPos);
					const dataSize = cdBuf.readUInt16LE(extraPos + 2);
					if (headerId === 0x0001) {
						let offsetInExtra = extraPos + 4;
						if (uncompSize === 0xFFFFFFFF && offsetInExtra + 8 <= extraEnd) {
							uncompSize = Number(cdBuf.readBigUInt64LE(offsetInExtra));
							offsetInExtra += 8;
						}
						if (compSize === 0xFFFFFFFF && offsetInExtra + 8 <= extraEnd) {
							compSize = Number(cdBuf.readBigUInt64LE(offsetInExtra));
							offsetInExtra += 8;
						}
						if (localOffset === 0xFFFFFFFF && offsetInExtra + 8 <= extraEnd) {
							localOffset = Number(cdBuf.readBigUInt64LE(offsetInExtra));
							offsetInExtra += 8;
						}
						break;
					}
					extraPos += 4 + dataSize;
				}
			}

			entries.push({
				entryName,
				method,
				compSize,
				uncompSize,
				localOffset
			});

			cdPos += 46 + nameLen + extraLen + commentLen;
		}

		return entries;
	} catch (err) {
		return [];
	} finally {
		if (fd !== null) {
			try { nodeFs.closeSync(fd); } catch (_) {}
		}
	}
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

/**
 * The dedicated subfolder name for shared map dependencies.
 * All mods that are dependencies of maps live here so they are centrally
 * managed, never duplicated, and safely shared across all maps.
 */
const MAP_DEPENDENCIES_FOLDER = 'Map Dependencies';

/**
 * Returns the full absolute path to the Map Dependencies folder inside the primary mods root.
 */
function getMapDepsPath() {
	return path.join(getModsPath(), MAP_DEPENDENCIES_FOLDER);
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
	let virtualBaseDir = (app && app.getPath) ? app.getPath('userData') : path.join(process.env.APPDATA, 'fs25-mt-mod-manager');
	
	try {
		const allPaths = getModsPaths();
		if (allPaths && allPaths.length > 0) {
			let bestPath = allPaths[0];
			let maxFree = 0;
			for (const p of allPaths) {
				try {
					if (fs.existsSync(p)) {
						const stats = fs.statfsSync(p);
						const free = Number(stats.bfree) * Number(stats.bsize);
						if (free > maxFree) {
							maxFree = free;
							bestPath = p;
						}
					}
				} catch (e) {}
			}
			if (bestPath) {
				const driveRoot = path.parse(bestPath).root || path.dirname(bestPath);
				virtualBaseDir = path.join(driveRoot, '.fs25_virtual_mods');
			}
		}
	} catch (err) {
		console.warn('[VIRTUAL] Failed to resolve dynamic drive for virtual mods, falling back to userData:', err.message);
	}

	const virtualPath = path.join(virtualBaseDir, savegameIndex ? `VirtualActiveMods_Savegame${savegameIndex}` : 'VirtualActiveMods');
	
	debugLog(`[VIRTUAL] Preparing ${savegameIndex ? `Selective (Savegame ${savegameIndex})` : 'Global'} synthesis in: ${virtualPath}`);
	
	try {
		if (fs.existsSync(virtualPath)) {
			const files = await fs.readdir(virtualPath);
			// Use safeRemove for each entry to avoid crashing on locks
			await Promise.all(files.map(f => safeRemove(path.join(virtualPath, f)).catch(e => console.warn(`[VIRTUAL] Cleanup skip: ${f}`))));
		} else {
			await fs.ensureDir(virtualPath);
		}

		// Fetch all authoritative mods
		const { mods } = await scanLocalMods();

		// Initialize as an empty set if we are in selective mode
		let activeModNames = savegameIndex !== null ? new Set() : null;
		if (activeModNames) {
			activeModNames.add('fs25_mtradiomanager');
			activeModNames.add('fs25_quietloadingscreen');
		}
		let mapModName = null;
		let mapModObj = null;

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
					
					// Identify the map mod using robust detection
					const careerPath = path.join(savePath, 'careerSavegame.xml');
					if (fs.existsSync(careerPath)) {
						const xml = await fs.readFile(careerPath, 'utf8');
						mapModObj = savegameManager.findMapModInSavegame(xml, mods);
						if (mapModObj && mapModObj.modName) {
							mapModName = mapModObj.modName.toLowerCase();
							activeModNames.add(mapModName);
						} else {
							const mapMatch = xml.match(/<mapId[^>]*>([^<]+)<\/mapId>/i) || xml.match(/mapId="([^"]+)"/i);
							if (mapMatch && mapMatch[1] && !['MapUS', 'MapEU', 'MapAS', 'HighlandsFishingMap'].includes(mapMatch[1])) {
								mapModName = mapMatch[1].split('.')[0].toLowerCase();
								activeModNames.add(mapModName);
								mapModObj = mods.find(m => m.modName && m.modName.toLowerCase() === mapModName);
							}
						}
					}
				} catch (e) {
					console.warn(`[VIRTUAL] Failed to read savegame mods for slot ${savegameIndex}:`, e.message);
				}
			}
		}

		let linkedCount = 0;
		const seenFiles = new Set();

		// If mapModObj is found and active, find its dedicated subfolder and auto-add non-map sibling mods
		if (mapModObj && activeModNames && mapModObj.filePath) {
			try {
				const mapDir = path.dirname(mapModObj.filePath);
				const configuredRoots = getModsPaths().map(p => path.resolve(p).toLowerCase());
				const mapDirResolved = path.resolve(mapDir).toLowerCase();
				const parentOfMapDir = path.resolve(path.dirname(mapDir)).toLowerCase();

				if (configuredRoots.includes(parentOfMapDir) && !configuredRoots.includes(mapDirResolved)) {
					debugLog(`[VIRTUAL] Map '${mapModObj.modName}' resides in dedicated subfolder '${path.basename(mapDir)}'. Auto-activating non-map sibling mods.`);
					mods.forEach(m => {
						if (!m.filePath || !m.modName) return;
						const mDir = path.resolve(path.dirname(m.filePath)).toLowerCase();
						if (mDir === mapDirResolved) {
							// DO NOT auto-add conflicting alternate map versions (e.g. crossplay vs non-crossplay in same folder)
							if (m.isMap && m.modName.toLowerCase() !== mapModObj.modName.toLowerCase()) {
								return;
							}
							activeModNames.add(m.modName.toLowerCase());
						}
					});
				} else if (mapModObj.folder && mapModObj.folder.toLowerCase() !== 'mods' && mapModObj.folder.toLowerCase() !== '') {
					const folderLower = mapModObj.folder.toLowerCase();
					mods.forEach(m => {
						if (m.folder && m.folder.toLowerCase() === folderLower && m.modName) {
							if (m.isMap && m.modName.toLowerCase() !== mapModObj.modName.toLowerCase()) {
								return;
							}
							activeModNames.add(m.modName.toLowerCase());
						}
					});
				}
			} catch (mDirErr) {
				console.warn('[VIRTUAL] Error resolving subfolder siblings:', mDirErr.message);
			}
		}

        // Recursively resolve all dependencies of active mods (including shared mods outside the subfolder)
        if (activeModNames) {
            const queue = Array.from(activeModNames);
            const resolved = new Set(queue);
            
            const modsByName = new Map();
            const modsByNormalized = new Map();
            
            for (const m of mods) {
                if (m.modName) {
                    modsByName.set(m.modName.toLowerCase(), m);
                }
            }
            
            while (queue.length > 0) {
                const currentName = queue.shift();
                const mObj = modsByName.get(currentName);
                if (mObj && mObj.dependencies && mObj.dependencies.length > 0) {
                    for (const dep of mObj.dependencies) {
                        const foundMod = mods.find(m => dependencyResolver.matchModWithDependency(m, dep));

                        if (foundMod && foundMod.modName) {
                            const resolvedName = foundMod.modName.toLowerCase();
                            if (!resolved.has(resolvedName)) {
                                resolved.add(resolvedName);
                                activeModNames.add(resolvedName);
                                queue.push(resolvedName);
                                debugLog(`[VIRTUAL] Auto-activated shared dependency mod: ${foundMod.modName}`);
                            }
                        }
                    }
                }
            }
        }
        
        for (const m of mods) {
            const modNameLower = m.modName.toLowerCase();
            
            // FILTER: If we are in selective mode, only link if it's in the active set
            if (activeModNames && !activeModNames.has(modNameLower)) {
                continue;
            }

            // Name the symlink EXACTLY what the engine expects (m.modName + .zip if it was a zip)
            const isZip = m.filePath.toLowerCase().endsWith('.zip');
            const destPath = path.join(virtualPath, m.modName + (isZip ? '.zip' : ''));

            try {
                // Remove existing if it somehow persisted
                if (fs.existsSync(destPath)) await fs.remove(destPath);
                
                if (isZip) {
                    // Try Hardlink first (requires no admin privileges on Windows when on same drive)
                    try {
                        await fs.link(m.filePath, destPath);
                    } catch (hErr) {
                        try {
                            await fs.symlink(m.filePath, destPath, 'file');
                        } catch (sErr) {
                            // Fallback to direct copy if symlink fails across drives (e.g. without dev mode / admin permissions)
                            await atomicCopyFile(m.filePath, destPath);
                        }
                    }
                } else {
                    try {
                        await fs.symlink(m.filePath, destPath, 'junction');
                    } catch (jErr) {
                        await atomicCopyFile(m.filePath, destPath);
                    }
                }
                linkedCount++;
                seenFiles.add(m.modName.toLowerCase());
            } catch (e) {
                console.error(`[VIRTUAL] Failed to stage mod ${m.modName} in virtual folder:`, e.message);
                debugLog(`[VIRTUAL] Link failed for ${m.modName}: ${e.message}`);
            }
        }

		// Inject internal QuietLoadingScreen helper mod to guarantee silent loading screens
		try {
			const internalQuietMod = path.join(__dirname, '..', 'resources', 'internalMods', 'FS25_QuietLoadingScreen.zip');
			if (fs.existsSync(internalQuietMod)) {
				const destQuietPath = path.join(virtualPath, 'FS25_QuietLoadingScreen.zip');
				if (fs.existsSync(destQuietPath)) await fs.remove(destQuietPath);
				await fs.copyFile(internalQuietMod, destQuietPath);
				debugLog('[VIRTUAL] Injected internal helper mod: FS25_QuietLoadingScreen.zip');
			}
		} catch (qErr) {
			console.warn('[VIRTUAL] Could not inject FS25_QuietLoadingScreen:', qErr.message);
		}

		// Inject internal MTRadioManager helper mod to guarantee in-game radio station overrides
		try {
			const internalRadioMod = path.join(__dirname, '..', 'resources', 'internalMods', 'FS25_MTRadioManager.zip');
			if (fs.existsSync(internalRadioMod)) {
				const destRadioPath = path.join(virtualPath, 'FS25_MTRadioManager.zip');
				if (fs.existsSync(destRadioPath)) await fs.remove(destRadioPath);
				await fs.copyFile(internalRadioMod, destRadioPath);
				debugLog('[VIRTUAL] Injected internal helper mod: FS25_MTRadioManager.zip');
			}
		} catch (rErr) {
			console.warn('[VIRTUAL] Could not inject FS25_MTRadioManager:', rErr.message);
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
            const fileLower = file.toLowerCase();
            const fileNorm = fileLower.replace(/^pdlc_/i, '');
            const mappingKey = Object.keys(DLC_MAPPING).find(k => {
                const kLower = k.toLowerCase();
                const kNorm = kLower.replace(/^pdlc_/i, '');
                return kLower === fileLower || kNorm === fileNorm;
            }) || file;
            const mapping = DLC_MAPPING[mappingKey];
            const stats = nodeFs.statSync(path.join(pdlcPath, file));
            
            // Generate a readable title from filename if not in mapping
            let cleanTitle = file.replace(/\.dlc$/i, '').replace(/^pdlc_/i, '');
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
				let buf = readEntryFromZip(modPath, 'modDesc.xml');
				if (!buf) {
					const entries = listZipEntries(modPath);
					const target = entries.find(e =>
						e.entryName.toLowerCase() === 'moddesc.xml' ||
						e.entryName.toLowerCase().endsWith('/moddesc.xml')
					);
					if (target) {
						buf = readEntryFromZip(modPath, target.entryName);
					}
				}
				if (buf) {
					xmlContent = decodeBuffer(buf);
				}
			} catch (zipErr) {
				debugLog(`[PARSE ERROR] Zip parsing failed: ${path.basename(modPath)} - ${zipErr.message}`);
			}
		} else if (nodeFs.existsSync(modPath) && nodeFs.statSync(modPath).isDirectory()) {
			const modDescPath = path.join(modPath, 'modDesc.xml');
			if (nodeFs.existsSync(modDescPath)) {
				xmlContent = decodeBuffer(nodeFs.readFileSync(modDescPath));
			}
		}
		
		if (!xmlContent) return null;
		
		// Strip XML comments so commented-out tags (like old versions) are never extracted
		xmlContent = xmlContent.replace(/<!--[\s\S]*?-->/g, '');
		
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
		
		// Extract category only if it is a simple short tag (prevent multi-line <helpline> or nested tags)
		let categoryXml = '';
		const catRaw = getTag(xmlContent, 'category') || getTag(xmlContent, 'extraContent') || '';
		if (catRaw && catRaw.length <= 40 && !catRaw.includes('<') && !catRaw.includes('\n') && !catRaw.includes('\r')) {
			categoryXml = catRaw.trim();
		}
		
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
		const mapMatch = xmlContent.match(/<map\s+[^>]*id=(["'])(.*?)\1[^>]*>/is) || 
		                 xmlContent.match(/<maps[^>]*>/is);
		
		// 2. Additional patterns: modType="map", <mapConfiguration>, or map .i3d references
		const hasModTypeMap = /modType\s*=\s*["']map["']/i.test(xmlContent);
		const hasMapConfiguration = /<mapConfiguration/i.test(xmlContent);
		const hasMapI3D = /filename\s*=\s*["'][^"']*map[^"']*\.i3d["']/i.test(xmlContent);
		
		if (mapMatch || hasModTypeMap || hasMapConfiguration) {
			isMap = true;
			// If we matched the <map> tag with a group, extract the ID
			if (mapMatch && mapMatch[2]) {
				mapId = mapMatch[2];
			} else {
				// Fallback: look for the first map tag inside the maps block
				const innerMapIdMatch = xmlContent.match(/<map\s+[^>]*id=(["'])(.*?)\1[^>]*>/is);
				mapId = innerMapIdMatch ? innerMapIdMatch[2] : null;
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
		const xmlWithoutComments = xmlContent.replace(/<!--[\s\S]*?-->/g, '');
		const depBlock = getTag(xmlWithoutComments, 'dependencies');
		
		// Strategy: Check inside <dependencies> block first, fallback to all <dependency> tags if block missing
		const contentToSearch = depBlock || xmlWithoutComments;
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
			category: categoryXml,
			mapId,
			dependencies,
			scripts,
			specializations,
			conflicts,
			techData: null,
		};

		// ── MOD KEYBINDS EXTRACTION ──
		try {
			// Extract actions and inputBinding XML blocks natively as strings
			const actionsBlock = getTag(xmlContent, 'actions');
			const inputBindingBlock = getTag(xmlContent, 'inputBinding');
			
			if (actionsBlock) result.actionsXml = actionsBlock;
			if (inputBindingBlock) result.inputBindingXml = inputBindingBlock;
		} catch (e) {}

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
				const normalizedPath = xmlPath.replace(/\\/g, '/');
				const buf = readEntryFromZip(modPath, normalizedPath);
				if (buf) xmlContent = decodeBuffer(buf);
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

let lastScanResult = null;
let lastScanTime = 0;
const SCAN_CACHE_TTL = 15000; // 15s in-memory cache TTL for unforced scans
let pendingScanQueue = [];
let nextScanForced = false;

function clearScanCache() {
	lastScanResult = null;
	lastScanTime = 0;
}

function getLastScanResult() {
	return lastScanResult;
}

/**
	* Scan the local mods folder and return metadata for each mod.
*/
async function scanLocalMods(manualPaths = null, force = false) {
	const now = Date.now();
	if (force) {
		clearScanCache();
	}

	if (!force && !manualPaths && lastScanResult && (now - lastScanTime < SCAN_CACHE_TTL)) {
		debugLog('[SCAN] Returning cached scan result.');
		return lastScanResult;
	}

	if (activeScanPromise) {
		if (force) {
			nextScanForced = true;
			debugLog('[SCAN] Scan already running, queuing forced follow-up scan.');
			return new Promise((resolve, reject) => {
				pendingScanQueue.push({ resolve, reject, manualPaths });
			});
		} else {
			debugLog('[SCAN] Scan already in progress, reusing active scan promise.');
			return activeScanPromise;
		}
	}

	activeScanPromise = (async () => {
		try {
			const result = await performScan(manualPaths);
			lastScanResult = result;
			lastScanTime = Date.now();
			return result;
		} finally {
			activeScanPromise = null;

			// Drain any pending queue in a single serialized follow-up
			if (pendingScanQueue.length > 0) {
				const queue = pendingScanQueue;
				pendingScanQueue = [];
				const wasForced = nextScanForced;
				nextScanForced = false;

				debugLog(`[SCAN] Draining ${queue.length} queued scan requests (Forced: ${wasForced})...`);
				scanLocalMods(null, wasForced)
					.then(freshResult => queue.forEach(q => q.resolve(freshResult)))
					.catch(err => queue.forEach(q => q.reject(err)));
			}
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

	// Fetch the ModHub metadata pool once to avoid heavy DB queries in the loop
	const pool = cache.getModHubMetadataPool();
	const poolByCleanTitle = pool._byCleanTitle || {};

	// Batch load all local mod cache and tracking entries to eliminate thousands of DB queries in loop
	const allCacheRows = cache.getAllLocalModCache();
	const localCacheMap = new Map();
	for (const row of allCacheRows) {
		localCacheMap.set(row.file_path, row);
	}

	const allTrackingRows = cache.getAllModTracking();
	const trackingFileMap = new Map();
	const trackingBaseNameMap = new Map();
	for (const t of allTrackingRows) {
		if (t.local_file_name) {
			const normFile = t.local_file_name.replace(/\\/g, '/');
			trackingFileMap.set(t.local_file_name, t);
			trackingFileMap.set(t.local_file_name.toLowerCase(), t);
			trackingFileMap.set(normFile, t);
			trackingFileMap.set(normFile.toLowerCase(), t);
			const baseName = path.basename(t.local_file_name).toLowerCase();
			trackingBaseNameMap.set(baseName, t);
		}
	}

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

		// Allow all zip files and directories regardless of leading digits
		
		try {
			// Use asynchronous stat to prevent blocking, especially on NAS
			let stats = await fs.lstat(fullPath).catch(() => null);
			if (!stats) return;

			let targetPath = fullPath;

			// Handle symbolic links
			if (stats.isSymbolicLink()) {
				if (!subFolder) {
					// Skip symbolic links in root ONLY if they point to an internal subfolder (an internal mirror)
					// If they point to an external drive (e.g. F:\mods4, D:\mods), WE MUST SCAN THEM!
					try {
						let real = null;
						try {
							real = await fs.realpath(fullPath);
						} catch (e) {
							// Check if the symlink target path was in an old subfolder that was reorganized
							const rawTarget = await fs.readlink(fullPath).catch(() => null);
							if (rawTarget) {
								const baseTarget = path.basename(rawTarget);
								const candidatePaths = [
									path.join(path.dirname(path.dirname(rawTarget)), baseTarget),
									path.join('D:\\mods', baseTarget),
									path.join('F:\\mods4', baseTarget)
								];
								for (const cp of candidatePaths) {
									if (await fs.pathExists(cp)) {
										real = cp;
										break;
									}
								}
							}
						}
						if (!real) return;

						const isInternalMirror = real.toLowerCase().startsWith(modRootPath.toLowerCase());
						if (isInternalMirror) {
							debugLog(`[SCAN] Skipping mirror link in root: ${entryName}`);
							return;
						}
						targetPath = real;
						const realStats = await fs.stat(real).catch(() => null);
						if (realStats) {
							stats = realStats;
						}
					} catch (e) {
						return;
					}
				} else {
					try {
						targetPath = await fs.realpath(fullPath);
						const realStats = await fs.stat(targetPath).catch(() => null);
						if (realStats && realStats.size > 1000) {
							stats = realStats;
						} else {
							// Link target might be broken or 0 bytes, check if root zip exists
							const rootZipPath = path.join(modRootPath, entryName);
							if (fs.existsSync(rootZipPath) && !fs.lstatSync(rootZipPath).isSymbolicLink()) {
								targetPath = rootZipPath;
								stats = await fs.stat(targetPath).catch(() => stats);
							}
						}
					} catch (e) {
						const rootZipPath = path.join(modRootPath, entryName);
						if (fs.existsSync(rootZipPath) && !fs.lstatSync(rootZipPath).isSymbolicLink()) {
							targetPath = rootZipPath;
							stats = await fs.stat(targetPath).catch(() => stats);
						}
					}
				}
			}

			const mtime = stats.mtimeMs;
			let size = stats.size;
			
			if (stats.isDirectory()) {
				isModDir = await fs.pathExists(path.join(targetPath, 'modDesc.xml'));
				if (isModDir) {
					// Fallback to simple size for directories - using readdir for count
					const dirFiles = await fs.readdir(targetPath).catch(() => []);
					size = dirFiles.length * 1024; 
				}
			}
			
			if (!isZip && !isModDir) return;
			
			const cached = localCacheMap.get(fullPath);
			let modDesc = null;
			let fileHash = null;
			if (cached && cached.mtime === Math.floor(mtime) && cached.size === size) {
				try {
					modDesc = JSON.parse(cached.json_data);
					fileHash = cached.file_hash;
				} catch (e) {
					modDesc = null;
				}
			}
			
			let iconBase64 = cached?.icon_base64 || null;
			let storeBase64 = cached?.store_base64 || null;

			// Check if this is a third-party mod/map (not a DLC and not tracked on ModHub)
			const fileId = `file_${entryName.toLowerCase()}`;
			const isDlc = entryName.toLowerCase().startsWith('pdlc_') || fullPath.toLowerCase().includes('pdlc');
			const isModHub = !!(pool[fileId] || (modDesc?.modId && pool[String(modDesc.modId)]) || (modDesc?.mapId && pool[String(modDesc.mapId)]));
			let isThirdParty = !isDlc && !isModHub;
			
			// Skip zip parsing for files currently being downloaded by activeInstalls to prevent AdmZip crash
			const isDownloadingFile = Array.from(activeInstalls.values()).some(inst => {
				if (!inst || !inst.savePath) return false;
				return path.basename(inst.savePath).toLowerCase() === entryName.toLowerCase() || inst.savePath === fullPath;
			});

			// ONLY parse ZIP if modDesc is not cached (new or modified file)
		let isCorrupt = false;
		if (!modDesc && isZip && !isDownloadingFile) {
			// Quick integrity check — catches 0-byte files and truncated downloads
			// without needing to decompress anything
			const integrity = verifyZipFileIntegrity(targetPath);
			if (!integrity.ok) {
				isCorrupt = true;
				debugLog(`[CORRUPT] ${entryName}: ${integrity.error}`);
				// Don't attempt to parse — it will throw. Fall through to mods.push with isCorrupt=true.
			}
		}

		if (!modDesc && !isCorrupt) {
				try {
					if (targetPath.toLowerCase().endsWith('.zip') && isDownloadingFile) {
						// Skip parsing while actively downloading to avoid file contention
						return;
					}

					const modDescResult = parseModDesc(targetPath);
					if (modDescResult) {
						modDesc = modDescResult;
						
						// Re-evaluate if third party with newly parsed modDesc info
						if (isThirdParty && modDesc.modId && pool[String(modDesc.modId)]) {
							isThirdParty = false;
						}

						// Extract images for new/changed mods
						try {
							const newIcon = await getModIcon(targetPath, modDesc.iconFile, modDesc, null, false);
							if (newIcon && newIcon !== 'CATEGORY:generic' && newIcon !== 'CATEGORY:map') {
								iconBase64 = newIcon;
							} else if (!iconBase64) {
								iconBase64 = newIcon;
							}
							
							// Only extract store icon for third-party mods/maps (saves heavy zip decompression/resizing)
							if (isThirdParty) {
								const newStore = await getModIcon(fullPath, modDesc.iconFile, modDesc, null, true);
								if (newStore && newStore !== 'CATEGORY:generic' && newStore !== 'CATEGORY:map') {
									storeBase64 = newStore;
								} else if (!storeBase64) {
									storeBase64 = newStore;
								}
							} else {
								storeBase64 = 'CATEGORY:skipped';
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
            let dependencies = modDesc?.dependencies || [];

			const relativePath = subFolder ? `${subFolder}/${entryName}` : entryName;
			
			let calculatedModId = modDesc?.modId || null;
			let tracked = null;
			if (!calculatedModId) {
				tracked = trackingFileMap.get(relativePath) || trackingFileMap.get(entryName) || trackingFileMap.get(entryName.toLowerCase());
				if (tracked?.mod_id) {
					calculatedModId = tracked.mod_id;
				} else {
					const trackedBase = trackingBaseNameMap.get(entryName.toLowerCase());
					if (trackedBase?.mod_id) {
						calculatedModId = trackedBase.mod_id;
						tracked = trackedBase;
					}
				}
			} else {
				tracked = trackingFileMap.get(relativePath) || trackingFileMap.get(entryName) || trackingFileMap.get(entryName.toLowerCase());
			}

			const cleanFileId = entryName.toLowerCase().replace('.zip', '');
			const cleanPrefix = cleanFileId.replace(/^(?:fs25|fs22|pdlc)_/i, '');
			const cleanAlphanum = cleanPrefix.replace(/[^a-z0-9]/g, '');

			let remoteMod = pool[fileId] || pool[cleanFileId] || pool[cleanPrefix] || (cleanAlphanum ? pool[cleanAlphanum] : null) || (calculatedModId ? pool[String(calculatedModId)] : null);

			// Fallback for manually downloaded mods: match clean title / alphanum against pool
			if (!remoteMod) {
				const cleanTitleKey = (title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
				remoteMod = poolByCleanTitle[cleanAlphanum] || poolByCleanTitle[cleanTitleKey] || pool[cleanTitleKey] || null;
			}

			if (remoteMod) {
				if (!calculatedModId && (remoteMod.modId || remoteMod.id || remoteMod.rawModId)) {
					calculatedModId = String(remoteMod.modId || remoteMod.id || remoteMod.rawModId).replace(/^0+/, '');
				}
				// Use ModHub dependencies as primary authority
				if (remoteMod.dependencies && Array.isArray(remoteMod.dependencies)) {
					dependencies = remoteMod.dependencies;
				}

				// Enrich missing metadata
				if (author === 'Unknown' && remoteMod.author) author = remoteMod.author;
				if (author === 'Unknown' && remoteMod.title && remoteMod.title.includes('by ')) {
					author = remoteMod.title.split('by ')[1].trim();
				}
				if ((version === 'Unknown' || version === 'Invalid' || !modDesc?.version) && remoteMod.version) {
					version = remoteMod.version;
				}
				if (title === entryName.replace('.zip', '') && remoteMod.title) title = remoteMod.title;
			}

			if ((version === 'Unknown' || version === 'Invalid') && (tracked?.remote_version || tracked?.local_version)) {
				version = tracked.remote_version || tracked.local_version;
			}

			const isCrossplay = isCrossplayMod(title, calculatedModId, remoteMod);

			mods.push({
				title,
				author,
				version,
				category: modDesc?.category || null,
				size: size,
				fileName: subFolder ? `${subFolder}/${entryName}` : entryName,
				filePath: fullPath,
				folder: subFolder, 
				isDLC: isDlc || subFolder === 'DLC' || entryName.toLowerCase().startsWith('pdlc_'),
				isMap: modDesc?.isMap || false,
				isCrossplay: !!isCrossplay,
				mapId: modDesc?.mapId || null,
				mapTitle: modDesc?.mapTitle || null,
				modName: modDesc?.techName || entryName.replace(/\.zip$/i, ''),
				technicalName: modDesc?.techName || '',
				dependencies,
				conflicts: modDesc?.conflicts || [],
				scripts: modDesc?.scripts || [],
				specializations: modDesc?.specializations || [],
				techData: modDesc?.techData || null,
				modId: calculatedModId,
				iconFile: modDesc?.iconFile || '',
				iconData: iconBase64 && iconBase64.startsWith('CATEGORY:') ? iconBase64 : null,
				storeData: null,
				fileHash: fileHash || '',
				tags: cached?.tags ? JSON.parse(cached.tags) : [],
				isCorrupt: isCorrupt || false,
			});

			// ── CONSOLIDATED MOD METADATA REFINEMENT ──
			const modObj = mods[mods.length - 1];
			const isMapViaCategory = isMapCategory(modObj.category);
            
            // Ensure category is set for local maps if we detected it via icon/heuristic and it is indeed a map
            if (!modObj.category && iconBase64 === 'CATEGORY:map' && modObj.isMap) {
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
					try { cache.setLocalModCache(fullPath, mtime, size, modDesc, iconBase64, fileHash, storeBase64); } catch (e) {}
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
						
						let folderHasMods = false;
						for (const sub of subEntries) {
							if (sub.isSymbolicLink()) continue;
							if (sub.name.toLowerCase().endsWith('.zip')) {
								folderEntries.push({ root: modsPath, name: sub.name, sub: entryName });
								subfolderModNames.add(sub.name.toLowerCase());
								folderHasMods = true;
							} else if (sub.isDirectory()) {
								const hasModDesc = await fs.pathExists(path.join(subPath, sub.name, 'modDesc.xml'));
								if (hasModDesc) {
									folderEntries.push({ root: modsPath, name: sub.name, sub: entryName });
									subfolderModNames.add(sub.name.toLowerCase());
									folderHasMods = true;
								}
							}
						}
						if (folderHasMods) {
							allFolders.push(entryName);
						}
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

	// Process with concurrency limit (10 items per batch keeps memory footprint low for large map ZIPs)
	const limit = 10;
	for (let i = 0; i < allEntries.length; i += limit) {
		const chunk = allEntries.slice(i, i + limit);
		
		try {
			await Promise.all(chunk.map(e => processEntry(e.root, e.name, e.sub)));
		} catch (e) {
			console.error('[SCAN] Chunk processing error:', e.message);
		}

		// Yield event loop after every batch so V8 Garbage Collector can instantly reclaim uncompressed ZIP heap memory
		await new Promise(r => setTimeout(r, 10));
	}

	// Mirror sync is available via explicit user settings or folder changes to prevent launch lag
	
	// ── FINAL DEDUPLICATION (By Identity & Filename) ──
	// We use multiple keys to catch duplicates even if the filename or version changed.
	// We ALWAYS prioritize mods in a subfolder over those in the root.
	// However, distinct non-empty subfolders (such as PC vs CP versions of maps, or mods
	// organized into separate folders) must NEVER deduplicate against each other.
	const uniqueModsMap = new Map();
	const sortedForDedupe = [...mods].sort((a, b) => {
		const aIsRoot = !a.folder || a.folder === '';
		const bIsRoot = !b.folder || b.folder === '';
		if (!aIsRoot && bIsRoot) return -1;
		if (aIsRoot && !bIsRoot) return 1;
		return 0;
	});

	for (const m of sortedForDedupe) {
		// Only MAP mods (e.g. PC vs CP versions in separate folders) are preserved across different folders.
		// Regular mods that exist in multiple folders should be deduplicated so the user does not see duplicates across folders.
		const isMapMod = !!m.isMap;
		const folderPrefix = (isMapMod && m.folder && m.folder !== '') ? `[DIR:${m.folder.toLowerCase()}]_` : '';
		const idKey = m.modId ? `${folderPrefix}ID_${m.modId}` : null;
		const fileKey = `${folderPrefix}FILE_${path.basename(m.fileName).toLowerCase().replace(/\.zip$/i, '')}`;

		// Global collision keys: used to deduplicate across folders for regular mods,
		// and to drop root mods if a subfolder version already exists.
		const globalFileKey = `GLOBAL_FILE_${path.basename(m.fileName).toLowerCase().replace(/\.zip$/i, '')}`;
		const globalIdKey = m.modId ? `GLOBAL_ID_${m.modId}` : null;

		const isRoot = !m.folder || m.folder === '';
		let alreadySeen = false;

		if (isMapMod) {
			if (isRoot) {
				// Map in root: drop if a subfolder version of this map exists
				if (uniqueModsMap.has(globalFileKey) || (globalIdKey && uniqueModsMap.has(globalIdKey))) {
					alreadySeen = true;
				}
			} else {
				// Map in dedicated folder: only deduplicate within the same folder
				const keys = [idKey, fileKey].filter(Boolean);
				for (const k of keys) {
					if (uniqueModsMap.has(k)) {
						alreadySeen = true;
						break;
					}
				}
			}
		} else {
			// Non-map mods: deduplicate globally so identical mods in multiple folders do not duplicate
			if (uniqueModsMap.has(globalFileKey) || (globalIdKey && uniqueModsMap.has(globalIdKey))) {
				alreadySeen = true;
			}
		}

		if (!alreadySeen) {
			if (isMapMod && !isRoot) {
				[idKey, fileKey].filter(Boolean).forEach(k => uniqueModsMap.set(k, m));
			}
			uniqueModsMap.set(globalFileKey, m);
			if (globalIdKey) uniqueModsMap.set(globalIdKey, m);
			uniqueModsMap.set(`FP_${m.filePath || m.fileName}`, m);
		}
	}

	// The map now contains only one instance per mod "identity"
	let finalMods = Array.from(new Set(uniqueModsMap.values()));

	// Filter out internal background logic mods so they don't appear in UI
	const internalMods = ['fs25_rememberpositions', 'fs25_storedeliveries', 'fs25_managerpersistencebridge', 'fs25_quietloadingscreen', 'fs25_mtradiomanager'];
	finalMods = finalMods.filter(m => {
		const name = (m.modName || '').toLowerCase();
		const file = path.basename(m.fileName || m.filePath || '').toLowerCase().replace(/\.zip$/, '');
		return !internalMods.includes(name) && !internalMods.includes(file);
	});

function getTemplatesPath() {
	const p = path.join(pathProvider.getFS25DataRoot(), 'modManagerTemplates');
	if (!fs.existsSync(p)) fs.ensureDirSync(p);
	return p;
}



	// ── ENRICH WITH SQLITE MOD TRACKING & CATEGORIES ──
	const trackingMap = cache.getAllModTrackingMap();
	for (const m of finalMods) {
		const baseName = path.basename(m.fileName).toLowerCase();
		const fullName = m.fileName.replace(/\\/g, '/').toLowerCase();
		const trackingRecord = (m.modId ? trackingMap.get(`ID_${m.modId}`) : null) || 
                               trackingMap.get(`FILE_${fullName}`) || 
                               trackingMap.get(`FILE_${baseName}`);
		
		if (trackingRecord) {
			if (trackingRecord.category || trackingRecord.custom_category) {
				m.category = trackingRecord.custom_category || trackingRecord.category;
			}
			let trackingTags = [];
			if (trackingRecord.tags) {
				try { trackingTags = JSON.parse(trackingRecord.tags); } catch(e) {}
			}
			m.tags = Array.from(new Set([...(m.tags || []), ...trackingTags]));
		}

		// Note: mod.tags is strictly preserved for user-assigned tags (e.g. lock-updates or custom user tags).
		// System categories and map classifications remain in m.category and m.isMap.
		m.tags = Array.from(new Set((m.tags || []).filter(Boolean)));
	}

	finalMods.sort((a, b) => a.title.localeCompare(b.title));
	const conflicts = detectConflicts(finalMods);
	
	// Identify missing dependencies (checking Mod ID, ZIP filename, technical name, title, and ultra-normalized matches)
	const installedIds = new Set();
	const installedFileNames = new Set();
	const installedModNames = new Set();
	const installedTitles = new Set();
	const installedUltraTitles = new Set();
	const installedUltraFiles = new Set();
	const installedUltraNames = new Set();

	for (const m of finalMods) {
		if (m.modId) installedIds.add(String(m.modId).replace(/^0+/, ''));
		if (m.fileName) {
			const cleanF = m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
			installedFileNames.add(cleanF);
			const uF = ultraNormalize(cleanF);
			if (uF) installedUltraFiles.add(uF);
		}
		if (m.modName) {
			installedModNames.add(m.modName.toLowerCase());
			const uM = ultraNormalize(m.modName);
			if (uM) installedUltraNames.add(uM);
		}
		if (m.title) {
			installedTitles.add(m.title.toLowerCase());
			const uT = ultraNormalize(m.title);
			if (uT) installedUltraTitles.add(uT);
		}
	}

	const missingDependencies = [];
	for (const mod of finalMods) {
		for (const dep of (mod.dependencies || [])) {
			let isInstalled = false;

			// 1. Try URL extraction (Mod ID & ZIP filename)
			const depUrl = typeof dep === 'object' ? dep.url : (typeof dep === 'string' && dep.includes('http') ? dep : null);
			if (depUrl) {
				const idMatch = depUrl.match(/mod_id=(\d+)/i) || depUrl.match(/storage\/(\d+)\//i);
				if (idMatch && idMatch[1]) {
					const cleanId = idMatch[1].replace(/^0+/, '');
					if (installedIds.has(cleanId)) isInstalled = true;
				}
				const fileMatch = depUrl.match(/\/([^\/]+\.zip)$/i);
				if (fileMatch && fileMatch[1]) {
					const cleanFile = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
					if (installedFileNames.has(cleanFile) || installedModNames.has(cleanFile)) isInstalled = true;
				}
			}

			// 2. Try explicit modId property
			if (!isInstalled && typeof dep === 'object' && dep.modId) {
				const cleanId = String(dep.modId).replace(/^0+/, '');
				if (installedIds.has(cleanId)) isInstalled = true;
			}

			// 3. Try filename / modName / title exact match
			const depStr = typeof dep === 'string' ? dep : (dep.fileName || dep.modName || dep.technicalName || dep.title || '');
			if (!isInstalled && depStr) {
				const norm = depStr.replace(/\.zip$/i, '').toLowerCase();
				if (installedFileNames.has(norm) || installedModNames.has(norm) || installedTitles.has(norm)) {
					isInstalled = true;
				}
			}

			// 4. Smart Ultra-Normalized, ModHub Pool & Fuzzy Overlap Matching
			if (!isInstalled && depStr) {
				const uDep = ultraNormalize(depStr);

				// 4a. Direct ultra-normalized match against installed titles, files, or technical names
				if (uDep && (installedUltraTitles.has(uDep) || installedUltraFiles.has(uDep) || installedUltraNames.has(uDep))) {
					isInstalled = true;
				}

				// 4b. Pool match: check if the dependency string matches a ModHub entry whose modId is installed
				if (!isInstalled && uDep) {
					const poolMod = poolByCleanTitle[uDep] || pool[uDep] || pool[`file_${uDep}`] || null;
					if (poolMod && (poolMod.modId || poolMod.id)) {
						const cleanPoolId = String(poolMod.modId || poolMod.id).replace(/^0+/, '');
						if (installedIds.has(cleanPoolId)) {
							isInstalled = true;
						}
					}
				}

				// 4c. Word/Substring Containment Overlap for longer names
				if (!isInstalled && uDep.length >= 6) {
					for (const uTitle of installedUltraTitles) {
						if (uTitle.length >= 6 && (uTitle.includes(uDep) || uDep.includes(uTitle))) {
							const ratio = Math.min(uTitle.length, uDep.length) / Math.max(uTitle.length, uDep.length);
							if (ratio > 0.65) {
								isInstalled = true;
								break;
							}
						}
					}
					if (!isInstalled) {
						for (const uFile of installedUltraFiles) {
							if (uFile.length >= 6 && (uFile.includes(uDep) || uDep.includes(uFile))) {
								const ratio = Math.min(uFile.length, uDep.length) / Math.max(uFile.length, uDep.length);
								if (ratio > 0.65) {
									isInstalled = true;
									break;
								}
							}
						}
					}
				}
			}

			if (!isInstalled) {
				const displayDep = typeof dep === 'string' ? dep : (dep.title || dep.modName || dep.fileName || 'Unknown Mod');
				missingDependencies.push({
					mod: mod.title,
					dependency: displayDep,
					modPath: mod.filePath
				});
			}
		}
	}

	const cleanFolders = Array.from(new Set(allFolders)).sort();
	const resultData = { mods: finalMods, dlcs: allDlcs, allFolders: cleanFolders, conflicts, missingDependencies };
	

	// ── PURGE STALE CACHE FOR DELETED DISK FILES ──
	try {
		const cachedEntries = cache.getAllLocalModCache();
		if (Array.isArray(cachedEntries)) {
			const scannedPaths = new Set(finalMods.map(m => m.filePath));
			for (const entry of cachedEntries) {
				if (entry.file_path && !scannedPaths.has(entry.file_path) && !fs.existsSync(entry.file_path)) {
					cache.removeLocalModCache(entry.file_path);
					debugLog(`[SCAN] Purged deleted file from SQLite cache: ${entry.file_path}`);
				}
			}
		}
	} catch (e) {
		console.error('[SCAN] Error purging stale cache entries:', e.message);
	}

	debugLog(`[SCAN] Finished. Total unique mods: ${finalMods.length} (from ${mods.length} physical files)`);
	return resultData;
}

/**
 * Detect script and specialization conflicts across a list of mods.
 */
function detectConflicts(mods) {
	const conflicts = [];

	const specMap = new Map();   // specName -> [{ modTitle, isMap, folder }]

	for (const mod of (mods || [])) {
		const isMapMod = !!(mod.isMap || (mod.category && isMapCategory(mod.category)));

		// Specialization Conflicts
		for (const specName of (mod.specializations || [])) {
			const lowerSpec = specName.toLowerCase();
			if (!specMap.has(lowerSpec)) specMap.set(lowerSpec, []);
			specMap.get(lowerSpec).push({ title: mod.title, modName: mod.modName, isMap: isMapMod, folder: mod.folder || 'MAIN' });
		}
	}

	// Analyze specialization conflicts
	specMap.forEach((entries, specName) => {
		const uniqueMods = [];
		const seenTitles = new Set();
		for (const e of entries) {
			if (!seenTitles.has(e.title)) {
				seenTitles.add(e.title);
				uniqueMods.push(e);
			}
		}

		// Only flag if at least one non-map mod is involved
		const nonMapMods = uniqueMods.filter(m => !m.isMap);
		if (uniqueMods.length > 1 && nonMapMods.length > 0) {
			conflicts.push({
				type: 'specialization',
				name: specName,
				mods: uniqueMods.map(m => m.title),
				modNames: uniqueMods.map(m => m.modName),
				severity: 'critical'
			});
		}
	});

	return conflicts;
}

function checkFreeDiskSpace(targetPath = null, requiredBytes = 0, safetyBufferBytes = 524288000) {
	try {
		const p = targetPath || getModsPath();
		if (p && fs.existsSync(p)) {
			const stats = nodeFs.statfsSync(p);
			const freeBytes = Number(stats.bfree) * Number(stats.bsize);
			
			// If requiredBytes is unknown (0), demand at least 2.5 GB to safely cover massive 4x/16x maps.
			// If requiredBytes is known, demand (requiredBytes * 1.5) + 500 MB buffer for zip extraction & backups.
			const minRequired = requiredBytes > 0 
				? Math.round(requiredBytes * 1.5) + safetyBufferBytes 
				: 2684354560; // 2.5 GB safety default for single unknown mod/map

			if (freeBytes < minRequired) {
				const freeGB = (freeBytes / (1024 ** 3)).toFixed(2);
				const reqGB = (minRequired / (1024 ** 3)).toFixed(2);
				return {
					ok: false,
					freeMB: Math.round(freeBytes / (1024 * 1024)),
					freeGB,
					reqGB,
					error: `Insufficient Disk Space: ${freeGB} GB available on drive, but ${reqGB} GB required for this download.`
				};
			}
		}
	} catch (e) {}
	return { ok: true };
}

/**
	* Internal function for the queue worker to run.
	*/
async function runInstallTask(task) {
	const { modId, modTitle, downloadUrl, onProgress, category, subFolder, techData, oldPath, recoveryPath } = task;
	
	broadcastStatus?.(modId, 'connecting', { title: modTitle, modTitle });
	
	try {
		const result = await installModInternal(modId, modTitle, downloadUrl, onProgress, category, subFolder, techData);
		
		// ── SUCCESS CLEANUP/BACKUP ──
		if (result.success) {
			const modsPath = getModsPath();
			const backupsDir = path.join(modsPath, 'backups');
			const bakPath = oldPath ? path.join(backupsDir, `${path.basename(oldPath)}.bak`) : null;
			
			if (oldPath && fs.existsSync(oldPath)) {
				const fileName = path.basename(oldPath);
				
				if (oldPath !== result.filePath) {
					console.log(`[UPDATE] Filename changed. Moving old version to backup: ${fileName}`);
					try {
						await fs.ensureDir(backupsDir);
						if (bakPath && fs.existsSync(bakPath)) await fs.remove(bakPath);
						await fs.move(oldPath, bakPath);
					} catch (e) { console.warn(`[UPDATE] Failed to move old mod to backup: ${e.message}`); }
				} else {
					if (recoveryPath && fs.existsSync(recoveryPath)) {
						if (bakPath && recoveryPath !== bakPath) {
							console.log(`[UPDATE] Filename same (overwritten). Moving recovery copy to backup: ${fileName}`);
							try {
								await fs.ensureDir(backupsDir);
								if (fs.existsSync(bakPath)) await fs.remove(bakPath);
								await fs.move(recoveryPath, bakPath);
							} catch (e) { console.warn(`[UPDATE] Failed to move recovery copy to backup: ${e.message}`); }
						}
					}
				}
			}

			if (recoveryPath && fs.existsSync(recoveryPath) && recoveryPath !== bakPath) {
				await fs.remove(recoveryPath).catch(() => {});
			}
		}

		broadcastStatus?.(modId, 'success', { title: modTitle, modTitle, fileName: result?.fileName, filePath: result?.filePath, subFolder });
		onProgress?.({ status: 'success', title: modTitle, modTitle, fileName: result?.fileName, filePath: result?.filePath, subFolder });
		return result;
	} catch (err) {
		console.error(`[QUEUE] Task failed for ${modTitle}:`, err);
		try { cache.removePendingDownload(String(modId)); } catch (_) {}
		
		// ── LOW DISK SPACE / ENOSPC PURGE ──
		if (err && (err.code === 'ENOSPC' || (err.message && err.message.toLowerCase().includes('enospc')) || (err.message && err.message.toLowerCase().includes('low disk space')))) {
			console.error(`[QUEUE] DISK EXHAUSTED (ENOSPC). Immediately purging all ${downloadQueue.length} queued items.`);
			while (downloadQueue.length > 0) {
				const purged = downloadQueue.shift();
				try { cache.removePendingDownload(String(purged.modId)); } catch (_) {}
				broadcastStatus?.(purged.modId, 'error');
				purged.onProgress?.({ status: 'error' });
			}
			activeBatchTasks.clear();
		}

		// ── ERROR RECOVERY ──
		if (typeof recoveryPath === 'string' && typeof oldPath === 'string' && fs.existsSync(recoveryPath) && oldPath) {
			console.log(`[UPDATE] Installation failed. Restoring backup for: ${modTitle}`);
			try {
				await fs.ensureDir(path.dirname(oldPath));
				await fs.move(recoveryPath, oldPath, { overwrite: true });
			} catch (e) { console.error(`[UPDATE] Critical: Failed to restore backup: ${e.message}`); }
		}

		broadcastStatus?.(modId, 'error');
		onProgress?.({ status: 'error' });
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
async function enqueueInstall(modId, modTitle, downloadUrl, onProgress, category, subFolder = null, techData = null, oldPath = null, recoveryPath = null) {
	// Check if already in queue or active
	if (activeInstalls.has(modId) || downloadQueue.some(t => t.modId === modId)) {
		return { success: false, error: 'Already in progress or queued' };
	}

	// ── DISK SPACE SAFETY CHECK ──
	const spaceCheck = checkFreeDiskSpace(subFolder ? path.join(getModsPath(), subFolder) : getModsPath());
	if (!spaceCheck.ok) {
		console.warn(`[QUEUE] Refusing to queue ${modTitle}: ${spaceCheck.error}`);
		broadcastStatus?.(modId, 'error');
		return { success: false, error: spaceCheck.error };
	}

	const strModId = String(modId);
	let resolvedTitle = modTitle;
	if (!resolvedTitle || resolvedTitle === `Mod ${strModId}` || resolvedTitle === strModId) {
		const pool = cache.getModHubMetadataPool();
		if (pool[strModId]?.title) {
			resolvedTitle = pool[strModId].title;
		}
	}

	let dependencies = null;
	if (!downloadUrl || !category || !resolvedTitle || resolvedTitle.startsWith('Mod ')) {
		try {
			debugLog(`[QUEUE] Fetching/Completing metadata for ${modId}...`);
			const detail = await scraper.fetchModDetail(modId);
			if (!techData && detail?.techData) techData = detail.techData;
			if (!downloadUrl && detail?.downloadUrl) downloadUrl = detail.downloadUrl;
			if (!category && detail?.category) category = detail.category;
			if (detail?.dependencies) dependencies = detail.dependencies;
			if (detail?.title && (!resolvedTitle || resolvedTitle === `Mod ${strModId}` || resolvedTitle === strModId)) {
				resolvedTitle = detail.title;
			}
		} catch (e) {
			debugLog(`[QUEUE] Scraper failed for ${modId}: ${e.message}`);
		}
	} else {
		scraper.fetchModDetail(modId).then(detail => { 
			techData = detail?.techData || null; 
		}).catch(() => {});
	}

	if (!resolvedTitle || resolvedTitle === `Mod ${strModId}` || resolvedTitle === strModId) {
		const pool = cache.getModHubMetadataPool();
		if (pool[strModId]?.title) {
			resolvedTitle = pool[strModId].title;
		}
	}

	downloadQueue.push({ modId, modTitle: resolvedTitle, downloadUrl, onProgress, category, subFolder, techData, oldPath, recoveryPath });

	// Persist to pending database table so it survives app restarts even before connection starts
	try {
		const targetDir = subFolder ? (path.isAbsolute(subFolder) ? subFolder : path.join(getModsPath(), subFolder)) : getModsPath();
		cache.savePendingDownload({
			mod_id: strModId,
			mod_title: resolvedTitle,
			download_url: downloadUrl || '',
			target_dir: targetDir,
			file_name: null,
			total_bytes: 0,
			received_bytes: 0,
			category: category || null,
			tech_data: techData ? JSON.stringify(techData) : null
		});
	} catch (e) {
		console.warn(`[QUEUE] Failed to save pending download state for ${modId}:`, e.message);
	}

	// Auto-queue required dependencies if available from the initial fetch
	const isMapCat = isMapCategory(category);
	if (isMapCat && Array.isArray(dependencies) && dependencies.length > 0) {
		const pool = cache.getModHubMetadataPool();
		const targetSubFolder = subFolder || getMapSubfolderName(resolvedTitle || modTitle, modId);
		for (const dep of dependencies) {
			let depTitle = typeof dep === 'string' ? dep : (dep.title || dep.modName);
			const depUrl = typeof dep === 'object' ? dep.url : null;
			let depId = typeof dep === 'object' && dep.modId ? String(dep.modId) : null;
			if (!depId && depUrl) {
				const idMatch = depUrl.match(/mod_id=(\d+)/i) || depUrl.match(/storage\/(\d+)\//i);
				if (idMatch) depId = idMatch[1].replace(/^0+/, '');
			}
			if ((!depTitle || depTitle.startsWith('Mod ')) && depId && pool[depId]?.title) {
				depTitle = pool[depId].title;
			}
			if (depId && !activeInstalls.has(depId) && !downloadQueue.some(t => String(t.modId) === depId)) {
				console.log(`[QUEUE] Auto-queueing linked ModHub dependency "${depTitle || `Mod ${depId}`}" (ID: ${depId}) for map "${resolvedTitle}"`);
				enqueueInstall(depId, depTitle, depUrl, onProgress, null, targetSubFolder).catch(() => {});
			}
		}
	}

	broadcastStatus?.(modId, 'queued', { title: resolvedTitle, modTitle: resolvedTitle, category });
	processQueue();

	return { success: true, queued: true };
}


/**
 * Accurately determines if a category string belongs to a map category.
 * Non-map categories like Gameplay, Prefab, Package, Objects, etc. are strictly false.
 */
function isMapCategory(category) {
	if (!category || typeof category !== 'string') return false;
	const c = category.trim().toLowerCase();
	// Any explicit non-map category is strictly false
	if (
		c.includes('gameplay') ||
		c.includes('prefab') ||
		c.includes('package') ||
		c.includes('object') ||
		c.includes('placeable') ||
		c.includes('drivable') ||
		c.includes('trailer') ||
		c.includes('tool') ||
		c.includes('animal') ||
		c.includes('baling') ||
		c.includes('harvest') ||
		c.includes('forestry') ||
		c.includes('grassland') ||
		c.includes('grape') ||
		c.includes('loader') ||
		c.includes('rootcrop') ||
		c.includes('seeding') ||
		c.includes('cultivation') ||
		c.includes('crop') ||
		c.includes('vegetable') ||
		c.includes('yield') ||
		c.includes('misc')
	) {
		return false;
	}
	return /\bmaps?\b/i.test(c);
}

/**
 * Detects if a mod/map is Crossplay compatible.
 */
function isCrossplayMod(modTitle, modId = null, remoteModOrDetail = null) {
	const title = (modTitle || '').toLowerCase();
	if (title.includes('crossplay') || title.includes('(cp)') || title.includes('[cp]')) {
		return true;
	}

	let target = remoteModOrDetail;
	if (!target && modId) {
		const pool = cache.getModHubMetadataPool();
		const cleanId = String(modId).replace(/^0+/, '');
		target = pool[cleanId] || pool[String(modId)] || null;
	}

	if (target) {
		const targetTitle = (target.title || target.modhub_title || '').toLowerCase();
		if (targetTitle.includes('crossplay') || targetTitle.includes('(cp)') || targetTitle.includes('[cp]')) {
			return true;
		}
		const fileName = (target.fileName || target.localFileName || target.file_path || '').toLowerCase();
		if (fileName.includes('crossplay') || fileName.includes('(cp)') || fileName.includes('[cp]')) {
			return true;
		}
	}

	return false;
}

/**
 * Returns clean subfolder name for a mod map, appending ' (CP)' if the map is Crossplay compatible.
 */
function getMapSubfolderName(modTitle, modId = null, remoteModOrDetail = null) {
	let cleanMapFolder = (modTitle || '').replace(/[\\/:*?"<>|]/g, '_').trim();
	if (!cleanMapFolder) return cleanMapFolder;

	const isCrossplay = isCrossplayMod(modTitle, modId, remoteModOrDetail);
	if (isCrossplay) {
		cleanMapFolder = cleanMapFolder.replace(/\s*[\(\[]\s*(?:crossplay|cp)\s*[\)\]]\s*$/i, '')
		                               .replace(/\s+crossplay\s*$/i, '')
		                               .replace(/\s+cp\s*$/i, '')
		                               .trim();
		cleanMapFolder = `${cleanMapFolder} (CP)`.trim();
	}
	return cleanMapFolder;
}

/**
	* We intercept the download event from the session.
	*/
async function installModInternal(modId, modTitle, downloadUrl, onProgress, category, subFolder = null, techData = null) {
	// 1. By default, regular mods (vehicles, trailers, tools, scripts) go directly to the root mods folder
	let isModMap = false;

	// 2. ONLY if the category is confirmed as a Map do we evaluate map routing and subfolders
	if (isMapCategory(category)) {
		const titleClean = (modTitle || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
		const isBaseMap = titleClean.startsWith('mapus') || 
		                  titleClean.startsWith('mapeu') || 
		                  titleClean.startsWith('mapas') || 
		                  titleClean.startsWith('kinlaig') || 
		                  titleClean.startsWith('zielonka') || 
		                  titleClean.startsWith('elmcreek') || 
		                  titleClean.startsWith('riverbend') || 
		                  titleClean.startsWith('hautbeyleron') || 
		                  titleClean.startsWith('erlengrat') || 
		                  titleClean.startsWith('pdlc');
		isModMap = !isBaseMap;
	} else if (!category && modId) {
		const pool = cache.getModHubMetadataPool();
		const cleanId = String(modId).replace(/^0+/, '');
		const target = pool[cleanId] || pool[String(modId)];
		if (target && (isMapCategory(target.category) || target.isMap)) {
			const titleClean = (modTitle || target.title || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
			const isBaseMap = titleClean.startsWith('mapus') || titleClean.startsWith('mapeu') || titleClean.startsWith('pdlc');
			isModMap = !isBaseMap;
		}
	}

	if (isModMap) {
		const cleanMapFolder = getMapSubfolderName(modTitle, modId);
		if (!subFolder) {
			subFolder = cleanMapFolder;
			console.log(`[INSTALL] Custom Mod Map detected ("${cleanMapFolder}"). Auto-assigned to dedicated subfolder: ${subFolder}`);
		}
	} else if (subFolder && !path.isAbsolute(subFolder)) {
		subFolder = null;
	}

	const modsPath = getModsPath();
	if (!modsPath) {
		console.error('[INSTALL] Failed to resolve mods directory path.');
		throw new Error('Mods directory not configured. Please set it in Settings.');
	}
	
	let targetDirPath = modsPath;
	if (subFolder && typeof subFolder === 'string') {
		if (path.isAbsolute(subFolder)) {
			targetDirPath = subFolder;
			console.log(`[INSTALL] Folder Routing: Using absolute path: ${targetDirPath}`);
		} else {
			// Better sanitization that allows path separators (for nested folders) but cleans names
			const sanitized = subFolder.split(/[\\/]/).map(part => 
				part.replace(/[^a-zA-Z0-9_\-\.\s\(\)\[\]]/g, '').trim()
			).filter(part => part && part.length > 0).join(path.sep);

			if (sanitized) {
				targetDirPath = path.join(modsPath, sanitized);
				console.log(`[INSTALL] Folder Routing: Using subfolder "${sanitized}" -> Full path: ${targetDirPath}`);
			}
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

		// ── Step 0: Direct Hand-off (If URL is already known and is a direct download link) ──
		const isDirectZipLink = downloadUrl && (
			downloadUrl.includes('storage/') || 
			downloadUrl.toLowerCase().endsWith('.zip') || 
			downloadUrl.toLowerCase().includes('.zip?') ||
			downloadUrl.includes('download.php')
		) && !downloadUrl.includes('mod.php?');

		const triggerScrapeFallback = () => {
			debugLog(`[SCRAPE-FALLBACK] Fetching fresh mod page link for ${modId}...`);
			broadcastStatus?.(modId, 'handshaking');
			
			scraper.fetchModDetail(modId).then((details) => {
				if (details && details.downloadUrl && (details.downloadUrl.endsWith('.zip') || details.downloadUrl.includes('storage/'))) {
					debugLog(`[INSTALL] Scraper found direct link: ${details.downloadUrl}`);
					broadcastStatus?.(modId, 'starting');
					onProgress?.({ percent: 0, receivedBytes: 0, totalBytes: 0, fileName: 'Initializing...' });
					
					downloadWithNet(modId, details.downloadUrl, targetDirPath, modTitle, onProgress, category, 0, details.techData || techData, modUrl, scraper.getPHPSESSID?.())
						.then(wrappedResolve)
						.catch((err) => {
							if (err.message && err.message.includes('403')) {
								debugLog(`[INSTALL] Scraped link gave 403. Clearing session and retrying once...`);
								scraper.clearSession?.();
								downloadWithNet(modId, details.downloadUrl, targetDirPath, modTitle, onProgress, category, 0, details.techData || techData, modUrl, scraper.getPHPSESSID?.())
									.then(wrappedResolve)
									.catch(wrappedReject);
							} else {
								wrappedReject(err);
							}
						});
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
					headers['Upgrade-Insecure-Requests'] = '1';
					callback({ cancel: false, requestHeaders: headers });
				});

				ses.setUserAgent(chromeUA);

				let resolved = false;
				let didDownload = false;
				let timeout = null;

				const cleanupInternal = () => {
					if (timeout) clearTimeout(timeout);
					if (hiddenWin && !hiddenWin.isDestroyed()) {
						hiddenWin.destroy();
					}
					hiddenWin = null;
				};

				ses.on('will-download', (event, item, webContents) => {
					if (webContents.id !== hiddenWin?.webContents?.id) return;
					didDownload = true;
					if (timeout) clearTimeout(timeout);
					
					const fileName = item.getFilename() || `${modTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
					const savePath = path.join(targetDirPath, fileName);
					const tempPath = `${savePath}.download`;
					
					item.setSavePath(tempPath);
					item.resume();

					activeInstalls.set(String(modId), { 
						type: 'window',
						window: hiddenWin,
						item: item,
						savePath,
						tempPath,
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
						}
					});

					item.once('done', async (event, state) => {
						debugLog(`[INSTALL] Window download done for ${modId}. State: ${state}`);
						if (state === 'completed') {
							// Verify ZIP archive integrity on tempPath without loading gigabytes into RAM
							if (fileName.toLowerCase().endsWith('.zip')) {
								const zipCheck = verifyZipFileIntegrity(tempPath);
								if (!zipCheck.ok) {
									debugLog(`[INSTALL] ZIP verification failed for ${fileName}: ${zipCheck.error}`);
									try { fs.unlinkSync(tempPath); } catch (e) {}
									activeInstalls.delete(String(modId));
									wrappedReject(new Error(`Downloaded ZIP is corrupted or incomplete: ${zipCheck.error}`));
									return;
								}
							}

							// Atomically finalize file from .download to .zip
							try {
								if (fs.existsSync(savePath)) {
									await safeRemove(savePath);
								}
								await fs.move(tempPath, savePath, { overwrite: true });
							} catch (mvErr) {
								wrappedReject(new Error(`Failed to finalize download: ${mvErr.message}`));
								return;
							}

							debugLog(`[INSTALL] Finalized file moved to: ${savePath}`);
							const relativePath = path.relative(getModsPath(), savePath);
							cache.setModTracking(modId, {
								localFileName: relativePath,
								modhubTitle: modTitle,
								category: category,
								techData: techData
							});
							cache.removePendingDownload(String(modId));
							activeInstalls.delete(String(modId));
							cleanupInternal();
							const relFolder = path.relative(getModsPath(), targetDirPath);
							wrappedResolve({ success: true, fileName, filePath: savePath, subFolder: relFolder });
						} else {
							activeInstalls.delete(String(modId));
							cleanupInternal();
							wrappedReject(new Error(`Download ${state}`));
						}
					});
				});

				hiddenWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
					if (errorCode === -3) return; // ABORTED is normal when download starts
					if (resolved) return;
					resolved = true;
					cleanupInternal();
					wrappedReject(new Error(`Page load failed: ${errorDescription}`));
				});

				timeout = setTimeout(() => {
					if (resolved || didDownload) return;
					resolved = true;
					cleanupInternal();
					wrappedReject(new Error('Download timeout - no download started'));
				}, 60000);

				hiddenWin.loadURL(modUrl).catch((err) => {
					if (!resolved && !didDownload) {
						resolved = true;
						cleanupInternal();
						wrappedReject(err);
					}
				});
			});
		};

		if (isDirectZipLink) {
			debugLog(`[INSTALL] Direct Hand-off for ${modId} (URL: ${downloadUrl})`);
			broadcastStatus?.(modId, 'starting');
			onProgress?.({ percent: 0, receivedBytes: 0, totalBytes: 0, fileName: 'Initializing...' });
			
			downloadWithNet(modId, downloadUrl, targetDirPath, modTitle, onProgress, category, 0, techData, modUrl, scraper.getPHPSESSID?.())
				.then(wrappedResolve)
				.catch((directErr) => {
					debugLog(`[INSTALL] Direct URL download failed (${directErr.message}). Refreshing link from ModHub...`);
					if (directErr.message && directErr.message.includes('403')) {
						scraper.clearSession?.();
					}
					triggerScrapeFallback();
				});
			return;
		}

		// URL missing -> trigger scrape fallback
		triggerScrapeFallback();
	});
}

/**
 * Safely verify ZIP archive integrity without buffering entire multi-gigabyte files into RAM.
 * Checks both the start PK header and the End of Central Directory record at the end of the file.
 */
function verifyZipFileIntegrity(filePath) {
	let fd = null;
	try {
		if (!fs.existsSync(filePath)) return { ok: false, error: 'File does not exist' };
		const stats = fs.statSync(filePath);
		if (stats.size < 22) return { ok: false, error: 'ZIP file too small' };
		fd = fs.openSync(filePath, 'r');
		
		// 1. Check PK header at start (first 4 bytes)
		const startBuf = Buffer.alloc(4);
		fs.readSync(fd, startBuf, 0, 4, 0);
		if (startBuf[0] !== 0x50 || startBuf[1] !== 0x4B) {
			return { ok: false, error: 'Invalid ZIP start signature (not a ZIP archive)' };
		}

		// 2. Check End of Central Directory signature in last 65KB (Standard 0x06054b50 or Zip64 0x06064b50)
		const readLen = Math.min(stats.size, 65536 + 22);
		const endBuf = Buffer.alloc(readLen);
		fs.readSync(fd, endBuf, 0, readLen, stats.size - readLen);

		let hasEOCD = false;
		for (let i = 0; i <= readLen - 4; i++) {
			if (endBuf[i] === 0x50 && endBuf[i + 1] === 0x4B && 
			   ((endBuf[i + 2] === 0x05 && endBuf[i + 3] === 0x06) || (endBuf[i + 2] === 0x06 && endBuf[i + 3] === 0x06))) {
				hasEOCD = true;
				break;
			}
		}

		if (!hasEOCD) {
			return { ok: false, error: 'Incomplete or truncated ZIP archive (missing End of Central Directory)' };
		}

		return { ok: true };
	} catch (err) {
		return { ok: false, error: err.message };
	} finally {
		if (fd !== null) {
			try { fs.closeSync(fd); } catch (_) {}
		}
	}
}

/**
 * Incrementally registers and caches a single downloaded mod without triggering a heavy full disk rescan.
 */
async function registerDownloadedFile(savePath, modId, modTitle, category, techData, modVersion) {
	try {
		if (!nodeFs.existsSync(savePath)) return null;
		const stats = nodeFs.statSync(savePath);
		let modDesc = parseModDesc(savePath);
		
		const pool = cache.getModHubMetadataPool();
		const poolItem = modId ? pool[String(modId)] : null;
		const resolvedVersion = modDesc?.version || modVersion || poolItem?.version || '1.0.0.0';
		
		if (!modDesc) {
			modDesc = { 
				title: modTitle || poolItem?.title || path.basename(savePath, '.zip'), 
				version: resolvedVersion,
				author: poolItem?.author || 'Unknown'
			};
		} else if (!modDesc.version || modDesc.version === '1.0.0.0' || modDesc.version === 'Unknown') {
			modDesc.version = resolvedVersion;
		}

		const iconBase64 = await getModIcon(savePath, modDesc.iconFile, modDesc, null, false).catch(() => 'CATEGORY:generic');
		const relativePath = path.relative(getModsPath(), savePath);
		const folder = path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath);
		const cleanFileName = path.basename(savePath);

		// Cache single mod entry
		cache.setLocalModCache(savePath, stats.mtimeMs, stats.size, modDesc, iconBase64, null, 'CATEGORY:skipped');
		cache.setModTracking(modId, {
			localFileName: relativePath,
			modhubTitle: modTitle || poolItem?.title || modDesc.title,
			category: category || poolItem?.category,
			techData: techData,
			localVersion: resolvedVersion,
			remoteVersion: poolItem?.version || resolvedVersion
		});

		// Incrementally update lastScanResult.mods in memory
		if (lastScanResult && Array.isArray(lastScanResult.mods)) {
			const modObj = {
				title: modDesc.title || modTitle || cleanFileName.replace('.zip', ''),
				modName: modDesc.modName || cleanFileName.replace('.zip', ''),
				technicalName: modDesc.techName || '',
				author: modDesc.author || 'Unknown',
				version: resolvedVersion,
				descVersion: modDesc.descVersion || '90',
				category: category || (modDesc.isMap ? 'CATEGORY:map' : 'CATEGORY:generic'),
				folder: folder,
				fileName: cleanFileName,
				filePath: savePath,
				size: stats.size,
				mtime: stats.mtimeMs,
				isDLC: false,
				isMap: !!modDesc.isMap,
				mapId: modDesc.mapId || null,
				mapTitle: modDesc.mapTitle || null,
				modId: modId ? String(modId).replace(/^0+/, '') : null,
				dependencies: modDesc.dependencies || [],
				iconData: iconBase64 && iconBase64.startsWith('CATEGORY:') ? iconBase64 : null
			};
			const existingIdx = lastScanResult.mods.findIndex(m => 
				(modId && m.modId && String(m.modId).replace(/^0+/, '') === String(modId).replace(/^0+/, '')) ||
				(m.fileName && m.fileName.toLowerCase() === cleanFileName.toLowerCase() && (m.folder || '') === folder)
			);
			if (existingIdx !== -1) {
				lastScanResult.mods[existingIdx] = modObj;
			} else {
				lastScanResult.mods.push(modObj);
			}
			console.log(`[INCREMENTAL] Registered "${modObj.title}" in memory without full scan.`);
			return modObj;
		}
	} catch (e) {
		console.warn('[INCREMENTAL] Failed to register mod:', e.message);
	}
	return null;
}

/**
	* Download a file directly using Electron's net module.
*/
function downloadWithNet(modId, url, modsPath, modTitle, onProgress, category, redirectCount = 0, techData = null, refererUrl = null, cookies = null) {
	if (redirectCount > 10) {
		return Promise.reject(new Error('Too many redirects.'));
	}

	try {
		fs.ensureDirSync(modsPath);
	} catch (_) {}

	// ── CHECK FOR RESUMPTION ──
	const pending = cache.getPendingDownloads().find(d => d.mod_id === String(modId));
	let startByte = 0;
	let existingFileName = pending?.file_name;
	
	if (pending && existingFileName) {
		const partPath = path.join(modsPath, `${existingFileName}.download`);
		const legacyPartPath = path.join(modsPath, existingFileName);
		if (fs.existsSync(partPath)) {
			const stats = fs.statSync(partPath);
			startByte = stats.size;
			debugLog(`[HTTPS-DL] [RESUME] Found partial file: ${existingFileName}.download (${(startByte/1024/1024).toFixed(2)}MB)`);
		} else if (fs.existsSync(legacyPartPath)) {
			const stats = fs.statSync(legacyPartPath);
			startByte = stats.size;
			try { fs.renameSync(legacyPartPath, partPath); } catch (e) {}
			debugLog(`[HTTPS-DL] [RESUME] Migrated legacy partial file: ${existingFileName} (${(startByte/1024/1024).toFixed(2)}MB)`);
		}
	}

	return new Promise((resolve, reject) => {
		debugLog(`[HTTPS-DL] Initializing: ${modTitle} (${modId}) ${startByte > 0 ? '[RESUMING]' : ''}`);
		
		let parsedUrl;
		try {
			parsedUrl = new URL(url);
		} catch (urlErr) {
			debugLog(`[HTTPS-DL] Invalid URL for ${modId}: ${url}`);
			return reject(new Error(`Invalid download URL: ${url}`));
		}

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

		let request;
		try {
			request = https.get(options, (response) => {
				// Set socket timeout to prevent hanging on silent connections
				request.setTimeout(45000, () => {
					debugLog(`[HTTPS-DL] Request timed out for ${modId}`);
					try { request.destroy(new Error('Request timed out')); } catch (_) {}
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

				// Handle Expired or Unauthorized download links (HTTP 403 / 404)
				if ((response.statusCode === 403 || response.statusCode === 404) && redirectCount === 0) {
					debugLog(`[HTTPS-DL] Direct link expired (${response.statusCode}). Attempting re-scrape for ${modId}...`);
					return scraper.fetchModDetail(modId).then(details => {
						if (details && details.downloadUrl && details.downloadUrl !== url) {
							return downloadWithNet(modId, details.downloadUrl, modsPath, modTitle, onProgress, category, redirectCount + 1, techData, refererUrl, cookies)
								.then(resolve).catch(reject);
						}
						reject(new Error(`HTTP ${response.statusCode}`));
					}).catch(reject);
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
					const tempPath = `${savePath}.download`;
					if (fs.existsSync(tempPath)) {
						try { fs.moveSync(tempPath, savePath, { overwrite: true }); } catch (e) {}
					}
					resolve({ success: true, fileName: existingFileName, filePath: savePath, size: startByte });
					return;
				}

				const isPartial = response.statusCode === 206;
				const disposition = response.headers['content-disposition'];
				let fileName = existingFileName;
				if (!fileName) {
					// 1. Try to extract from download URL first (ModHub URLs contain the exact filename)
					if (url && url.toLowerCase().includes('.zip')) {
						const urlName = url.split('/').pop().split('?')[0];
						if (urlName && urlName.toLowerCase().endsWith('.zip')) {
							fileName = urlName;
						}
					}

					// 2. Fallback to sanitized title if URL didn't have a filename
					if (!fileName) {
						let sanitized = modTitle.replace(/[^a-zA-Z0-9_]/g, '_');
						// Ensure it doesn't start with a digit (required by GIANTS engine)
						if (/^[0-9]/.test(sanitized)) {
							sanitized = `FS25_${sanitized}`;
						}
						fileName = `${sanitized}.zip`;
					}
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
				const tempPath = `${savePath}.download`;
				const contentLength = parseInt(response.headers['content-length'] || '0', 10);
				const totalBytes = isPartial ? contentLength + startByte : contentLength;
				
				debugLog(`[HTTPS-DL] Starting write to: ${tempPath} (Mode: ${isPartial ? 'APPEND' : 'OVERWRITE'}, Size: ${(totalBytes/1024/1024).toFixed(2)}MB)`);

				// Back up existing file ONLY IF NOT RESUMING
				if (!isPartial && fs.existsSync(savePath)) {
					const bakPath = path.join(modsPath, 'backups', `${fileName}.bak`);
					try {
						fs.ensureDirSync(path.join(modsPath, 'backups'));
						if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
						fs.renameSync(savePath, bakPath);
					} catch (_) {}
				}

				const fileStream = fs.createWriteStream(tempPath, { 
					flags: isPartial ? 'a' : 'w',
					highWaterMark: 2 * 1024 * 1024 // 2MB buffer to prevent constant stream pausing on fast connections
				});
				let receivedBytes = isPartial ? startByte : 0;
				let lastUpdate = 0;
				let lastDbUpdate = 0;
				let lastSpeedBytes = receivedBytes;
				let lastSpeedTime = Date.now();
				let currentSpeed = 0;

				// Initialize tracking in DB if not already present
				if (!pending) {
					try {
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
					} catch (_) {}
				}

				activeInstalls.set(String(modId), { type: 'https', request, fileStream, tempPath, savePath, targetDirPath: modsPath, techData });

				let dlStallTimer = setInterval(() => {
					const now = Date.now();
					if (lastUpdate && now - lastUpdate > 30000 && receivedBytes < totalBytes) {
						// 30 seconds no data
						clearInterval(dlStallTimer);
						try { if (!fileStream.destroyed) fileStream.destroy(); } catch (_) {}
						try { if (!request.destroyed) request.destroy(new Error('Download stalled for 30s')); } catch (_) {}
					}
				}, 5000);

				let isSettled = false;

				response.on('data', (chunk) => {
					if (isSettled || !fileStream || fileStream.destroyed || fileStream.writableEnded) return;
					receivedBytes += chunk.length;
					try {
						if (!fileStream.write(chunk)) {
							if (!response.destroyed) response.pause();
							fileStream.once('drain', () => {
								if (!response.destroyed && !fileStream.destroyed && !isSettled) response.resume();
							});
						}
					} catch (wErr) {
						debugLog(`[HTTPS-DL] Write Error: ${wErr.message}`);
						return;
					}

					const now = Date.now();
					const speedElapsed = (now - lastSpeedTime) / 1000;
					if (speedElapsed >= 1) {
						currentSpeed = Math.round((receivedBytes - lastSpeedBytes) / speedElapsed);
						lastSpeedBytes = receivedBytes;
						lastSpeedTime = now;
					}

					if (totalBytes > 0 && now - lastUpdate > 200) {
						const percent = Math.round((receivedBytes / totalBytes) * 100);
						try {
							onProgress?.({ percent, receivedBytes, totalBytes, fileName, downloadSpeed: currentSpeed });
						} catch (_) {}
						lastUpdate = now;
					}

					// Throttled DB update (every 5 seconds or so)
					if (now - lastDbUpdate > 5000) {
						try {
							cache.updateDownloadProgress(String(modId), receivedBytes);
						} catch (_) {}
						lastDbUpdate = now;
					}
				});

				response.on('end', () => {
					try { if (fileStream && !fileStream.destroyed && !fileStream.writableEnded) fileStream.end(); } catch (_) {}
				});

				response.on('error', (err) => {
					if (isSettled) return;
					isSettled = true;
					clearInterval(dlStallTimer);
					debugLog(`[HTTPS-DL] Response Stream Error: ${err.message}`);
					try { if (fileStream && !fileStream.destroyed) fileStream.destroy(); } catch (_) {}
					activeInstalls.delete(String(modId));
					broadcastStatus?.(modId, 'error');
					reject(err);
				});

				fileStream.on('finish', async () => {
					clearInterval(dlStallTimer);

					// 1. Verify byte count completeness
					if (totalBytes > 0 && receivedBytes < totalBytes) {
						debugLog(`[HTTPS-DL] Incomplete download for ${fileName}: received ${receivedBytes}/${totalBytes} bytes`);
						activeInstalls.delete(String(modId));
						broadcastStatus?.(modId, 'error');
						reject(new Error(`Download incomplete (${(receivedBytes/1024/1024).toFixed(1)}MB / ${(totalBytes/1024/1024).toFixed(1)}MB received)`));
						return;
					}

					// 2. Verify ZIP archive integrity without loading multi-gigabyte files into RAM
					if (fileName.toLowerCase().endsWith('.zip')) {
						const zipCheck = verifyZipFileIntegrity(tempPath);
						if (!zipCheck.ok) {
							debugLog(`[HTTPS-DL] ZIP verification failed for ${fileName}: ${zipCheck.error}`);
							try { fs.unlinkSync(tempPath); } catch (e) {}
							activeInstalls.delete(String(modId));
							broadcastStatus?.(modId, 'error');
							reject(new Error(`Downloaded ZIP is corrupted or incomplete: ${zipCheck.error}`));
							return;
						}
					}

					// Atomically finalize file from .download to .zip
					try {
						if (fs.existsSync(savePath)) {
							await safeRemove(savePath);
						}
						await fs.move(tempPath, savePath, { overwrite: true });
					} catch (mvErr) {
						debugLog(`[HTTPS-DL] Failed to finalize file ${fileName}: ${mvErr.message}`);
						reject(new Error(`Failed to finalize download: ${mvErr.message}`));
						return;
					}

					debugLog(`[HTTPS-DL] Success & Verified: ${fileName}`);
					
					// Final Tracking and Incremental Ingestion
					try {
						await registerDownloadedFile(savePath, modId, modTitle, category, techData);
					} catch (_) {}

					// Remove from pending
					try { cache.removePendingDownload(String(modId)); } catch (_) {}
					activeInstalls.delete(String(modId));
					const relFolder = path.relative(getModsPath(), modsPath);
					resolve({ success: true, fileName, filePath: savePath, size: receivedBytes, subFolder: relFolder });
				});

				fileStream.on('error', (err) => {
					clearInterval(dlStallTimer);
					debugLog(`[HTTPS-DL] Stream Error: ${err.message}`);
					try { if (response && !response.destroyed) response.destroy(); } catch (_) {}
					try { if (!fileStream.destroyed) fileStream.destroy(); } catch (_) {}
					activeInstalls.delete(String(modId));
					broadcastStatus?.(modId, 'error');
					reject(err);
				});
			});

			request.on('error', (err) => {
				debugLog(`[HTTPS-DL] Request Error: ${err.message}`);
				activeInstalls.delete(String(modId));
				broadcastStatus?.(modId, 'error');
				reject(err);
			});

			request.setTimeout(60000, () => {
				debugLog(`[HTTPS-DL] Socket timeout for ${modTitle} (${modId})`);
				try { request.destroy(new Error('Connection timeout. Please try again later.')); } catch (_) {}
			});
		} catch (reqErr) {
			debugLog(`[HTTPS-DL] Request initialization error: ${reqErr.message}`);
			activeInstalls.delete(String(modId));
			broadcastStatus?.(modId, 'error');
			reject(reqErr);
		}
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

	const allPaths = getModsPaths();
	const baseName = path.basename(modFileName);
	let fullPath = null;

	// 1. Check if modFileName is an absolute path or matches directly across all configured mod roots
	for (const p of allPaths) {
		const candidate1 = path.join(p, modFileName);
		const candidate2 = folder ? path.join(p, folder, baseName) : candidate1;
		if (fs.existsSync(candidate2)) {
			fullPath = candidate2;
			break;
		}
		if (fs.existsSync(candidate1)) {
			fullPath = candidate1;
			break;
		}
	}

	if (!fullPath) {
		fullPath = await findModPath(baseName);
	}

	if (!fullPath || !fs.existsSync(fullPath)) {
		// Clean up DB cache even if file was already removed from disk
		cache.removeModTrackingByFile(baseName);
		if (folder) cache.removeModTrackingByFile(`${folder}/${baseName}`);
		clearScanCache();
		return { success: true, fileName: modFileName, note: 'File was already removed from disk' };
	}

	// 1. Check if game is running (Windows lock protection)
	if (await gameLauncher.isGameRunning()) {
		return { success: false, error: 'Cannot delete: Farming Simulator 25 is currently running. Please close the game first.' };
	}
	
	try {
		await safeRemove(fullPath);
		
		// 2. CLEANUP DB TRACKING & CACHE
		cache.removeModTrackingByFile(baseName);
		if (folder) cache.removeModTrackingByFile(`${folder}/${baseName}`);
		cache.removeLocalModCache(fullPath);
		
		clearScanCache();
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
				
				if (detail) {
					// 1. Prevent false matches by comparing author name
					const cleanAuthorName = (name) => name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
					const detailAuth = cleanAuthorName(detail.author);
					const modAuth = cleanAuthorName(mod.author);
					if (detailAuth && modAuth && !detailAuth.includes(modAuth) && !modAuth.includes(detailAuth)) {
						console.log(`[SYNC] Author mismatch for ${mod.title}: remote '${detail.author}' vs local '${mod.author}'. Skipping.`);
						continue;
					}

					// 2. Prevent false matches by comparing filename bases
					if (detail.fileName && mod.fileName) {
						const getBaseName = (str) => {
							if (!str) return '';
							const match = str.match(/([^/\\]+)\.zip$/i) || [null, str];
							return match[1].replace(/^(?:fs25|fs22|pdlc)_/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
						};
						const detailFile = getBaseName(detail.fileName);
						const localFile = getBaseName(mod.fileName);
						if (detailFile && localFile && detailFile !== localFile) {
							console.log(`[SYNC] Filename mismatch for ${mod.title}: remote '${detail.fileName}' vs local '${mod.fileName}'. Skipping.`);
							continue;
						}
					}
				}

				let modhubTitle = detail?.title || mod.title;
				const isMapResult = isMapCategory(detail?.category);

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
		const versionManager = require('./versionManager');
		const updates = await versionManager.checkAllUpdates();
		return { updates: updates || [] };
	} catch (err) {
		console.error('[UPDATES] Version check failed:', err);
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
	const backupsDir = path.join(modsPath, 'backups');
	const backupPath = path.join(backupsDir, `${path.basename(originalPath)}.bak`);
	
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
		
		// 3. Backup the old version to dedicated backups directory
		if (fs.existsSync(originalPath)) {
			await fs.ensureDir(backupsDir);
			if (fs.existsSync(backupPath)) await fs.remove(backupPath);
			await fs.copy(originalPath, backupPath);
		}
		
		// 4. Download and install (respecting subFolder)
		// We pass originalPath and backupPath to the queue so it can handle cleanup/backup AFTER completion.
		const updateTitle = detail?.title || modFileName.replace('.zip', '');
		const result = await installMod(modId, updateTitle, directUrl, onProgress, category, subFolder, detail?.techData, originalPath, backupPath);
		
		if (result && result.success && detail?.version) {
			try {
				cache.setModTracking(String(modId), {
					localFileName: modFileName,
					localVersion: detail.version,
					remoteVersion: detail.version,
					modhubTitle: updateTitle
				});
				console.log(`[UPDATE] Mod ${modId} tracking record updated: version ${detail.version}`);
			} catch (e) {
				console.warn('[UPDATE] Failed to save tracking record:', e);
			}
		}

		return result;
	} catch (err) {
		// Restore backup on failure
		const legacyBackupPath = originalPath + '.bak';
		const bakToRestore = fs.existsSync(backupPath) ? backupPath : (fs.existsSync(legacyBackupPath) ? legacyBackupPath : null);
		if (bakToRestore && fs.existsSync(bakToRestore)) {
			// Ensure directory exists for restore if it was deleted
			await fs.ensureDir(path.dirname(originalPath));
			await fs.move(bakToRestore, originalPath, { overwrite: true });
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
		// Run deduplication first to convert any physical duplicate files in subfolders into hard links
		await deduplicateSubfolderMods(primaryPath);

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
					// Root file exists and is NOT a link. If targetPath in subfolder is also a physical file, convert root file to link!
					const targetStats = await fs.lstat(targetPath).catch(() => null);
					if (targetStats && !targetStats.isSymbolicLink()) {
						console.log(`[MIRROR] Converting physical duplicate root file ${modName} to link pointing to ${targetPath}`);
						await fs.remove(mirrorPath);
						shouldCreate = true;
					} else {
						console.warn(`[MIRROR] Name conflict: Root file ${modName} exists and is NOT a link. Skipping mirror.`);
					}
				}
			}

			if (shouldCreate) {
				try {
					const targetStats = await fs.lstat(targetPath);
					const isDir = targetStats.isDirectory();
					if (!isDir) {
						// Try hardlink first for files (0 bytes extra disk space, no admin rights required!)
						try {
							await fs.link(targetPath, mirrorPath);
							console.log(`[MIRROR] Created HARDLINK: ${modName} -> ${targetPath}`);
						} catch (hErr) {
							await fs.symlink(targetPath, mirrorPath, 'file');
							console.log(`[MIRROR] Created SYMLINK: ${modName} -> ${targetPath}`);
						}
					} else {
						await fs.symlink(targetPath, mirrorPath, 'junction');
						console.log(`[MIRROR] Created JUNCTION: ${modName} -> ${targetPath}`);
					}
				} catch (e) {
					console.error(`[MIRROR] Failed to create link for ${modName}: ${e.message}`);
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
	return new Promise((resolve) => {
		let finished = false;
		const wrappedProgress = (p) => {
			try { onProgress?.(p); } catch (_) {}
			if (p && (p.status === 'success' || p.status === 'installed')) {
				if (!finished) { 
					finished = true; 
					resolve({ success: true }); 
				}
			} else if (p && (p.status === 'error' || p.status === 'failed')) {
				if (!finished) { 
					finished = true; 
					resolve({ success: false, error: p.message || 'Download failed' }); 
				}
			}
		};

		enqueueInstall(modId, modTitle, downloadUrl, wrappedProgress, category, subFolder, techData, oldPath, recoveryPath)
			.then((res) => {
				if (res && !res.success) {
					if (!finished) { 
						finished = true; 
						resolve(res); 
					}
				}
			})
			.catch((err) => {
				if (!finished) { 
					finished = true; 
					resolve({ success: false, error: err.message }); 
				}
			});
	});
}

/**
	* Cancel an active installation.
*/
async function cancelInstall(modId) {
	const strModId = String(modId);
	const cleanModId = strModId.replace(/^0+/, '');

	// Always remove from pending downloads table so it won't re-appear on next launch
	try { 
		cache.removePendingDownload(strModId); 
		cache.removePendingDownload(cleanModId); 
	} catch (_) {}

	// 1. Check if it's in the queue but not yet active (or any child tasks spawned by this parent)
	for (let i = downloadQueue.length - 1; i >= 0; i--) {
		const t = downloadQueue[i];
		const tid = String(t.modId || '');
		const pid = String(t.parentId || '');
		if (tid === strModId || tid.replace(/^0+/, '') === cleanModId || pid === strModId || pid === cleanModId) {
			const removed = downloadQueue.splice(i, 1)[0];
			console.log(`[CANCEL] Removed from queue: ${removed.modTitle || removed.modId}`);
			broadcastStatus?.(removed.modId, 'cancelled');
		}
	}

	// 2. Check active installs
	let activeKey = null;
	for (const [key, val] of activeInstalls.entries()) {
		if (key === strModId || key.replace(/^0+/, '') === cleanModId) {
			activeKey = key;
		} else if (val && (String(val.parentId) === strModId || String(val.parentId) === cleanModId)) {
			// Cancel child active install
			try {
				if (val.type === 'window' && val.item) val.item.cancel();
				if (val.fileStream && !val.fileStream.destroyed) val.fileStream.destroy();
				if (val.request && !val.request.destroyed) val.request.destroy();
			} catch (_) {}
			activeInstalls.delete(key);
			broadcastStatus?.(key, 'cancelled');
		}
	}

	if (activeBatchTasks.has(modId) || activeBatchTasks.has(cleanModId)) {
		console.log(`[CANCEL] Terminating batch loop for parent: ${modId}`);
		activeBatchTasks.delete(modId);
		activeBatchTasks.delete(cleanModId);
	}

	if (!activeKey) {
		console.log(`[CANCEL] Task not found in active or queue for ${modId}, confirming cancellation.`);
		broadcastStatus?.(modId, 'cancelled');
		return { success: true };
	}

	const task = activeInstalls.get(activeKey);
	console.log(`[CANCEL] Cancelling download for mod: ${modId} (Key: ${activeKey})`);

	try {
		if (task.type === 'window') {
			try {
				if (task.item && !task.item.isPaused()) task.item.pause();
				if (task.item) task.item.cancel();
				if (task.window && !task.window.isDestroyed()) {
					setImmediate(() => {
						if (!task.window.isDestroyed()) task.window.close();
					});
				}
			} catch (e) {
				console.warn('[CANCEL] Window cleanup warning:', e.message);
			}
		} else if (task.type === 'net' || task.type === 'https') {
			try {
				if (task.request) {
					if (typeof task.request.destroy === 'function') task.request.destroy();
					else if (typeof task.request.abort === 'function') task.request.abort();
				}
				if (task.response && typeof task.response.destroy === 'function') task.response.destroy();
				if (task.fileStream && typeof task.fileStream.destroy === 'function') task.fileStream.destroy();
			} catch (e) {
				console.warn('[CANCEL] Net cleanup warning:', e.message);
			}
		}

		activeInstalls.delete(activeKey);
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
						const modsPath = getModsPath();
						const fileName = path.basename(task.savePath);
						const dedicatedBakPath = path.join(modsPath, 'backups', `${fileName}.bak`);
						const legacyBakPath = task.savePath + '.bak';
						const bakPath = fs.existsSync(dedicatedBakPath) ? dedicatedBakPath : (fs.existsSync(legacyBakPath) ? legacyBakPath : null);

						if (bakPath && fs.existsSync(bakPath)) {
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
async function moveModsToFolder(fileNames, destinationFolder, targetRootPath = null) {
	if (!Array.isArray(fileNames)) {
		console.error('[MOVE] TypeError: fileNames is not an array. Received:', typeof fileNames, fileNames);
		return { success: false, error: 'Invalid file list' };
	}

	const allModsPaths = getModsPaths();
	const modsPath = targetRootPath || allModsPaths[0]; // Target root or Primary
	
	if (!modsPath) {
		console.error('[MOVE] No mod paths detected!');
		return { success: false, error: 'No mod paths detected' };
	}

	// 0. Check if game is running (Windows lock protection)
	if (await gameLauncher.isGameRunning()) {
		return { success: false, error: 'Cannot move mods: Farming Simulator 25 is currently running. Please close the game first.' };
	}

	const destDir = destinationFolder === '' ? modsPath : path.join(modsPath, destinationFolder);
	debugLog(`[MOVE] Moving ${fileNames.length} mods. Target Root: ${modsPath}, Dest: ${destDir}`);
	
	if (!await fs.pathExists(destDir)) {
		await fs.ensureDir(destDir);
	}
	
	// ── ROBUST SOURCE FILE LOCATION INDEXING ──
	const locationIndex = new Map(); // Lowercase Name -> Full Path
	const destDirNorm = path.normalize(destDir).toLowerCase();

	for (const fileName of fileNames) {
		const lower = fileName.toLowerCase();
		const baseName = path.basename(fileName);
		const destFileNorm = path.normalize(path.join(destDir, baseName)).toLowerCase();

		let candidate = null;

		// 1. Search all configured mod paths, prioritizing files outside of destDir (source files)
		for (const p of allModsPaths) {
			const candidate1 = path.join(p, fileName);
			const candidate2 = destinationFolder ? path.join(p, destinationFolder, baseName) : candidate1;
			const candidate3 = path.join(p, baseName);
			
			for (const cand of [candidate1, candidate2, candidate3]) {
				if (await fs.pathExists(cand)) {
					const stats = await fs.lstat(cand).catch(() => null);
					if (stats && !stats.isSymbolicLink()) {
						const candNorm = path.normalize(cand).toLowerCase();
						if (candNorm !== destFileNorm) {
							candidate = cand;
							break;
						} else if (!candidate) {
							candidate = cand;
						}
					}
				}
			}
			if (candidate && path.normalize(candidate).toLowerCase() !== destFileNorm) break;
		}

		// 2. Check cache if not found
		if (!candidate) {
			const cachedMods = cache.getAllLocalModCache();
			if (Array.isArray(cachedMods)) {
				const cached = cachedMods.find(m => path.basename(m.file_path).toLowerCase() === lower);
				if (cached && await fs.pathExists(cached.file_path)) {
					candidate = cached.file_path;
				}
			}
		}

		// 3. Fallback findModPath
		if (!candidate) {
			candidate = await findModPath(baseName);
		}

		if (candidate) {
			locationIndex.set(lower, candidate);
		}
	}
	
	debugLog(`[MOVE] Preparation complete. Indexed ${locationIndex.size} mod files.`);

	let completed = 0;
	const total = fileNames.length;
	const errors = [];
	const cacheUpdates = []; // { oldLoc, newLoc, oldRel, newRel }

	if (total === 0) return { success: false, completed: 0, total: 0, error: 'No files to move' };

	// Initial broadcast
	if (broadcastStatus) {
		broadcastStatus('move:progress', {
			current: 0,
			total: total,
			percent: 0,
			status: 'starting'
		});
	}

	const modifiedSourceDirs = new Set();
	for (let i = 0; i < total; i++) {
		const fileName = fileNames[i];
		const lowerName = fileName.toLowerCase();
		const currentLoc = locationIndex.get(lowerName);

		const fileIndex = i + 1;

		// Broadcast progress when file starts moving
		if (broadcastStatus) {
			broadcastStatus('move:progress', {
				current: i,
				total: total,
				fileIndex: fileIndex,
				percent: Math.round((i / total) * 85),
				currentFile: fileName,
				status: 'copying',
				label: `Transferring file ${fileIndex} of ${total}: "${fileName}"`
			});
		}

		if (currentLoc) {
			const baseName = path.basename(fileName);
			const destPath = path.join(destDir, baseName);

			// Skip if already at destination
			if (currentLoc.toLowerCase() === destPath.toLowerCase()) {
				completed++;
			} else {
				try {
					await fs.ensureDir(path.dirname(destPath));
					await safeMove(currentLoc, destPath, { overwrite: true });
					modifiedSourceDirs.add(path.dirname(currentLoc));

					const oldRelative = path.relative(modsPath, currentLoc).replace(/\\/g, '/');
					const newRelative = destinationFolder === '' ? baseName : `${destinationFolder}/${baseName}`;
					cacheUpdates.push({ currentLoc, destPath, oldRelative, newRelative });
					completed++;
				} catch (e) {
					console.error(`[MOVE] Failed to move ${fileName}:`, e.message);
					errors.push({ file: fileName, error: e.message });
				}
			}
		} else {
			errors.push({ file: fileName, error: 'File not found on disk' });
		}

		// Broadcast progress after file completes
		if (broadcastStatus) {
			broadcastStatus('move:progress', {
				current: completed,
				total: total,
				fileIndex: fileIndex,
				percent: Math.round((completed / total) * 85),
				currentFile: fileName,
				status: 'done',
				label: `Copied file ${fileIndex} of ${total}: "${fileName}"`
			});
		}
	}

	// Broadcast finalizing status before database and mirror operations
	if (broadcastStatus) {
		broadcastStatus('move:progress', {
			current: completed,
			total: total,
			percent: 92,
			currentFile: null,
			status: 'finalizing',
			label: 'Finalizing database and re-indexing mods...'
		});
	}

	// Apply batched cache updates
	if (cacheUpdates.length > 0) {
		debugLog(`[MOVE] Applying ${cacheUpdates.length} database updates...`);
		for (const update of cacheUpdates) {
			cache.setModLocation(update.currentLoc, update.destPath, update.oldRelative, update.newRelative);
		}
	}

	// Clean up abandoned empty source directories left after moving mods
	for (const srcDir of modifiedSourceDirs) {
		try {
			const isRoot = allModsPaths.some(p => p.toLowerCase() === srcDir.toLowerCase());
			if (!isRoot && await fs.pathExists(srcDir)) {
				const entries = await fs.readdir(srcDir, { withFileTypes: true });
				const hasMods = entries.some(e => 
					(!e.isSymbolicLink() && e.isFile() && e.name.toLowerCase().endsWith('.zip')) ||
					(e.isDirectory() && e.name.toLowerCase() !== 'backups' && !e.name.startsWith('.'))
				);
				if (!hasMods) {
					await safeRemove(srcDir);
					debugLog(`[MOVE] Cleaned up abandoned empty source directory: ${srcDir}`);
				}
			}
		} catch (e) {
			console.warn(`[MOVE] Failed to clean up empty source directory ${srcDir}:`, e.message);
		}
	}

	const finalResult = { 
		success: completed > 0 && errors.length === 0, 
		completed, 
		total, 
		errors,
		skipped: total - completed - errors.length
	};

	debugLog(`[MOVE] Finished. Completed: ${completed}, Errors: ${errors.length}, Total: ${total}`);

	// Invalidate scan cache so subsequent scanLocalMods reflects new physical locations
	clearScanCache();

	// TRIGGER MIRROR SYNC (Async)
	syncMirrorLinks(modsPath).catch(err => console.error('[MIRROR] Auto-sync failed:', err));

	if (broadcastStatus) {
		broadcastStatus('move:progress', {
			current: completed,
			total: total,
			percent: 100,
			currentFile: null,
			status: 'complete',
			label: 'Migration complete!'
		});
	}

	return finalResult;
}

/**
 * Move all mods from a folder/subfolder to a specific target root/drive.
 */
async function moveFolderToDrive(sourceFolderName, targetRootPath, targetFolderName = null, explicitFileNames = null) {
	if (sourceFolderName === undefined || sourceFolderName === null) {
		return { success: false, error: 'Source folder name is required' };
	}

	const allPaths = getModsPaths();
	const destRoot = targetRootPath || allPaths[0];
	if (!destRoot) {
		return { success: false, error: 'Target root directory not found' };
	}
	const destFolderName = (targetFolderName !== null && targetFolderName !== undefined) ? targetFolderName : sourceFolderName;

	if (await gameLauncher.isGameRunning()) {
		return { success: false, error: 'Cannot move mods: Farming Simulator 25 is currently running. Please close the game first.' };
	}

	let uniqueFiles = [];
	if (Array.isArray(explicitFileNames) && explicitFileNames.length > 0) {
		uniqueFiles = [...new Set(explicitFileNames)];
	} else {
		// Scan all configured mod paths for files belonging to this subfolder
		const filesToMove = [];
		for (const p of allPaths) {
			const folderDir = sourceFolderName === '' ? p : path.join(p, sourceFolderName);
			if (await fs.pathExists(folderDir)) {
				try {
					const entries = await fs.readdir(folderDir, { withFileTypes: true });
					for (const entry of entries) {
						if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
							filesToMove.push(entry.name);
						} else if (entry.isDirectory() && await fs.pathExists(path.join(folderDir, entry.name, 'modDesc.xml'))) {
							filesToMove.push(entry.name);
						}
					}
				} catch (e) {}
			}
		}

		// Also check cache for mods with this folder name or map title
		const cachedMods = cache.getAllLocalModCache();
		if (Array.isArray(cachedMods)) {
			for (const mod of cachedMods) {
				const base = path.basename(mod.file_path);
				const modFolder = mod.folder || '';
				const modTitle = (mod.title || '').replace(/\([^)]+\)/g, '').trim();
				if (modFolder === sourceFolderName || (mod.is_map && modTitle === sourceFolderName)) {
					filesToMove.push(base);
				}
			}
		}

		uniqueFiles = [...new Set(filesToMove)];
	}

	if (uniqueFiles.length === 0) {
		return { success: false, completed: 0, total: 0, error: `No physical mod files found for "${sourceFolderName || 'MAIN'}" to move.` };
	}

	const result = await moveModsToFolder(uniqueFiles, destFolderName, destRoot);

	// Clean up duplicate source files and empty directories on non-target roots
	if (sourceFolderName !== '') {
		for (const p of allPaths) {
			if (p.toLowerCase() !== destRoot.toLowerCase()) {
				const sourceDir = path.join(p, sourceFolderName);
				try {
					if (await fs.pathExists(sourceDir)) {
						for (const file of uniqueFiles) {
							const fPath = path.join(sourceDir, file);
							if (await fs.pathExists(fPath)) {
								const stats = await fs.lstat(fPath).catch(() => null);
								if (stats && !stats.isSymbolicLink()) {
									await safeRemove(fPath);
								}
							}
						}
						const remaining = await fs.readdir(sourceDir);
						const validRemaining = remaining.filter(f => f !== 'backups');
						if (validRemaining.length === 0) {
							await safeRemove(sourceDir);
						}
					}

					// Also check if any loose files were in the root of source drive
					for (const file of uniqueFiles) {
						const rootFilePath = path.join(p, file);
						if (await fs.pathExists(rootFilePath)) {
							const stats = await fs.lstat(rootFilePath).catch(() => null);
							if (stats && !stats.isSymbolicLink()) {
								await safeRemove(rootFilePath);
							}
						}
					}
				} catch (e) {}
			}
		}
	}

	return result;
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
        const pfFlags = buffer.readUInt32LE(80); // PixelFormat flags
        const pfFourCC = buffer.toString('utf8', 84, 88); // Direct DXT indicator
        let format = 'rgba';
        let dataOffset = 128;
        if (pfFourCC === 'DX10' && buffer.length >= 148) {
            dataOffset = 148;
            const dxgiFormat = buffer.readUInt32LE(128);
            if (dxgiFormat === 71 || dxgiFormat === 72) format = 'dxt1';
            else if (dxgiFormat === 74 || dxgiFormat === 75) format = 'dxt3';
            else if (dxgiFormat === 77 || dxgiFormat === 78) format = 'dxt5';
            else if (dxgiFormat === 98 || dxgiFormat === 99) format = 'bc7';
        } else if (pfFlags & 0x4) { // DDPF_FOURCC
            if (pfFourCC === 'DXT1') format = 'dxt1';
            else if (pfFourCC === 'DXT3') format = 'dxt3'; // Limited support
            else if (pfFourCC === 'DXT5') format = 'dxt5';
		}
        return { width, height, type: 'dds', format, dataOffset };
	}
    
    return null;
}

/**
	* Minimal DXT1/DXT5 decoder to translate binary DDS data to raw RGBA.
*/
function decodeDDS(buffer, width, height, format, dataOffset = 128) {
    if (!buffer || !Buffer.isBuffer(buffer) || width <= 0 || height <= 0 || width > 4096 || height > 4096) {
        return null;
    }
    const safeWidth = Math.min(width, 2048);
    const safeHeight = Math.min(height, 2048);
    const rgba = Buffer.alloc(safeWidth * safeHeight * 4);
    let offset = dataOffset;
	
    const decode565 = (val) => {
        const r = (val >> 11) & 0x1F;
        const g = (val >> 5) & 0x3F;
        const b = val & 0x1F;
        return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
	};
	
    const blockSize = (format === 'dxt5' ? 16 : 8);

    for (let y = 0; y < safeHeight; y += 4) {
        for (let x = 0; x < safeWidth; x += 4) {
            if (offset + blockSize > buffer.length) {
                return rgba;
            }

            let colors = [];
            let alphaBlocks = null;
			
            if (format === 'dxt5') {
                alphaBlocks = buffer.slice(offset, offset + 8);
                offset += 8;
			}
			
            const c0 = buffer.readUInt16LE(offset);
            const c1 = buffer.readUInt16LE(offset + 2);
            const lookup = buffer.readUInt32LE(offset + 4);
            offset += 8;
			
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
                    
                    if (format === 'dxt5' && alphaBlocks && alphaBlocks.length >= 8) {
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
                    const py = y + j;
                    
                    if (px < safeWidth && py >= 0 && py < safeHeight) {
						const rgbaIdx = (py * safeWidth + px) * 4;
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

		let normalizedIcon = iconFile ? iconFile.replace(/\\/g, '/') : null;
		
		// If iconFile was not passed in, attempt to auto-detect iconFilename from modDesc.xml
		if (!normalizedIcon && filePath && fs.existsSync(filePath)) {
			try {
				let xmlStr = null;
				if (filePath.endsWith('.zip')) {
					const buf = readEntryFromZip(filePath, 'modDesc.xml');
					if (buf) xmlStr = buf.toString('utf8');
				} else {
					const xmlPath = path.join(filePath, 'modDesc.xml');
					if (fs.existsSync(xmlPath)) xmlStr = fs.readFileSync(xmlPath, 'utf8');
				}
				if (xmlStr) {
					xmlStr = xmlStr.replace(/<!--[\s\S]*?-->/g, '');
					let raw = (
						(xmlStr.match(/<iconFilename[^>]*>([\s\S]*?)<\/iconFilename>/i) || [])[1] ||
						(xmlStr.match(/<icon[^>]+filename=["']([^"']+)["']/i) || [])[1] ||
						(xmlStr.match(/<icon[^>]*>([\s\S]*?)<\/icon>/i) || [])[1] ||
						''
					).trim();
					if (raw.includes('<')) raw = raw.replace(/<[^>]*>/g, '').trim();
					if (raw) normalizedIcon = raw.replace(/\\/g, '/');
				}
			} catch (e) {}
		}
		
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
			return 'CATEGORY:generic';
		};

		if (filePath.endsWith('.zip')) {
			const entries = listZipEntries(filePath);
			let entry = null;

			// 1. Primary: Search for exact filename of normalizedIcon
			if (!entry && normalizedIcon) {
				entry = entries.find(e => e.entryName.toLowerCase() === normalizedIcon.toLowerCase());
			}
			
			// 2. Secondary: Search for basename match (ignoring extension) or matching basename anywhere
			if (!entry && normalizedIcon) {
				const iconBaseWithExt = path.basename(normalizedIcon).toLowerCase();
				const iconBaseNoExt = iconBaseWithExt.split('.')[0];
				
				entry = entries.find(e => {
					const name = path.basename(e.entryName).toLowerCase();
					return name === iconBaseWithExt || name === iconBaseNoExt + '.dds' || name === iconBaseNoExt + '.png' || name === iconBaseNoExt + '.jpg';
				}) || entries.find(e => e.entryName.toLowerCase().endsWith('/' + iconBaseWithExt) || e.entryName.toLowerCase().endsWith('/' + iconBaseNoExt + '.dds') || e.entryName.toLowerCase().endsWith('/' + iconBaseNoExt + '.png'));
			}

			// 3. Store Priority (if enabled)
			if (!entry && prioritizeStore) {
				entry = entries.find(e => {
					const n = e.entryName.toLowerCase();
					return (n.startsWith('store_') && (n.endsWith('.dds') || n.endsWith('.png'))) && !n.includes('/');
				}) || entries.find(e => {
					const n = e.entryName.toLowerCase();
					return n === 'store.png' || n === 'store.dds' || n === 'shop.png' || n === 'shop.dds';
				});
			}

			// 4. Icon Priority (if not store)
			if (!entry) {
				entry = entries.find(e => {
					const n = e.entryName.toLowerCase();
					return (n.startsWith('icon_') && (n.endsWith('.dds') || n.endsWith('.png'))) && !n.includes('/');
				});
			}
			
			// 5. Common Icon Filenames
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
					for (const cand of candidates.slice(0, 5)) {
						try {
							const buffer = readEntryFromZip(filePath, cand.entryName);
							if (buffer) {
								const dims = getImageDimensions(buffer);
								if (dims && dims.width === 512 && dims.height === 512) {
									bestMatch = cand;
									break;
								}
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
				const buffer = readEntryFromZip(filePath, entry.entryName);
				if (!buffer) return getCategoryFallback(entries);
				const info = getImageDimensions(buffer);
				let nativeImage = null;
				try {
					const electron = require('electron');
					if (electron && typeof electron === 'object' && electron.nativeImage) {
						nativeImage = electron.nativeImage;
					}
				} catch (e) {}

				if (info && info.type === 'dds' && (info.format === 'dxt1' || info.format === 'dxt5') && nativeImage) {
					try {
						const safeWidth = Math.min(info.width, 2048);
						const safeHeight = Math.min(info.height, 2048);
						const rgba = decodeDDS(buffer, safeWidth, safeHeight, info.format, info.dataOffset);
						if (rgba && Buffer.isBuffer(rgba) && rgba.length === safeWidth * safeHeight * 4) {
							let img = nativeImage.createFromBitmap(rgba, { width: safeWidth, height: safeHeight });
							if (img && !img.isEmpty()) {
								const size = img.getSize();
								if (size.width > 512 || size.height > 512) {
									img = img.resize({ width: 512, height: 512, quality: 'good' });
								}
								return img.toDataURL();
							}
						}
					} catch (e) {
						console.error('[DDS] Render failed:', e.message);
					}
				}
				
				const ext = path.extname(entry.entryName).replace('.', '').toLowerCase() || 'png';
				if (ext === 'dds') {
					// Fallback search for PNG/JPG alternative in zip before category
					const altPng = entries.find(e => {
						const n = e.entryName.toLowerCase();
						return (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) && !n.includes('textures');
					});
					if (altPng) {
						try {
							const altBuffer = readEntryFromZip(filePath, altPng.entryName);
							if (altBuffer) {
								if (nativeImage) {
									let img = nativeImage.createFromBuffer(altBuffer);
									if (img && !img.isEmpty()) {
										const size = img.getSize();
										if (size.width > 512 || size.height > 512) {
											img = img.resize({ width: 512, height: 512, quality: 'good' });
										}
										return img.toDataURL();
									}
								}
								const altExt = path.extname(altPng.entryName).replace('.', '').toLowerCase() || 'png';
								return `data:image/${altExt === 'jpg' ? 'jpeg' : altExt};base64,${altBuffer.toString('base64')}`;
							}
						} catch (e) {}
					}
					return getCategoryFallback(entries);
				}
				// Don't return tiny images (likely textures) unless it's the named icon
				if (buffer.length < 5000 && !entry.entryName.toLowerCase().includes('icon')) return getCategoryFallback(entries);
				
				try {
					if (nativeImage) {
						let img = nativeImage.createFromBuffer(buffer);
						if (img && !img.isEmpty()) {
							const size = img.getSize();
							if (size.width > 512 || size.height > 512) {
								img = img.resize({ width: 512, height: 512, quality: 'good' });
							}
							return img.toDataURL();
						}
					}
					return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`;
				} catch (e) {
					return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`;
				}
			}
		} else {
			// It's a directory
			let hints = null;
			let fullIconPath = null;
			const dirFiles = fs.readdirSync(filePath);
			hints = dirFiles.map(f => ({ entryName: f }));
			const lowerFiles = dirFiles.map(f => f.toLowerCase());

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

			// 2. Store Priority (Directories)
			if (!fullIconPath && prioritizeStore) {
				const storeMatch = dirFiles.find(f => {
					const low = f.toLowerCase();
					return (low.startsWith('store_') && (low.endsWith('.dds') || low.endsWith('.png'))) || low === 'store.png' || low === 'store.dds' || low === 'shop.png' || low === 'shop.dds';
				});
				if (storeMatch) fullIconPath = path.join(filePath, storeMatch);
			}

			// 3. Icon Priority (Directories)
			if (!fullIconPath) {
				const iconMatch = dirFiles.find(f => {
					const low = f.toLowerCase();
					return (low.startsWith('icon_') && (low.endsWith('.dds') || low.endsWith('.png')));
				});
				if (iconMatch) fullIconPath = path.join(filePath, iconMatch);
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
							const rgba = decodeDDS(buffer, info.width, info.height, info.format, info.dataOffset);
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
						// If we couldn't decode it above, try to fall back to the modDesc icon if PNG/JPG
						if (normalizedIcon && !fullIconPath.toLowerCase().endsWith(normalizedIcon.toLowerCase())) {
							const secondChance = path.join(filePath, normalizedIcon);
							if (fs.existsSync(secondChance) && !secondChance.toLowerCase().endsWith('.dds')) {
								try {
									const secondBuffer = fs.readFileSync(secondChance);
									const { nativeImage } = require('electron');
									let img = nativeImage.createFromBuffer(secondBuffer);
									return img.toDataURL();
								} catch (e) {}
							}
						}
						// Check for any PNG/JPG in directory
						const altPngName = dirFiles.find(f => {
							const low = f.toLowerCase();
							return (low.endsWith('.png') || low.endsWith('.jpg') || low.endsWith('.jpeg')) && !low.includes('textures');
						});
						if (altPngName) {
							try {
								const altBuf = fs.readFileSync(path.join(filePath, altPngName));
								const { nativeImage } = require('electron');
								let img = nativeImage.createFromBuffer(altBuf);
								return img.toDataURL();
							} catch (e) {}
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
			await atomicCopyFile(filePath, destPath);
			
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
	
	syncMirrorLinks(modsPath).catch(err => console.error('[MIRROR] Auto-sync failed after local install:', err));
	return results;
}

/**
 * Restore a mod to its previous version (.bak)
 */
async function restoreModVersion(filePath) {
	const modsPath = getModsPath();
	const fileName = path.basename(filePath);
	const backupsDir = path.join(modsPath, 'backups');
	const dedicatedBakPath = path.join(backupsDir, `${fileName}.bak`);
	const legacyBakPath = filePath + '.bak';

	const bakPath = fs.existsSync(dedicatedBakPath) ? dedicatedBakPath : (fs.existsSync(legacyBakPath) ? legacyBakPath : null);

	if (!bakPath || !fs.existsSync(bakPath)) return { success: false, error: 'No previous version found' };

	try {
		await fs.ensureDir(backupsDir);
		const targetBakPath = path.join(backupsDir, `${fileName}.bak`);
		const tempPath = path.join(backupsDir, `${fileName}.tmp`);

		// Swap current mod with backup in dedicated backups folder
		if (fs.existsSync(filePath)) {
			await fs.move(filePath, tempPath, { overwrite: true });
		}
		await fs.move(bakPath, filePath, { overwrite: true });
		if (fs.existsSync(tempPath)) {
			await fs.move(tempPath, targetBakPath, { overwrite: true });
		}
		
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
  
  // ── DYNAMIC DISK SPACE CHECK FOR BULK BATCH ──
  const totalEstimatedBytes = modList.reduce((acc, m) => acc + (m.fileSize || m.size || 350 * 1024 * 1024), 0);
  const spaceCheck = checkFreeDiskSpace(null, totalEstimatedBytes);
  if (!spaceCheck.ok) {
    console.warn(`[BATCH] Refusing batch install: ${spaceCheck.error}`);
    return { success: [], failed: modList.map(m => ({ modTitle: m.modTitle, error: spaceCheck.error })) };
  }

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

function getAllInstalledModsList() {
	if (lastScanResult?.mods && lastScanResult.mods.length > 0) {
		return lastScanResult.mods;
	}
	const rows = cache.getAllLocalModCache() || [];
	const trackingMap = cache.getAllModTrackingMap();
	const list = [];
	for (const r of rows) {
		try {
			let data = {};
			if (r.json_data) {
				try { data = typeof r.json_data === 'string' ? JSON.parse(r.json_data) : r.json_data; } catch (_) {}
			}
			const baseName = path.basename(r.file_path);
			const cleanBase = baseName.replace(/\.zip$/i, '');
			let modId = data.modId || null;
			if (!modId) {
				const tr = trackingMap.get(`FILE_${baseName.toLowerCase()}`) || trackingMap.get(`FILE_${r.file_path.toLowerCase()}`);
				if (tr?.mod_id) modId = String(tr.mod_id).replace(/^0+/, '');
			}
			list.push({
				filePath: r.file_path,
				fileName: baseName,
				title: data.title || cleanBase,
				modName: data.techName || data.modName || cleanBase,
				version: data.version || '1.0.0.0',
				modId: modId ? String(modId).replace(/^0+/, '') : null,
				isMap: data.isMap || false,
				dependencies: data.dependencies || []
			});
		} catch (_) {}
	}
	return list;
}

function checkModInstalled(dep, localMods) {
	if (!dep) return { installed: false, localMod: null };

	let depId = null;
	let depFileName = null;
	let depTitle = null;

	if (typeof dep === 'string') {
		if (dep.includes('http')) {
			const idMatch = dep.match(/mod_id=(\d+)/i) || dep.match(/storage\/(\d+)\//i);
			if (idMatch) depId = parseInt(idMatch[1], 10).toString();
			const fileMatch = dep.match(/\/([^\/]+\.zip)$/i);
			if (fileMatch) depFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
		} else {
			depTitle = dep.replace(/^[\s\-\*\•\–\—]+/, '').replace(/\s*(?:\(|\[)?by:?[\s\S]*$/i, '').replace(/\s*\(v?\d+\.\d+.*?\)/i, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim();
			depFileName = dep.replace(/\.zip$/i, '').trim().toLowerCase();
		}
	} else if (typeof dep === 'object') {
		if (dep.modId || dep.id) depId = String(dep.modId || dep.id).replace(/^0+/, '');
		if (dep.url) {
			const idMatch = dep.url.match(/mod_id=(\d+)/i) || dep.url.match(/storage\/(\d+)\//i);
			if (idMatch && !depId) depId = parseInt(idMatch[1], 10).toString();
			const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
			if (fileMatch && !depFileName) depFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
		}
		if (!depFileName) {
			const fn = dep.fileName || dep.modName || dep.technicalName;
			if (fn) depFileName = fn.replace(/\.zip$/i, '').toLowerCase();
		}
		if (dep.title) {
			depTitle = dep.title.replace(/^[\s\-\*\•\–\—]+/, '').replace(/\s*(?:\(|\[)?by:?[\s\S]*$/i, '').replace(/\s*\(v?\d+\.\d+.*?\)/i, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim();
		}
	}

	const normDepFile = depFileName ? depFileName.replace(/\.zip$/i, '').toLowerCase().trim() : null;
	const cleanDepAlphanum = normDepFile ? normDepFile.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '') : null;
	const uDepTitle = depTitle ? ultraNormalize(depTitle) : null;
	const uCleanDep = depTitle ? depTitle.toLowerCase().replace(/[^a-z0-9]/g, '') : null;

	// 1. Check local scanned / cached mods list
	for (const m of localMods) {
		// 1a. ModHub ID Match
		if (depId && m.modId && String(m.modId).replace(/^0+/, '') === depId) {
			return { installed: true, localMod: m };
		}
		// 1b. ZIP Filename / Technical Name Match
		if (normDepFile) {
			const mFile = m.fileName ? path.basename(m.fileName).replace(/\.zip$/i, '').toLowerCase().trim() : '';
			const mTech = m.modName ? m.modName.replace(/\.zip$/i, '').toLowerCase().trim() : '';
			if (mFile === normDepFile || mTech === normDepFile) return { installed: true, localMod: m };
			if (cleanDepAlphanum) {
				const mFileAlpha = mFile.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');
				const mTechAlpha = mTech.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');
				if (mFileAlpha === cleanDepAlphanum || mTechAlpha === cleanDepAlphanum) return { installed: true, localMod: m };
			}
		}
		// 1c. Mod Title Match
		if (uDepTitle || uCleanDep) {
			const mTitle = m.title ? m.title.trim() : '';
			const uMTitle = ultraNormalize(mTitle);
			const cleanMTitle = mTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
			if (uDepTitle && uMTitle === uDepTitle) return { installed: true, localMod: m };
			if (uCleanDep && cleanMTitle === uCleanDep) return { installed: true, localMod: m };

			// Also check title vs technical name/filename
			const mTech = m.modName ? m.modName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
			const mFile = m.fileName ? path.basename(m.fileName).replace(/\.zip$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '') : '';
			if (uCleanDep && (mTech === uCleanDep || mFile === uCleanDep)) return { installed: true, localMod: m };
		}
	}

	// 2. Physical disk scan across ALL directories and subfolders
	const allDirs = getModsPaths();
	for (const dir of allDirs) {
		if (!fs.existsSync(dir)) continue;
		try {
			// Check root of folder
			if (normDepFile && fs.existsSync(path.join(dir, `${normDepFile}.zip`))) {
				return { installed: true, localMod: { filePath: path.join(dir, `${normDepFile}.zip`), fileName: `${normDepFile}.zip` } };
			}
			if (depTitle) {
				const safe = depTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
				if (fs.existsSync(path.join(dir, `${safe}.zip`))) {
					return { installed: true, localMod: { filePath: path.join(dir, `${safe}.zip`), fileName: `${safe}.zip` } };
				}
			}
			// Check one level of subfolders
			const subEntries = fs.readdirSync(dir, { withFileTypes: true });
			for (const sub of subEntries) {
				if (sub.isDirectory()) {
					const subPath = path.join(dir, sub.name);
					if (normDepFile && fs.existsSync(path.join(subPath, `${normDepFile}.zip`))) {
						return { installed: true, localMod: { filePath: path.join(subPath, `${normDepFile}.zip`), fileName: `${normDepFile}.zip`, folder: sub.name } };
					}
				}
			}
		} catch (_) {}
	}

	return { installed: false, localMod: null };
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

	// ── DYNAMIC DISK SPACE CHECK FOR MAP DEPENDENCIES ──
	const totalEstimatedBytes = mods.reduce((acc, m) => acc + (m.fileSize || m.size || 450 * 1024 * 1024), 0);
	const spaceCheck = checkFreeDiskSpace(subFolder ? path.join(getModsPath(), subFolder) : getModsPath(), totalEstimatedBytes);
	if (!spaceCheck.ok) {
		console.warn(`[AUTO-INSTALL] Refusing dependency batch: ${spaceCheck.error}`);
		if (parentId) activeBatchTasks.delete(parentId);
		return { total: mods.length, installed: 0, failed: mods.map(m => m.title), error: spaceCheck.error };
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
			} else if (parentMod && parentMod.title) {
				subFolder = getMapSubfolderName(parentMod.title, parentId, parentMod);
				console.log(`[AUTO-INSTALL] Resolved subfolder "${subFolder}" from map title ${parentMod.title}`);
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

	// Direct Map Page Dependency Link Resolution:
	// If parentId (map ID) is provided, fetch the map's ModHub detail page to get direct dependency links
	let scrapedMapDeps = [];
	if (parentId) {
		try {
			const detail = await scraper.fetchModDetail(parentId);
			if (detail && Array.isArray(detail.dependencies)) {
				scrapedMapDeps = detail.dependencies;
				console.log(`[AUTO-INSTALL] Retrieved ${scrapedMapDeps.length} direct dependency links from map ${parentId}'s ModHub page.`);
			}
		} catch (err) {
			console.warn(`[AUTO-INSTALL] Could not fetch live map details for ${parentId}:`, err.message);
		}
	}

	for (const modObj of mods) {
		// CHECK FOR CANCELLATION
		if (parentId && !activeBatchTasks.has(parentId)) {
			console.log(`[AUTO-INSTALL] Batch ${parentId} was cancelled. Aborting loop.`);
			break;
		}

		const modObjNorm = typeof modObj === 'string' ? { title: modObj } : (modObj || {});
		if (typeof modObj === 'string') {
			if (modObj.startsWith('http://') || modObj.startsWith('https://')) {
				modObjNorm.url = modObj;
			} else if (modObj.toLowerCase().endsWith('.zip')) {
				modObjNorm.fileName = modObj;
			}
		}

		const modName = (modObjNorm.title || modObjNorm.modName || modObjNorm.name || modObjNorm.technicalName || modObjNorm.fileName || '').trim();
		let modUrl = modObjNorm.url || modObjNorm.downloadUrl || null;

		if (!modName && !modUrl && !modObjNorm.modId && !modObjNorm.fileName) {
			console.warn(`[AUTO-INSTALL] Empty mod item encountered in autoInstallDependencies. Skipping.`);
			continue;
		}

		// Match direct link from the map's live ModHub page if URL is missing
		if (!modUrl && scrapedMapDeps.length > 0) {
			const normTarget = ultraNormalize(modName);
			const matchedMapDep = scrapedMapDeps.find(d => {
				if (!d) return false;
				const normTitle = ultraNormalize(d.title || '');
				return normTitle === normTarget || (normTarget.length > 4 && (normTitle.includes(normTarget) || normTarget.includes(normTitle)));
			});
			if (matchedMapDep && matchedMapDep.url) {
				modUrl = matchedMapDep.url;
				console.log(`[AUTO-INSTALL] Direct ModHub page link matched for "${modName}": ${modUrl}`);
			}
		}
		
		try {
			let modId = modObjNorm.modId || modObjNorm.id || null;
			let downloadUrl = modObjNorm.downloadUrl || modObjNorm.url || null;
			let targetFileName = modObjNorm.fileName ? modObjNorm.fileName.replace(/\.zip$/i, '').toLowerCase() : null;
			let modTitle = modObjNorm.title || modName;

			// 0. Resolve ID & filename from URL if possible (High reliability)
			if (modUrl) {
				const idMatch = modUrl.match(/mod_id=(\d+)/) || modUrl.match(/storage\/(\d+)\//);
				if (idMatch) modId = parseInt(idMatch[1], 10).toString();
				const fileMatch = modUrl.match(/\/([^\/]+\.zip)$/i);
				if (fileMatch) targetFileName = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
			}

			// 0.5 REGISTRY CHECK: Is this mod currently being installed or in queue?
			const isCurrentlyInstalling = (modId && activeInstalls.has(modId)) || 
										 downloadQueue.some(q => (modId && q.modId === modId) || (targetFileName && q.fileName && q.fileName.replace(/\.zip$/i, '').toLowerCase() === targetFileName));
			
			if (isCurrentlyInstalling) {
				console.log(`[AUTO-INSTALL] Mod "${modName}" is already active/queued. Awaiting completion...`);
				onProgress?.({ type: 'STATUS', modId, modName, status: 'DOWNLOADING', title: modName, parentId });
				
				await new Promise((resolve) => {
					const startWait = Date.now();
					const checkInterval = setInterval(() => {
						const stillActive = (modId && activeInstalls.has(modId)) || 
							downloadQueue.some(q => (modId && q.modId === modId) || (targetFileName && q.fileName && q.fileName.replace(/\.zip$/i, '').toLowerCase() === targetFileName));
						if (!stillActive || Date.now() - startWait > 600000) {
							clearInterval(checkInterval);
							resolve();
						}
					}, 500);
				});

				results.installed++;
				console.log(`[AUTO-INSTALL] Active/queued install finished for "${modName}".`);
				onProgress?.({ type: 'STATUS', modId, modName, status: 'success', title: modName, parentId });
				continue;
			}

			// 1. SMART CHECK: Is this mod already installed and physically present on disk?
			const localScanMods = getAllInstalledModsList();
			const checkResult = checkModInstalled(modObjNorm, localScanMods);
			let alreadyInstalled = checkResult.installed;
			let localMod = checkResult.localMod;

			// Version Contingency: If we have a required version, check if local meets it
			if (alreadyInstalled && localMod && modObj.version && localMod.version) {
				const vComp = compareVersions(localMod.version, modObj.version);
				if (vComp < 0) {
					console.log(`[AUTO-INSTALL] Version mismatch for ${modName}: Local ${localMod.version} < Required ${modObj.version}. Triggering upgrade.`);
					alreadyInstalled = false; // Force re-download/update
				} else {
					console.log(`[AUTO-INSTALL] VersCheck: ${modName} ${localMod.version} >= ${modObj.version}. OK.`);
				}
			}

			if (alreadyInstalled) {
				// If it's already installed anywhere, DO NOT create a physical copy in the subfolder.
				// The map folder will link to it virtually (via virtual dependency injection in the UI / symlinks during launch).
				results.installed++;
				console.log(`[AUTO-INSTALL] Mod "${modName}" is already installed (in "${localMod.folder || 'MAIN'}"). Map "${subFolder || 'N/A'}" will link to it virtually. Skipping duplicate file creation.`);
				continue; // Skip download without polluting active download queue
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

			// 2.5 LOCAL METADATA POOL CHECK (O(1) Instant Lookup before HTTP search)
			if (!modId) {
				const pool = cache.getModHubMetadataPool();
				const poolByCleanTitle = pool._byCleanTitle || {};
				const uModName = ultraNormalize(modName);
				const poolMatch = poolByCleanTitle[uModName] || pool[uModName] || pool[`file_${uModName}`] || pool[modName.toLowerCase()];
				if (poolMatch) {
					modId = String(poolMatch.modId || poolMatch.id);
					modTitle = poolMatch.title || modName;
					console.log(`[AUTO-INSTALL] Found match via local metadata pool: "${modTitle}" (ID: ${modId})`);
				}
			}

			// 3. Fallback to Search if no ID found or if we only had a title
			if (!modId) {
				const words = modName.split(/[^a-zA-Z0-9]/).filter(w => w.length > 2);
				const shortQuery = words.slice(0, 3).join(' ');

				const searchQueries = [
					modName, // 1. Original
					shortQuery, // 2. First 2-3 words
					modName.replace(/^(fs\d{2}_?|dlc_|pdlc_|mod_|fendt_|jcb_|caseih_|newholland_|massey_)/i, ''), // 3. Prefix-less
					modName.replace(/\[[^\]]*\]/g, '').trim(), // 4. Tag-less
					modName.split(/[\(\[\-]/)[0].trim() // 5. Deep Clean
				];
				
				// Unique queries only
				const uniqueQueries = [...new Set(searchQueries)].filter(q => q && q.length > 2);

				for (const query of uniqueQueries) {
					console.log(`[AUTO-INSTALL] Searching ModHub for "${query}" (Attempt ${uniqueQueries.indexOf(query) + 1}/${uniqueQueries.length})...`);
					onProgress?.({ type: 'STATUS', modName, status: 'SEARCHING', parentId });
					
					await new Promise(r => setTimeout(r, 600)); // Rate limit safety
					
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
								const isSimilar = targetWords.length > 0 && (matchingWords.length / targetWords.length) >= 0.5;

								return isOverlap || isSimilar;
							});
						}

						// Strategy C: First search result if query was tokenized
						if (!bestMatch && search.mods.length > 0) {
							bestMatch = search.mods[0];
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

			if (!modId) {
				console.warn(`[AUTO-INSTALL] Could not resolve ModHub ID for dependency: ${modName}`);
				onProgress?.({ type: 'STATUS', modName, status: 'error', message: 'Could not locate mod on ModHub. Try downloading manually.', parentId });
				results.failed.push(modName);
				continue;
			}

			if (modId) {
				// 4. Fetch Detail if we don't have direct download link yet
				let category = null;
				if (!downloadUrl) {
					try {
						const detail = await scraper.fetchModDetail(modId);
						modTitle = detail?.title || modTitle;
						downloadUrl = detail?.downloadUrl || null;
						category = detail?.category || null;
					} catch (err) {
						console.warn(`[AUTO-INSTALL] fetchModDetail failed for ID ${modId}, using CDN fallback:`, err.message);
					}
				}

				// Deterministic ModHub CDN URL Fallback if downloadUrl is still missing
				if (!downloadUrl && modId) {
					const paddedId = String(modId).padStart(8, '0');
					downloadUrl = `https://cdn18.giants-software.com/modHub/storage/${paddedId}/FS25_mod_${modId}.zip`;
					console.log(`[AUTO-INSTALL] Constructed fallback ModHub CDN URL for mod ${modId}: ${downloadUrl}`);
				}

				// 5. Trigger Install with automatic 3-attempt retry loop
				onProgress?.({ type: 'STATUS', modId, modName, status: 'DOWNLOADING', title: modTitle, parentId });
				
				let installResult = null;
				let lastError = null;

				for (let attempt = 1; attempt <= 3; attempt++) {
					try {
						if (attempt > 1) {
							console.log(`[AUTO-INSTALL] Retrying download for ${modTitle} (Attempt ${attempt}/3)...`);
							onProgress?.({ type: 'STATUS', modId, modName, status: 'DOWNLOADING', title: `${modTitle} (Retry ${attempt}/3)`, parentId });
							await new Promise(r => setTimeout(r, 2000)); // 2s backoff delay before retrying
						}

						installResult = await installMod(
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
							MAP_DEPENDENCIES_FOLDER // Always route dependency downloads to the dedicated shared folder
						);

						if (installResult.success) {
							break;
						} else {
							lastError = new Error(installResult.error || 'Install failed');
						}
					} catch (attemptErr) {
						lastError = attemptErr;
					}
				}

				if (installResult && installResult.success) {
					results.installed++;
					console.log(`[AUTO-INSTALL] Successfully installed ${modName}`);
					onProgress?.({ type: 'STATUS', modId, modName, status: 'success', title: modTitle, parentId });
				} else {
					throw lastError || new Error('Install failed after 3 attempts');
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

		// Rate limit delay between sequential dependency downloads
		await new Promise(r => setTimeout(r, 1500));
	}

	if (parentId) {
		activeBatchTasks.delete(parentId);
	}

	return results;
}



async function renameFolder(oldName, newName) {
	const allPaths = getModsPaths();
	
	if (oldName === '') {
		debugLog(`[RENAME] Renaming MAIN folder. Moving root zip files to subdirectory: ${newName}`);
		let filesMoved = 0;
		try {
			for (const p of allPaths) {
				const newPath = path.join(p, newName);
				if (!fs.existsSync(newPath)) {
					await fs.mkdir(newPath, { recursive: true });
				}
				
				const entries = await fs.readdir(p, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
						const oldFilePath = path.join(p, entry.name);
						const newFilePath = path.join(newPath, entry.name);
						
						await fs.rename(oldFilePath, newFilePath);
						
						// Sync cache and tracking
						const oldRelative = entry.name;
						const newRelative = `${newName}/${entry.name}`;
						cache.updateLocalModCachePath(oldFilePath, newFilePath);
						cache.updateModTrackingFileInfo(oldRelative, newRelative);
						filesMoved++;
					}
				}
			}
			return { success: true, filesMoved };
		} catch (err) {
			console.error(`[RENAME-MAIN] Failed to move files:`, err.message);
			throw new Error(`Failed to group MAIN mods: ${err.message}`);
		}
	}

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
	const folderPaths = [];
	
	// Search in all mod locations for the folder
	for (const p of allPaths) {
		const target = path.join(p, folderName);
		if (fs.existsSync(target)) {
			folderPaths.push(target);
		}
	}
	
	// 1. Check if game is running (Windows lock protection)
	if (await gameLauncher.isGameRunning()) {
		throw new Error('Cannot delete: Farming Simulator 25 is currently running. Please close the game first.');
	}

	let deletedAny = false;

	if (folderPaths.length > 0) {
		for (const folderPath of folderPaths) {
			debugLog(`[DELETE] Permanently removing folder: ${folderPath}`);
			try {
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
				deletedAny = true;
			} catch (err) {
				console.error(`[DELETE-FOLDER] Failed to delete ${folderPath}:`, err.message);
			}
		}
	}

	// Also check if any standalone mods in cache belong to this folder or map title
	const cachedMods = cache.getAllLocalModCache();
	if (Array.isArray(cachedMods)) {
		for (const mod of cachedMods) {
			const base = path.basename(mod.file_path);
			const modFolder = mod.folder || '';
			const modTitle = (mod.title || '').replace(/\([^)]+\)/g, '').trim();
			if (modFolder === folderName || (mod.is_map && modTitle === folderName)) {
				try {
					if (fs.existsSync(mod.file_path)) {
						await safeRemove(mod.file_path);
						deletedAny = true;
					}
					cache.removeLocalModCache(mod.file_path);
					cache.removeModTrackingByFile(base);
				} catch (e) {}
			}
		}
	}

	clearScanCache();
	debugLog(`[DELETE] Finished deleting folder "${folderName}". Deleted: ${deletedAny}`);
	return { success: true };
}

let hasMigratedLegacyBackups = false;

/**
 * One-time migration of any legacy loose .bak / .backup files found in the mods folder
 * or subdirectories into the dedicated 'backups' folder.
 */
async function migrateLegacyBakFiles() {
	if (hasMigratedLegacyBackups || cache.getSetting('legacyBackupsMigrated')) {
		hasMigratedLegacyBackups = true;
		return;
	}

	const modsPath = getModsPath();
	if (!modsPath || !fs.existsSync(modsPath)) return;

	const backupsDir = path.join(modsPath, 'backups');

	const walkAndMigrate = async (dir) => {
		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (!entry.name.startsWith('.') && entry.name.toLowerCase() !== 'backups') {
						await walkAndMigrate(fullPath);
					}
				} else if (entry.isFile() && (entry.name.endsWith('.bak') || entry.name.endsWith('.backup'))) {
					try {
						await fs.ensureDir(backupsDir);
						const targetBakPath = path.join(backupsDir, entry.name);
						if (fullPath !== targetBakPath) {
							if (fs.existsSync(targetBakPath)) {
								await fs.remove(targetBakPath);
							}
							await fs.move(fullPath, targetBakPath);
							console.log(`[MIGRATION] Moved loose backup file ${entry.name} to backups folder`);
						}
					} catch (moveErr) {
						console.warn(`[MIGRATION] Failed to move backup file ${entry.name}:`, moveErr.message);
					}
				}
			}
		} catch (e) {
			console.warn('[MIGRATION] Directory read failed during backup migration:', e.message);
		}
	};

	await walkAndMigrate(modsPath);
	hasMigratedLegacyBackups = true;
	cache.setSetting('legacyBackupsMigrated', true);
}

/**
 * Prune old backup files (.bak) directly from the dedicated backups folder.
 * Uses the 'backupRetention' setting from the cache.
 */
async function pruneBackups() {
	await migrateLegacyBakFiles().catch(e => console.warn('[MIGRATION] Migration error:', e.message));
	await pruneAbandonedEmptyFolders().catch(e => console.warn('[CLEANUP] Prune empty folders error:', e.message));

	const policy = cache.getSetting('backupRetention') || '1w';
	if (policy === 'forever') return;

	const modsPath = getModsPath();
	if (!modsPath) return;
	const backupsDir = path.join(modsPath, 'backups');
	if (!fs.existsSync(backupsDir)) return;

	try {
		const now = Date.now();
		let msThreshold = 0;
		
		if (policy === 'never') msThreshold = -1; // Specific flag to delete all
		else if (policy === '1w') msThreshold = 7 * 24 * 60 * 60 * 1000;
		else if (policy === '2w') msThreshold = 14 * 24 * 60 * 60 * 1000;
		else if (policy === '1m') msThreshold = 30 * 24 * 60 * 60 * 1000;

		let prunedCount = 0;
		const entries = await fs.readdir(backupsDir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isFile() && (entry.name.endsWith('.bak') || entry.name.endsWith('.backup'))) {
				const fullPath = path.join(backupsDir, entry.name);
				try {
					const stats = await fs.stat(fullPath);
					if (msThreshold === -1 || (now - stats.mtimeMs > msThreshold)) {
						await fs.remove(fullPath);
						prunedCount++;
					}
				} catch (statErr) {}
			}
		}
		
		if (prunedCount > 0) {
			console.log(`[CLEANUP] Pruned ${prunedCount} old mod backups (Policy: ${policy})`);
		}
	} catch (e) {
		console.error('[CLEANUP] Backup pruning failed:', e.message);
	}
}

/**
 * Prune abandoned empty mod folder shells (e.g. leftover from moves) across all configured paths.
 */
async function pruneAbandonedEmptyFolders() {
	const allPaths = getModsPaths();
	for (const root of allPaths) {
		if (!await fs.pathExists(root)) continue;
		try {
			const entries = await fs.readdir(root, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.toLowerCase() === 'backups' || entry.isSymbolicLink()) continue;
				const subPath = path.join(root, entry.name);
				try {
					const files = await fs.readdir(subPath);
					const validFiles = files.filter(f => !f.startsWith('.') && f.toLowerCase() !== 'backups' && !f.endsWith('.bak') && !f.endsWith('.download'));
					if (validFiles.length === 0) {
						// Folder contains no active mods or files; clean up leftover shell
						await safeRemove(subPath);
						debugLog(`[CLEANUP] Pruned abandoned empty mod folder: ${subPath}`);
					}
				} catch (_) {}
			}
		} catch (_) {}
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

    if (isMap) {
        // Strip any trailing or parenthetical "Crossplay" / "CP" and normalize to standard suffix " (CP)"
        const isCP = /\bcrossplay\b|\(cp\)|\bcp\b/i.test(clean) || 
                     /\bcrossplay\b|\(cp\)|\bcp\b/i.test(fileName || '') || 
                     /\bcrossplay\b|\(cp\)|\bcp\b/i.test(modName || '');
        if (isCP) {
            clean = clean.replace(/\s*[\(\[]\s*(?:crossplay|cp)\s*[\)\]]\s*$/i, '')
                         .replace(/\s+crossplay\s*$/i, '')
                         .replace(/\s+cp\s*$/i, '')
                         .trim();
            clean = `${clean} (CP)`;
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
					}, iconData, mod.fileHash, mod.storeData);
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

const failedAutoResolves = new Set();

/**
 * Background service to silently fix missing map dependencies.
 * Exported at bottom for use by other services.
 */
async function autoResolveMissingDependencies(mods, targetMapName = null) {
	// Use global ultraNormalize

	const maps = mods.filter(m => m.isMap && (!targetMapName || m.modName === targetMapName));
	if (maps.length === 0) {
		return;
	}

	const allMissing = [];
	const mapToFolderMap = {};

	for (const map of maps) {
		if (!map.dependencies || map.dependencies.length === 0) continue;
		
        let mapDeps = map.dependencies;
        const needsModHubFetch = mapDeps.some(d => typeof d === 'string' || !d.url);
        
        if (needsModHubFetch) {
            try {
                if (map.modId) {
                    const scraper = require('./scraper');
                    const detail = await scraper.fetchModDetail(map.modId);
                    if (detail && Array.isArray(detail.dependencies)) {
                        console.log(`[AUTO-RESOLVE] Successfully fetched exact ModHub dependencies for map.`);
                        const webDeps = detail.dependencies;
                        const currentDeps = Array.isArray(mapDeps) ? mapDeps : [];
                        const merged = [...webDeps];
                        for (const cDep of currentDeps) {
                            const cStr = (typeof cDep === 'string' ? cDep : (cDep.modName || cDep.title || cDep.fileName || '')).toLowerCase();
                            const cleanC = cStr.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');
                            const exists = merged.some(d => {
                                const dStr = (typeof d === 'string' ? d : (d.modName || d.title || d.fileName || '')).toLowerCase();
                                const cleanD = dStr.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/g, '');
                                return cleanD && cleanC && (cleanD === cleanC || cleanD.includes(cleanC) || cleanC.includes(cleanD));
                            });
                            if (!exists) merged.push(cDep);
                        }
                        mapDeps = merged;
                    }
                }
            } catch (err) {
                console.error(`[AUTO-RESOLVE] Failed to fetch exact ModHub dependencies for map:`, err);
            }
        }
        
		for (const dep of mapDeps) {
			const depTitle = typeof dep === 'string' ? dep : (dep.title || dep.modName || dep.fileName);
			const depId = typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\d+)/)?.[1] || dep.url.match(/storage\/(\d+)\//)?.[1]) : null;

			const { installed: isInstalled } = checkModInstalled(dep, mods);

			if (!isInstalled) {
				const depObj = typeof dep === 'object' ? dep : { title: depTitle, url: null };
				const depKey = depId || depTitle;
				if (depKey && failedAutoResolves.has(depKey)) {
					// Skip dependencies that failed previously so we don't retry downloading them endlessly on every scan
					continue;
				}

				const alreadyQueued = allMissing.some(d => (d.title && d.title === depTitle) || (d.url && d.url === depObj.url));
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
		const depKey = (typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\d+)/)?.[1] || dep.url.match(/storage\/(\d+)\//)?.[1]) : null) || dep.title;

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
			console.log(`[AUTO-RESOLVE] Dependency install failed for ${dep.title}. Skipping future automatic retries.`);
			if (depKey) failedAutoResolves.add(depKey);
		}
	}
}

/**
 * Automatically resume any pending downloads found in the database.
 */
async function resumePendingDownloads(onProgress) {
	const pending = cache.getPendingDownloads();
	if (!Array.isArray(pending) || pending.length === 0) return { success: true, count: 0 };
	
	console.log(`[RESUME] Found ${pending.length} pending download records in database.`);
	const pool = cache.getModHubMetadataPool();
	const results = [];
	
	for (const item of pending) {
		const strId = String(item.mod_id);
		
		// If already active or queued in memory, skip duplicate enqueue
		if (activeInstalls.has(strId) || downloadQueue.some(t => String(t.modId) === strId)) {
			continue;
		}

		// Enrich title if generic
		let title = item.mod_title;
		if (!title || title === `Mod ${strId}` || title === strId) {
			if (pool[strId]?.title) title = pool[strId].title;
		}

		// Calculate relative subfolder if target_dir was stored as absolute path
		let subFolder = null;
		if (item.target_dir) {
			if (path.isAbsolute(item.target_dir)) {
				const rel = path.relative(getModsPath(), item.target_dir);
				if (rel && !rel.startsWith('..')) {
					subFolder = rel;
				}
			} else {
				subFolder = item.target_dir;
			}
		}

		let techData = null;
		if (item.tech_data) {
			try { techData = JSON.parse(item.tech_data); } catch (_) {}
		}

		try {
			console.log(`[RESUME] Re-queueing pending download: "${title || strId}" (ID: ${strId})`);
			const promise = enqueueInstall(
				strId, 
				title || `Mod ${strId}`, 
				item.download_url || null, 
				(progress) => onProgress?.(strId, progress),
				item.category || null,
				subFolder,
				techData,
				null,
				null
			);
			results.push(promise);
		} catch (err) {
			console.error(`[RESUME] Failed to resume ${strId}:`, err.message);
			try { cache.removePendingDownload(strId); } catch (_) {}
		}
	}
	
	return { success: true, count: results.length };
}

async function deduplicateSubfolderMods(modsPath) {
	try {
		const targetDir = modsPath || getModsPath();
		if (!targetDir || !fs.existsSync(targetDir)) return { success: false, reclaimedBytes: 0, count: 0 };
		
		const rootEntries = await fs.readdir(targetDir, { withFileTypes: true });
		const rootZips = new Map();
		for (const entry of rootEntries) {
			if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
				const fullPath = path.join(targetDir, entry.name);
				const stats = await fs.stat(fullPath);
				rootZips.set(entry.name.toLowerCase(), { path: fullPath, size: stats.size });
			}
		}

		let reclaimedBytes = 0;
		let convertedCount = 0;

		const scanDir = async (dir) => {
			const items = await fs.readdir(dir, { withFileTypes: true });
			for (const item of items) {
				const fullPath = path.join(dir, item.name);
				if (item.isDirectory()) {
					await scanDir(fullPath);
				} else if (item.isFile() && item.name.toLowerCase().endsWith('.zip')) {
					const lstats = await fs.lstat(fullPath);
					if (lstats.isSymbolicLink()) continue;
					
					const rootItem = rootZips.get(item.name.toLowerCase());
					if (rootItem && lstats.size === rootItem.size) {
						try {
							await fs.remove(fullPath);
							await fs.link(rootItem.path, fullPath);
							reclaimedBytes += rootItem.size;
							convertedCount++;
							debugLog(`[DEDUPE] Replaced physical duplicate ${item.name} in ${path.basename(dir)} with zero-byte NTFS hard link`);
						} catch (err) {
							console.error(`[DEDUPE] Failed hardlink conversion for ${item.name}: ${err.message}`);
						}
					}
				}
			}
		};

		for (const entry of rootEntries) {
			if (entry.isDirectory()) {
				await scanDir(path.join(targetDir, entry.name));
			}
		}

		return { success: true, reclaimedBytes, count: convertedCount };
	} catch (err) {
		console.error('[DEDUPE] Deduplication scanner error:', err.message);
		return { success: false, error: err.message };
	}
}

async function flattenSubfolders() {
	if (await gameLauncher.isGameRunning()) {
		return { success: false, error: 'Cannot move mods: Farming Simulator 25 is currently running. Please close the game first.' };
	}

	const modsPath = getModsPath();
	if (!modsPath || !await fs.pathExists(modsPath)) {
		return { success: false, error: 'Mods directory not found' };
	}

	let movedCount = 0;
	try {
		const entries = await fs.readdir(modsPath, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const folderNameLower = entry.name.toLowerCase();
			if (entry.name.startsWith('.') || folderNameLower === 'backups' || folderNameLower === 'pdlc') continue;

			const subDir = path.join(modsPath, entry.name);
			const subEntries = await fs.readdir(subDir, { withFileTypes: true });

			for (const subEntry of subEntries) {
				const isZip = subEntry.name.toLowerCase().endsWith('.zip');
				const subPath = path.join(subDir, subEntry.name);
				const isModDir = subEntry.isDirectory() && await fs.pathExists(path.join(subPath, 'modDesc.xml'));

				if (isZip || isModDir) {
					const targetPath = path.join(modsPath, subEntry.name);
					try {
						if (subPath.toLowerCase() !== targetPath.toLowerCase()) {
							if (await fs.pathExists(targetPath)) {
								await fs.remove(targetPath);
							}
							await fs.move(subPath, targetPath, { overwrite: true });
							movedCount++;
						}
					} catch (e) {
						console.error(`[FLATTEN] Error moving ${subEntry.name}:`, e.message);
					}
				}
			}

			const remaining = await fs.readdir(subDir).catch(() => []);
			if (remaining.length === 0) {
				await fs.remove(subDir).catch(() => {});
			}
		}

		await scanLocalMods(null, true);
		return { success: true, movedCount };
	} catch (err) {
		console.error('[FLATTEN] Error flattening subfolders:', err);
		return { success: false, error: err.message };
	}
}

/**
 * Consolidates all shared map dependencies into the dedicated 'Map Dependencies' subfolder.
 * 
 * For every non-map .zip file that exists inside a map subfolder (e.g. F:\mods4\Rettenbach\FS25_BaleStorage.zip),
 * this function:
 *   1. Ensures a copy exists in the 'Map Dependencies' folder (moving the first occurrence it finds).
 *   2. Removes duplicate physical copies from all other map subfolders.
 *   3. Leaves the map's own .zip file untouched.
 *
 * After consolidation, every map folder's dependencies appear in the UI as virtual SHARED links
 * pointing to the single master copy inside 'Map Dependencies'.
 */
async function consolidateDependencies(onProgress = null) {
	const modsPath = getModsPath();
	if (!modsPath || !await fs.pathExists(modsPath)) {
		return { success: false, error: 'Primary mods directory not found' };
	}

	const depsDir = path.join(modsPath, MAP_DEPENDENCIES_FOLDER);
	await fs.ensureDir(depsDir);

	// Build a map of all .zip files already in Map Dependencies so we know what we already have
	const alreadyInDeps = new Map(); // lowercased filename -> full path
	const existingDepsEntries = await fs.readdir(depsDir, { withFileTypes: true }).catch(() => []);
	for (const e of existingDepsEntries) {
		if (e.isFile() && e.name.toLowerCase().endsWith('.zip')) {
			alreadyInDeps.set(e.name.toLowerCase(), path.join(depsDir, e.name));
		}
	}

	const topEntries = await fs.readdir(modsPath, { withFileTypes: true }).catch(() => []);
	let movedCount = 0;
	let removedCount = 0;

	for (const entry of topEntries) {
		if (!entry.isDirectory()) continue;
		const entryNameLower = entry.name.toLowerCase();
		// Skip system/reserved folders
		if (entry.name.startsWith('.') || entryNameLower === 'backups' || entryNameLower === 'pdlc' || entryNameLower === MAP_DEPENDENCIES_FOLDER.toLowerCase()) continue;

		const subDir = path.join(modsPath, entry.name);
		const subEntries = await fs.readdir(subDir, { withFileTypes: true }).catch(() => []);

		for (const sub of subEntries) {
			if (!sub.isFile() || !sub.name.toLowerCase().endsWith('.zip')) continue;

			// Try to parse the zip to check if it's the map itself (isMap = true) — skip map files
			const subFilePath = path.join(subDir, sub.name);
			let isMap = false;
			try {
				const cachedRow = cache.getLocalModCache(subFilePath);
				if (cachedRow && cachedRow.json_data) {
					const parsed = typeof cachedRow.json_data === 'string' ? JSON.parse(cachedRow.json_data) : cachedRow.json_data;
					isMap = !!parsed.isMap;
				}
			} catch (e) {}
			if (isMap) continue; // Never move the map's own zip

			const fileNameLower = sub.name.toLowerCase();
			const targetPath = path.join(depsDir, sub.name);

			if (alreadyInDeps.has(fileNameLower)) {
				// A copy already exists in Map Dependencies — remove this duplicate
				try {
					await fs.remove(subFilePath);
					cache.removeLocalModCache(subFilePath);
					removedCount++;
					onProgress?.({ type: 'REMOVED', file: sub.name, from: entry.name });
					console.log(`[CONSOLIDATE] Removed duplicate: ${entry.name}/${sub.name} (already in Map Dependencies)`);
				} catch (e) {
					console.warn(`[CONSOLIDATE] Could not remove duplicate ${subFilePath}:`, e.message);
				}
			} else {
				// First occurrence — move into Map Dependencies
				try {
					await fs.move(subFilePath, targetPath, { overwrite: false });
					alreadyInDeps.set(fileNameLower, targetPath);
					// Update cache: remove old path, the next scan will index the new path
					cache.removeLocalModCache(subFilePath);
					movedCount++;
					onProgress?.({ type: 'MOVED', file: sub.name, from: entry.name });
					console.log(`[CONSOLIDATE] Moved ${entry.name}/${sub.name} -> Map Dependencies/`);
				} catch (e) {
					console.warn(`[CONSOLIDATE] Could not move ${subFilePath} -> ${targetPath}:`, e.message);
				}
			}
		}
	}

	clearScanCache();
	console.log(`[CONSOLIDATE] Done. Moved: ${movedCount}, Removed duplicates: ${removedCount}`);
	return { success: true, movedCount, removedCount };
}

/**
 * Returns all corrupt mods from the last scan result, grouped so that the same
 * mod appearing in multiple directories is represented as a single entry with
 * an `allPaths` array listing every corrupt copy.
 */
function getCorruptMods() {
	const scanResult = getLastScanResult();
	if (!scanResult || !Array.isArray(scanResult.mods)) return [];

	const corruptMods = scanResult.mods.filter(m => m.isCorrupt);
	// Group by base filename (entryName without subfolder prefix) so duplicates
	// across multiple mod directories collapse into one entry.
	const groups = new Map();
	for (const mod of corruptMods) {
		const baseFile = path.basename(mod.fileName); // e.g. FS25_Deppenhausen.zip
		const key = mod.modId ? `id_${mod.modId}` : `file_${baseFile.toLowerCase()}`;
		if (!groups.has(key)) {
			groups.set(key, {
				modName: baseFile.replace(/\.zip$/i, ''),
				fileName: baseFile,
				modId: mod.modId || null,
				title: mod.title || baseFile.replace(/\.zip$/i, ''),
				allPaths: [],
				canAutoRepair: !!mod.modId,
				isMap: mod.isMap || false,
				size: mod.size || 0,
			});
		}
		groups.get(key).allPaths.push(mod.filePath);
	}

	return Array.from(groups.values());
}

/**
 * Repairs a corrupt mod by re-downloading it from ModHub and replacing every
 * corrupt copy at allPaths with the fresh download.
 *
 * @param {string} fileName   - Base filename, e.g. FS25_Deppenhausen.zip
 * @param {string} modId      - ModHub mod ID
 * @param {string[]} allPaths - All corrupt file paths to replace
 * @param {Function} onProgress - Progress callback (same shape as updateMod)
 */
async function repairCorruptMod(fileName, modId, allPaths, onProgress) {
	if (!modId) {
		return { success: false, thirdParty: true, error: 'No ModHub ID — re-obtain this mod manually.' };
	}
	try {
		console.log(`[REPAIR] Starting repair of ${fileName} (modId: ${modId}), paths: ${allPaths.join(', ')}`);

		// Use the primary path as the download target. If the file exists there (even corrupt),
		// updateMod will back it up and overwrite. If not, it downloads fresh.
		const primaryPath = allPaths[0];
		const result = await updateMod(fileName, modId, onProgress, primaryPath);
		if (!result || !result.success) {
			return { success: false, error: result?.error || 'Download failed' };
		}

		// After the primary is repaired, replace remaining corrupt copies.
		const repairedPath = await findModPath(fileName).catch(() => null) || primaryPath;
		if (allPaths.length > 1) {
			for (const otherPath of allPaths.slice(1)) {
				try {
					if (nodeFs.existsSync(repairedPath)) {
						await fs.copy(repairedPath, otherPath, { overwrite: true });
						console.log(`[REPAIR] Replaced corrupt copy at ${otherPath}`);
					}
				} catch (e) {
					console.warn(`[REPAIR] Could not replace copy at ${otherPath}: ${e.message}`);
				}
			}
		}

		return { success: true, fileName };
	} catch (err) {
		console.error(`[REPAIR] Failed to repair ${fileName}:`, err);
		return { success: false, error: err.message };
	}
}

/**
 * to find code-level conflicts where multiple mods overwrite or append to the 
 * exact same base game functions (e.g. Utils.overwrittenFunction).
 */
async function deepScanLuaConflicts(modsToScan) {
	// regex matches: Utils.overwrittenFunction( Vehicle, "update", ... )
	const regex = /Utils\.(overwritten|appended|prepended)Function\(\s*([^,]+),\s*["']([^"']+)["']/g;
	
	const overrides = new Map();

	for (const mod of modsToScan) {
		if (!mod.filePath || !nodeFs.existsSync(mod.filePath)) continue;
		
		try {
			const zip = new AdmZip(mod.filePath);
			const entries = zip.getEntries();
			for (const entry of entries) {
				if (entry.entryName.toLowerCase().endsWith('.lua')) {
					const content = entry.getData().toString('utf8');
					let match;
					while ((match = regex.exec(content)) !== null) {
						const type = match[1]; // overwritten, appended, prepended
						const baseObj = match[2].trim();
						const funcName = match[3].trim();
						const target = `${baseObj}.${funcName}`;
						
						if (!overrides.has(target)) overrides.set(target, []);
						const list = overrides.get(target);
						
						if (!list.find(x => x.modName === mod.modName)) {
							list.push({
								modName: mod.modName,
								title: mod.title,
								file: entry.entryName,
								type
							});
						}
					}
				}
			}
		} catch (err) {
			debugLog(`deepScanLuaConflicts failed to parse zip: ${mod.filePath} - ${err.message}`);
		}
	}

	const deepConflicts = [];
	overrides.forEach((involvedMods, target) => {
		if (involvedMods.length > 1) {
			deepConflicts.push({
				target,
				mods: involvedMods
			});
		}
	});

	return deepConflicts;
}

module.exports = {
	getModsPaths,
	getModsPath,
	getFS25DataRoot,
	getAllFS25DataRoots,
	scanLocalMods,
	getLastScanResult,
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
	deepScanLuaConflicts,
	getPersonalFolderPath: pathProvider.getPersonalFolderPath,
	pruneBackups,
	createFolder,
	renameFolder,
	deleteFolder,
	moveModsToFolder,
	moveFolderToDrive,
	flattenSubfolders,
	getDefaultModsPath,
	installLocalMods,
	restoreModVersion,
	batchInstallMods,
	deepScanModIcons,
	updateMod,
	autoInstallDependencies,
	autoResolveMissingDependencies,
	looksLikeMap,
    getFolderSize,
	resumePendingDownloads,
	prepareVirtualModsFolder,
	deduplicateSubfolderMods,
	syncMirrorLinks,
	ultraNormalize,
	getMapSubfolderName,
	isCrossplayMod,
	readEntryFromZip,
	listZipEntries,
	getCorruptMods,
	repairCorruptMod,
	consolidateDependencies,
	MAP_DEPENDENCIES_FOLDER,
};