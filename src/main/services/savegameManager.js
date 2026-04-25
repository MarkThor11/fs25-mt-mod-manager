const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { app } = require('electron');
const nodeFs = require('fs');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const pathProvider = require('./pathProvider');

// 🛠️ DIAGNOSTIC UTILITY 🛠️
const logFile = (app && typeof app.getPath === 'function') 
    ? path.join(app.getPath('userData'), 'download_debug.log')
    : path.join(process.cwd(), 'download_debug.log');
function debugLog(msg) {
    const entry = `${new Date().toISOString()} - ${msg}\n`;
    console.log(`[DEBUG] ${msg}`);
    try { nodeFs.appendFileSync(logFile, entry); } catch (e) {}
}

const parser = new XMLParser({ 
    ignoreAttributes: false, 
    attributeNamePrefix: '@_',
    parseAttributeValue: false, // CRITICAL: Keep as string to prevent stripping ="true"
    parseTagValue: false
});

// Helper to safely extract arrays from parsed XML
const getXMLArray = (obj, rootTag, itemTag) => {
    if (!obj) return [];
    // Case 1: { vehicles: { vehicle: [...] } }
    if (obj[rootTag] && obj[rootTag][itemTag]) {
        return Array.isArray(obj[rootTag][itemTag]) ? obj[rootTag][itemTag] : [obj[rootTag][itemTag]];
    }
    // Case 2: { vehicle: [...] } (root stripped)
    if (obj[itemTag]) {
        return Array.isArray(obj[itemTag]) ? obj[itemTag] : [obj[itemTag]];
    }
    // Case 3: { vehicles: [...] } (items directly under root tag)
    if (obj[rootTag] && Array.isArray(obj[rootTag])) return obj[rootTag];
    
    // Case 4: Deep search for the root tag if it's nested under ?xml
    if (obj['?xml'] || Object.keys(obj).length > 1) {
        for (const key in obj) {
            if (key === rootTag || key === itemTag) continue;
            if (typeof obj[key] === 'object') {
                const res = getXMLArray(obj[key], rootTag, itemTag);
                if (res.length > 0) return res;
            }
        }
    }
    return [];
};

const builder = new XMLBuilder({ 
    ignoreAttributes: false, 
    attributeNamePrefix: '@_', 
    format: true,
    suppressEmptyNode: true,
    processEntities: false,
    suppressBooleanAttributes: false
});

function getFs25Path() {
    return pathProvider.getFS25DataRoot();
}

function getTemplatesPath() {
    const p = path.join(getFs25Path(), 'modManagerTemplates');
    if (!fs.existsSync(p)) fs.ensureDirSync(p);
    return p;
}

function getElementText(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'i'));
    return match ? match[1] : null;
}

function isOfficialMap(mapId) {
    if (!mapId) return false;
    return ['MapUS', 'MapEU', 'MapAS', 'HighlandsFishingMap'].includes(mapId);
}

let cachedMapMods = null;
let lastModsScan = 0;

/**
 * Get all available map templates.
 */
async function getMapTemplates() {
    const templatesDir = getTemplatesPath();
    const folders = await fs.readdir(templatesDir);
    
    // 1. Get map mods (with 30s cache to prevent redundant heavy scans)
    const now = Date.now();
    const modManager = require('./modManager');
    
    if (!cachedMapMods || (now - lastModsScan) > 30000) {
        console.log('[MAPS] Refreshing map mods cache...');
        const { mods: allMods } = await modManager.scanLocalMods();
        cachedMapMods = allMods.filter(m => m.isMap);
        lastModsScan = now;
    }
    
    const mapMods = cachedMapMods;
    const dlcMappings = modManager.DLC_MAPPING || {};

    console.log(`[MAPS] Scanning ${folders.length} folders in ${templatesDir} (Parallel)`);

    const templatePromises = folders.map(async (folder) => {
        const folderPath = path.join(templatesDir, folder);
        try {
            const stats = await fs.stat(folderPath);
            if (!stats.isDirectory()) return null;

            const heightmap = path.join(folderPath, 'terrain.heightmap.png');
            if (!fs.existsSync(heightmap)) return null;

            // Try to find names in careerSavegame.xml if present
            let mapTitle = folder;
            let mapId = folder;
            const careerPath = path.join(folderPath, 'careerSavegame.xml');
            
            let xmlContent = null;
            if (fs.existsSync(careerPath)) {
                xmlContent = await fs.readFile(careerPath, 'utf8');
                mapTitle = getElementText(xmlContent, 'mapTitle') || folder;
                mapId = getElementText(xmlContent, 'mapId') || folder;
            }

            // Attempt a "Rich Match" using installed mods or DLCs
            const matchedMod = mapMods.find(m => {
                const mId = m.mapId;
                const mTitle = m.title;
                const mName = m.modName;
                const fLower = folder.toLowerCase();

                if (mId && mId === mapId) return true;
                if (mTitle && mTitle === mapTitle) return true;
                if (mName && mName === folder) return true;
                if (mId && mId.replace(/[^a-z0-9]/gi, '_') === folder) return true;
                
                if (mName && mId) {
                    const cleanMName = mName.toLowerCase().replace('pdlc_', '').replace(/[^a-z0-9]/gi, '_');
                    const cleanMId = mId.toLowerCase().replace(/[^a-z0-9]/gi, '_');
                    if (fLower.includes(cleanMName) && fLower.includes(cleanMId)) return true;
                }
                return false;
            });

            let dlcInfo = null;
            if (!matchedMod) {
                for (const info of Object.values(dlcMappings)) {
                    if (folder.toLowerCase().includes(info.dlcId?.toLowerCase())) {
                        dlcInfo = info;
                        break;
                    }
                }
            }

            // Count files efficiently
            const files = await fs.readdir(folderPath);

            return {
                id: folder,
                title: matchedMod ? matchedMod.title : (dlcInfo ? dlcInfo.title : mapTitle),
                mapId: matchedMod ? matchedMod.mapId : mapId,
                isModMap: !isOfficialMap(mapId),
                path: folderPath,
                created: stats.birthtime.toISOString(),
                filesCount: files.length,
                author: matchedMod ? matchedMod.author : (dlcInfo ? dlcInfo.author : (isOfficialMap(mapId) ? 'GIANTS Software' : 'Unknown')),
                version: matchedMod ? matchedMod.version : (dlcInfo ? dlcInfo.version : null)
            };
        } catch (err) {
            console.error(`[TEMPLATES] Skipping ${folder}: ${err.message}`);
            return null;
        }
    });

    const results = await Promise.all(templatePromises);
    return results.filter(t => t !== null);
}

/**
 * Delete a template from the library.
 */
async function deleteMapTemplate(folderName) {
    const templatesDir = getTemplatesPath();
    const target = path.join(templatesDir, folderName);
    if (fs.existsSync(target)) {
        await fs.remove(target);
        return { success: true };
    }
    return { success: false, error: 'Template not found' };
}

/**
 * Check if a map has a template.
 */
async function hasMapTemplate(mapId, mapTitle = null, modName = null) {
    if (!mapId) return false;
    const templatesDir = getTemplatesPath();
    const cleanMapId = mapId.replace(/[^a-z0-9]/gi, '_');
    
    // 1. Candidate folder names to check (Pre-calculate for speed)
    const candidates = new Set([cleanMapId]);
    if (modName) {
        const cleanMod = modName.replace(/[^a-z0-9]/gi, '_');
        candidates.add(`${cleanMod}_${cleanMapId}`);
        candidates.add(`${cleanMod}.${cleanMapId}`.replace(/[^a-z0-9]/gi, '_'));
        
        // Handle pdlc_ prefix bidirectional
        const baseMod = modName.startsWith('pdlc_') ? modName.substring(5) : modName;
        const cleanBase = baseMod.replace(/[^a-z0-9]/gi, '_');
        
        candidates.add(`${cleanBase}_${cleanMapId}`);
        candidates.add(`pdlc_${cleanBase}_${cleanMapId}`);
    }

    for (const cand of candidates) {
        const p = path.join(templatesDir, cand, 'terrain.heightmap.png');
        if (fs.existsSync(p)) return true;
    }

    // 2. Deep Scan Fallback (Look inside XMLs)
    const folders = await fs.readdir(templatesDir);
    for (const folder of folders) {
        const folderPath = path.join(templatesDir, folder);
        const careerPath = path.join(folderPath, 'careerSavegame.xml');
        if (fs.existsSync(careerPath)) {
            const xml = await fs.readFile(careerPath, 'utf8');
            const internalId = getElementText(xml, 'mapId');
            const internalTitle = getElementText(xml, 'mapTitle');
            
            if (internalId === mapId) return true;
            if (mapTitle && internalTitle === mapTitle) return true;
        }
    }

    return false;
}

/**
 * Get mods for a specific savegame.
 */
async function getSavegameMods(savegamePath) {
    const careerPath = path.join(savegamePath, 'careerSavegame.xml');
    if (!fs.existsSync(careerPath)) return { mods: [] };

    try {
        const xml = await fs.readFile(careerPath, 'utf8');
        const data = parser.parse(xml);
        
        if (!data || !data.careerSavegame) {
            console.warn(`[SAVEGAME] Invalid careerSavegame.xml structure in ${savegamePath}`);
            return { mods: [] };
        }

        const mods = [];
        const modEntries = data.careerSavegame.mod || data.careerSavegame.mods?.mod || [];
        const entries = Array.isArray(modEntries) ? modEntries : [modEntries];
        
        for (const entry of entries) {
            if (entry && entry['@_modName']) {
                mods.push({
                    modName: entry['@_modName'],
                    title: entry['@_title'] || entry['@_modName'],
                    version: entry['@_version'] || '1.0.0.0',
                    required: entry['@_required'] === 'true'
                });
            }
        }
        return { mods };
    } catch (err) {
        console.error(`[SAVEGAME] Error parsing mods for ${savegamePath}:`, err.message);
        return { mods: [] };
    }
}

/**
 * Set mods for a specific savegame.
 */
async function setSavegameMods(savegamePath, mods) {
    const careerPath = path.join(savegamePath, 'careerSavegame.xml');
    if (!fs.existsSync(careerPath)) throw new Error('careerSavegame.xml not found');

    const xml = await fs.readFile(careerPath, 'utf8');
    const data = parser.parse(xml);

    // Identify which mod is the map by looking at settings
    const mapId = data.careerSavegame.settings?.mapId;
    const mapTitle = data.careerSavegame.settings?.mapTitle;

    data.careerSavegame.mod = mods.map(m => {
        // If it's a map (either explicitly marked or matches mapId/title), set required="true"
        const isMap = m.required || (mapId && m.modName === mapId.split('.')[0]) || (mapTitle && m.title === mapTitle);
        return {
            '@_modName': m.modName,
            '@_title': m.title,
            '@_version': m.version || '1.0.0.0',
            '@_required': isMap ? 'true' : 'false',
            '@_fileHash': m.fileHash || ''
        };
    });
    
    // Remove the old wrapper if it exists
    if (data.careerSavegame.mods) delete data.careerSavegame.mods;

    const newXml = builder.build(data);
    await fs.writeFile(careerPath, newXml);
    return { success: true };
}

/**
 * Create a new savegame from a template.
 */
async function createSavegameWithMods(savegameIndex, savegameName, selectedMods, opts = {}) {
    const fs25Path = getFs25Path();
    const slotPath = path.join(fs25Path, `savegame${savegameIndex}`);
    const templatesDir = getTemplatesPath();
    let requiresEngineInit = false;
    
    const { mapId, mapTitle, mapModName, money = 1000000, difficulty = 1, mode = 'NEW_FARMER' } = opts;

    // 1. Prepare Slot
    if (fs.existsSync(slotPath)) {
        // Archive existing if needed? For now just overwrite safely if empty
        await fs.emptyDir(slotPath);
    } else {
        await fs.ensureDir(slotPath);
    }

    // 2. Identify and Copy Template
    let templateFolder = mapId.replace(/[^a-z0-9]/gi, '_');
    if (mapModName) {
        const cleanMod = mapModName.replace(/[^a-z0-9]/gi, '_');
        const p1 = path.join(templatesDir, `${cleanMod}_${templateFolder}`);
        if (fs.existsSync(p1)) templateFolder = `${cleanMod}_${templateFolder}`;
    }

    const templatePath = path.join(templatesDir, templateFolder);
    if (fs.existsSync(templatePath)) {
        console.log(`[CREATE] Copying template from ${templateFolder}`);
        await fs.copy(templatePath, slotPath);
    } else {
        // Create minimal savegame structure if no template
        console.warn(`[CREATE] No template found for ${mapId}. Creating minimal save.`);
        requiresEngineInit = true;
    }

    // 3. Update careerSavegame.xml
    const careerPath = path.join(slotPath, 'careerSavegame.xml');
    const today = new Date().toISOString().split('T')[0];

    const finalMods = [...selectedMods];
    // Add map mod if not already there
    if (mapModName && !finalMods.find(m => m.modName === mapModName)) {
        finalMods.unshift({ modName: mapModName, title: mapTitle, version: '1.0.0.0', required: true });
    }

    const modData = finalMods.map(mod => {
        // The unshifted map mod has required: true
        const isRequired = mod.required === true || (mapModName && mod.modName === mapModName);
        return {
            '@_modName': mod.modName,
            '@_title': mod.title || mod.modName,
            '@_version': mod.version || '1.0.0.0',
            '@_required': isRequired ? 'true' : 'false',
            '@_fileHash': mod.fileHash || ''
        };
    });

    const savegameData = {
        careerSavegame: {
            '@_revision': '2',
            '@_valid': 'true',
            settings: {
                savegameName: savegameName,
                creationDate: today,
                mapId: mapId,
                mapTitle: mapTitle,
                saveDateFormatted: today,
                saveDate: today,
                initialMoney: String(money),
                difficulty: String(difficulty),
                economicDifficulty: 'NORMAL',
                loadDefaultFarm: 'true',
                loadDefaultVehicles: 'true',
                isCrossPlatformSavegame: 'true'
            },
            statistics: {
                money: String(money)
            },
            mod: modData
        }
    };

    let xmlOutput = builder.build(savegameData);
    
    // Ensure XML declaration
    if (!xmlOutput.startsWith('<?xml')) {
        xmlOutput = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + xmlOutput;
    }

    await fs.writeFile(careerPath, xmlOutput);
    return { success: true, path: slotPath, requiresEngineInit, mapId };
}

/**
 * Surgical attribute update for a savegame XML
 */
async function updateSavegameAttribute(savePath, fileType, attribute, value) {
    const fileName = fileType === 'career' ? 'careerSavegame.xml' : (fileType === 'farms' ? 'farms.xml' : (fileType === 'environment' ? 'environment.xml' : null));
    if (!fileName) return { success: false, error: 'Invalid file type' };

    const filePath = path.join(savePath, fileName);
    if (!fs.existsSync(filePath)) return { success: false, error: `${fileName} not found` };

    const xml = await fs.readFile(filePath, 'utf8');
    const data = parser.parse(xml);

    // Ensure value is a string for XML building to prevent attribute stripping
    const stringValue = typeof value === 'boolean' ? String(value) : value;

    if (fileType === 'career') {
        if (!data.careerSavegame.settings) data.careerSavegame.settings = {};
        const settings = data.careerSavegame.settings;
        
        if (attribute === 'savegameName') settings.savegameName = stringValue;
        else if (attribute === 'playerName') settings.playerName = stringValue;
        else if (attribute === 'economicDifficulty') settings.economicDifficulty = stringValue;
        else if (attribute === 'timeScale') settings.timeScale = stringValue;
        else if (attribute === 'autoSaveInterval') settings.autoSaveInterval = stringValue;
        else if (attribute === 'plannedDaysPerPeriod') settings.plannedDaysPerPeriod = stringValue;
        else if (attribute === 'trafficEnabled') settings.trafficEnabled = stringValue;
        else if (attribute === 'fruitDestruction') settings.fruitDestruction = stringValue;
        else if (attribute === 'plowingRequiredEnabled') settings.plowingRequiredEnabled = stringValue;
        else if (attribute === 'limeRequired') settings.limeRequired = stringValue;
        else if (attribute === 'stonesEnabled') settings.stonesEnabled = stringValue;
        else if (attribute === 'weedsEnabled') settings.weedsEnabled = stringValue;
        else if (attribute === 'isSnowEnabled') settings.isSnowEnabled = stringValue;
        else if (attribute === 'stopAndGoBraking') settings.stopAndGoBraking = stringValue;
        else if (attribute === 'trailerFillLimit') settings.trailerFillLimit = stringValue;
        else if (attribute === 'automaticMotorStartEnabled') settings.automaticMotorStartEnabled = stringValue;
        else if (attribute === 'isTrainTabEnabled') settings.isTrainTabEnabled = stringValue;
    } else if (fileType === 'farms') {
        if (!data.farms || !data.farms.farm) return { success: false, error: 'No farms found in farms.xml' };
        const farm = Array.isArray(data.farms.farm) ? data.farms.farm[0] : data.farms.farm;
        if (attribute === 'money') {
            farm['@_money'] = stringValue;
            // Also update careerSavegame statistics for consistency
            const careerPath = path.join(savePath, 'careerSavegame.xml');
            if (fs.existsSync(careerPath)) {
                const cXml = await fs.readFile(careerPath, 'utf8');
                const cData = parser.parse(cXml);
                if (!cData.careerSavegame.statistics) cData.careerSavegame.statistics = {};
                cData.careerSavegame.statistics.money = stringValue;
                await fs.writeFile(careerPath, builder.build(cData));
            }
        } else if (attribute === 'loan') {
            farm['@_loan'] = stringValue;
        }
    }
 else if (fileType === 'environment') {
        if (attribute === 'currentPeriod') data.environment.currentPeriod = stringValue;
        else if (attribute === 'daysPerPeriod') data.environment.daysPerPeriod = stringValue;
    }

    const newXml = builder.build(data);
    console.log(`[SAVE EDIT] Writing ${attribute}=${stringValue} to ${filePath}`);
    await fs.writeFile(filePath, newXml);
    return { success: true };
}

/**
 * Bulk update vehicle attributes (dirt, repair, paint)
 */
async function updateFleetMaintenance(savePath, type, value) {
    const vehiclePath = path.join(savePath, 'vehicles.xml');
    if (!fs.existsSync(vehiclePath)) return { success: false, error: 'vehicles.xml not found' };

    const xml = await fs.readFile(vehiclePath, 'utf8');
    const data = parser.parse(xml);
    
    if (!data.vehicles || !data.vehicles.vehicle) return { success: true }; // No vehicles to update

    const vehicles = Array.isArray(data.vehicles.vehicle) ? data.vehicles.vehicle : [data.vehicles.vehicle];
    
    vehicles.forEach(v => {
        if (type === 'dirt' && v.wearable) v.wearable['@_dirtAmount'] = value;
        if (type === 'repair' && v.wearable) v.wearable['@_wearAmount'] = 1 - value; // wear is 0-1, 0 is perfect
        if (type === 'paint' && v.wearable) v.wearable['@_paintAmount'] = value;
    });

    await fs.writeFile(vehiclePath, builder.build(data));
    return { success: true };
}

/**
 * Get all savegame slots (re-implement for consistency)
 */
async function getAllSavegames() {
    const fs25Path = getFs25Path();
    const savegames = [];
    debugLog(`[SAVEGAMES] Scanning slots 1-20 in ${fs25Path}...`);
    for (let i = 1; i <= 20; i++) {
        const savePath = path.join(fs25Path, `savegame${i}`);
        if (fs.existsSync(savePath) && fs.existsSync(path.join(savePath, 'careerSavegame.xml'))) {
            const xml = await fs.readFile(path.join(savePath, 'careerSavegame.xml'), 'utf8');
            const data = parser.parse(xml);
            debugLog(`[SAVEGAMES] Found slot ${i}: size=${xml.length} bytes`);
            const settings = data.careerSavegame.settings;
            const stats = data.careerSavegame.statistics;

            savegames.push({
                index: i,
                path: savePath,
                folderName: `savegame${i}`,
                farmName: settings['@_savegameName'] || settings.savegameName || 'Unnamed Farm',
                playerName: settings['@_playerName'] || settings.playerName || 'Farmer',
                mapId: settings['@_mapId'] || settings.mapId,
                mapTitle: settings['@_mapTitle'] || settings.mapTitle,
                money: parseFloat(stats?.['@_money'] || stats?.money || 0),
                playTime: parseFloat(stats?.['@_playTime'] || stats?.playTime || 0),
                lastSaveDate: settings['@_saveDateFormatted'] || settings.saveDateFormatted,
                modCount: (Array.isArray(data.careerSavegame.mod) ? data.careerSavegame.mod.length : (data.careerSavegame.mod ? 1 : (data.careerSavegame.mods?.mod?.length || 0))),
                // Add more settings for the editor
                economicDifficulty: settings['@_economicDifficulty'] || settings.economicDifficulty,
                autoSaveInterval: settings['@_autoSaveInterval'] || settings.autoSaveInterval,
                timeScale: settings['@_timeScale'] || settings.timeScale,
                currentPeriod: data.careerSavegame.environment?.currentPeriod,
                plannedDaysPerPeriod: settings['@_plannedDaysPerPeriod'] || settings.plannedDaysPerPeriod,
                trafficEnabled: (settings['@_trafficEnabled'] || settings.trafficEnabled) !== 'false',
                fruitDestruction: (settings['@_fruitDestruction'] || settings.fruitDestruction) !== 'false',
                plowingRequiredEnabled: (settings['@_plowingRequiredEnabled'] || settings.plowingRequiredEnabled) === 'true',
                limeRequired: (settings['@_limeRequired'] || settings.limeRequired) !== 'false',
                stonesEnabled: (settings['@_stonesEnabled'] || settings.stonesEnabled) !== 'false',
                weedsEnabled: (settings['@_weedsEnabled'] || settings.weedsEnabled) !== 'false',
                isSnowEnabled: (settings['@_isSnowEnabled'] || settings.isSnowEnabled) !== 'false',
                stopAndGoBraking: (settings['@_stopAndGoBraking'] || settings.stopAndGoBraking) !== 'false',
                trailerFillLimit: (settings['@_trailerFillLimit'] || settings.trailerFillLimit) === 'true',
                automaticMotorStartEnabled: (settings['@_automaticMotorStartEnabled'] || settings.automaticMotorStartEnabled) !== 'false',
                isTrainTabEnabled: (settings['@_isTrainTabEnabled'] || settings.isTrainTabEnabled) !== 'false',
                mods: (Array.isArray(data.careerSavegame.mod) ? data.careerSavegame.mod : (data.careerSavegame.mod ? [data.careerSavegame.mod] : (data.careerSavegame.mods?.mod || []))).map(m => ({
                    modName: m['@_modName'] || m.modName,
                    title: m['@_title'] || m.title,
                    version: m['@_version'] || m.version
                }))
            });
        }
    }
    debugLog(`[SAVEGAMES] Scan complete. Total slots found: ${savegames.length}`);
    return { savegames };
}

/**
 * Get surgical data for transfer
 */
/**
 * Unified Data Extraction Layer
 * Parses all relevant XMLs and normalizes into TransferItems
 */
async function getSavegameTransferData({ savePath }) {
    debugLog(`[TRANSFER] Loading data from ${savePath}`);
    const data = { 
        money: 0, 
        items: [], // All normalized TransferItems
        farms: [], // Available farms for selection
        mods: []   // Installed mods in this save
    };
    
    // 1. Get Mods (for validation)
    const careerPath = path.join(savePath, 'careerSavegame.xml');
    if (fs.existsSync(careerPath)) {
        debugLog("Parsing careerSavegame.xml...");
        const xml = await fs.readFile(careerPath, 'utf8');
        const parsed = parser.parse(xml);
        const career = parsed.careerSavegame || parsed;
        
        // Extract Mods
        const modEntries = getXMLArray(career, 'mods', 'mod');
        data.mods = modEntries.map(m => m?.['@_modName']).filter(Boolean);

        // Extract Stats (Global Money as fallback)
        if (career.statistics) {
            data.money = parseFloat(career.statistics['@_money'] || career.statistics.money || 0);
        }
    }

    // 2. Get Farms (Multiplayer/Farm Selection)
    const farmsPath = path.join(savePath, 'farms.xml');
    if (fs.existsSync(farmsPath)) {
        debugLog("Parsing farms.xml...");
        const xml = await fs.readFile(farmsPath, 'utf8');
        const parsed = parser.parse(xml);
        const farms = getXMLArray(parsed, 'farms', 'farm');
        
        data.farms = farms.map(f => ({
            id: parseInt(f['@_farmId'] || 1),
            name: f['@_name'] || `Farm ${f['@_farmId'] || 1}`,
            money: parseFloat(f['@_money'] || 0)
        }));

        // Use the first farm's money if available
        if (data.farms.length > 0) {
            data.money = data.farms[0].money;
        }
    }

    // 3. Extract Assets (Vehicles, Items, Placeables, Animals)
    const assets = [];

    // --- A. Vehicles & Tools (vehicles.xml) ---
    const vehsPath = path.join(savePath, 'vehicles.xml');
    if (fs.existsSync(vehsPath)) {
        const xml = await fs.readFile(vehsPath, 'utf8');
        const parsed = parser.parse(xml);
        
        // Robust vehicle list extraction
        let rawVehicles = [];
        if (parsed.vehicles && parsed.vehicles.vehicle) {
            rawVehicles = Array.isArray(parsed.vehicles.vehicle) ? parsed.vehicles.vehicle : [parsed.vehicles.vehicle];
        } else if (parsed.vehicle) {
            rawVehicles = Array.isArray(parsed.vehicle) ? parsed.vehicle : [parsed.vehicle];
        }

        rawVehicles.forEach(v => {
            if (!v || typeof v !== 'object') return;
            // EXCLUDE leased and mission items (user requested)
            if (v['@_isLeased'] === 'true' || v['@_propertyState'] === 'MISSION') return;
            if (!v['@_filename']) return;

            const filename = (v['@_filename'] || '').toLowerCase();
            const modName = v['@_modName'];
            const isMotorized = v['@_isMotorized'] === 'true' || 
                               v.motorized !== undefined || 
                               v.fuelConsumer !== undefined || 
                               v.drivable !== undefined || 
                               v.enterable !== undefined ||
                               v.wheels !== undefined; // Wheels are a strong indicator of a vehicle/implement

            let category = isMotorized ? "vehicle" : "tool";
            if (isPallet) category = "pallet";
            else if (isBale) category = "bale";
            else if (isHandtool) category = "tool";
            
            assets.push({
                category: category,
                displayName: path.basename(v['@_filename'], '.xml').replace(/_/g, ' ').toUpperCase(),
                filename: v['@_filename'],
                modName: modName,
                farmId: parseInt(v['@_farmId'] || 1),
                data: v, // Keep original for transfer
                quantity: 1
            });
        });
    }

    // --- B. Pallets, Bags, Bales (items.xml) ---
    const itemsPath = path.join(savePath, 'items.xml');
    if (fs.existsSync(itemsPath)) {
        const xml = await fs.readFile(itemsPath, 'utf8');
        const parsed = parser.parse(xml);
        const itemsRoot = parsed.items || parsed;
        const items = Array.isArray(itemsRoot.item) ? itemsRoot.item : [itemsRoot.item].filter(Boolean);
        
        items.forEach(item => {
            const filename = (item['@_filename'] || '').toLowerCase();
            const isBale = filename.includes('bale');
            const isPallet = filename.includes('pallet') || filename.includes('bigbag');
            const isHandtool = filename.includes('handtool') || filename.includes('chainsaw');

            let category = "pallet"; // Default for items.xml
            if (isBale) category = "bale";
            else if (isHandtool) category = "tool";
            else if (isPallet) category = "pallet";
            else category = "tool"; // Fallback for other items in items.xml to tools section

            const fillType = item.fillUnit?.['@_fillType'] || item['@_fillType'] || "UNKNOWN";
            const fillLevel = parseFloat(item.fillUnit?.['@_fillLevel'] || item['@_fillLevel'] || 0);

            assets.push({
                category: category,
                displayName: path.basename(item['@_filename'], '.xml').replace(/_/g, ' ').toUpperCase(),
                filename: item['@_filename'],
                fillType: fillType,
                fillLevel: fillLevel,
                farmId: parseInt(item['@_farmId'] || 1),
                data: item,
                quantity: 1
            });
        });
    }

    // --- C. Bulk Storage (placeables.xml) ---
    const placeablesPath = path.join(savePath, 'placeables.xml');
    if (fs.existsSync(placeablesPath)) {
        const xml = await fs.readFile(placeablesPath, 'utf8');
        const parsed = parser.parse(xml);
        const plcsRoot = parsed.placeables || parsed;
        const placeables = Array.isArray(plcsRoot.placeable) ? plcsRoot.placeable : [plcsRoot.placeable].filter(Boolean);
        
        placeables.forEach(p => {
            const farmId = parseInt(p['@_farmId'] || 1);
            
            // Silos / Storages - More aggressive child scanning
            if (p.storage && typeof p.storage === 'object') {
                // Check for 'node', 'fillLevel', or any direct child with fillType/fillLevel
                const storageChildren = Object.keys(p.storage).filter(k => !k.startsWith('@'));
                storageChildren.forEach(childKey => {
                    const children = Array.isArray(p.storage[childKey]) ? p.storage[childKey] : [p.storage[childKey]];
                    children.forEach(n => {
                        if (!n || typeof n !== 'object') return;
                        const ft = n['@_fillType'] || n['@_fillTypeName'] || n['@_type'];
                        const fl = parseFloat(n['@_fillLevel'] || n['@_level'] || 0);
                        if (typeof ft === 'string' && fl > 0) {
                            assets.push({
                                category: "fillType",
                                displayName: ft.replace('FILLTYPE_', '').replace(/_/g, ' ').toUpperCase(),
                                fillType: ft,
                                quantity: fl,
                                farmId: farmId,
                                sourceType: `silo_${childKey}`
                            });
                        }
                    });
                });
            }

            // Bunker Silos (BGA/Silage)
            if (p.bunkerSilo) {
                const level = parseFloat(p.bunkerSilo['@_fillLevel'] || 0);
                if (level > 0) {
                    assets.push({
                        category: "fillType",
                        displayName: "Silage (Bunker)",
                        fillType: "SILAGE",
                        quantity: level,
                        farmId: farmId,
                        sourceType: 'bunker'
                    });
                }
            }

            // Husbandry Meadow (Pasture Storage)
            if (p.husbandryMeadow?.fillType) {
                const nodes = Array.isArray(p.husbandryMeadow.fillType) ? p.husbandryMeadow.fillType : [p.husbandryMeadow.fillType];
                nodes.forEach(n => {
                    const level = parseFloat(n['@_fillLevel'] || 0);
                    if (level > 0) {
                        assets.push({
                            category: "fillType",
                            displayName: (n['@_name'] || 'Grass').replace('FILLTYPE_', '').replace(/_/g, ' '),
                            fillType: n['@_name'],
                            quantity: level,
                            farmId: farmId,
                            sourceType: 'meadow'
                        });
                    }
                });
            }

            // Productions / Production Storage
            if (p.productionPoint?.storage) {
                const nodes = Array.isArray(p.productionPoint.storage.node) ? p.productionPoint.storage.node : (p.productionPoint.storage.node ? [p.productionPoint.storage.node] : []);
                nodes.forEach(n => {
                    const level = parseFloat(n['@_fillLevel'] || 0);
                    if (level > 0) {
                        assets.push({
                            category: "fillType",
                            displayName: (n['@_fillType'] || 'UNKNOWN').replace('FILLTYPE_', '').replace(/_/g, ' '),
                            fillType: n['@_fillType'],
                            quantity: level,
                            farmId: farmId,
                            sourceType: 'production'
                        });
                    }
                });
            }

            // Husbandry Food Silos (Feed/Grains in barns)
            if (p.husbandryFood?.storage) {
                const nodes = Array.isArray(p.husbandryFood.storage.node) ? p.husbandryFood.storage.node : (p.husbandryFood.storage.node ? [p.husbandryFood.storage.node] : []);
                nodes.forEach(n => {
                    const level = parseFloat(n['@_fillLevel'] || 0);
                    if (level > 0) {
                        assets.push({
                            category: "fillType",
                            displayName: (n['@_fillType'] || 'UNKNOWN').replace('FILLTYPE_', '').replace(/_/g, ' '),
                            fillType: n['@_fillType'],
                            quantity: level,
                            farmId: farmId,
                            sourceType: 'husbandry_feed'
                        });
                    }
                });
            }

            // Dynamic Storage (Modded silos or specific storages)
            if (p.dynamicStorage) {
                const nodes = Array.isArray(p.dynamicStorage.node) ? p.dynamicStorage.node : (p.dynamicStorage.node ? [p.dynamicStorage.node] : []);
                nodes.forEach(n => {
                    const level = parseFloat(n['@_fillLevel'] || 0);
                    if (level > 0) {
                        assets.push({
                            category: "fillType",
                            displayName: (n['@_fillType'] || 'UNKNOWN').replace('FILLTYPE_', '').replace(/_/g, ' '),
                            fillType: n['@_fillType'],
                            quantity: level,
                            farmId: farmId,
                            sourceType: 'dynamic'
                        });
                    }
                });
            }

            // Husbandry Animals
            if (p.husbandryAnimals?.clusters?.animal) {
                const clusters = Array.isArray(p.husbandryAnimals.clusters.animal) ? p.husbandryAnimals.clusters.animal : [p.husbandryAnimals.clusters.animal];
                clusters.forEach(c => {
                    assets.push({
                        category: "animal",
                        displayName: `${c['@_subType']} (${c['@_age']} mo)`,
                        subType: c['@_subType'],
                        age: parseInt(c['@_age']),
                        quantity: parseInt(c['@_numAnimals'] || 1),
                        farmId: farmId,
                        data: c
                    });
                });
            }
        });
    }

    // 4. Aggregation Layer
    const aggregated = {};
    assets.forEach((item, idx) => {
        // Only aggregate stackable items (pallets, bales, fillTypes, animals)
        // Vehicles and Tools should always show as full individual blocks (requested)
        const isStackable = item.category !== 'vehicle' && item.category !== 'tool';
        
        if (!isStackable) {
            // Unique key for individual vehicles/tools
            const uniqueKey = `unique_${item.category}_${idx}`;
            aggregated[uniqueKey] = { ...item };
            return;
        }

        const key = `${item.category}_${item.filename || ''}_${item.fillType || ''}_${item.subType || ''}_${item.age || ''}`;
        if (!aggregated[key]) {
            aggregated[key] = { ...item };
        } else {
            aggregated[key].quantity += item.quantity;
        }
    });

    data.items = Object.values(aggregated);
    return data;
}


/**
 * Execute transfer between savegames
 */
/**
 * Execute transfer between savegames with strict Deduction-then-Insertion pipeline
 */
async function executeTransfer(sourcePath, destPath, options) {
    const { transferMoney, moneyAmount, selectedItems, sourceFarmId, destFarmId } = options;
    const fileCache = {};

    const loadFile = async (savePath, name) => {
        const filePath = path.join(savePath, name);
        if (fileCache[filePath]) return fileCache[filePath];
        if (!fs.existsSync(filePath)) return null;
        const xml = await fs.readFile(filePath, 'utf8');
        const data = parser.parse(xml);
        fileCache[filePath] = data;
        return data;
    };

    const flushFiles = async () => {
        for (const [filePath, data] of Object.entries(fileCache)) {
            await fs.writeFile(filePath, builder.build(data));
        }
    };

    try {
        // --- PREPARE DATA ---
        const sVehicles = await loadFile(sourcePath, 'vehicles.xml');
        const dVehicles = await loadFile(destPath, 'vehicles.xml');
        const sItems = await loadFile(sourcePath, 'items.xml');
        const dItems = await loadFile(destPath, 'items.xml');
        const sPlaceables = await loadFile(sourcePath, 'placeables.xml');
        const dPlaceables = await loadFile(destPath, 'placeables.xml');
        const sFarms = await loadFile(sourcePath, 'farms.xml');
        const dFarms = await loadFile(destPath, 'farms.xml');
        const sCareer = await loadFile(sourcePath, 'careerSavegame.xml');
        const dCareer = await loadFile(destPath, 'careerSavegame.xml');

        // ID Counters
        const getNextId = (root, tag) => {
            const nodes = Array.isArray(root[tag]) ? root[tag] : [root[tag]].filter(Boolean);
            const ids = nodes.map(n => parseInt(n['@_id'] || 0));
            return Math.max(0, ...ids) + 1;
        };

        let nextVehicleId = dVehicles ? getNextId(dVehicles.vehicles || dVehicles, 'vehicle') : 1;
        let nextItemId = dItems ? getNextId(dItems.items || dItems, 'item') : 1;

        // Store Position
        const storePos = "0 50 0"; // Fallback, could be improved with map-specific defaults

        // --- EXECUTE TRANSFER PIPELINE ---

        for (const item of selectedItems) {
            const { category, quantity, transferQuantity } = item;
            const amount = transferQuantity || quantity;

            // 1. Vehicles / Tools
            if (category === 'vehicle' || category === 'tool') {
                const sRoot = sVehicles.vehicles || sVehicles;
                const dRoot = dVehicles.vehicles || dVehicles;
                if (!dRoot.vehicle) dRoot.vehicle = [];
                
                const sList = Array.isArray(sRoot.vehicle) ? sRoot.vehicle : [sRoot.vehicle];
                // Find matching vehicles in source
                let moved = 0;
                for (let i = sList.length - 1; i >= 0; i--) {
                    if (moved >= amount) break;
                    const v = sList[i];
                    if (v['@_filename'] === item.filename && parseInt(v['@_farmId']) === sourceFarmId) {
                        // DEDUCT
                        sList.splice(i, 1);
                        
                        // INSERT
                        const clone = JSON.parse(JSON.stringify(v));
                        clone['@_id'] = String(nextVehicleId++);
                        clone['@_farmId'] = String(destFarmId);
                        clone['@_position'] = storePos;
                        clone['@_rotation'] = "0 0 0";
                        
                        if (Array.isArray(dRoot.vehicle)) dRoot.vehicle.push(clone);
                        else dRoot.vehicle = [dRoot.vehicle, clone];
                        
                        moved++;
                    }
                }
                sRoot.vehicle = sList.length === 1 ? sList[0] : sList;
                if (Array.isArray(dRoot.vehicle) && dRoot.vehicle.length === 1) dRoot.vehicle = dRoot.vehicle[0];
            }

            // 2. Pallets / Bales
            if (category === 'pallet' || category === 'bale') {
                const sRoot = sItems.items || sItems;
                const dRoot = dItems.items || dItems;
                if (!dRoot.item) dRoot.item = [];

                const sList = Array.isArray(sRoot.item) ? sRoot.item : [sRoot.item];
                let moved = 0;
                for (let i = sList.length - 1; i >= 0; i--) {
                    if (moved >= amount) break;
                    const it = sList[i];
                    if (it['@_filename'] === item.filename && parseInt(it['@_farmId']) === sourceFarmId) {
                        // DEDUCT
                        sList.splice(i, 1);

                        // INSERT
                        const clone = JSON.parse(JSON.stringify(it));
                        clone['@_id'] = String(nextItemId++);
                        clone['@_farmId'] = String(destFarmId);
                        clone['@_position'] = storePos;

                        if (Array.isArray(dRoot.item)) dRoot.item.push(clone);
                        else dRoot.item = [dRoot.item, clone];

                        moved++;
                    }
                }
                sRoot.item = sList.length === 1 ? sList[0] : sList;
                if (Array.isArray(dRoot.item) && dRoot.item.length === 1) dRoot.item = dRoot.item[0];
            }

            // 3. Bulk Storage (FillTypes)
            if (category === 'fillType') {
                let remainingToDeduct = amount;
                const sPlcsList = Array.isArray(sPlaceables.placeables?.placeable || sPlaceables.placeable) ? (sPlaceables.placeables?.placeable || sPlaceables.placeable) : [sPlaceables.placeables?.placeable || sPlaceables.placeable].filter(Boolean);
                
                // DEDUCT
                sPlcsList.forEach(p => {
                    if (remainingToDeduct <= 0 || parseInt(p['@_farmId']) !== sourceFarmId) return;
                    if (p.storage) {
                        const nodes = Array.isArray(p.storage.node) ? p.storage.node : [p.storage.node].filter(Boolean);
                        nodes.forEach(n => {
                            if (n['@_fillType'] === item.fillType) {
                                const level = parseFloat(n['@_fillLevel'] || 0);
                                const toTake = Math.min(level, remainingToDeduct);
                                n['@_fillLevel'] = String(level - toTake);
                                remainingToDeduct -= toTake;
                            }
                        });
                    }
                });

                // INSERT
                let remainingToInsert = amount - remainingToDeduct; // Only insert what we actually found to deduct
                const dPlcsList = Array.isArray(dPlaceables.placeables?.placeable || dPlaceables.placeable) ? (dPlaceables.placeables?.placeable || dPlaceables.placeable) : [dPlaceables.placeables?.placeable || dPlaceables.placeable].filter(Boolean);
                
                for (const p of dPlcsList) {
                    if (remainingToInsert <= 0 || parseInt(p['@_farmId']) !== destFarmId) continue;
                    if (p.storage) {
                        const cap = parseFloat(p['@_capacity'] || 1000000);
                        const nodes = Array.isArray(p.storage.node) ? p.storage.node : [p.storage.node].filter(Boolean);
                        const totalFill = nodes.reduce((sum, n) => sum + parseFloat(n['@_fillLevel'] || 0), 0);
                        const space = Math.max(0, cap - totalFill);
                        
                        let node = nodes.find(n => n['@_fillType'] === item.fillType);
                        if (!node && space > 0) {
                            node = { '@_fillType': item.fillType, '@_fillLevel': "0" };
                            if (Array.isArray(p.storage.node)) p.storage.node.push(node);
                            else p.storage.node = [p.storage.node, node];
                        }

                        if (node) {
                            const toAdd = Math.min(space, remainingToInsert);
                            node['@_fillLevel'] = String(parseFloat(node['@_fillLevel']) + toAdd);
                            remainingToInsert -= toAdd;
                        }
                    }
                }
                
                // Handle Overflow (Fallback to pallets?)
                if (remainingToInsert > 0) {
                    debugLog(`[TRANSFER] Warning: ${remainingToInsert} L of ${item.fillType} could not fit in destination storage.`);
                }
            }

            // 4. Animals
            if (category === 'animal') {
                let remainingToMove = amount;
                const sPlcsList = Array.isArray(sPlaceables.placeables?.placeable || sPlaceables.placeable) ? (sPlaceables.placeables?.placeable || sPlaceables.placeable) : [sPlaceables.placeables?.placeable || sPlaceables.placeable].filter(Boolean);
                const dPlcsList = Array.isArray(dPlaceables.placeables?.placeable || dPlaceables.placeable) ? (dPlaceables.placeables?.placeable || dPlaceables.placeable) : [dPlaceables.placeables?.placeable || dPlaceables.placeable].filter(Boolean);

                // DEDUCT & INSERT
                sPlcsList.forEach(sp => {
                    if (remainingToMove <= 0 || parseInt(sp['@_farmId']) !== sourceFarmId) return;
                    if (sp.husbandryAnimals?.clusters?.animal) {
                        const clusters = Array.isArray(sp.husbandryAnimals.clusters.animal) ? sp.husbandryAnimals.clusters.animal : [sp.husbandryAnimals.clusters.animal];
                        for (let i = clusters.length - 1; i >= 0; i--) {
                            const c = clusters[i];
                            if (c['@_subType'] === item.subType && parseInt(c['@_age']) === item.age) {
                                const count = parseInt(c['@_numAnimals'] || 1);
                                const toMove = Math.min(count, remainingToMove);
                                
                                // Subtract from source
                                if (toMove >= count) clusters.splice(i, 1);
                                else c['@_numAnimals'] = String(count - toMove);
                                
                                // Add to destination (find compatible husbandry)
                                let added = false;
                                for (const dp of dPlcsList) {
                                    if (parseInt(dp['@_farmId']) === destFarmId && dp.husbandryAnimals) {
                                        if (!dp.husbandryAnimals.clusters) dp.husbandryAnimals.clusters = { animal: [] };
                                        const dClusters = Array.isArray(dp.husbandryAnimals.clusters.animal) ? dp.husbandryAnimals.clusters.animal : [dp.husbandryAnimals.clusters.animal].filter(Boolean);
                                        
                                        let target = dClusters.find(dc => dc['@_subType'] === item.subType && parseInt(dc['@_age']) === item.age);
                                        if (target) {
                                            target['@_numAnimals'] = String(parseInt(target['@_numAnimals']) + toMove);
                                        } else {
                                            const clone = JSON.parse(JSON.stringify(c));
                                            clone['@_numAnimals'] = String(toMove);
                                            clone['@_farmId'] = String(destFarmId);
                                            dClusters.push(clone);
                                        }
                                        dp.husbandryAnimals.clusters.animal = dClusters.length === 1 ? dClusters[0] : dClusters;
                                        added = true;
                                        break;
                                    }
                                }
                                remainingToMove -= toMove;
                            }
                        }
                        sp.husbandryAnimals.clusters.animal = clusters.length === 1 ? clusters[0] : (clusters.length === 0 ? undefined : clusters);
                    }
                });
            }
        }

        // --- MONEY ---
        if (transferMoney && moneyAmount > 0) {
            // Update farms.xml
            const sFarm = (Array.isArray(sFarms.farms?.farm) ? sFarms.farms.farm : [sFarms.farms?.farm]).find(f => parseInt(f['@_farmId']) === sourceFarmId);
            const dFarm = (Array.isArray(dFarms.farms?.farm) ? dFarms.farms.farm : [dFarms.farms?.farm]).find(f => parseInt(f['@_farmId']) === destFarmId);
            
            if (sFarm && dFarm) {
                const sMoney = parseFloat(sFarm['@_money'] || 0);
                const dMoney = parseFloat(dFarm['@_money'] || 0);
                const actualTransfer = Math.min(sMoney, moneyAmount);
                
                sFarm['@_money'] = String((sMoney - actualTransfer).toFixed(2));
                dFarm['@_money'] = String((dMoney + actualTransfer).toFixed(2));
                
                // Update careerSavegame stats (if it's the primary farm)
                if (sourceFarmId === 1 && sCareer.careerSavegame?.statistics) {
                    sCareer.careerSavegame.statistics['@_money'] = sFarm['@_money'];
                }
                if (destFarmId === 1 && dCareer.careerSavegame?.statistics) {
                    dCareer.careerSavegame.statistics['@_money'] = dFarm['@_money'];
                }
            }
        }

        // --- FINAL FLUSH ---
        await flushFiles();
        return { success: true };

    } catch (err) {
        debugLog(`[TRANSFER] Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function getInstalledMods() {
    const modManager = require('./modManager');
    const { mods } = await modManager.scanLocalMods();
    return { mods };
}

/**
 * Archive management (stubs for functionality)
 */
async function importSavegame(sourcePath, targetIndex) {
    const fs25Path = getFs25Path();
    const destPath = path.join(fs25Path, `savegame${targetIndex}`);
    const AdmZip = require('adm-zip');
    
    let tempDir = null;
    let finalSourcePath = sourcePath;

    try {
        // 1. Handle ZIP if necessary
        if (sourcePath.toLowerCase().endsWith('.zip')) {
            tempDir = path.join(os.tmpdir(), `fs25_import_${Date.now()}`);
            await fs.ensureDir(tempDir);
            const zip = new AdmZip(sourcePath);
            zip.extractAllTo(tempDir, true);
            
            // Check if zipped content is the savegame itself or a subfolder
            const files = await fs.readdir(tempDir);
            if (!fs.existsSync(path.join(tempDir, 'careerSavegame.xml'))) {
                const subFolder = files.find(f => fs.existsSync(path.join(tempDir, f, 'careerSavegame.xml')));
                if (subFolder) {
                    finalSourcePath = path.join(tempDir, subFolder);
                } else {
                    throw new Error('ZIP file does not contain a valid Farming Simulator 25 savegame.');
                }
            } else {
                finalSourcePath = tempDir;
            }
        }

        // 2. Validate source contains careerSavegame.xml
        const careerPath = path.join(finalSourcePath, 'careerSavegame.xml');
        if (!fs.existsSync(careerPath)) {
            throw new Error('Selected folder is not a valid Farming Simulator 25 savegame (missing careerSavegame.xml)');
        }

        // 3. Overwrite target
        console.log(`[IMPORT] Importing savegame from ${finalSourcePath} to slot ${targetIndex}`);
        if (fs.existsSync(destPath)) {
            await fs.remove(destPath);
        }
        await fs.ensureDir(destPath);
        await fs.copy(finalSourcePath, destPath);

        return { success: true, path: destPath };
    } catch (err) {
        console.error('[IMPORT] Failed:', err);
        return { success: false, error: err.message };
    } finally {
        if (tempDir && fs.existsSync(tempDir)) {
            await fs.remove(tempDir);
        }
    }
}

async function renameSavegame(savePath, newName) {
    const careerPath = path.join(savePath, 'careerSavegame.xml');
    if (!fs.existsSync(careerPath)) return { success: false, error: 'careerSavegame.xml not found' };
    
    return updateSavegameAttribute(savePath, 'career', 'savegameName', newName);
}

async function deleteSavegame(savePath) {
    if (fs.existsSync(savePath)) {
        await fs.remove(savePath);
        return { success: true };
    }
    return { success: false, error: 'Savegame not found' };
}

function getArchivesPath() {
    const p = path.join(getFs25Path(), 'modManagerArchives');
    if (!fs.existsSync(p)) fs.ensureDirSync(p);
    return p;
}

async function archiveSavegame(savePath) {
    if (!fs.existsSync(savePath)) return { success: false, error: 'Savegame not found' };
    const archivesDir = getArchivesPath();
    const folderName = path.basename(savePath);
    
    // Read careerSavegame.xml to get a nice name for the folder
    const careerPath = path.join(savePath, 'careerSavegame.xml');
    let farmName = folderName;
    if (fs.existsSync(careerPath)) {
        try {
            const xml = await fs.readFile(careerPath, 'utf8');
            const data = parser.parse(xml);
            farmName = data.careerSavegame?.settings?.savegameName || data.careerSavegame?.settings?.['@_savegameName'] || folderName;
        } catch (e) {
            console.error('[ARCHIVE] Failed to parse careerSavegame for name:', e);
        }
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now().toString().slice(-4);
    const safeFarmName = String(farmName).replace(/[^a-z0-9]/gi, '_');
    const archiveFolderName = `${safeFarmName}_${timestamp}`;
    const destPath = path.join(archivesDir, archiveFolderName);
    
    try {
        await fs.move(savePath, destPath);
        return { success: true };
    } catch (err) {
        console.error('[ARCHIVE] Move failed:', err);
        return { success: false, error: err.message };
    }
}

async function getArchivedSavegames() {
    const archivesDir = getArchivesPath();
    if (!fs.existsSync(archivesDir)) return { archives: [] };
    
    try {
        const folders = await fs.readdir(archivesDir);
        const archives = [];
        
        for (const folder of folders) {
            const folderPath = path.join(archivesDir, folder);
            const stats = await fs.stat(folderPath);
            if (!stats.isDirectory()) continue;
            
            const careerPath = path.join(folderPath, 'careerSavegame.xml');
            if (fs.existsSync(careerPath)) {
                const xml = await fs.readFile(careerPath, 'utf8');
                const data = parser.parse(xml);
                const settings = data.careerSavegame.settings;
                const statsData = data.careerSavegame.statistics;
                
                archives.push({
                    folderName: folder,
                    path: folderPath,
                    farmName: settings?.['@_savegameName'] || settings?.savegameName || 'Unnamed Farm',
                    mapTitle: settings?.['@_mapTitle'] || settings?.mapTitle || 'Unknown Map',
                    money: parseFloat(statsData?.['@_money'] || statsData?.money || 0),
                    lastSaveDate: settings?.['@_saveDateFormatted'] || settings?.saveDateFormatted || stats.mtime.toISOString()
                });
            }
        }
        return { archives: archives.sort((a, b) => b.folderName.localeCompare(a.folderName)) };
    } catch (err) {
        console.error('[ARCHIVE] Failed to list archives:', err);
        return { archives: [] };
    }
}

async function restoreSavegame(archivedFolderName, slotIndex) {
    const archivesDir = getArchivesPath();
    const sourcePath = path.join(archivesDir, archivedFolderName);
    const destPath = path.join(getFs25Path(), `savegame${slotIndex}`);
    
    if (!fs.existsSync(sourcePath)) return { success: false, error: 'Archive not found' };
    
    try {
        if (fs.existsSync(destPath)) {
            await fs.remove(destPath);
        }
        await fs.copy(sourcePath, destPath);
        return { success: true };
    } catch (err) {
        console.error('[RESTORE] Failed:', err);
        return { success: false, error: err.message };
    }
}

async function deleteArchivedSavegame(archivedFolderName) {
    const archivesDir = getArchivesPath();
    const target = path.join(archivesDir, archivedFolderName);
    if (fs.existsSync(target)) {
        await fs.remove(target);
        return { success: true };
    }
    return { success: false, error: 'Archive not found' };
}

async function swapArchiveToSlot(archivedFolderName, slotIndex) {
    const result = await restoreSavegame(archivedFolderName, slotIndex);
    if (result.success) {
        await deleteArchivedSavegame(archivedFolderName);
    }
    return result;
}

async function renameArchivedSavegame() { return { success: true }; }

module.exports = {
    getMapTemplates,
    deleteMapTemplate,
    hasMapTemplate,
    getSavegameMods,
    setSavegameMods,
    createSavegameWithMods,
    importSavegame,
    renameSavegame,
    deleteSavegame,
    getInstalledMods,
    archiveSavegame,
    getArchivedSavegames,
    restoreSavegame,
    swapArchiveToSlot,
    deleteArchivedSavegame,
    renameArchivedSavegame,
    getAllSavegames,
    updateSavegameAttribute,
    updateFleetMaintenance,
    getSavegameTransferData,
    executeTransfer
};
