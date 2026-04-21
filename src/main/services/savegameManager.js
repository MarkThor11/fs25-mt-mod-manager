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
async function getSavegameTransferData(savePath) {
    const data = { money: 0, products: [], animals: [] };
    
    // 1. Money
    const farmsPath = path.join(savePath, 'farms.xml');
    if (fs.existsSync(farmsPath)) {
        const xml = await fs.readFile(farmsPath, 'utf8');
        const parsed = parser.parse(xml);
        const farm = Array.isArray(parsed.farms.farm) ? parsed.farms.farm[0] : parsed.farms.farm;
        data.money = parseFloat(farm['@_money'] || 0);
    }

    // 2. Products (Silos)
    const placeablesPath = path.join(savePath, 'placeables.xml');
    if (fs.existsSync(placeablesPath)) {
        const xml = await fs.readFile(placeablesPath, 'utf8');
        const parsed = parser.parse(xml);
        const placeables = Array.isArray(parsed.placeables.placeable) ? parsed.placeables.placeable : [parsed.placeables.placeable];
        
        placeables.forEach(p => {
            if (p.storage && p.storage.node) {
                const nodes = Array.isArray(p.storage.node) ? p.storage.node : [p.storage.node];
                nodes.forEach(n => {
                    data.products.push({
                        fillType: n['@_fillType'],
                        fillLevel: parseFloat(n['@_fillLevel'] || 0),
                        capacity: parseFloat(p['@_capacity'] || 1000000) // Default if missing
                    });
                });
            }
        });
    }

    // 3. Animals
    const animalsPath = path.join(savePath, 'animals.xml');
    if (fs.existsSync(animalsPath)) {
        const xml = await fs.readFile(animalsPath, 'utf8');
        const parsed = parser.parse(xml);
        if (parsed.animals && parsed.animals.animal) {
            const animals = Array.isArray(parsed.animals.animal) ? parsed.animals.animal : [parsed.animals.animal];
            data.animals = animals.map(a => ({
                type: a['@_type'],
                subType: a['@_subType'],
                age: a['@_age'],
                health: a['@_health']
            }));
        }
    }

    // 4. Vehicles & Equipment
    const vehiclesPath = path.join(savePath, 'vehicles.xml');
    data.vehicles = [];
    if (fs.existsSync(vehiclesPath)) {
        const xml = await fs.readFile(vehiclesPath, 'utf8');
        const parsed = parser.parse(xml);
        if (parsed.vehicles && parsed.vehicles.vehicle) {
            const vehicles = Array.isArray(parsed.vehicles.vehicle) ? parsed.vehicles.vehicle : [parsed.vehicles.vehicle];
            data.vehicles = vehicles.map(v => ({
                filename: v['@_filename'],
                operatingTime: parseFloat(v['@_operatingTime'] || 0),
                dirt: parseFloat(v.wearable?.['@_dirtAmount'] || 0),
                wear: parseFloat(v.wearable?.['@_wearAmount'] || 0),
                paint: parseFloat(v.wearable?.['@_paintAmount'] || 1)
            }));
        }
    }

    // 5. Farmland (Owned Land)
    const farmlandPath = path.join(savePath, 'farmland.xml');
    data.farmlands = [];
    if (fs.existsSync(farmlandPath)) {
        const xml = await fs.readFile(farmlandPath, 'utf8');
        const parsed = parser.parse(xml);
        if (parsed.farmlands && parsed.farmlands.farmland) {
            const farmlands = Array.isArray(parsed.farmlands.farmland) ? parsed.farmlands.farmland : [parsed.farmlands.farmland];
            data.farmlands = farmlands.filter(f => f['@_farmId'] === "1" || f['@_farmId'] === 1).map(f => f['@_id']);
        }
    }

    // 6. Loose Items (Bales, Pallets)
    const itemsPath = path.join(savePath, 'items.xml');
    data.items = [];
    if (fs.existsSync(itemsPath)) {
        const xml = await fs.readFile(itemsPath, 'utf8');
        const parsed = parser.parse(xml);
        if (parsed.items && parsed.items.item) {
            const items = Array.isArray(parsed.items.item) ? parsed.items.item : [parsed.items.item];
            data.items = items.map(i => ({
                className: i['@_className'],
                fillType: i['@_fillType'],
                fillLevel: parseFloat(i['@_fillLevel'] || 0),
                farmId: i['@_farmId']
            }));
        }
    }

    return data;
}

/**
 * Execute transfer between savegames
 */
async function executeTransfer(sourcePath, destPath, options) {
    const sourceData = await getSavegameTransferData(sourcePath);
    
    // 1. Money Transfer
    if (options.transferMoney && options.moneyAmount > 0) {
        const sourceDataCurrent = await getSavegameTransferData(sourcePath);
        const destDataCurrent = await getSavegameTransferData(destPath);
        
        console.log(`[TRANSFER] Money: Source(${sourceDataCurrent.money} -> ${Math.max(0, sourceDataCurrent.money - options.moneyAmount)}), Dest(${destDataCurrent.money} -> ${destDataCurrent.money + options.moneyAmount})`);
        
        // Deduct from source
        const newSourceTotal = Math.max(0, (sourceDataCurrent.money || 0) - options.moneyAmount);
        await updateSavegameAttribute(sourcePath, 'farms', 'money', newSourceTotal);
        
        // Add to destination
        const newDestTotal = (destDataCurrent.money || 0) + options.moneyAmount;
        await updateSavegameAttribute(destPath, 'farms', 'money', newDestTotal);
    }

    // 2. Products Transfer (Simplified: additive to first matching silo)
    if (options.selectedProducts?.length > 0) {
        const destPlaceablesPath = path.join(destPath, 'placeables.xml');
        if (fs.existsSync(destPlaceablesPath)) {
            const xml = await fs.readFile(destPlaceablesPath, 'utf8');
            const parsed = parser.parse(xml);
            // Logic to find destination silo and add products...
            // For now, we'll just log that we are doing it.
            console.log(`[TRANSFER] Moving products to ${destPath}`);
        }
    }

    // 3. Vehicles Transfer
    if (options.selectedVehicles?.length > 0) {
        const sourceVehPath = path.join(sourcePath, 'vehicles.xml');
        const destVehPath = path.join(destPath, 'vehicles.xml');
        
        if (fs.existsSync(sourceVehPath) && fs.existsSync(destVehPath)) {
            const sXml = await fs.readFile(sourceVehPath, 'utf8');
            const dXml = await fs.readFile(destVehPath, 'utf8');
            
            const sData = parser.parse(sXml);
            const dData = parser.parse(dXml);
            
            const sVehs = Array.isArray(sData.vehicles?.vehicle) ? sData.vehicles.vehicle : (sData.vehicles?.vehicle ? [sData.vehicles.vehicle] : []);
            
            if (!dData.vehicles) dData.vehicles = { vehicle: [] };
            const dVehs = Array.isArray(dData.vehicles.vehicle) ? dData.vehicles.vehicle : (dData.vehicles.vehicle ? [dData.vehicles.vehicle] : []);
            
            options.selectedVehicles.forEach(idx => {
                if (sVehs[idx]) {
                    const clone = JSON.parse(JSON.stringify(sVehs[idx]));
                    clone['@_farmId'] = "1"; // Assign to first farm on destination
                    dVehs.push(clone);
                }
            });
            
            dData.vehicles.vehicle = dVehs;
            await fs.writeFile(destVehPath, builder.build(dData));
            
            // Deduct from source
            const remainingVehs = sVehs.filter((_, i) => !options.selectedVehicles.includes(i));
            sData.vehicles.vehicle = remainingVehs;
            await fs.writeFile(sourceVehPath, builder.build(sData));
        }
    }

    // 4. Farmland Transfer
    if (options.transferFarmland) {
        const sourceFarmlandPath = path.join(sourcePath, 'farmland.xml');
        const destFarmlandPath = path.join(destPath, 'farmland.xml');
        
        if (fs.existsSync(sourceFarmlandPath) && fs.existsSync(destFarmlandPath)) {
            const sXml = await fs.readFile(sourceFarmlandPath, 'utf8');
            const dXml = await fs.readFile(destFarmlandPath, 'utf8');
            const sData = parser.parse(sXml);
            const dData = parser.parse(dXml);
            const sLands = Array.isArray(sData.farmlands?.farmland) ? sData.farmlands.farmland : (sData.farmlands?.farmland ? [sData.farmlands.farmland] : []);
            const dLands = Array.isArray(dData.farmlands?.farmland) ? dData.farmlands.farmland : (dData.farmlands?.farmland ? [dData.farmlands.farmland] : []);
            const ownedIds = sLands.filter(f => f['@_farmId'] === "1" || f['@_farmId'] === 1).map(f => f['@_id']);
            dLands.forEach(f => { if (ownedIds.includes(f['@_id'])) f['@_farmId'] = "1"; });
            dData.farmlands.farmland = dLands;
            await fs.writeFile(destFarmlandPath, builder.build(dData));
            sLands.forEach(f => { if (ownedIds.includes(f['@_id'])) f['@_farmId'] = "0"; });
            sData.farmlands.farmland = sLands;
            await fs.writeFile(sourceFarmlandPath, builder.build(sData));
        }
    }

    // 5. Items (Bales/Pallets) Transfer
    if (options.selectedItems?.length > 0) {
        const sourceItemsPath = path.join(sourcePath, 'items.xml');
        const destItemsPath = path.join(destPath, 'items.xml');
        if (fs.existsSync(sourceItemsPath) && fs.existsSync(destItemsPath)) {
            const sXml = await fs.readFile(sourceItemsPath, 'utf8');
            const dXml = await fs.readFile(destItemsPath, 'utf8');
            const sData = parser.parse(sXml);
            const dData = parser.parse(dXml);
            const sItems = Array.isArray(sData.items?.item) ? sData.items.item : (sData.items?.item ? [sData.items.item] : []);
            if (!dData.items) dData.items = { item: [] };
            const dItems = Array.isArray(dData.items.item) ? dData.items.item : (dData.items.item ? [dData.items.item] : []);
            options.selectedItems.forEach(idx => {
                if (sItems[idx]) {
                    const clone = JSON.parse(JSON.stringify(sItems[idx]));
                    clone['@_farmId'] = "1";
                    dItems.push(clone);
                }
            });
            dData.items.item = dItems;
            await fs.writeFile(destItemsPath, builder.build(dData));
            const remainingItems = sItems.filter((_, i) => !options.selectedItems.includes(i));
            sData.items.item = remainingItems;
            await fs.writeFile(sourceItemsPath, builder.build(sData));
        }
    }

    return { success: true };
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

async function archiveSavegame(savePath) { /* ... */ return { success: true }; }
async function getArchivedSavegames() { return { archives: [] }; }
async function restoreSavegame() { return { success: true }; }
async function swapArchiveToSlot() { return { success: true }; }
async function deleteArchivedSavegame() { return { success: true }; }
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
