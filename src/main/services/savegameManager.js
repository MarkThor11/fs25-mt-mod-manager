const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { app } = require('electron');
const nodeFs = require('fs');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const AdmZip = require('adm-zip');
const pathProvider = require('./pathProvider');

function ultraNormalize(str) {
    if (!str) return '';
    let s = str.toLowerCase();
    s = s.replace(/[^a-z0-9]/g, '');
    s = s.replace(/v\d+.*$/, '');
    s = s.replace(/(?:fs25|fs22|fs19|pdlc)+/g, '');
    s = s.replace(/(?:mod|pack|prefab|map)+/g, '');
    return s;
}
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
    suppressBooleanAttributes: false, suppressEmptyNode: true });

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
    const lower = mapId.toLowerCase();
    return ['mapus', 'mapeu', 'mapas', 'highlandsfishingmap'].includes(lower) || 
           lower.startsWith('pdlc_') || 
           lower.includes('highlandsfishing');
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
                modName: matchedMod ? matchedMod.modName : (dlcInfo ? dlcInfo.dlcId : null),
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
    return results.filter(t => t !== null && !isOfficialMap(t.mapId));
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

async function resolveTemplateFolder(mapId, mapModName = null, mapTitle = null) {
    if (!mapId) return null;
    const templatesDir = getTemplatesPath();
    if (!fs.existsSync(templatesDir)) return null;

    const ultraNorm = (s) => {
        if (!s) return '';
        return s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(?:fs\d{2}|pdlc)_/, '');
    };

    const targetMapIdNorm = ultraNorm(mapId);
    const targetModNorm = ultraNorm(mapModName);
    const targetTitleNorm = ultraNorm(mapTitle);

    const folders = await fs.readdir(templatesDir);

    // 1. Direct folder check (matches folder name containing mod name, title, or mapId)
    for (const folder of folders) {
        const folderPath = path.join(templatesDir, folder);
        const stat = await fs.stat(folderPath).catch(() => null);
        if (!stat || !stat.isDirectory()) continue;

        if (!fs.existsSync(path.join(folderPath, 'terrain.heightmap.png'))) continue;

        const fNorm = ultraNorm(folder);
        if (targetModNorm && fNorm.includes(targetModNorm)) return folder;
        if (targetTitleNorm && fNorm.includes(targetTitleNorm)) return folder;
        if (targetMapIdNorm && fNorm.includes(targetMapIdNorm)) return folder;
    }

    // 2. XML Deep Scan check inside templates
    for (const folder of folders) {
        const folderPath = path.join(templatesDir, folder);
        const careerPath = path.join(folderPath, 'careerSavegame.xml');
        if (fs.existsSync(careerPath) && fs.existsSync(path.join(folderPath, 'terrain.heightmap.png'))) {
            try {
                const xml = await fs.readFile(careerPath, 'utf8');
                const internalId = getElementText(xml, 'mapId');
                const internalTitle = getElementText(xml, 'mapTitle');
                if ((internalId && ultraNorm(internalId) === targetMapIdNorm) || 
                    (internalTitle && targetTitleNorm && ultraNorm(internalTitle) === targetTitleNorm)) {
                    return folder;
                }
            } catch (e) {}
        }
    }

    return null;
}

/**
 * Check if a map has a template.
 */
async function hasMapTemplate(mapId, mapTitle = null, modName = null) {
    const folder = await resolveTemplateFolder(mapId, modName, mapTitle);
    return !!folder;
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

    // Get existing required mods (e.g. map dependencies)
    const existingMods = data.careerSavegame.mod || (data.careerSavegame.mods?.mod) || [];
    const existingModsArray = Array.isArray(existingMods) ? existingMods : [existingMods];
    const requiredExisting = existingModsArray.filter(m => m['@_required'] === 'true');

    // Build the new mod array
    const newModsMap = new Map();
    
    // First, preserve all required existing mods
    requiredExisting.forEach(m => {
        newModsMap.set(m['@_modName'], m);
    });

    // Then, add/update the user-selected mods
    mods.forEach(m => {
        const isMap = m.required || (mapId && m.modName === mapId.split('.')[0]) || (mapTitle && m.title === mapTitle);
        // Exclude the Player Positions mod if we want to hide it completely from being listed, BUT wait, if we don't list it, it won't load! 
        // We will keep it but maybe set something else? Actually let's just add it normally here.
        newModsMap.set(m.modName, {
            '@_modName': m.modName,
            '@_title': m.title,
            '@_version': m.version || '1.0.0.0',
            '@_required': isMap ? 'true' : 'false',
            '@_fileHash': m.fileHash || ''
        });
    });

    data.careerSavegame.mod = Array.from(newModsMap.values());
    
    // Remove the old wrapper if it exists
    if (data.careerSavegame.mods) delete data.careerSavegame.mods;
    
    // Crucially ensure valid="true" is present, otherwise the engine treats it as an Empty Slot
    data.careerSavegame['@_valid'] = 'true';

    let newXml = builder.build(data);
    
    // Ensure XML declaration is strictly formatted so the engine accepts it
    if (!newXml.startsWith('<?xml')) {
        newXml = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + newXml;
    }
    
    await fs.writeFile(careerPath, newXml);
    
    // Auto-inject any missing dependencies required by the user's selected mods
    await autoInjectDependencies(savegamePath);
    
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
        await fs.emptyDir(slotPath);
    } else {
        await fs.ensureDir(slotPath);
    }

    // Scan mods first so we can resolve the correct path of the map mod (even if in a subfolder)
    const modManager = require('./modManager');
    let allMods = [];
    try {
        const scanRes = await modManager.scanLocalMods();
        allMods = scanRes.mods || [];
    } catch (err) {
        console.error('[CREATE] Failed to scan local mods:', err);
    }

    let modZipPath = null;
    if (mapModName) {
        const mapModObjInAll = allMods.find(m => m.modName === mapModName);
        if (mapModObjInAll && mapModObjInAll.filePath && mapModObjInAll.filePath.toLowerCase().endsWith('.zip')) {
            modZipPath = mapModObjInAll.filePath;
        }
    }

    // 2. Identify and Copy Template
    const resolvedFolder = await resolveTemplateFolder(mapId, mapModName, mapTitle);
    let copiedTemplate = false;
    if (resolvedFolder) {
        const templatePath = path.join(templatesDir, resolvedFolder);
        if (fs.existsSync(templatePath)) {
            console.log(`[CREATE] Copying master template from ${resolvedFolder}`);
            await fs.copy(templatePath, slotPath);
            copiedTemplate = true;
        }
    }

    if (!copiedTemplate) {
        console.warn(`[CREATE] No specific or base template found for ${mapId}. Creating minimal save to force terrain generation.`);
        requiresEngineInit = true;
    }

    // 3. Update careerSavegame.xml
    const careerPath = path.join(slotPath, 'careerSavegame.xml');
    const today = new Date().toISOString().split('T')[0];

    const finalMods = selectedMods.filter(m => m.modName !== 'FS25_rememberPositions');
    // Add map mod if not already there
    let mapModObj = finalMods.find(m => m.modName === mapModName);
    if (mapModName && !mapModObj) {
        mapModObj = { modName: mapModName, title: mapTitle, version: '1.0.0.0', required: true };
        finalMods.unshift(mapModObj);
    } else if (mapModObj) {
        mapModObj.required = true;
    }

    // --- AUTO-INJECT DEPENDENCIES FOR ALL SELECTED MODS ---
    // If we don't do this, the FS25 engine pauses the launch and prompts: "Do you want to select all required mods?"
    try {
        
        let addedNewDep = true;
        while(addedNewDep) {
            addedNewDep = false;
            const currentMods = [...finalMods];
            for (const selMod of currentMods) {
                const fullMod = allMods.find(m => m.modName === selMod.modName);
                if (fullMod && fullMod.dependencies && fullMod.dependencies.length > 0) {
                    for (const dep of fullMod.dependencies) {
                        let installedDep = null;

                        // 1. Resolve match from ModHub ID if available
                        if (typeof dep === 'object' && dep.url) {
                            const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
                            if (idMatch) {
                                const depId = idMatch[1];
                                installedDep = allMods.find(m => m.modId && String(m.modId) === String(depId));
                            }
                        }

                        // 2. Resolve exact literal match from the dependency name string
                        if (!installedDep) {
                            const depStr = typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || '');
                            if (!depStr) continue;
                            
                            // Spelling, casing, spacing, and underscores must match exactly
                            installedDep = allMods.find(m => m.modName === depStr);
                        }

                        if (installedDep && installedDep.modName !== mapModName && !finalMods.some(m => m.modName === installedDep.modName)) {
                            console.log(`[CREATE] Auto-injecting dependency: ${installedDep.title} (required by ${selMod.title || selMod.modName})`);
                            finalMods.push({
                                modName: installedDep.modName,
                                title: installedDep.title,
                                version: installedDep.version || '1.0.0.0',
                                required: false,
                                fileHash: installedDep.fileHash || ''
                            });
                            addedNewDep = true;
                        } else if (installedDep) {
                            const alreadySelected = finalMods.find(m => m.modName === installedDep.modName);
                            if (alreadySelected) {
                                alreadySelected.required = true;
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('[CREATE] Failed to auto-inject dependencies:', err);
    }

    // FS25 engine requires mod maps to have their mapId prefixed with the mod name (e.g. FS25_MapMod.MapId)
    // If we don't do this, the engine can't find the map, marking the save as corrupted and greying out the Continue button.
    let engineMapId = mapId;
    if (mapModName && !engineMapId.startsWith(mapModName + '.') && !['MapUS', 'MapEU', 'MapAS', 'HighlandsFishingMap'].includes(engineMapId)) {
        engineMapId = `${mapModName}.${engineMapId}`;
    }

    const modData = finalMods.map(mod => {
        // We explicitly set required above for injected deps and the map.
        const isRequired = mod.required === true;
        return {
            '@_modName': mod.modName,
            '@_title': mod.title || mod.modName,
            '@_version': mod.version || '1.0.0.0',
            '@_required': isRequired ? 'true' : 'false',
            '@_fileHash': mod.fileHash || ''
        };
    });

    let savegameData;
    if (!requiresEngineInit && fs.existsSync(careerPath)) {
        // We copied a template, so preserve its initialized state!
        try {
            const xml = await fs.readFile(careerPath, 'utf8');
            savegameData = parser.parse(xml);
            
            // Only update necessary fields
            if (!savegameData.careerSavegame.settings) savegameData.careerSavegame.settings = {};
            savegameData.careerSavegame.settings.savegameName = savegameName;
            savegameData.careerSavegame.settings.mapId = engineMapId;
            savegameData.careerSavegame.settings.mapTitle = mapTitle;
            savegameData.careerSavegame.settings.saveDateFormatted = today;
            savegameData.careerSavegame.settings.saveDate = today;
            savegameData.careerSavegame.settings.initialMoney = String(money);
            savegameData.careerSavegame.settings.isCrossPlatformSavegame = 'false';
            if (difficulty) savegameData.careerSavegame.settings.difficulty = String(difficulty);
            
            if (!savegameData.careerSavegame.statistics) savegameData.careerSavegame.statistics = {};
            savegameData.careerSavegame.statistics.money = String(money);
            
            // Overwrite mods with the new selection
            savegameData.careerSavegame.mod = modData;

            // Since it's an initialized save, we must also update farms.xml to give the player the money
            const farmsPath = path.join(slotPath, 'farms.xml');
            if (fs.existsSync(farmsPath)) {
                try {
                    const farmsXml = await fs.readFile(farmsPath, 'utf8');
                    const farmsData = parser.parse(farmsXml);
                    if (farmsData.farms && farmsData.farms.farm) {
                        if (Array.isArray(farmsData.farms.farm)) {
                            farmsData.farms.farm[0]['@_money'] = String(money);
                        } else {
                            farmsData.farms.farm['@_money'] = String(money);
                        }
                        await fs.writeFile(farmsPath, builder.build(farmsData));
                        console.log('[CREATE] Updated farms.xml with starting money.');
                    }
                } catch (err) {
                    console.error('[CREATE] Failed to update farms.xml:', err);
                }
            }
        } catch (err) {
            console.error('[CREATE] Failed to parse template careerSavegame.xml, falling back to barebones:', err);
        }
    }

    if (!savegameData) {
        // Fallback for fresh uninitialized maps (or if parsing failed)
        savegameData = {
            careerSavegame: {
                '@_revision': '2',
                '@_valid': 'true',
                settings: {
                    savegameName: savegameName,
                    creationDate: today,
                    mapId: engineMapId,
                    mapTitle: mapTitle,
                    saveDateFormatted: today,
                    saveDate: today,
                    initialMoney: String(money),
                    difficulty: String(difficulty),
                    economicDifficulty: 'NORMAL',
                    loadDefaultFarm: 'true',
                    loadDefaultVehicles: 'true',
                    isCrossPlatformSavegame: 'false',
                    densityMapRevision: '4',
                    terrainTextureRevision: '1',
                    terrainLodTextureRevision: '2',
                    splitShapesRevision: '2',
                    tipCollisionRevision: '2',
                    placementCollisionRevision: '2',
                    navigationCollisionRevision: '2',
                    mapDensityMapRevision: '1',
                    mapTerrainTextureRevision: '1',
                    mapTerrainLodTextureRevision: '1',
                    mapSplitShapesRevision: '1',
                    mapTipCollisionRevision: '1',
                    mapPlacementCollisionRevision: '1',
                    mapNavigationCollisionRevision: '1'
                },
                statistics: {
                    money: String(money),
                    playTime: '0.000000'
                },
                mod: modData,
                mapsSplitShapeFileIds: {
                    '@_count': '0'
                },
                slotSystem: {
                    '@_slotUsage': '0'
                }
            }
        };
    }

    let xmlOutput = builder.build(savegameData);
    
    // Ensure XML declaration
    if (!xmlOutput.startsWith('<?xml')) {
        xmlOutput = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + xmlOutput;
    }

    await fs.writeFile(careerPath, xmlOutput);

    let extractedGrles = 0;
    if (modZipPath) {
        try {
            if (fs.existsSync(modZipPath)) {
                const stats = fs.statSync(modZipPath);
                if (stats.isFile()) {
                    const zip = new AdmZip(modZipPath);
                    
                    // Extract infoLayer grle files
                    for (const entry of zip.getEntries()) {
                        const baseName = path.basename(entry.entryName);
                        if (baseName.toLowerCase().startsWith('infolayer_') && baseName.toLowerCase().endsWith('.grle')) {
                            const targetPath = path.join(slotPath, baseName);
                            await fs.writeFile(targetPath, entry.getData());
                            extractedGrles++;
                        }
                    }
                    console.log(`[CREATE] Extracted ${extractedGrles} infoLayer GRLE files from map zip.`);
                }
            }
        } catch (err) {
            console.error(`[CREATE] Failed to extract map files from zip:`, err);
        }
    }

    if (requiresEngineInit || !fs.existsSync(path.join(slotPath, 'farms.xml'))) {
        // Fetch the REAL uniqueUserId from an existing save so the game recognizes the user!
        let realUserId = "player";
        for (let i = 1; i <= 20; i++) {
            if (i === savegameIndex) continue;
            const otherFarmsPath = path.join(fs25Path, `savegame${i}`, 'farms.xml');
            if (fs.existsSync(otherFarmsPath)) {
                try {
                    const xml = await fs.readFile(otherFarmsPath, 'utf8');
                    const match = xml.match(/uniqueUserId="([^"]+)"/);
                    if (match && match[1] && match[1] !== 'player') {
                        realUserId = match[1];
                        console.log(`[CREATE] Extracted real uniqueUserId: ${realUserId} from savegame${i}`);
                        break;
                    }
                } catch (err) {}
            }
        }

        const farmsPath = path.join(slotPath, 'farms.xml');
        const farmsXml = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<farms>
    <farm farmId="1" name="My farm" color="1" loan="0.000000" money="${money}.000000">
        <players>
            <player uniqueUserId="${realUserId}" farmManager="true" />
        </players>
    </farm>
</farms>`;
        await fs.writeFile(farmsPath, farmsXml);
    }

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

            const mapId = settings['@_mapId'] || settings.mapId;
            const mapTitle = settings['@_mapTitle'] || settings.mapTitle;
            let mapModName = null;
            if (mapId && mapId.includes('.')) {
                mapModName = mapId.split('.')[0];
            }

            const farmsFile = path.join(savePath, 'farms.xml');
            const initFile = path.join(savePath, 'terrain.heightmap.png');
            const placeablesFile = path.join(savePath, 'placeables.xml');
            const isInitialized = fs.existsSync(farmsFile) && fs.existsSync(initFile) && fs.existsSync(placeablesFile);

            let hasTemplate = false;
            try {
                hasTemplate = await hasMapTemplate(mapId, mapTitle, mapModName);
                if (isInitialized && !hasTemplate && mapId && !isOfficialMap(mapId)) {
                    console.log(`[AUTO-HARVEST] Automatically learning master template for map ${mapId} from savegame slot ${i}...`);
                    const harvestResult = await adoptSaveAsTemplate(i);
                    if (harvestResult && harvestResult.success) {
                        hasTemplate = true;
                    } else {
                        console.error(`[AUTO-HARVEST] Failed to automatically learn template for ${mapId}:`, harvestResult ? harvestResult.error : 'Unknown error');
                    }
                }
            } catch (e) {
                console.error('[SAVEGAMES] Failed to check template for', mapId, e);
            }

            savegames.push({
                index: i,
                path: savePath,
                folderName: `savegame${i}`,
                farmName: settings['@_savegameName'] || settings.savegameName || 'Unnamed Farm',
                playerName: settings['@_playerName'] || settings.playerName || 'Farmer',
                mapId,
                mapTitle,
                isInitialized,
                hasTemplate,
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

/**
 * Retrieve a list of native FS25 engine backups for a given save slot.
 */
async function getEngineBackups(slotIndex) {
    try {
        const backupDir = path.join(getFs25Path(), 'savegameBackup');
        if (!fs.existsSync(backupDir)) return { backups: [] };
        
        const folders = await fs.readdir(backupDir);
        const prefix = `savegame${slotIndex}_backup`;
        const backups = folders
            .filter(f => f.startsWith(prefix))
            .map(f => {
                const stat = fs.statSync(path.join(backupDir, f));
                // Extract timestamp from folder name: savegame1_backupYYYY-MM-DD_HH-mm
                let formattedDate = stat.mtime.toLocaleString();
                const match = f.match(/backup(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/);
                if (match) {
                    formattedDate = match[1].replace('_', ' ').replace('-', '/').replace('-', '/');
                }
                return {
                    folderName: f,
                    date: formattedDate,
                    timestamp: stat.mtimeMs
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp); // Newest first
            
        return { backups };
    } catch (err) {
        return { backups: [], error: err.message };
    }
}

/**
 * Restore a save slot from a native FS25 engine backup.
 */
async function restoreEngineBackup(slotIndex, backupFolderName) {
    try {
        const backupDir = path.join(getFs25Path(), 'savegameBackup');
        const sourceFolder = path.join(backupDir, backupFolderName);
        if (!fs.existsSync(sourceFolder)) throw new Error('Backup folder not found');

        const destFolder = path.join(getFs25Path(), `savegame${slotIndex}`);
        
        // Wipe current slot contents safely
        if (fs.existsSync(destFolder)) {
            await fs.emptyDir(destFolder);
        } else {
            await fs.ensureDir(destFolder);
        }

        // Copy backup contents
        await fs.copy(sourceFolder, destFolder);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
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

async function getFleetPositions(savePath, mapModName) {
    const fs = require('fs');
    const path = require('path');
    const { XMLParser } = require('fast-xml-parser');
    
    const excludeKeywords = [
        'pallet', 'bigbag', 'tree', 'bale', 'header', 'cutter', 'weight', 'implement', 'attachment', 
        'trailer', 'wagon', 'plow', 'cultivator', 'seeder', 'planter', 'roller', 'weeder', 'sprayer', 
        'spreader', 'slurry', 'manure', 'tank', 'windrower', 'tedder', 'baler', 'wrapper', 'conveyor', 
        'silage', 'auger', 'fork', 'weight', 'grab', 'bucket', 'shovel', 'palletfork', 'frontloader'
    ];
    
    const parseVehicleXml = (xml, isDefault = false) => {
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        const data = parser.parse(xml);
        const fleet = [];
        if (data && data.vehicles && data.vehicles.vehicle) {
            const vehicles = Array.isArray(data.vehicles.vehicle) ? data.vehicles.vehicle : [data.vehicles.vehicle];
            for (const v of vehicles) {
                const filename = v['@_filename'];
                if (!filename) continue;
                
                // Exclude leased and mission items
                if (v['@_isLeased'] === 'true' || v['@_propertyState'] === 'MISSION' || v['@_propertyState'] === 'NONE') continue;
                
                // 1. PRIMARY STRUCTURAL RULE: Check runtime XML tags (enterable, motor, drivable, motor configs)
                const hasEnterableState = v.enterable !== undefined || v.motor !== undefined || v.drivable !== undefined;
                let hasMotorConfig = false;
                if (v.configuration) {
                    const configs = Array.isArray(v.configuration) ? v.configuration : [v.configuration];
                    hasMotorConfig = configs.some(c => c['@_name'] === 'motor');
                }

                const isStructurallyDrivable = hasEnterableState || hasMotorConfig;

                // 2. FALLBACK HEURISTICS (Only for default map templates where runtime tags haven't instantiated)
                const isDrivableHeuristics = fnLower.includes('tractor') || fnLower.includes('truck') || fnLower.includes('lorry') || fnLower.includes('car') || fnLower.includes('pickup') || fnLower.includes('van') || fnLower.includes('suv') || fnLower.includes('jeep') || fnLower.includes('xuv') || fnLower.includes('harvester') || fnLower.includes('combine') || fnLower.includes('fendt') || fnLower.includes('johnDeere') || fnLower.includes('caseih') || fnLower.includes('valtra') || fnLower.includes('massey') || fnLower.includes('newholland') || fnLower.includes('jcb') || fnLower.includes('claas');

                // Determine if drivable: primary XML structure first, fallback heuristics second
                const isDrivable = isDefault ? (isStructurallyDrivable || isDrivableHeuristics) : isStructurallyDrivable;
                if (!isDrivable) continue;

                // 3. FALLBACK EXCLUSION LIST (Safety check)
                if (excludeKeywords.some(kw => fnLower.includes(kw))) continue;
                
                // Require vehicle to be an OWNED player vehicle (farmId=1) unless it's default vehicles xml
                if (!isDefault) {
                    const farmId = parseInt(v['@_farmId'] || '0');
                    if (farmId !== 1) continue;
                }
                
                const gameAssignedId = v['@_id'];
                
                // Parse coordinates from component position (FS25 format)
                let coords = [0, 0, 0];
                let comp = v.component;
                if (Array.isArray(comp)) comp = comp[0];
                if (comp && comp['@_position']) {
                    const parts = comp['@_position'].split(' ').map(parseFloat);
                    if (parts.length >= 3 && !isNaN(parts[0])) coords = parts;
                } else if (v['@_xPosition']) {
                    // Fallback: some defaultVehicles.xml use xPosition/zPosition attributes
                    coords = [parseFloat(v['@_xPosition'] || 0), parseFloat(v['@_yOffset'] || 0), parseFloat(v['@_zPosition'] || 0)];
                }
                
                const base = path.basename(filename, '.xml');
                let name = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim().toUpperCase();
                let brand = 'Unknown';
                const parts = filename.split('/');
                if (parts.length > 2 && parts[0] === 'data') brand = parts[2].replace(/([a-z])([A-Z])/g, '$1 $2').trim().toUpperCase();
                else if (v['@_modName']) brand = v['@_modName'].replace(/^FS\d+_/i, '').toUpperCase();
                
                // Remove word "Tractor" (case-insensitive) from brand and name
                brand = brand.replace(/\bTRACTOR\b/gi, '').replace(/\s+/g, ' ').trim() || 'Unknown';
                name = name.replace(/\bTRACTOR\b/gi, '').replace(/\s+/g, ' ').trim();
                
                const type = v['@_type'] || 'vehicle';
                
                fleet.push({ 
                    id: gameAssignedId, 
                    uniqueId: v['@_uniqueId'], 
                    name, 
                    brand, 
                    type, 
                    category: 'vehicle', 
                    x: coords[0], 
                    y: coords[1], 
                    z: coords[2],
                    filename
                });
            }
        }
        return fleet;
    };

    try {
        // 1. Try savegame's vehicles.xml first (always preferred)
        const xmlPath = path.join(savePath, 'vehicles.xml');
        if (fs.existsSync(xmlPath)) {
            const xml = fs.readFileSync(xmlPath, 'utf8');
            return { items: parseVehicleXml(xml, false), source: 'savegame' };
        }
        
        // 2. Fallback: read default vehicles from the map mod's modDesc.xml
        if (mapModName) {
            const modManager = require('./modManager');
            const modsDir = modManager.getModsPath();
            const AdmZip = require('adm-zip');
            
            const modZip = path.join(modsDir, `${mapModName}.zip`);
            if (fs.existsSync(modZip)) {
                const zip = new AdmZip(modZip);
                
                // Parse modDesc.xml to find defaultVehiclesXMLFilename
                const modDescEntry = zip.getEntry('modDesc.xml');
                if (modDescEntry) {
                    const modDescXml = modDescEntry.getData().toString('utf8');
                    const match = modDescXml.match(/defaultVehiclesXMLFilename=["']([^"']+)["']/);
                    if (match && match[1]) {
                        const defaultVehiclesPath = match[1];
                        const vehiclesEntry = zip.getEntry(defaultVehiclesPath);
                        if (vehiclesEntry) {
                            const xml = vehiclesEntry.getData().toString('utf8');
                            return { items: parseVehicleXml(xml, true), source: 'map_defaults' };
                        }
                    }
                }
            }
        }
    } catch (e) { 
        console.error('Error reading fleet positions:', e.message); 
    }
    return { items: [] };
}


async function activatePlayerPersistence(savePath, mapId, includeBridge, includeDeliveries) { return { success: true }; }
async function deactivatePlayerPersistence(savePath, mapId) { return { success: true }; }

async function checkStoreDeliveries() {
    const modManager = require('./modManager');
    const modsDir = modManager.getModsPath();
    const destZip = require('path').join(modsDir, 'FS25_storeDeliveries.zip');
    return require('fs').existsSync(destZip);
}

async function ensureStoreDeliveries() {
    try {
        const modManager = require('./modManager');
        const modsDir = modManager.getModsPath();
        const destZip = require('path').join(modsDir, 'FS25_storeDeliveries.zip');
        if (require('fs').existsSync(destZip)) return { success: true };
        
        const appPath = require('electron').app ? require('electron').app.getAppPath() : process.cwd();
        const sourceDir = require('path').join(appPath, 'scratch', 'storeDeliveries_unzipped');
        if (!require('fs').existsSync(sourceDir)) return { success: false, error: 'Source files not found at ' + sourceDir };
        
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        zip.addLocalFolder(sourceDir);
        await require('fs').promises.writeFile(destZip, zip.toBuffer());
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

async function ensureBridgeMod() {
    try {
        const modManager = require('./modManager');
        const modsDir = modManager.getModsPath();
        const destZip = require('path').join(modsDir, 'FS25_rememberPositions.zip');
        if (require('fs').existsSync(destZip)) return { success: true };
        
        const appPath = require('electron').app ? require('electron').app.getAppPath() : process.cwd();
        const sourceZip = require('path').join(appPath, 'src', 'main', 'assets', 'FS25_rememberPositions.zip');
        if (!require('fs').existsSync(sourceZip)) return { success: false, error: 'Source file not found at ' + sourceZip };
        
        await require('fs').promises.copyFile(sourceZip, destZip);
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
}

async function updateNativeEnhancement(savePath, includeBridge, includeDeliveries) {
    try {
        const path = require('path');
        const fs = require('fs');
        const { XMLParser, XMLBuilder } = require('fast-xml-parser');
        const xmlPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(xmlPath)) return { success: false, error: 'careerSavegame.xml not found' };
        const xmlData = fs.readFileSync(xmlPath, 'utf8');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        const obj = parser.parse(xmlData);
        if (obj && obj.careerSavegame && obj.careerSavegame.mod) {
            let mods = Array.isArray(obj.careerSavegame.mod) ? obj.careerSavegame.mod : [obj.careerSavegame.mod];
            let hasDeliveries = mods.some(m => m['@_modName'] === 'FS25_storeDeliveries');
            let hasBridge = mods.some(m => m['@_modName'] === 'FS25_rememberPositions');

            if (includeDeliveries && !hasDeliveries) {
                mods.push({ '@_modName': 'FS25_storeDeliveries', '@_title': 'Store Deliveries', '@_version': '1.0.0.0', '@_required': 'false', '@_fileHash': '' });
                // Automatically restore the backup if they changed their mind
                try {
                    const backupPath = path.join(savePath, 'manager_spawn_backup.json');
                    if (fs.existsSync(backupPath)) {
                        const pos = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
                        if (pos && pos.x !== undefined) {
                            await setPlayerPosition({ savePath, x: pos.x, y: pos.y, z: pos.z, vehicleUniqueId: pos.vehicleUniqueId });
                        }
                    }
                } catch(e) {}
            } else if (!includeDeliveries) {
                if (hasDeliveries) mods = mods.filter(m => m['@_modName'] !== 'FS25_storeDeliveries');
                
                // BACKUP the coordinates before wiping them, just in case!
                try {
                    const pos = await getPlayerPosition(savePath);
                    if (pos) {
                        let vehicleUniqueId = null;
                        const xmlPath = path.join(savePath, 'players.xml');
                        if (fs.existsSync(xmlPath)) {
                            const { XMLParser } = require('fast-xml-parser');
                            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
                            const data = parser.parse(fs.readFileSync(xmlPath, 'utf8'));
                            const player = Array.isArray(data?.players?.player) ? data.players.player[0] : data?.players?.player;
                            if (player?.spawn?.['@_vehicleUniqueId']) vehicleUniqueId = player.spawn['@_vehicleUniqueId'];
                        }
                        fs.writeFileSync(path.join(savePath, 'manager_spawn_backup.json'), JSON.stringify({ ...pos, vehicleUniqueId }), 'utf8');
                    }
                } catch(e) {}

                // Completely hand over all spawn control back to the game engine
                await resetPlayerSpawn(savePath);
            }
            
            // Always strip the rememberPositions mod as it is no longer used and causes UI issues/prompts
            mods = mods.filter(m => m['@_modName'] !== 'FS25_rememberPositions');
            
            obj.careerSavegame.mod = mods;
            if (obj.careerSavegame) obj.careerSavegame['@_valid'] = 'true';
            delete obj['?xml'];
            const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
            const newXml = builder.build(obj);
            fs.writeFileSync(xmlPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml, 'utf8');
        }
        if (includeDeliveries) {
            await ensureStoreDeliveries();
            const storePath = path.join(savePath, 'storeDeliveries.xml');
            if (!fs.existsSync(storePath)) {
                try {
                    const pos = await getPlayerPosition(savePath);
                    if (pos) {
                        const storeXml = '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n<storeDeliveries>\n    <delivery x="' + pos.x + '" y="' + pos.y + '" z="' + pos.z + '" rotation="0 0 0" />\n</storeDeliveries>';
                        fs.writeFileSync(storePath, storeXml, 'utf8');
                    }
                } catch(err) { console.error('Failed to init storeDeliveries', err); }
            }
        }
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
}

async function getMapDefaultStartCoordinates(savePath, allowFallback = true) {
    try {
        const fs = require('fs-extra');
        const path = require('path');
        const { XMLParser } = require('fast-xml-parser');
        
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(careerPath)) return { x: 0, y: 0, z: 0 };
        
        const xmlData = fs.readFileSync(careerPath, 'utf8');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        const obj = parser.parse(xmlData);
        if (!obj || !obj.careerSavegame) return { x: 0, y: 0, z: 0 };
        
        const settings = obj.careerSavegame.settings || {};
        const mapId = settings.mapId;
        const mapTitle = settings.mapTitle;
        
        let mapModName = null;
        if (mapId && mapId.includes('.')) {
            mapModName = mapId.split('.')[0];
        }
        
        const templateFolder = await resolveTemplateFolder(mapId, mapModName, mapTitle);
        const templatesDir = getTemplatesPath();
        
        if (templateFolder) {
            const tCareerPath = path.join(templatesDir, templateFolder, 'careerSavegame.xml');
            const tCareerXml = fs.readFileSync(tCareerPath, 'utf8');
            const tObj = parser.parse(tCareerXml);
            if (tObj && tObj.careerSavegame && tObj.careerSavegame.player) {
                const pTag = tObj.careerSavegame.player;
                if (pTag['@_spawnPositionX'] !== undefined) {
                    return {
                        x: parseFloat(pTag['@_spawnPositionX']),
                        y: parseFloat(pTag['@_spawnPositionY']),
                        z: parseFloat(pTag['@_spawnPositionZ'])
                    };
                }
            }
            const tPlayersPath = path.join(templatesDir, templateFolder, 'players.xml');
            if (fs.existsSync(tPlayersPath)) {
                const tPlayersXml = fs.readFileSync(tPlayersPath, 'utf8');
                const pObj = parser.parse(tPlayersXml);
                if (pObj && pObj.players && pObj.players.player) {
                    const player = Array.isArray(pObj.players.player) ? pObj.players.player[0] : pObj.players.player;
                    if (player.spawn && player.spawn['@_position']) {
                        const coords = player.spawn['@_position'].split(' ').map(parseFloat);
                        if (coords.length >= 3 && !isNaN(coords[0])) {
                            return { x: coords[0], y: coords[1], z: coords[2] };
                        }
                    }
                }
            }
        }

        // Fallback: parse map mod zip itself!
        if (mapModName) {
            const modManager = require('./modManager');
            const modsDir = modManager.getModsPath();
            const AdmZip = require('adm-zip');
            const modZip = path.join(modsDir, `${mapModName}.zip`);
            if (fs.existsSync(modZip)) {
                const zip = new AdmZip(modZip);
                
                // Let's first search in modDesc.xml maps config
                const modDescEntry = zip.getEntry('modDesc.xml');
                if (modDescEntry) {
                    const modDescXml = modDescEntry.getData().toString('utf8');
                    const mdObj = parser.parse(modDescXml);
                    if (mdObj && mdObj.modDesc && mdObj.modDesc.maps && mdObj.modDesc.maps.map) {
                        const mNode = Array.isArray(mdObj.modDesc.maps.map) ? mdObj.modDesc.maps.map[0] : mdObj.modDesc.maps.map;
                        const configFilename = mNode['@_configFilename'];
                        if (configFilename) {
                            const mapXmlEntry = zip.getEntry(configFilename);
                            if (mapXmlEntry) {
                                const mapXml = mapXmlEntry.getData().toString('utf8');
                                const mapObj = parser.parse(mapXml);
                                if (mapObj && mapObj.map && mapObj.map.playerStart) {
                                    const pStart = mapObj.map.playerStart;
                                    if (pStart['@_position']) {
                                        const coords = pStart['@_position'].split(' ').map(parseFloat);
                                        if (coords.length >= 3) {
                                            return { x: coords[0], y: coords[1], z: coords[2] };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Fallback search: look for any map.xml in zip
                let mapXmlEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('map.xml'));
                if (mapXmlEntry) {
                    const mapXml = mapXmlEntry.getData().toString('utf8');
                    const mapObj = parser.parse(mapXml);
                    if (mapObj && mapObj.map && mapObj.map.playerStart) {
                        const pStart = mapObj.map.playerStart;
                        if (pStart['@_position']) {
                            const coords = pStart['@_position'].split(' ').map(parseFloat);
                            if (coords.length >= 3) {
                                return { x: coords[0], y: coords[1], z: coords[2] };
                            }
                        }
                    }
                }
                
                const i3dEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('map.i3d'));
                if (i3dEntry) {
                    const i3dText = i3dEntry.getData().toString('utf8');
                    const match = i3dText.match(/<TransformGroup\s+[^>]*name="[^"]*(?:careerStartPoint|playerStart)[^"]*"[^>]*translation="([^"]+)"/i) ||
                                  i3dText.match(/name="[^"]*(?:careerStartPoint|playerStart)[^"]*"[^>]*translation="([^"]+)"/i) ||
                                  i3dText.match(/translation="([^"]+)"[^>]*name="[^"]*(?:careerStartPoint|playerStart)[^"]*"/i);
                    if (match && match[1]) {
                        const coords = match[1].split(' ').map(parseFloat);
                        if (coords.length >= 3 && !isNaN(coords[0])) {
                            return { x: coords[0], y: coords[1], z: coords[2] };
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('Error getting map default start coordinates:', e);
    }
    
    // Shop fallback if default start coordinates couldn't be parsed
    try {
        const shopPos = allowFallback ? await getMapShopCoordinates(savePath, false) : null;
        if (shopPos && (shopPos.x !== 0 || shopPos.y !== 0 || shopPos.z !== 0)) {
            return shopPos;
        }
    } catch (err) {
        console.error('Error getting shop fallback coordinates:', err);
    }
    return null;
}

async function getMapShopCoordinates(savePath, allowFallback = true) {
    try {
        const fs = require('fs-extra');
        const path = require('path');
        const { XMLParser } = require('fast-xml-parser');
        
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(careerPath)) return null;
        
        const xmlData = fs.readFileSync(careerPath, 'utf8');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        const obj = parser.parse(xmlData);
        if (!obj || !obj.careerSavegame) return null;
        
        const settings = obj.careerSavegame.settings || {};
        const mapId = settings.mapId;
        const mapTitle = settings.mapTitle;
        
        let mapModName = null;
        if (mapId && mapId.includes('.')) {
            mapModName = mapId.split('.')[0];
        }
        
        if (mapId === 'MapUS') {
            return { x: 1390.0, y: 42.0, z: -50.0 };
        } else if (mapId === 'MapEU') {
            return { x: -283.0, y: 60.0, z: 68.5 };
        } else if (mapId === 'MapAS') {
            return { x: -562.0, y: 43.8, z: 566.0 };
        }
        
        const templateFolder = await resolveTemplateFolder(mapId, mapModName, mapTitle);
        const templatesDir = getTemplatesPath();
        
        if (templateFolder) {
            const tPlaceablesPath = path.join(templatesDir, templateFolder, 'placeables.xml');
            if (fs.existsSync(tPlaceablesPath)) {
                const tPlaceablesXml = fs.readFileSync(tPlaceablesPath, 'utf8');
                const pObj = parser.parse(tPlaceablesXml);
                if (pObj && pObj.placeables && pObj.placeables.placeable) {
                    const placeables = Array.isArray(pObj.placeables.placeable) ? pObj.placeables.placeable : [pObj.placeables.placeable];
                    const shopPlaceable = placeables.find(p => {
                        const filename = String(p['@_filename'] || '').toLowerCase();
                        const uniqueId = String(p['@_uniqueId'] || '').toLowerCase();
                        const nameL10nKey = String(p['@_nameL10nKey'] || '').toLowerCase();
                        const hasPos = p['@_position'] !== undefined;
                        return hasPos && (
                            filename.includes('sellingstationvehicles') || 
                            filename.includes('vehicletrader') || 
                            filename.includes('sellingstationstore') ||
                            uniqueId.includes('sellingstationvehicles') || 
                            uniqueId.includes('vehicletrader') ||
                            nameL10nKey.includes('shopitem_')
                        );
                    });
                    
                    if (shopPlaceable) {
                        const coords = shopPlaceable['@_position'].split(' ').map(parseFloat);
                        if (coords.length >= 3 && !isNaN(coords[0])) {
                            return { x: coords[0], y: coords[1], z: coords[2] };
                        }
                    }
                }
            }
        }

        // Fallback: parse map mod zip placeables!
        if (mapModName) {
            const modManager = require('./modManager');
            const modsDir = modManager.getModsPath();
            const AdmZip = require('adm-zip');
            const modZip = path.join(modsDir, `${mapModName}.zip`);
            if (fs.existsSync(modZip)) {
                const zip = new AdmZip(modZip);
                let placeablesFilename = 'maps/placeables.xml'; // default guess
                
                let mapXmlEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('map.xml'));
                if (mapXmlEntry) {
                    const mapXml = mapXmlEntry.getData().toString('utf8');
                    const mapObj = parser.parse(mapXml);
                    if (mapObj && mapObj.map && mapObj.map.placeables && mapObj.map.placeables['@_filename']) {
                        placeablesFilename = mapObj.map.placeables['@_filename'];
                    }
                }
                
                let placeablesEntry = zip.getEntry(placeablesFilename);
                if (!placeablesEntry) {
                    placeablesEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('placeables.xml'));
                }
                
                let foundPos = null;
                if (placeablesEntry) {
                    const xml = placeablesEntry.getData().toString('utf8');
                    const pObj = parser.parse(xml);
                    if (pObj && pObj.placeables && pObj.placeables.placeable) {
                        const placeables = Array.isArray(pObj.placeables.placeable) ? pObj.placeables.placeable : [pObj.placeables.placeable];
                        const shopPlaceable = placeables.find(p => {
                            const filename = String(p['@_filename'] || '').toLowerCase();
                            const uniqueId = String(p['@_uniqueId'] || '').toLowerCase();
                            const nameL10nKey = String(p['@_nameL10nKey'] || '').toLowerCase();
                            const hasPos = p['@_position'] !== undefined;
                            return hasPos && (
                                filename.includes('sellingstationvehicles') || 
                                filename.includes('vehicletrader') || 
                                filename.includes('sellingstationstore') ||
                                uniqueId.includes('sellingstationvehicles') || 
                                uniqueId.includes('vehicletrader') ||
                                nameL10nKey.includes('shopitem_')
                            );
                        });
                        
                        if (shopPlaceable && shopPlaceable['@_position']) {
                            const coords = shopPlaceable['@_position'].split(' ').map(parseFloat);
                            if (coords.length >= 3 && !isNaN(coords[0])) {
                                foundPos = { x: coords[0], y: coords[1], z: coords[2] };
                            }
                        }
                    }
                }
                
                if (foundPos) return foundPos;
                
                // If not found or lacks position (e.g. preplaced in I3D), try to find it in map.i3d from the zip
                const i3dEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('map.i3d'));
                if (i3dEntry) {
                    const i3dText = i3dEntry.getData().toString('utf8');
                    const match = i3dText.match(/<TransformGroup\s+[^>]*name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport|sellingStationVehicles)[^"]*"[^>]*translation="([^"]+)"/i) ||
                                  i3dText.match(/name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport|sellingStationVehicles)[^"]*"[^>]*translation="([^"]+)"/i) ||
                                  i3dText.match(/translation="([^"]+)"[^>]*name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport|sellingStationVehicles)[^"]*"/i);
                    if (match && match[1]) {
                        const coords = match[1].split(' ').map(parseFloat);
                        if (coords.length >= 3 && !isNaN(coords[0])) {
                            return { x: coords[0], y: coords[1], z: coords[2] };
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('Error getting map shop coordinates:', e);
    }
    if (allowFallback) {
        return await getMapDefaultStartCoordinates(savePath, false);
    }
    return null;
}

async function getMapHomeCoordinates(savePath) {
    return await getMapDefaultStartCoordinates(savePath);
}

async function getStoreDeliveryCoordinates(savePath) { 
    try {
        const path = require('path');
        const fs = require('fs');
        const storePath = path.join(savePath, 'storeDeliveries.xml');
        if (!fs.existsSync(storePath)) {
            const coords = await getMapDefaultStartCoordinates(savePath);
            return coords ? { ...coords, type: 'Home' } : null;
        }
        
        const { XMLParser } = require('fast-xml-parser');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        const data = parser.parse(fs.readFileSync(storePath, 'utf8'));
        if (data && data.storeDeliveries) {
            const isLoaded = data.storeDeliveries['@_isLoaded'] === 'true' || data.storeDeliveries['@_isLoaded'] === true;
            if (isLoaded) {
                let x = null, y = null, z = null;
                if (data.storeDeliveries.storeTeleportLocation) {
                    const loc = data.storeDeliveries.storeTeleportLocation;
                    x = parseFloat(loc['@_x']);
                    y = parseFloat(loc['@_y']);
                    z = parseFloat(loc['@_z']);
                } else if (data.storeDeliveries.storeLocation) {
                    const loc = data.storeDeliveries.storeLocation;
                    x = parseFloat(loc['@_x']);
                    y = parseFloat(loc['@_y']);
                    z = parseFloat(loc['@_z']);
                } else if (data.storeDeliveries.delivery) {
                    const d = Array.isArray(data.storeDeliveries.delivery) ? data.storeDeliveries.delivery[0] : data.storeDeliveries.delivery;
                    x = parseFloat(d['@_x']);
                    y = parseFloat(d['@_y']);
                    z = parseFloat(d['@_z']);
                }
                
                if (x !== null && !isNaN(x)) {
                    return { x, y, z, type: 'Custom' };
                }
            }
        }
    } catch(e) { console.error(e); }
    const coords = await getMapDefaultStartCoordinates(savePath);
    return coords ? { ...coords, type: 'Home' } : null;
}

async function resetPlayerSpawn(savePath) {
    try {
        const path = require('path');
        const fs = require('fs');
        const { XMLParser, XMLBuilder } = require('fast-xml-parser');
        
        // 1. Reset in players.xml
        const xmlPath = path.join(savePath, 'players.xml');
        if (fs.existsSync(xmlPath)) {
            const xmlData = fs.readFileSync(xmlPath, 'utf8');
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
            const obj = parser.parse(xmlData);
            if (obj && obj.players && obj.players.player) {
                let players = Array.isArray(obj.players.player) ? obj.players.player : [obj.players.player];
                for (let p of players) {
                    if (p.spawn) {
                        delete p.spawn['@_position'];
                        delete p.spawn['@_yaw'];
                        delete p.spawn['@_vehicleUniqueId'];
                    }
                }
                delete obj['?xml'];
                const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                const newXml = builder.build(obj);
                fs.writeFileSync(xmlPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml, 'utf8');
            }
        }
        
        // 2. Reset in careerSavegame.xml
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (fs.existsSync(careerPath)) {
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
            const careerXml = fs.readFileSync(careerPath, 'utf8');
            const careerObj = parser.parse(careerXml);
            if (careerObj && careerObj.careerSavegame && careerObj.careerSavegame.player) {
                delete careerObj.careerSavegame.player['@_spawnPositionX'];
                delete careerObj.careerSavegame.player['@_spawnPositionY'];
                delete careerObj.careerSavegame.player['@_spawnPositionZ'];
                delete careerObj.careerSavegame.player['@_vehicleId'];
                delete careerObj.careerSavegame.player['@_spawnYaw'];
                delete careerObj['?xml'];
                const careerBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                const newCareerXml = careerBuilder.build(careerObj);
                fs.writeFileSync(careerPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newCareerXml, 'utf8');
            }
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function getPlayerPosition(savePath) {
    try {
        const fs = require('fs');
        const path = require('path');
        const { XMLParser } = require('fast-xml-parser');
        
        let pos = null;
        const xmlPath = path.join(savePath, 'players.xml');
        if (fs.existsSync(xmlPath)) {
            const xml = fs.readFileSync(xmlPath, 'utf8');
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
            const data = parser.parse(xml);
            if (data && data.players && data.players.player) {
                const player = Array.isArray(data.players.player) ? data.players.player[0] : data.players.player;
                if (player.spawn && player.spawn['@_position']) {
                    const coords = player.spawn['@_position'].split(' ');
                    pos = { x: parseFloat(coords[0]), y: parseFloat(coords[1]), z: parseFloat(coords[2]) };
                } else if (player['@_lastPosition']) {
                    const coords = player['@_lastPosition'].split(' ');
                    pos = { x: parseFloat(coords[0]), y: parseFloat(coords[1]), z: parseFloat(coords[2]) };
                }
            }
        }

        if (!pos) {
            const careerPath = path.join(savePath, 'careerSavegame.xml');
            if (fs.existsSync(careerPath)) {
                const xml = fs.readFileSync(careerPath, 'utf8');
                const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
                const data = parser.parse(xml);
                if (data && data.careerSavegame && data.careerSavegame.player) {
                    const player = data.careerSavegame.player;
                    if (player['@_spawnPositionX'] !== undefined) {
                        pos = {
                            x: parseFloat(player['@_spawnPositionX']),
                            y: parseFloat(player['@_spawnPositionY']),
                            z: parseFloat(player['@_spawnPositionZ'])
                        };
                    }
                }
            }
        }
        
        // If no pos or pos is exactly 0,0,0 (default unspawned state), fallback to map default start
        if (!pos || (pos.x === 0 && pos.y === 0 && pos.z === 0)) {
            const defaultPos = await getMapDefaultStartCoordinates(savePath);
            if (defaultPos) return defaultPos;
        }
        
        if (pos) return pos;
    } catch (e) {
        console.error('Error reading player position:', e.message);
    }
    return null;
}

async function setPlayerPosition(options) {
    let savePath, x, y, z, vehicleUniqueId;
    if (typeof options === 'object') {
        ({ savePath, x, y, z, vehicleUniqueId } = options);
    } else {
        savePath = arguments[0];
        x = arguments[1];
        y = arguments[2];
        z = arguments[3];
    }
    
    try {
        const fs = require('fs');
        const path = require('path');
        const { XMLParser, XMLBuilder } = require('fast-xml-parser');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        
        // 1. Update players.xml
        const xmlPath = path.join(savePath, 'players.xml');
        if (fs.existsSync(xmlPath)) {
            const xmlData = fs.readFileSync(xmlPath, 'utf8');
            const obj = parser.parse(xmlData);
            if (obj && obj.players && obj.players.player) {
                let players = Array.isArray(obj.players.player) ? obj.players.player : [obj.players.player];
                for (let p of players) {
                    if (!p.spawn) p.spawn = {};
                    if (x !== undefined && y !== undefined && z !== undefined) {
                        p.spawn['@_position'] = `${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`;
                    }
                    if (vehicleUniqueId) {
                        p.spawn['@_vehicleUniqueId'] = vehicleUniqueId;
                    } else {
                        delete p.spawn['@_vehicleUniqueId'];
                    }
                }
                delete obj['?xml'];
                const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                const newXml = builder.build(obj);
                fs.writeFileSync(xmlPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml, 'utf8');
            }
        }
        
        // 2. Update careerSavegame.xml
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (fs.existsSync(careerPath)) {
            const careerXml = fs.readFileSync(careerPath, 'utf8');
            const careerObj = parser.parse(careerXml);
            if (careerObj && careerObj.careerSavegame) {
                if (!careerObj.careerSavegame.player) {
                    careerObj.careerSavegame.player = {};
                }
                const player = careerObj.careerSavegame.player;
                if (x !== undefined && y !== undefined && z !== undefined) {
                    player['@_spawnPositionX'] = String(x.toFixed(3));
                    player['@_spawnPositionY'] = String(y.toFixed(3));
                    player['@_spawnPositionZ'] = String(z.toFixed(3));
                }
                if (vehicleUniqueId) {
                    player['@_vehicleId'] = vehicleUniqueId;
                } else {
                    delete player['@_vehicleId'];
                }
                delete careerObj['?xml'];
                const careerBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                const newCareerXml = careerBuilder.build(careerObj);
                fs.writeFileSync(careerPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newCareerXml, 'utf8');
            }
        }
        
        // AUTO-INJECT DEPENDENCIES AT CREATION TIME
        if (options && options.autoInject) {
            await autoInjectDependencies(savePath);
        }
        
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function autoInjectDependencies(savegamePath) {
    const careerPath = path.join(savegamePath, 'careerSavegame.xml');
    if (!fs.existsSync(careerPath)) return { success: false, error: 'careerSavegame.xml not found' };

    try {
        const xml = await fs.readFile(careerPath, 'utf8');
        const data = parser.parse(xml);
        if (!data || !data.careerSavegame || !data.careerSavegame.mod) return { success: true };

        const modEntries = data.careerSavegame.mod || data.careerSavegame.mods?.mod || [];
        let mods = Array.isArray(modEntries) ? modEntries : [modEntries];

        const modManager = require('./modManager');
        const { mods: allMods } = await modManager.scanLocalMods();

        let addedNewDep = true;
        let didChange = false;
        
        while (addedNewDep) {
            addedNewDep = false;
            const currentMods = [...mods];
            for (const selMod of currentMods) {
                const fullMod = allMods.find(m => m.modName === selMod['@_modName']);
                if (fullMod && fullMod.dependencies && fullMod.dependencies.length > 0) {
                    for (const dep of fullMod.dependencies) {
                        let installedDep = null;
                        if (typeof dep === 'object' && dep.url) {
                            const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
                            if (idMatch) {
                                installedDep = allMods.find(m => m.modId && String(m.modId) === String(idMatch[1]));
                            }
                        }
                        if (!installedDep) {
                            const depStr = typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || '');
                            if (!depStr) continue;
                            
                            // Try exact literal match first
                            installedDep = allMods.find(m => m.modName && m.modName.toLowerCase() === depStr.toLowerCase());
                            
                            if (!installedDep) {
                                const normalizedDep = ultraNormalize(depStr);
                                if (normalizedDep) {
                                    installedDep = allMods.find(m => {
                                        const localName = ultraNormalize(m.modName);
                                        const localTitle = ultraNormalize(m.title);
                                        const localTech = ultraNormalize(m.technicalName);
                                        
                                        if (localName && (localName === normalizedDep || localName.includes(normalizedDep) || normalizedDep.includes(localName))) return true;
                                        if (localTitle && (localTitle === normalizedDep || localTitle.includes(normalizedDep) || normalizedDep.includes(localTitle))) return true;
                                        if (localTech && (localTech === normalizedDep || localTech.includes(normalizedDep) || normalizedDep.includes(localTech))) return true;
                                        
                                        return false;
                                    });
                                }
                            }
                        }
                        if (installedDep) {
                            const depStrMatch = typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || '');
                            if (depStrMatch && installedDep.modName !== depStrMatch && /^[a-zA-Z0-9_-]+$/.test(depStrMatch)) {
                                try {
                                    const path = require('path');
                                    const fsExtra = require('fs-extra');
                                    const oldPath = installedDep.filePath;
                                    if (oldPath && fsExtra.existsSync(oldPath)) {
                                        const dir = path.dirname(oldPath);
                                        const newPath = path.join(dir, depStrMatch + '.zip');
                                        if (!fsExtra.existsSync(newPath)) {
                                            console.log(`[AUTO-INJECT] Renaming mismatched dependency: ${installedDep.modName} -> ${depStrMatch}`);
                                            fsExtra.renameSync(oldPath, newPath);
                                            installedDep.modName = depStrMatch;
                                            installedDep.fileName = depStrMatch + '.zip';
                                            installedDep.filePath = newPath;
                                            
                                            // Also update cache if it exists
                                            const cache = require('./cache');
                                            if (cache.has('localMods')) {
                                                const cached = cache.get('localMods');
                                                if (cached && cached.mods) {
                                                    const cachedMod = cached.mods.find(m => m.filePath === oldPath);
                                                    if (cachedMod) {
                                                        cachedMod.modName = depStrMatch;
                                                        cachedMod.fileName = depStrMatch + '.zip';
                                                        cachedMod.filePath = newPath;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`[AUTO-INJECT] Failed to rename mismatched dependency ${installedDep.modName}:`, e.message);
                                }
                            }

                            const alreadySelected = mods.find(m => m['@_modName'] === installedDep.modName);
                            if (!alreadySelected) {
                                console.log(`[AUTO-INJECT] Injecting dependency: ${installedDep.title} (required by ${selMod['@_title'] || selMod['@_modName']})`);
                                mods.push({
                                    '@_modName': installedDep.modName,
                                    '@_title': installedDep.title,
                                    '@_version': installedDep.version || '1.0.0.0',
                                    '@_required': 'true',
                                    '@_fileHash': installedDep.fileHash || ''
                                });
                                addedNewDep = true;
                                didChange = true;
                            } else if (alreadySelected['@_required'] !== 'true') {
                                alreadySelected['@_required'] = 'true';
                                didChange = true;
                            }
                        }
                    }
                }
            }
        }

        if (didChange) {
            data.careerSavegame.mod = mods;
            delete data['?xml'];
            const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
            let newXml = builder.build(data);
            if (!newXml.startsWith('<?xml')) {
                newXml = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + newXml;
            }
            await fs.writeFile(careerPath, newXml, 'utf8');
            console.log(`[AUTO-INJECT] Successfully updated dependencies in ${careerPath}`);
        }
        
        return { success: true };
    } catch (err) {
        console.error('[AUTO-INJECT] Failed:', err);
        return { success: false, error: err.message };
    }
}

async function cleanupBridgeModFromSavegame(savePath) {
    try {
        const path = require('path');
        const fs = require('fs');
        const { XMLParser, XMLBuilder } = require('fast-xml-parser');
        const xmlPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(xmlPath)) return;
        
        const xmlData = fs.readFileSync(xmlPath, 'utf8');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        const obj = parser.parse(xmlData);
        if (obj && obj.careerSavegame && obj.careerSavegame.mod) {
            let mods = Array.isArray(obj.careerSavegame.mod) ? obj.careerSavegame.mod : [obj.careerSavegame.mod];
            const hasBridge = mods.some(m => m['@_modName'] === 'FS25_rememberPositions');
            if (hasBridge) {
                console.log(`[CLEANUP] Stripping FS25_rememberPositions from careerSavegame.xml of launching save.`);
                mods = mods.filter(m => m['@_modName'] !== 'FS25_rememberPositions');
                obj.careerSavegame.mod = mods;
                if (obj.careerSavegame) obj.careerSavegame['@_valid'] = 'true';
                delete obj['?xml'];
                const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                const newXml = builder.build(obj);
                fs.writeFileSync(xmlPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml, 'utf8');
            }
        }
    } catch (e) {
        console.error('[CLEANUP] Failed to strip rememberPositions:', e.message);
    }
}

async function syncSubfolderMapDependencies(savePath) {
    try {
        const path = require('path');
        const fs = require('fs');
        const { XMLParser, XMLBuilder } = require('fast-xml-parser');
        const xmlPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(xmlPath)) return;

        const xmlData = fs.readFileSync(xmlPath, 'utf8');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        const obj = parser.parse(xmlData);
        if (!obj || !obj.careerSavegame) return;

        // Try to identify the map mod
        const mapMatch = xmlData.match(/mapId="([^"]+)"/);
        if (!mapMatch || !mapMatch[1]) return;
        const mapId = mapMatch[1].split('.')[0];
        
        // Skip default maps
        if (['MapUS', 'MapEU', 'MapAS', 'HighlandsFishingMap'].includes(mapId)) return;

        // Scan local mods
        const modManager = require('./modManager');
        const { mods: localMods } = await modManager.scanLocalMods();
        const mapModObj = localMods.find(m => m.modName && m.modName.toLowerCase() === mapId.toLowerCase());
        
        if (mapModObj && mapModObj.folder && mapModObj.folder.toLowerCase() !== 'mods' && mapModObj.folder.toLowerCase() !== '') {
            const folderLower = mapModObj.folder.toLowerCase();
            const siblingMods = localMods.filter(m => m.folder && m.folder.toLowerCase() === folderLower && m.modName && m.modName.toLowerCase() !== mapId.toLowerCase());
            
            if (siblingMods.length > 0) {
                let mods = obj.careerSavegame.mod;
                if (!mods) mods = [];
                else if (!Array.isArray(mods)) mods = [mods];

                let modified = false;
                for (const sib of siblingMods) {
                    const hasMod = mods.some(m => m['@_modName'] && m['@_modName'].toLowerCase() === sib.modName.toLowerCase());
                    if (!hasMod) {
                        console.log(`[SYNC-DEPS] Auto-activating missing sibling mod in careerSavegame.xml: ${sib.modName}`);
                        mods.push({
                            '@_modName': sib.modName,
                            '@_title': sib.title || sib.modName,
                            '@_version': sib.version || '1.0.0.0',
                            '@_required': 'false',
                            '@_fileHash': sib.fileHash || ''
                        });
                        modified = true;
                    }
                }

                if (modified) {
                    obj.careerSavegame.mod = mods;
                    obj.careerSavegame['@_valid'] = 'true';
                    delete obj['?xml'];
                    const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                    const newXml = builder.build(obj);
                    fs.writeFileSync(xmlPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml, 'utf8');
                    console.log(`[SYNC-DEPS] Successfully updated careerSavegame.xml with subfolder map dependencies.`);
                }
            }
        }
    } catch (e) {
        console.error('[SYNC-DEPS] Failed to sync map dependencies:', e.message);
    }
}

async function adoptSaveAsTemplate(saveIndex) {
    try {
        const fs25Path = getFs25Path();
        const savePath = path.join(fs25Path, `savegame${saveIndex}`);
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        
        if (!fs.existsSync(careerPath)) {
            return { success: false, error: `Savegame ${saveIndex} is empty or missing careerSavegame.xml` };
        }
        
        const xml = await fs.readFile(careerPath, 'utf8');
        const data = parser.parse(xml);
        const settings = data.careerSavegame.settings;
        const mapId = settings['@_mapId'] || settings.mapId;
        const mapTitle = settings['@_mapTitle'] || settings.mapTitle;
        
        if (!mapId) {
            return { success: false, error: 'Map ID not found in savegame' };
        }
        
        let mapModName = null;
        if (mapId && mapId.includes('.')) {
            mapModName = mapId.split('.')[0];
        }
        
        // Construct template name
        let templateFolder = mapId.replace(/[^a-z0-9]/gi, '_');
        if (mapModName) {
            const cleanMod = mapModName.replace(/[^a-z0-9]/gi, '_');
            templateFolder = `${cleanMod}_${templateFolder}`;
        }
        
        const templatesDir = getTemplatesPath();
        const destPath = path.join(templatesDir, templateFolder);
        
        console.log(`[HARVEST] Adopting savegame ${saveIndex} to template ${templateFolder}`);
        await fs.ensureDir(destPath);
        
        let retries = 10;
        while (retries > 0) {
            try {
                await fs.copy(savePath, destPath);
                break;
            } catch (copyErr) {
                retries--;
                if (retries === 0) throw copyErr;
                console.warn(`[HARVEST] Savegame files locked, retrying in 1 second... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Clean up temporary/user files in template
        const filesToRemove = ['steam_autocloud.vdf', 'modManager.json'];
        for (const f of filesToRemove) {
            const p = path.join(destPath, f);
            if (fs.existsSync(p)) {
                await fs.remove(p);
            }
        }
        
        return { success: true };
    } catch (err) {
        console.error('[HARVEST] Failed to adopt template:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    adoptSaveAsTemplate,
    cleanupBridgeModFromSavegame,
    syncSubfolderMapDependencies,
    getPlayerPosition,
    setPlayerPosition,
    resetPlayerSpawn,
    getMapHomeCoordinates,
    getMapShopCoordinates,
    getFleetPositions,
    activatePlayerPersistence,
    deactivatePlayerPersistence,
    checkStoreDeliveries,
    ensureStoreDeliveries,
    updateNativeEnhancement,
    getStoreDeliveryCoordinates,
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
    getEngineBackups,
    restoreEngineBackup,
    swapArchiveToSlot,
    deleteArchivedSavegame,
    renameArchivedSavegame,
    getAllSavegames,
    updateSavegameAttribute,
    updateFleetMaintenance,
    getSavegameTransferData,
    executeTransfer,
    autoInjectDependencies
};
