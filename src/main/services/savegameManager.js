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
    try { nodeFs.appendFile(logFile, entry, 'utf8', () => {}); } catch (e) {}
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

    // Sync master templates from app resources bundle if missing
    try {
        const bundledTemplates = [
            path.join(__dirname, '../resources/templates'),
            path.join(__dirname, '../../src/main/resources/templates')
        ].find(dir => fs.existsSync(dir));

        if (bundledTemplates) {
            const masterFolders = ['MapAS', 'MapEU', 'MapUS', 'pdlc_highlandsFishingPack_HighlandsFishingMap'];
            for (const mf of masterFolders) {
                const srcMf = path.join(bundledTemplates, mf);
                const dstMf = path.join(p, mf);
                if (fs.existsSync(srcMf)) {
                    if (!fs.existsSync(dstMf)) {
                        fs.copySync(srcMf, dstMf);
                    } else {
                        // Ensure vehicles.xml, careerSavegame.xml, and heightmap exist in target master folder
                        for (const file of ['vehicles.xml', 'careerSavegame.xml', 'terrain.heightmap.png']) {
                            const sf = path.join(srcMf, file);
                            const df = path.join(dstMf, file);
                            if (fs.existsSync(sf) && (!fs.existsSync(df) || fs.statSync(df).size < 100)) {
                                fs.copySync(sf, df);
                                console.log(`[TEMPLATES] Synced missing master template file ${mf}/${file}`);
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('[TEMPLATES] Failed to sync master templates:', e);
    }

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
 * Read text file from a template (either .zip archive or directory)
 */
function readTemplateEntryText(templateItem, relPath) {
    if (!templateItem) return null;
    const templatesDir = getTemplatesPath();
    const tPath = path.join(templatesDir, templateItem);
    if (!fs.existsSync(tPath)) {
        // Also check if .zip extension was omitted
        const zipAlt = tPath.endsWith('.zip') ? tPath : `${tPath}.zip`;
        if (fs.existsSync(zipAlt)) {
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(zipAlt);
                const entry = zip.getEntry(relPath.replace(/\\/g, '/'));
                if (entry) return entry.getData().toString('utf8');
            } catch (e) {}
        }
        return null;
    }
    const stat = fs.statSync(tPath);
    if (stat.isFile() && templateItem.toLowerCase().endsWith('.zip')) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(tPath);
            const entry = zip.getEntry(relPath.replace(/\\/g, '/'));
            if (entry) return entry.getData().toString('utf8');
        } catch (e) {}
        return null;
    }
    const fullPath = path.join(tPath, relPath);
    if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf8');
    }
    return null;
}

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

    console.log(`[MAPS] Scanning ${folders.length} items in ${templatesDir} (Parallel)`);

    const templatePromises = folders.map(async (folder) => {
        const folderPath = path.join(templatesDir, folder);
        try {
            const stats = await fs.stat(folderPath);
            const isZip = stats.isFile() && folder.toLowerCase().endsWith('.zip');
            if (!stats.isDirectory() && !isZip) return null;

            const baseName = folder.replace(/\.zip$/i, '');
            let mapTitle = baseName;
            let mapId = baseName;
            let filesCount = 0;

            if (isZip) {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(folderPath);
                const heightmap = zip.getEntry('terrain.heightmap.png');
                const economyFile = zip.getEntry('economy.xml');
                if (!heightmap || !economyFile) return null;

                const careerEntry = zip.getEntry('careerSavegame.xml');
                if (careerEntry) {
                    const xmlContent = careerEntry.getData().toString('utf8');
                    const tMatch = xmlContent.match(/<mapTitle[^>]*>([^<]+)<\/mapTitle>/i) || xmlContent.match(/mapTitle=["']([^"']+)["']/i);
                    const iMatch = xmlContent.match(/<mapId[^>]*>([^<]+)<\/mapId>/i) || xmlContent.match(/mapId=["']([^"']+)["']/i);
                    mapTitle = tMatch ? tMatch[1] : mapTitle;
                    mapId = iMatch ? iMatch[1] : mapId;
                }
                filesCount = zip.getEntries().length;
            } else {
                const heightmap = path.join(folderPath, 'terrain.heightmap.png');
                const economyFile = path.join(folderPath, 'economy.xml');
                if (!fs.existsSync(heightmap) || !fs.existsSync(economyFile)) return null;

                const careerPath = path.join(folderPath, 'careerSavegame.xml');
                if (fs.existsSync(careerPath)) {
                    const xmlContent = await fs.readFile(careerPath, 'utf8');
                    const tMatch = xmlContent.match(/<mapTitle[^>]*>([^<]+)<\/mapTitle>/i) || xmlContent.match(/mapTitle=["']([^"']+)["']/i);
                    const iMatch = xmlContent.match(/<mapId[^>]*>([^<]+)<\/mapId>/i) || xmlContent.match(/mapId=["']([^"']+)["']/i);
                    mapTitle = tMatch ? tMatch[1] : folder;
                    mapId = iMatch ? iMatch[1] : folder;
                }
                const files = await fs.readdir(folderPath);
                filesCount = files.length;
            }

            // Attempt a "Rich Match" using installed mods or DLCs
            const matchedMod = mapMods.find(m => {
                const mId = m.mapId;
                const mTitle = m.title;
                const mName = m.modName;
                const fLower = baseName.toLowerCase();

                if (mId && mId === mapId) return true;
                if (mTitle && mTitle === mapTitle) return true;
                if (mTitle && mapTitle && mTitle.toLowerCase().trim() === mapTitle.toLowerCase().trim()) return true;
                if (mName && mName === baseName) return true;
                if (mId && mId.replace(/[^a-z0-9]/gi, '_') === baseName) return true;
                if (mapId && mName && mapId.toLowerCase().startsWith(mName.toLowerCase() + '.')) return true;
                if (mapId && mId && mapId.toLowerCase().endsWith('.' + mId.toLowerCase())) return true;
                if (mName && fLower.includes(mName.toLowerCase())) return true;
                
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
                    if (baseName.toLowerCase().includes(info.dlcId?.toLowerCase())) {
                        dlcInfo = info;
                        break;
                    }
                }
            }

            return {
                id: folder,
                title: matchedMod ? matchedMod.title : (dlcInfo ? dlcInfo.title : mapTitle),
                modName: matchedMod ? matchedMod.modName : (dlcInfo ? dlcInfo.dlcId : null),
                mapId: matchedMod ? matchedMod.mapId : mapId,
                isModMap: !isOfficialMap(mapId),
                path: folderPath,
                created: stats.birthtime.toISOString(),
                filesCount: filesCount,
                author: matchedMod ? matchedMod.author : (dlcInfo ? dlcInfo.author : (isOfficialMap(mapId) ? 'GIANTS Software' : 'Unknown')),
                version: matchedMod ? matchedMod.version : (dlcInfo ? dlcInfo.version : null),
                isCompressed: isZip
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
    const cleanName = folderName.replace(/\.zip$/i, '');
    const targetDir = path.join(templatesDir, cleanName);
    const targetZip = path.join(templatesDir, `${cleanName}.zip`);
    let deleted = false;
    if (fs.existsSync(targetZip)) {
        await fs.remove(targetZip);
        deleted = true;
    }
    if (fs.existsSync(targetDir)) {
        await fs.remove(targetDir);
        deleted = true;
    }
    return { success: deleted };
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

    const GENERIC_MAP_IDS = new Set([
        'samplemodmap', 'templatemap', 'multifruitmodmap', 'modmap', 
        'map', 'maps4s', 'novabase', 'mountain', 'firstmap', 
        'davidsmap', 'baseblack', 'camposgauchos', 'elmcreek'
    ]);

    const isGenericMapId = GENERIC_MAP_IDS.has(targetMapIdNorm);

    const folders = await fs.readdir(templatesDir);

    // Helper: Verify template is complete (not a corrupt/dummy 9-file unlaunched folder)
    const isCompleteTemplate = async (fPath, isZip = false) => {
        if (isZip) {
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(fPath);
                return !!zip.getEntry('terrain.heightmap.png') && (!!zip.getEntry('densityMap_fruits.gdm') || !!zip.getEntry('economy.xml') || zip.getEntries().length >= 25);
            } catch (e) {
                return false;
            }
        }
        if (!fs.existsSync(path.join(fPath, 'terrain.heightmap.png'))) return false;
        // Must have real engine-generated files or substantial file count
        const hasGdm = fs.existsSync(path.join(fPath, 'densityMap_fruits.gdm'));
        const hasEconomy = fs.existsSync(path.join(fPath, 'economy.xml'));
        if (hasGdm || hasEconomy) return true;
        const count = await fs.readdir(fPath).then(files => files.length).catch(() => 0);
        return count >= 25;
    };

    // 1. Direct folder/zip check
    for (const folder of folders) {
        const folderPath = path.join(templatesDir, folder);
        const stat = await fs.stat(folderPath).catch(() => null);
        if (!stat) continue;
        const isZip = stat.isFile() && folder.toLowerCase().endsWith('.zip');
        if (!stat.isDirectory() && !isZip) continue;

        if (!(await isCompleteTemplate(folderPath, isZip))) continue;

        const cleanFolder = folder.replace(/\.zip$/i, '');
        const fNorm = ultraNorm(cleanFolder);
        // Exact normalized modName match (e.g. "birgland" === "birgland")
        if (targetModNorm && fNorm === targetModNorm) return folder;
        // Template named with pattern: {modName}_{mapId} or {modName}_{modName}_{mapId}
        if (targetModNorm && targetMapIdNorm && (fNorm === `${targetModNorm}${targetMapIdNorm}` || fNorm === `${targetModNorm}${targetModNorm}${targetMapIdNorm}`)) return folder;
        // Exact normalized title match
        if (targetTitleNorm && fNorm === targetTitleNorm) return folder;
        // Non-generic mapId match
        if (!isGenericMapId && targetMapIdNorm && fNorm === targetMapIdNorm) return folder;
    }

    // 2. XML Deep Scan check inside templates
    for (const folder of folders) {
        const folderPath = path.join(templatesDir, folder);
        const stat = await fs.stat(folderPath).catch(() => null);
        if (!stat) continue;
        const isZip = stat.isFile() && folder.toLowerCase().endsWith('.zip');
        if (!stat.isDirectory() && !isZip) continue;

        if (await isCompleteTemplate(folderPath, isZip)) {
            try {
                let xml = null;
                if (isZip) {
                    const AdmZip = require('adm-zip');
                    const zip = new AdmZip(folderPath);
                    const careerEntry = zip.getEntry('careerSavegame.xml');
                    if (careerEntry) xml = careerEntry.getData().toString('utf8');
                } else {
                    const careerPath = path.join(folderPath, 'careerSavegame.xml');
                    if (fs.existsSync(careerPath)) {
                        xml = await fs.readFile(careerPath, 'utf8');
                    }
                }

                if (xml) {
                    const idMatch = xml.match(/<mapId[^>]*>([^<]+)<\/mapId>/i) || xml.match(/mapId=["']([^"']+)["']/i);
                    const titleMatch = xml.match(/<mapTitle[^>]*>([^<]+)<\/mapTitle>/i) || xml.match(/mapTitle=["']([^"']+)["']/i);
                    const internalId = idMatch ? idMatch[1] : null;
                    const internalTitle = titleMatch ? titleMatch[1] : null;
                    
                    if (internalId && targetModNorm) {
                        const internalModPart = ultraNorm(internalId.split('.')[0]);
                        if (internalModPart === targetModNorm) {
                            return folder;
                        }
                    }
                    if (internalTitle && targetTitleNorm && ultraNorm(internalTitle) === targetTitleNorm) {
                        if (targetModNorm) {
                            const internalModPart = ultraNorm((internalId || '').split('.')[0]);
                            if (internalModPart && internalModPart === targetModNorm) return folder;
                        } else {
                            return folder;
                        }
                    }
                    if (!isGenericMapId && internalId && ultraNorm(internalId) === targetMapIdNorm) {
                        return folder;
                    }
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
 * Helper to persistently retrieve the user's real uniqueUserId profile hash.
 * Scans SQLite cache, active savegames 1-20, backup/archive folders, and falls back to user profile hash.
 */
async function getPersistentUniqueUserId(fs25Path) {
    const cache = require('./cache');
    try {
        let cachedId = cache.getSetting('cachedUniqueUserId');
        if (cachedId && cachedId !== 'player') {
            if (!cachedId.endsWith('=')) cachedId += '=';
            return cachedId;
        }
    } catch (e) {}

    let realUserId = null;

    // 1. Scan active savegames 1 through 20
    for (let i = 1; i <= 20; i++) {
        const otherFarmsPath = path.join(fs25Path, `savegame${i}`, 'farms.xml');
        if (fs.existsSync(otherFarmsPath)) {
            try {
                const xml = await fs.readFile(otherFarmsPath, 'utf8');
                const match = xml.match(/uniqueUserId="([^"]+)"/);
                if (match && match[1] && match[1] !== 'player') {
                    let id = match[1];
                    if (id.length === 43 && !id.endsWith('=')) id += '=';
                    realUserId = id;
                    if (id.endsWith('=')) break; // Found complete padded ID
                }
            } catch (err) {}
        }
    }

    // 2. If no active savegames found (e.g. all archived), scan backups and archive directories
    if (!realUserId) {
        try {
            const files = await fs.readdir(fs25Path);
            for (const file of files) {
                if (file.toLowerCase().includes('backup') || file.toLowerCase().includes('archive')) {
                    const fullSub = path.join(fs25Path, file);
                    try {
                        const stats = await fs.stat(fullSub);
                        if (stats.isDirectory()) {
                            const subEntries = await fs.readdir(fullSub);
                            for (const subItem of subEntries) {
                                const candidateFile = path.join(fullSub, subItem, 'farms.xml');
                                if (fs.existsSync(candidateFile)) {
                                    const xml = await fs.readFile(candidateFile, 'utf8');
                                    const match = xml.match(/uniqueUserId="([^"]+)"/);
                                    if (match && match[1] && match[1] !== 'player') {
                                        realUserId = match[1];
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                }
                if (realUserId) break;
            }
        } catch (e) {}
    }

    // 3. Fallback to user's known profile hash if no files exist
    if (!realUserId) {
        realUserId = "i+QOspKR7Rz/+5dq9rqsECnaqxfS1Eeb0I4hrQbVzzs=";
    }

    if (realUserId && !realUserId.endsWith('=')) {
        realUserId += '=';
    }

    if (realUserId && realUserId !== 'player') {
        try {
            cache.setSetting('cachedUniqueUserId', realUserId);
        } catch (e) {}
    }

    return realUserId || "i+QOspKR7Rz/+5dq9rqsECnaqxfS1Eeb0I4hrQbVzzs=";
}

/**
 * Configure farmland ownership in savegame farmland.xml based on game mode and map definitions.
 */
async function setupSavegameFarmlands(slotPath, modZipPath, engineMapId, mapModName, includeStartFarm) {
    const farmlandPath = path.join(slotPath, 'farmland.xml');
    
    // 1. Determine official map starting farmlands
    const defaultFarmIds = new Set();
    const allFarmlandIds = [];

    const OFFICIAL_DEFAULTS = {
        mapus: ['1', '2', '3', '4', '5'],
        mapeu: ['45', '46'],
        mapas: ['27', '28', '30', '31'],
        pdlc_highlandsfishingpack: ['20', '22', '23', '35', '49', '50']
    };

    const lowId = (engineMapId || '').toLowerCase();
    for (const [key, ids] of Object.entries(OFFICIAL_DEFAULTS)) {
        if (lowId.includes(key)) {
            ids.forEach(id => defaultFarmIds.add(id));
            break;
        }
    }

    // 2. If mod map, resolve zip and read author-configured farmlands XML
    let zipPath = modZipPath;
    if (!zipPath && mapModName) {
        const modManager = require('./modManager');
        const paths = modManager.getModsPaths();
        for (const p of paths) {
            const candidate = path.join(p, `${mapModName}.zip`);
            if (fs.existsSync(candidate)) {
                zipPath = candidate;
                break;
            }
        }
    }

    if (zipPath && fs.existsSync(zipPath)) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);

            let farmlandsXml = null;
            // A. Check via configFilename in modDesc.xml
            const mdEntry = zip.getEntry('modDesc.xml');
            if (mdEntry) {
                const mdXml = mdEntry.getData().toString('utf8');
                const cfgMatch = mdXml.match(/configFilename=["']([^"']+)["']/i);
                if (cfgMatch) {
                    const cfgEntry = zip.getEntry(cfgMatch[1]) || zip.getEntry(cfgMatch[1].replace(/\\/g, '/'));
                    if (cfgEntry) {
                        const cfgXml = cfgEntry.getData().toString('utf8');
                        const flMatch = cfgXml.match(/<farmlands\s+[^>]*filename=["']([^"']+)["']/i);
                        if (flMatch) {
                            const flEntry = zip.getEntry(flMatch[1]) || zip.getEntry(flMatch[1].replace(/\\/g, '/'));
                            if (flEntry) {
                                farmlandsXml = flEntry.getData().toString('utf8');
                            }
                        }
                    }
                }
            }

            // B. Fallback: search for farmlands.xml in zip entries
            if (!farmlandsXml) {
                const flEntry = zip.getEntries().find(e => /farmlands?\.xml$/i.test(e.entryName));
                if (flEntry) farmlandsXml = flEntry.getData().toString('utf8');
            }

            if (farmlandsXml) {
                const flRegex = /<farmland\s+([^>]+)>/gi;
                let match;
                while ((match = flRegex.exec(farmlandsXml)) !== null) {
                    const attrs = match[1];
                    const idM = attrs.match(/id=["']([^"']+)["']/i);
                    if (idM) {
                        const id = idM[1];
                        allFarmlandIds.push(id);
                        if (/defaultFarmProperty=["']true["']/i.test(attrs)) {
                            defaultFarmIds.add(id);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[CREATE] Could not parse default farmlands from mod zip:', e.message);
        }
    }

    console.log(`[CREATE] Configured ${defaultFarmIds.size} starting farmlands for ${engineMapId}: [${Array.from(defaultFarmIds).join(', ')}]`);

    // 3. Update or generate slotPath/farmland.xml in compliant FS25 savegame format
    try {
        let existingXml = fs.existsSync(farmlandPath) ? await fs.readFile(farmlandPath, 'utf8') : null;
        const isRawMapConfig = existingXml && (existingXml.includes('<map') || existingXml.includes('pricePerHa=') || existingXml.includes('priceScale='));

        if (!existingXml || isRawMapConfig) {
            // Missing or raw map configuration XML -> generate compliant savegame format
            const idsToUse = allFarmlandIds.length > 0 ? allFarmlandIds : Array.from({ length: 255 }, (_, i) => String(i + 1));
            let outXml = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<farmlands>\n';
            for (const id of idsToUse) {
                const isOwned = includeStartFarm && defaultFarmIds.has(id);
                outXml += `    <farmland id="${id}" farmId="${isOwned ? '1' : '0'}"/>\n`;
            }
            outXml += '</farmlands>\n';
            await fs.writeFile(farmlandPath, outXml, 'utf8');
            console.log(`[CREATE] Generated clean savegame farmland.xml with ${includeStartFarm ? defaultFarmIds.size : 0} owned farmlands.`);
        } else {
            // Valid savegame format exists (<farmlands><farmland id="..." farmId="..."/></farmlands>)
            if (!includeStartFarm) {
                existingXml = existingXml.replace(/farmId="1"/g, 'farmId="0"');
                await fs.writeFile(farmlandPath, existingXml, 'utf8');
                console.log('[CREATE] Set all farmlands to farmId="0" (includeStartFarm is false).');
            } else if (defaultFarmIds.size > 0) {
                for (const id of defaultFarmIds) {
                    const reg = new RegExp(`(<farmland\\s+[^>]*id=["']${id}["'][^>]*farmId=["'])[0-9]+(["'])`, 'i');
                    if (reg.test(existingXml)) {
                        existingXml = existingXml.replace(reg, '$11$2');
                    } else {
                        const regNoFarmId = new RegExp(`(<farmland\\s+[^>]*id=["']${id}["'])([^>]*\/?>)`, 'i');
                        if (regNoFarmId.test(existingXml)) {
                            existingXml = existingXml.replace(regNoFarmId, '$1 farmId="1"$2');
                        }
                    }
                }
                await fs.writeFile(farmlandPath, existingXml, 'utf8');
                console.log(`[CREATE] Assigned ${defaultFarmIds.size} starting farmlands to farmId="1" in farmland.xml.`);
            }
        }
    } catch (err) {
        console.error('[CREATE] Failed to configure farmland.xml:', err);
    }
}

/**
 * Create a new savegame from a template.
 */
async function createSavegameWithMods(savegameIndex, savegameName, selectedMods, opts = {}) {
    const fs25Path = getFs25Path();
    const slotPath = path.join(fs25Path, `savegame${savegameIndex}`);
    const templatesDir = getTemplatesPath();
    let requiresEngineInit = false;
    
    const { 
        mapId, 
        mapTitle, 
        mapModName, 
        money = 1000000, 
        difficulty = 1, 
        economicDifficulty = 'NORMAL',
        initialLoan = 0,
        fixedSeasonLength = 1,
        timeScale = 5.0,
        startMonth = 1,
        mode = 'NEW_FARMER' 
    } = opts;
    const includeStartFarm = opts.includeStartFarm !== false && opts.includeStartFarm !== 'false';
    const startFarmFlag = includeStartFarm ? 'true' : 'false';

    // 1. Prepare Slot
    if (fs.existsSync(slotPath)) {
        await fs.emptyDir(slotPath);
    } else {
        await fs.ensureDir(slotPath);
    }

    // Scan mods first so we can resolve the correct path of the map mod (even if in a subfolder)
    const modManager = require('./modManager');
    try {
        const defaultMods = modManager.getDefaultModsPath();
        if (defaultMods) {
            await modManager.syncMirrorLinks(defaultMods);
        }
    } catch (mErr) {
        console.warn('[CREATE] Warning: failed to sync mirror links:', mErr.message);
    }

    let allMods = [];
    try {
        const scanRes = await modManager.scanLocalMods();
        allMods = scanRes.mods || [];
    } catch (err) {
        console.error('[CREATE] Failed to scan local mods:', err);
    }

    const GENERIC_MAP_IDS = new Set([
        'samplemodmap', 'templatemap', 'multifruitmodmap', 'modmap', 
        'map', 'maps4s', 'novabase', 'mountain', 'firstmap', 
        'davidsmap', 'baseblack', 'camposgauchos', 'elmcreek'
    ]);

    let modZipPath = null;
    const findMapZip = (name, title, id, directFilePath) => {
        if (directFilePath && fs.existsSync(directFilePath)) return directFilePath;

        const nLow = (name || '').toLowerCase();
        const tLow = (title || '').toLowerCase();
        const idLow = (id || '').toLowerCase();
        
        // Pass 1: Match by exact mod name or file basename
        if (nLow) {
            for (const m of allMods) {
                if (!m.filePath || !m.filePath.toLowerCase().endsWith('.zip')) continue;
                const mNameLow = (m.modName || '').toLowerCase();
                const mFileBase = path.basename(m.filePath, '.zip').toLowerCase();
                if (mNameLow === nLow || mFileBase === nLow) return m.filePath;
            }
        }

        // Pass 2: Match by exact title
        if (tLow) {
            for (const m of allMods) {
                if (!m.filePath || !m.filePath.toLowerCase().endsWith('.zip')) continue;
                const mTitleLow = (m.title || '').toLowerCase();
                if (mTitleLow === tLow) return m.filePath;
            }
        }

        // Pass 3: Match by unique mapId (NEVER match generic placeholder map IDs like SampleModMap!)
        if (idLow && !GENERIC_MAP_IDS.has(idLow)) {
            for (const m of allMods) {
                if (!m.filePath || !m.filePath.toLowerCase().endsWith('.zip')) continue;
                const mMapIdLow = (m.mapId || '').toLowerCase();
                if (mMapIdLow === idLow) return m.filePath;
            }
        }

        return null;
    };
    modZipPath = findMapZip(mapModName, mapTitle, mapId, opts.mapFilePath);

    // 2. Identify and Copy Template
    const resolvedFolder = await resolveTemplateFolder(mapId, mapModName, mapTitle);
    let copiedTemplate = false;
    if (resolvedFolder) {
        const templatePath = path.join(templatesDir, resolvedFolder);
        if (fs.existsSync(templatePath)) {
            const stat = await fs.stat(templatePath);
            if (stat.isFile() && templatePath.toLowerCase().endsWith('.zip')) {
                console.log(`[CREATE] Extracting compressed master template from ${resolvedFolder}`);
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(templatePath);
                zip.extractAllTo(slotPath, true);
                copiedTemplate = true;
            } else if (stat.isDirectory()) {
                console.log(`[CREATE] Copying master template from ${resolvedFolder}`);
                await fs.copy(templatePath, slotPath);
                copiedTemplate = true;
            }
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
    const matchedMapMod = allMods.find(m => (m.modName || '').toLowerCase() === (mapModName || '').toLowerCase());
    let mapModObj = finalMods.find(m => (m.modName || '').toLowerCase() === (mapModName || '').toLowerCase());
    if (mapModName && !mapModObj) {
        mapModObj = { 
            modName: mapModName, 
            title: mapTitle || matchedMapMod?.title || mapModName, 
            version: matchedMapMod?.version || '1.0.0.0', 
            required: true 
        };
        finalMods.unshift(mapModObj);
    } else if (mapModObj) {
        mapModObj.required = true;
        if (matchedMapMod?.version) mapModObj.version = matchedMapMod.version;
    }

    // --- AUTO-INJECT DEPENDENCIES FOR ALL SELECTED MODS ---
    // If we don't do this, the FS25 engine pauses the launch and prompts: "Do you want to select all required mods?"
    try {
        let addedNewDep = true;
        while(addedNewDep) {
            addedNewDep = false;
            const currentMods = [...finalMods];
            for (const selMod of currentMods) {
                const fullMod = allMods.find(m => 
                    (m.modName && m.modName.toLowerCase() === (selMod.modName || '').toLowerCase()) ||
                    (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === (selMod.modName || '').toLowerCase())
                );
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

                        // 2. Resolve match from the dependency name string
                        if (!installedDep) {
                            const depStr = (typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || '')).toLowerCase();
                            if (!depStr) continue;
                            
                            installedDep = allMods.find(m => 
                                (m.modName && m.modName.toLowerCase() === depStr) ||
                                (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === depStr) ||
                                (m.title && m.title.toLowerCase() === depStr)
                            );
                        }

                        if (installedDep && installedDep.modName !== mapModName && !finalMods.some(m => m.modName.toLowerCase() === installedDep.modName.toLowerCase())) {
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
                            const alreadySelected = finalMods.find(m => m.modName.toLowerCase() === installedDep.modName.toLowerCase());
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

    // Extract true map id from the mod's modDesc.xml if available
    let internalMapId = mapId;
    if (modZipPath && fs.existsSync(modZipPath)) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(modZipPath);
            const entry = zip.getEntry('modDesc.xml');
            if (entry) {
                const xml = entry.getData().toString('utf8');
                const mMatch = xml.match(/<map\s+[^>]*id=["']([^"']+)["']/i);
                if (mMatch && mMatch[1]) {
                    internalMapId = mMatch[1];
                    console.log(`[CREATE] Extracted real internal mapId "${internalMapId}" from ${path.basename(modZipPath)}`);
                }
            }
        } catch (e) {
            console.warn(`[CREATE] Could not read mapId from zip: ${e.message}`);
        }
    }

    // FS25 engine requires mod maps to have their mapId prefixed with the mod name (e.g. FS25_MapMod.MapId)
    // If we don't do this, the engine can't find the map, marking the save as corrupted and greying out the Continue button.
    let engineMapId = internalMapId || mapId;
    const lowEngineId = (engineMapId || '').toLowerCase();
    if (lowEngineId === 'mapus') engineMapId = 'MapUS';
    else if (lowEngineId === 'mapeu') engineMapId = 'MapEU';
    else if (lowEngineId === 'mapas') engineMapId = 'MapAS';
    else if (lowEngineId.includes('highlandsfishing') || mapModName === 'pdlc_highlandsFishingPack') {
        engineMapId = 'pdlc_highlandsFishingPack.HighlandsFishingMap';
    } else if (mapModName && !['MapUS', 'MapEU', 'MapAS'].includes(engineMapId)) {
        if (!engineMapId.startsWith(mapModName + '.')) {
            engineMapId = `${mapModName}.${engineMapId}`;
        }
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
            savegameData.careerSavegame.settings.initialLoan = String(initialLoan);
            savegameData.careerSavegame.settings.economicDifficulty = String(economicDifficulty || 'NORMAL').toUpperCase();
            savegameData.careerSavegame.settings.plannedDaysPerPeriod = String(fixedSeasonLength || 1);
            savegameData.careerSavegame.settings.timeScale = String(timeScale || 5.0);
            savegameData.careerSavegame.settings.isCrossPlatformSavegame = 'false';
            savegameData.careerSavegame.settings.hasInitiallyOwnedFarmlands = startFarmFlag;
            savegameData.careerSavegame.settings.loadDefaultFarm = startFarmFlag;
            savegameData.careerSavegame.settings.loadDefaultVehicles = startFarmFlag;
            if (difficulty) savegameData.careerSavegame.settings.difficulty = String(difficulty);
            
            if (!savegameData.careerSavegame.statistics) savegameData.careerSavegame.statistics = {};
            savegameData.careerSavegame.statistics.money = String(money);
            
            // Preserve any essential mods / dependencies that were pre-configured in the template
            if (savegameData.careerSavegame.mod) {
                const templateMods = Array.isArray(savegameData.careerSavegame.mod)
                    ? savegameData.careerSavegame.mod
                    : [savegameData.careerSavegame.mod];
                
                const existingNames = new Set(modData.map(m => (m['@_modName'] || '').toLowerCase()));
                for (const tMod of templateMods) {
                    const tName = tMod['@_modName'];
                    if (tName && !existingNames.has(tName.toLowerCase())) {
                        modData.push({
                            '@_modName': tName,
                            '@_title': tMod['@_title'] || tName,
                            '@_version': tMod['@_version'] || '1.0.0.0',
                            '@_required': tMod['@_required'] === 'true' ? 'true' : 'false',
                            '@_fileHash': tMod['@_fileHash'] || ''
                        });
                        existingNames.add(tName.toLowerCase());
                        console.log(`[CREATE] Preserved template mod: ${tName}`);
                    }
                }
            }

            // Ensure QuietLoadingScreen is included to mute loading screens
            if (!modData.some(m => (m['@_modName'] || '').toLowerCase() === 'fs25_quietloadingscreen')) {
                modData.push({
                    '@_modName': 'FS25_QuietLoadingScreen',
                    '@_title': 'Quiet Loading Screen',
                    '@_version': '1.0.0.0',
                    '@_required': 'false',
                    '@_fileHash': ''
                });
            }

            // Update careerSavegame mods list
            savegameData.careerSavegame.mod = modData;

            // Configure player spawn: official maps receive canonical farmhouse coordinates,
            // while mod maps have coordinates cleared so the engine uses the author's designated spawn
            if (!savegameData.careerSavegame.player) {
                savegameData.careerSavegame.player = {};
            }
            if (engineMapId === 'MapUS') {
                savegameData.careerSavegame.player['@_spawnPositionX'] = '-128.000';
                savegameData.careerSavegame.player['@_spawnPositionY'] = '49.200';
                savegameData.careerSavegame.player['@_spawnPositionZ'] = '-162.000';
            } else if (engineMapId === 'MapEU') {
                savegameData.careerSavegame.player['@_spawnPositionX'] = '-263.000';
                savegameData.careerSavegame.player['@_spawnPositionY'] = '60.000';
                savegameData.careerSavegame.player['@_spawnPositionZ'] = '44.000';
            } else if (engineMapId === 'MapAS') {
                savegameData.careerSavegame.player['@_spawnPositionX'] = '-528.800';
                savegameData.careerSavegame.player['@_spawnPositionY'] = '19.800';
                savegameData.careerSavegame.player['@_spawnPositionZ'] = '-61.100';
            } else {
                const defaultSpawn = await getMapDefaultStartCoordinates(slotPath);
                if (defaultSpawn && defaultSpawn.x !== undefined) {
                    savegameData.careerSavegame.player['@_spawnPositionX'] = defaultSpawn.x.toFixed(3);
                    savegameData.careerSavegame.player['@_spawnPositionY'] = defaultSpawn.y.toFixed(3);
                    savegameData.careerSavegame.player['@_spawnPositionZ'] = defaultSpawn.z.toFixed(3);
                } else {
                    delete savegameData.careerSavegame.player['@_spawnPositionX'];
                    delete savegameData.careerSavegame.player['@_spawnPositionY'];
                    delete savegameData.careerSavegame.player['@_spawnPositionZ'];
                }
            }
            // Always ensure the player does NOT spawn inside a vehicle or car
            delete savegameData.careerSavegame.player['@_spawnYaw'];
            delete savegameData.careerSavegame.player['@_vehicleId'];
            delete savegameData.careerSavegame.player['@_vehicleFilename'];

            // Configure player spawn coordinates in players.xml with map default
            const playersPath = path.join(slotPath, 'players.xml');
            if (fs.existsSync(playersPath)) {
                try {
                    const pXml = await fs.readFile(playersPath, 'utf8');
                    const pData = parser.parse(pXml);
                    if (pData?.players?.player) {
                        const plist = Array.isArray(pData.players.player) ? pData.players.player : [pData.players.player];
                        const defaultSpawn = await getMapDefaultStartCoordinates(slotPath);
                        for (const p of plist) {
                            if (defaultSpawn && defaultSpawn.x !== undefined) {
                                p.spawn = {
                                    '@_position': `${defaultSpawn.x.toFixed(3)} ${defaultSpawn.y.toFixed(3)} ${defaultSpawn.z.toFixed(3)}`
                                };
                            } else if (p.spawn) {
                                delete p.spawn;
                            }
                        }
                        await fs.writeFile(playersPath, builder.build(pData));
                    }
                } catch (e) {}
            }

            // Reset template environment.xml to clean runtime Day 1 and strip stale forecast
            const envTemplatePath = path.join(slotPath, 'environment.xml');
            if (fs.existsSync(envTemplatePath)) {
                try {
                    const eXml = await fs.readFile(envTemplatePath, 'utf8');
                    const eData = parser.parse(eXml);
                    if (eData?.environment) {
                        eData.environment.currentPeriod = String(startMonth || 1);
                        eData.environment.daysPerPeriod = String(fixedSeasonLength || 1);
                        eData.environment.currentDay = '1';
                        eData.environment.currentMonotonicDay = '1';
                        eData.environment.realHourTimer = '0.000000';
                        eData.environment.dayTime = '480.000000';
                        eData.environment.time = '480.000000';
                        if (eData.environment.weather?.forecast) {
                            delete eData.environment.weather.forecast;
                        }
                        await fs.writeFile(envTemplatePath, builder.build(eData));
                    }
                } catch (e) {}
            }

            // If start farm is disabled by user, strip starting farm vehicles from vehicles.xml
            if (!includeStartFarm) {
                const vehiclesPath = path.join(slotPath, 'vehicles.xml');
                if (fs.existsSync(vehiclesPath)) {
                    try {
                        let vXml = await fs.readFile(vehiclesPath, 'utf8');
                        // Remove vehicles owned by farm 1
                        vXml = vXml.replace(/<vehicle\s+[^>]*farmId="1"[^>]*>[\s\S]*?<\/vehicle>/gi, '');
                        vXml = vXml.replace(/<vehicle\s+[^>]*farmId="1"[^>]*\/>/gi, '');
                        await fs.writeFile(vehiclesPath, vXml);
                        console.log('[CREATE] Stripped starting farm vehicles because includeStartFarm is false.');
                    } catch (e) {}
                }
            }

            // Since it's an initialized save, we must also update farms.xml to give the player the money
            const farmsPath = path.join(slotPath, 'farms.xml');
            if (fs.existsSync(farmsPath)) {
                try {
                    const farmsXml = await fs.readFile(farmsPath, 'utf8');
                    const farmsData = parser.parse(farmsXml);
                    if (farmsData.farms && farmsData.farms.farm) {
                        const targetFarm = Array.isArray(farmsData.farms.farm) ? farmsData.farms.farm[0] : farmsData.farms.farm;
                        if (targetFarm) {
                            targetFarm['@_money'] = String(money);
                            const fs25Path = pathProvider.getFS25DataRoot();
                            const userId = await getPersistentUniqueUserId(fs25Path);
                            if (targetFarm.players && targetFarm.players.player) {
                                const playerObj = Array.isArray(targetFarm.players.player) ? targetFarm.players.player[0] : targetFarm.players.player;
                                if (playerObj) {
                                    playerObj['@_uniqueUserId'] = userId;
                                }
                            }
                        }
                        await fs.writeFile(farmsPath, builder.build(farmsData));
                        console.log('[CREATE] Updated farms.xml with starting money and valid player uniqueUserId.');
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
                    initialLoan: String(initialLoan),
                    difficulty: String(difficulty),
                    economicDifficulty: String(economicDifficulty || 'NORMAL').toUpperCase(),
                    plannedDaysPerPeriod: String(fixedSeasonLength || 1),
                    timeScale: String(timeScale || 5.0),
                    hasInitiallyOwnedFarmlands: startFarmFlag,
                    loadDefaultFarm: startFarmFlag,
                    loadDefaultVehicles: startFarmFlag,
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
                    const AdmZip = require('adm-zip');
                    const zip = new AdmZip(modZipPath);

                    // 1. Read modDesc.xml to identify author-configured default asset paths
                    let defaultVehiclesFile = null;
                    let defaultPlaceablesFile = null;
                    let defaultItemsFile = null;
                    let defaultHandToolsFile = null;
                    let mapConfigFile = null;

                    try {
                        const mdEntry = zip.getEntry('modDesc.xml');
                        if (mdEntry) {
                            const mdXml = mdEntry.getData().toString('utf8');
                            const mapMatch = mdXml.match(/<map\s+([^>]+)>/i);
                            if (mapMatch) {
                                const attrRegex = /(\w+)=["']([^"']*)["']/g;
                                let aMatch;
                                const mapAttrs = {};
                                while ((aMatch = attrRegex.exec(mapMatch[1])) !== null) {
                                    mapAttrs[aMatch[1]] = aMatch[2];
                                }
                                defaultVehiclesFile = mapAttrs.defaultVehiclesXMLFilename;
                                defaultPlaceablesFile = mapAttrs.defaultPlaceablesXMLFilename;
                                defaultItemsFile = mapAttrs.defaultItemsXMLFilename;
                                defaultHandToolsFile = mapAttrs.defaultHandToolsXMLFilename;
                                mapConfigFile = mapAttrs.configFilename;
                            }
                        }
                    } catch (e) {
                        console.warn('[CREATE] Could not parse map modDesc.xml:', e.message);
                    }

                    // 2. Read map.xml to identify farmlands and fields paths
                    let farmlandsFile = null;
                    let fieldsFile = null;
                    if (mapConfigFile && !mapConfigFile.startsWith('$data')) {
                        try {
                            const cfgEntry = zip.getEntry(mapConfigFile) || zip.getEntry(mapConfigFile.replace(/\\/g, '/'));
                            if (cfgEntry) {
                                const cfgXml = cfgEntry.getData().toString('utf8');
                                const flMatch = cfgXml.match(/<farmlands\s+[^>]*filename=["']([^"']+)["']/i);
                                if (flMatch) farmlandsFile = flMatch[1];
                                const fMatch = cfgXml.match(/<fields\s+[^>]*filename=["']([^"']+)["']/i);
                                if (fMatch) fieldsFile = fMatch[1];
                            }
                        } catch (e) {
                            console.warn('[CREATE] Could not parse map config XML:', e.message);
                        }
                    }

                    // Helper to extract a specific entry from zip to destination file in slotPath
                    const extractExactZipFile = async (relPath, destFilename) => {
                        if (!relPath || relPath.startsWith('$data')) return false;
                        const normPath = relPath.replace(/\\/g, '/').toLowerCase();
                        const entry = zip.getEntries().find(e => e.entryName.replace(/\\/g, '/').toLowerCase() === normPath);
                        if (entry) {
                            const targetPath = path.join(slotPath, destFilename);
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                                console.log(`[CREATE] Extracted author-configured ${entry.entryName} -> ${destFilename}`);
                                return true;
                            }
                        }
                        return false;
                    };

                    // Extract exact starting files designated by the map author
                    if (defaultVehiclesFile) await extractExactZipFile(defaultVehiclesFile, 'vehicles.xml');
                    if (defaultPlaceablesFile) await extractExactZipFile(defaultPlaceablesFile, 'placeables.xml');
                    if (defaultItemsFile) await extractExactZipFile(defaultItemsFile, 'items.xml');
                    if (defaultHandToolsFile) await extractExactZipFile(defaultHandToolsFile, 'handTools.xml');
                    if (fieldsFile) await extractExactZipFile(fieldsFile, 'fields.xml');

                    // If starting farm is disabled, strip farm 1 vehicles
                    if (!includeStartFarm) {
                        const vehiclesPath = path.join(slotPath, 'vehicles.xml');
                        if (fs.existsSync(vehiclesPath)) {
                            try {
                                let vXml = await fs.readFile(vehiclesPath, 'utf8');
                                vXml = vXml.replace(/<vehicle\s+[^>]*farmId="1"[^>]*>[\s\S]*?<\/vehicle>/gi, '');
                                vXml = vXml.replace(/<vehicle\s+[^>]*farmId="1"[^>]*\/>/gi, '');
                                await fs.writeFile(vehiclesPath, vXml);
                                console.log('[CREATE] Stripped starting farm vehicles because includeStartFarm is false.');
                            } catch (e) {}
                        }
                    }

                    let extractedTerrain = false;

                    // Extract terrain assets: info layers, heightmaps, density maps, and terrain caches
                    // NOTE: Notice environment.xml is deliberately EXCLUDED! A map mod's environment.xml is a map lighting/weather
                    // configuration, NOT a savegame state. Copying it to the savegame breaks native ambient sounds and weather.
                    for (const entry of zip.getEntries()) {
                        const entryName = entry.entryName.replace(/\\/g, '/');
                        const baseName = path.basename(entryName);
                        const lowerBase = baseName.toLowerCase();

                        if (lowerBase.startsWith('infolayer_') && lowerBase.endsWith('.grle')) {
                            const targetPath = path.join(slotPath, baseName);
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                                extractedGrles++;
                            }
                        }
                        if (lowerBase.startsWith('densitymap_') && (lowerBase.endsWith('.gdm') || lowerBase.endsWith('.xml'))) {
                            const targetPath = path.join(slotPath, baseName);
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                            }
                        }
                        if (lowerBase === 'dem.png' || lowerBase === 'terrain.heightmap.png' || lowerBase.endsWith('_dem.png')) {
                            const targetPath = path.join(slotPath, 'terrain.heightmap.png');
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                                extractedTerrain = true;
                                console.log(`[CREATE] Extracted heightmap ${baseName} -> terrain.heightmap.png`);
                            }
                        }
                        if (lowerBase.endsWith('.terrain.occluders.cache') || lowerBase === 'terrain.occluders.cache') {
                            const targetPath = path.join(slotPath, 'terrain.occluders.cache');
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                            }
                        }
                        if (lowerBase.endsWith('.terrain.nmap.cache') || lowerBase === 'terrain.nmap.cache') {
                            const targetPath = path.join(slotPath, 'terrain.nmap.cache');
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                            }
                        }
                        if (lowerBase.endsWith('.terrain.lod.type.cache') || lowerBase === 'terrain.lod.type.cache') {
                            const targetPath = path.join(slotPath, 'terrain.lod.type.cache');
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                            }
                        }
                        if (lowerBase === 'splitshapes.gmss') {
                            const targetPath = path.join(slotPath, 'splitShapes.gmss');
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                            }
                        }

                        // Fallback extraction for maps that didn't have standard modDesc default attributes
                        if (!fs.existsSync(path.join(slotPath, 'vehicles.xml')) && lowerBase === 'vehicles.xml') {
                            await fs.writeFile(path.join(slotPath, 'vehicles.xml'), entry.getData());
                        }
                        if (!fs.existsSync(path.join(slotPath, 'placeables.xml')) && lowerBase === 'placeables.xml') {
                            await fs.writeFile(path.join(slotPath, 'placeables.xml'), entry.getData());
                        }
                        if (!fs.existsSync(path.join(slotPath, 'items.xml')) && lowerBase === 'items.xml') {
                            await fs.writeFile(path.join(slotPath, 'items.xml'), entry.getData());
                        }
                    }
                    console.log(`[CREATE] Extracted ${extractedGrles} infoLayer GRLE files and terrain assets from map zip: ${path.basename(modZipPath)}.`);
                }
            }
        } catch (err) {
            console.error(`[CREATE] Failed to extract map files from zip:`, err);
        }
    }

    // Configure starting farmlands accurately based on game mode and map definitions
    await setupSavegameFarmlands(slotPath, modZipPath, engineMapId, mapModName, includeStartFarm);

    if (requiresEngineInit || !fs.existsSync(path.join(slotPath, 'farms.xml'))) {
        const realUserId = await getPersistentUniqueUserId(fs25Path);

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

    const envPath = path.join(slotPath, 'environment.xml');
    if (!fs.existsSync(envPath)) {
        const envXml = `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<environment>
    <currentPeriod>${startMonth || 1}</currentPeriod>
    <daysPerPeriod>${fixedSeasonLength || 1}</daysPerPeriod>
    <currentDay>1</currentDay>
    <currentMonotonicDay>1</currentMonotonicDay>
    <realHourTimer>0.000000</realHourTimer>
    <time>480.000000</time>
</environment>`;
        await fs.writeFile(envPath, envXml);
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
            const playTime = parseFloat(stats?.['@_playTime'] || stats?.playTime || 0);

            // A savegame is ONLY truly initialized if the game engine has actually generated and saved it:
            // Must have core files AND genuine engine data (economy.xml, guidedTour.xml, or densityMap_fruits.gdm with playTime > 0)
            const hasEngineData = fs.existsSync(path.join(savePath, 'economy.xml')) ||
                                  fs.existsSync(path.join(savePath, 'guidedTour.xml')) ||
                                  (fs.existsSync(path.join(savePath, 'densityMap_fruits.gdm')) && playTime > 0);
            const isInitialized = fs.existsSync(farmsFile) && fs.existsSync(initFile) && fs.existsSync(placeablesFile) && hasEngineData;

            let hasTemplate = false;
            try {
                hasTemplate = await hasMapTemplate(mapId, mapTitle, mapModName);
                if (isInitialized && !hasTemplate && mapId && !isOfficialMap(mapId) && hasEngineData) {
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
 * Checks if a given file or directory is an FS25 savegame (folder or ZIP containing careerSavegame.xml).
 */
async function isSavegame(sourcePath) {
    if (!sourcePath || typeof sourcePath !== 'string') return false;
    try {
        if (!fs.existsSync(sourcePath)) return false;
        const stats = fs.statSync(sourcePath);
        
        if (stats.isDirectory()) {
            if (fs.existsSync(path.join(sourcePath, 'careerSavegame.xml'))) return true;
            if (fs.existsSync(path.join(sourcePath, 'farms.xml')) && fs.existsSync(path.join(sourcePath, 'vehicles.xml'))) return true;
            try {
                const subfiles = fs.readdirSync(sourcePath);
                const hasSubCareer = subfiles.some(f => {
                    try {
                        const subPath = path.join(sourcePath, f);
                        return fs.statSync(subPath).isDirectory() && fs.existsSync(path.join(subPath, 'careerSavegame.xml'));
                    } catch (_) { return false; }
                });
                if (hasSubCareer) return true;
            } catch (_) {}
        } else if (sourcePath.toLowerCase().endsWith('.zip')) {
            const modManager = require('./modManager');
            if (modManager && typeof modManager.listZipEntries === 'function') {
                const entries = modManager.listZipEntries(sourcePath);
                return entries.some(e => {
                    const name = (e.entryName || '').toLowerCase();
                    return name.endsWith('careersavegame.xml') || name === 'careersavegame.xml' || (name.endsWith('farms.xml') && !name.includes('mod'));
                });
            }
        }
    } catch (_) {}
    return false;
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

function formatBrandName(brand) {
    if (!brand) return 'Unknown';
    let b = String(brand).trim();
    const brandMap = {
        'JOHNDEERE': 'John Deere',
        'MASSEYFERGUSON': 'Massey Ferguson',
        'NEWHOLLAND': 'New Holland',
        'CASEIH': 'Case IH',
        'DEUTZFAHR': 'Deutz-Fahr',
        'GREATPLAINS': 'Great Plains',
        'RUDOLPHSOHN': 'Rudolph & Sohn',
        'POETTINGER': 'Pöttinger',
        'INTERNATIONAL': 'International',
        'AGCO': 'AGCO',
        'FENDT': 'Fendt',
        'CLAAS': 'Claas',
        'VALTRA': 'Valtra',
        'KUBOTA': 'Kubota',
        'ZETOR': 'Zetor',
        'STEYR': 'Steyr',
        'MCCORMICK': 'McCormick',
        'CHALLENGER': 'Challenger',
        'JCB': 'JCB',
        'KRONE': 'Krone',
        'AMAZONE': 'Amazone',
        'LEMKEN': 'Lemken',
        'HORSCH': 'Horsch',
        'KVERNELAND': 'Kverneland',
        'SAMPO': 'Sampo Rosenlew',
        'ROSTSELMASH': 'Rostselmash',
        'VERSATILE': 'Versatile',
        'MANITOU': 'Manitou',
        'MERLO': 'Merlo',
        'SCHAFFER': 'Schäffer',
        'WEIDEMANN': 'Weidemann'
    };
    const upper = b.toUpperCase().replace(/[\s_\-&]+/g, '');
    if (brandMap[upper]) return brandMap[upper];
    b = b.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    return b.trim();
}

function extractXmlString(val) {
    if (!val) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'object') {
        return (val.en || val['#text'] || Object.values(val)[0] || '').toString().trim();
    }
    return String(val).trim();
}

function readModVehicleXml(modName, targetPath) {
    if (!modName || !targetPath) return null;
    try {
        const modManager = require('./modManager');
        const allPaths = modManager.getModsPaths();
        const cleanModName = modName.replace(/\.zip$/i, '');
        const cleanRelPath = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');

        for (const p of allPaths) {
            if (!p || !fs.existsSync(p)) continue;

            // 1. Direct zip in mods folder
            const zipFile = path.join(p, cleanModName + '.zip');
            if (fs.existsSync(zipFile)) {
                const buf = modManager.readEntryFromZip(zipFile, cleanRelPath);
                if (buf) return buf.toString('utf8');
            }

            // 2. Unpacked folder in mods folder
            const dir = path.join(p, cleanModName);
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                const filePath = path.join(dir, cleanRelPath);
                if (fs.existsSync(filePath)) {
                    try {
                        return fs.readFileSync(filePath, 'utf8');
                    } catch (e) {}
                }
            }

            // 3. Subdirectories (organized categories like Maps, Tractors)
            try {
                const subs = fs.readdirSync(p, { withFileTypes: true });
                for (const sub of subs) {
                    if (sub.isDirectory()) {
                        const subZip = path.join(p, sub.name, cleanModName + '.zip');
                        if (fs.existsSync(subZip)) {
                            const buf = modManager.readEntryFromZip(subZip, cleanRelPath);
                            if (buf) return buf.toString('utf8');
                        }
                        const subDir = path.join(p, sub.name, cleanModName);
                        if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
                            const subFilePath = path.join(subDir, cleanRelPath);
                            if (fs.existsSync(subFilePath)) {
                                try {
                                    return fs.readFileSync(subFilePath, 'utf8');
                                } catch (e) {}
                            }
                        }
                    }
                }
            } catch (e) {}
        }
    } catch (err) {}
    return null;
}

function resolveL10n(str, modName) {
    if (!str || typeof str !== 'string') return '';
    if (!str.startsWith('$l10n_')) return str;
    const key = str.replace(/^\$l10n_/, '');
    if (modName) {
        try {
            const modDescStr = readModVehicleXml(modName, 'modDesc.xml');
            if (modDescStr) {
                const descParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
                const desc = descParser.parse(modDescStr);
                const texts = desc?.modDesc?.l10n?.text;
                if (texts) {
                    const textArr = Array.isArray(texts) ? texts : [texts];
                    const match = textArr.find(t => t['@_name'] === key);
                    if (match) {
                        const val = match.en || match['#text'] || Object.values(match).find(v => typeof v === 'string');
                        if (val) return val;
                    }
                }
            }
        } catch (e) {}
    }
    return key.replace(/^(shopItem_|storeItem_|vehicle_)/i, '')
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
              .trim();
}

async function getFleetPositions(savePath, mapModName) {
    const fs = require('fs');
    const path = require('path');
    const { XMLParser } = require('fast-xml-parser');
    
    const excludeKeywords = [
        'pallet', 'bigbag', 'tree', 'bale', 'header', 'cutter', 'weight', 'implement', 'attachment', 
        'trailer', 'wagon', 'plow', 'cultivator', 'seeder', 'planter', 'roller', 'weeder', 'sprayer', 
        'spreader', 'slurry', 'manure', 'tank', 'windrower', 'tedder', 'baler', 'wrapper', 'conveyor', 
        'silage', 'auger', 'fork', 'weight', 'grab', 'bucket', 'shovel', 'palletfork', 'frontloader',
        'kaercher', 'karcher', 'washer', 'pressurewasher', 'hds9184'
    ];
    
    const parseVehicleXml = async (xml, isDefault = false) => {
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
                
                const fnLower = filename.toLowerCase();
                
                // Embedded base game vehicle database lookup & category derivation
                let baseType = null;
                let baseCategory = null;
                let staticDisplayType = null;
                let resolvedBrand = null;
                let resolvedName = null;
                try {
                    const baseGameDb = require('../resources/data/baseGameVehicles.json');
                    const fnKey = (filename || '').toLowerCase().replace(/\\/g, '/');
                    const dbMatch = baseGameDb[fnKey] || baseGameDb[fnKey.replace(/^\$data\//, 'data/')];
                    if (dbMatch) {
                        staticDisplayType = dbMatch.displayType;
                        baseType = dbMatch.type;
                        baseCategory = dbMatch.category;
                        if (dbMatch.brand) resolvedBrand = dbMatch.brand;
                        if (dbMatch.name) resolvedName = dbMatch.name;
                    }
                } catch(err) {}

                // If mod vehicle, resolve from mod archive/directory
                let modName = v['@_modName'];
                let relPath = null;
                if (filename.includes('$moddir$')) {
                    const m = filename.match(/\$moddir\$([^\\/]+)[\\/](.*)/i);
                    if (m) {
                        if (!modName) modName = m[1];
                        relPath = m[2];
                    }
                }

                if (modName && (!resolvedBrand || !resolvedName)) {
                    try {
                        const modXml = readModVehicleXml(modName, relPath || filename);
                        if (modXml) {
                            const parsedMod = parser.parse(modXml);
                            const vRoot = parsedMod.vehicle || parsedMod;
                            if (vRoot.storeData) {
                                if (vRoot.storeData.name && !resolvedName) resolvedName = resolveL10n(extractXmlString(vRoot.storeData.name), modName);
                                if (vRoot.storeData.brand && !resolvedBrand) resolvedBrand = extractXmlString(vRoot.storeData.brand);
                                if (vRoot.storeData.category && !baseCategory) baseCategory = extractXmlString(vRoot.storeData.category);
                            }
                            if (vRoot.parentFile && vRoot.parentFile.attributes && vRoot.parentFile.attributes.set) {
                                const sets = Array.isArray(vRoot.parentFile.attributes.set) ? vRoot.parentFile.attributes.set : [vRoot.parentFile.attributes.set];
                                for (const s of sets) {
                                    const p = s['@_path'];
                                    const val = s['@_value'];
                                    if (p === 'vehicle.storeData.name' && !resolvedName) resolvedName = resolveL10n(val, modName);
                                    if (p === 'vehicle.storeData.brand' && !resolvedBrand) resolvedBrand = val;
                                    if (p === 'vehicle.storeData.category' && !baseCategory) baseCategory = val;
                                }
                            }
                        }
                    } catch (e) {}
                }

                const deriveVehicleType = (fn, rawType, bType, bCat, sDisplay) => {
                    if (sDisplay) return sDisplay;
                    const fnL = (fn || '').toLowerCase();
                    const tL = (rawType || '').toLowerCase();
                    const bTL = (bType || '').toLowerCase();
                    const bCL = (bCat || '').toLowerCase();
                    
                    if (bTL.includes('telehandler') || bCL.includes('teleloader') || tL.includes('telehandler') || fnL.includes('telehandler') || fnL.includes('mlt') || fnL.includes('farmlift') || fnL.includes('scorpion') || fnL.includes('multifarmer') || fnL.includes('sennebogen') || fnL.includes('telescopic')) return 'Telehandler';
                    if (bTL.includes('wheelloader') || bCL.includes('wheelloader') || tL.includes('wheelloader') || fnL.includes('wheelloader') || fnL.includes('torion') || fnL.includes('r640')) return 'Wheel Loader';
                    if (bTL.includes('skidsteer') || bCL.includes('skidsteer') || tL.includes('skidsteer') || fnL.includes('skidsteer')) return 'Skid Steer';
                    if (bTL.includes('combine') || bCL.includes('combine') || bCL.includes('harvester') || tL.includes('combine') || fnL.includes('combine') || fnL.includes('harvester') || fnL.includes('evion') || fnL.includes('lexion') || fnL.includes('trion') || fnL.includes('dominator') || fnL.includes('ideal') || fnL.includes('8570') || fnL.includes('axial') || fnL.includes('cr10') || fnL.includes('cr9') || fnL.includes('x9') || fnL.includes('ch770') || fnL.includes('braud')) return 'Combine Harvester';
                    if (bTL.includes('truck') || bCL.includes('truck') || tL.includes('truck') || fnL.includes('truck') || fnL.includes('lorry') || fnL.includes('tgx') || fnL.includes('mack') || fnL.includes('superliner') || fnL.includes('man/')) return 'Truck';
                    if (bTL.includes('car') || bCL.includes('car') || tL.includes('car') || tL.includes('pickup') || fnL.includes('pickup') || fnL.includes('car') || fnL.includes('van') || fnL.includes('suv') || fnL.includes('mahindra') || fnL.includes('octavia') || fnL.includes('skoda')) return 'Car / Pickup';
                    if (tL.includes('mower') || fnL.includes('mower')) return 'Self-Propelled Mower';
                    if (tL.includes('sprayer') || fnL.includes('sprayer')) return 'Self-Propelled Sprayer';
                    return 'Tractor';
                };

                const displayType = deriveVehicleType(filename, v['@_type'], baseType, baseCategory, staticDisplayType);

                // 1. PRIMARY RULE: Check vehicle type & runtime XML structure (drivable/motor state & motorized categories)
                const vType = (v['@_type'] || '').toLowerCase();
                const nonDrivableTypes = ['shovel', 'shovelleveler', 'implement', 'weight', 'attachable', 'handtool', 'pallet', 'bigbag', 'bale', 'cutter', 'header', 'washer', 'pressurewasher', 'kaercher', 'trailer', 'wagon'];
                if (vType && nonDrivableTypes.some(t => vType.includes(t))) continue;

                const hasMotorOrDrivable = v.motor !== undefined || v.drivable !== undefined;
                let hasMotorConfig = false;
                if (v.configuration) {
                    const configs = Array.isArray(v.configuration) ? v.configuration : [v.configuration];
                    hasMotorConfig = configs.some(c => c['@_name'] === 'motor');
                }

                const isStructurallyDrivable = hasMotorOrDrivable || hasMotorConfig || (v.enterable !== undefined && (vType.includes('drivable') || vType.includes('tractor') || vType.includes('combine')));
                const isDrivableHeuristics = fnLower.includes('tractor') || fnLower.includes('truck') || fnLower.includes('lorry') || fnLower.includes('car') || fnLower.includes('pickup') || fnLower.includes('van') || fnLower.includes('suv') || fnLower.includes('jeep') || fnLower.includes('xuv') || fnLower.includes('harvester') || fnLower.includes('combine') || fnLower.includes('telehandler') || fnLower.includes('wheelloader') || fnLower.includes('skidsteer') || fnLower.includes('octavia') || fnLower.includes('skoda');

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
                
                let brand = resolvedBrand || 'Unknown';
                let name = resolvedName || '';

                // Clean brand
                brand = formatBrandName(brand);

                // Fallback brand from filename or modName if still Unknown
                if (brand === 'Unknown') {
                    const parts = filename.split('/');
                    if (parts.length > 2 && (parts[0] === 'data' || parts[0].includes('$pdlcdir$'))) {
                        brand = parts[2].replace(/([a-z])([A-Z])/g, '$1 $2').trim();
                    } else if (v['@_modName'] && !v['@_modName'].toLowerCase().startsWith('pdlc_')) {
                        brand = v['@_modName'].replace(/^FS\d+_/i, '').replace(/_/g, ' ');
                    }
                }

                // Fallback name if still empty
                if (!name) {
                    const base = path.basename(filename, '.xml');
                    name = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-zA-Z])([0-9])/g, '$1 $2').replace(/([0-9])([a-zA-Z])/g, '$1 $2').trim();
                }

                // Clean up: avoid duplicate brand in name
                if (name.toUpperCase().startsWith(brand.toUpperCase() + ' ')) {
                    name = name.slice(brand.length).trim();
                }

                // Remove word "Tractor" (case-insensitive) from brand and name
                brand = brand.replace(/\bTRACTOR\b/gi, '').replace(/\s+/g, ' ').trim().toUpperCase() || 'UNKNOWN';
                name = name.replace(/\bTRACTOR\b/gi, '').replace(/\s+/g, ' ').trim().toUpperCase();
                if (!name) name = path.basename(filename, '.xml').toUpperCase();
                
                fleet.push({ 
                    id: gameAssignedId, 
                    uniqueId: v['@_uniqueId'], 
                    name, 
                    brand, 
                    type: displayType,
                    displayType, 
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
            return { items: await parseVehicleXml(xml, false), source: 'savegame' };
        }
        
        // 2. Fallback: read default vehicles from the map mod's modDesc.xml
        if (mapModName) {
            const modManager = require('./modManager');
            const modsDir = modManager.getModsPath();
            
            const modZip = path.join(modsDir, `${mapModName}.zip`);
            if (fs.existsSync(modZip)) {
                // Parse modDesc.xml to find defaultVehiclesXMLFilename
                const modDescBuf = modManager.readEntryFromZip(modZip, 'modDesc.xml');
                if (modDescBuf) {
                    const modDescXml = modDescBuf.toString('utf8');
                    const match = modDescXml.match(/defaultVehiclesXMLFilename=["']([^"']+)["']/);
                    if (match && match[1]) {
                        const defaultVehiclesPath = match[1];
                        const vehiclesBuf = modManager.readEntryFromZip(modZip, defaultVehiclesPath);
                        if (vehiclesBuf) {
                            const xml = vehiclesBuf.toString('utf8');
                            return { items: await parseVehicleXml(xml, true), source: 'map_defaults' };
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
    try {
        const modManager = require('./modManager');
        const modsDir = modManager.getModsPath();
        if (!modsDir) return false;
        const fs = require('fs');
        const path = require('path');
        return fs.existsSync(path.join(modsDir, 'FS25_storeDeliveries.zip')) ||
               fs.existsSync(path.join(modsDir, 'fs25_storedeliveries.zip')) ||
               fs.existsSync(path.join(modsDir, 'FS25_storeDeliveries')) ||
               fs.existsSync(path.join(modsDir, 'fs25_storedeliveries'));
    } catch (e) {
        return false;
    }
}

async function ensureStoreDeliveries() {
    if (await checkStoreDeliveries()) return { success: true };
    return { success: false, error: 'Store Deliveries mod is not installed. Please download it from ModHub.' };
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
            const tCareerXml = readTemplateEntryText(templateFolder, 'careerSavegame.xml');
            if (tCareerXml) {
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
            }
            const tPlayersXml = readTemplateEntryText(templateFolder, 'players.xml');
            if (tPlayersXml) {
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

        if (!mapModName) {
            if (mapId === 'MapUS') {
                return { x: -128.0, y: 49.2, z: -162.0 };
            } else if (mapId === 'MapEU') {
                return { x: -263.0, y: 60.0, z: 44.0 };
            } else if (mapId === 'MapAS') {
                return { x: -528.8, y: 19.8, z: -61.1 };
            }
        }

        // Fallback: parse map mod zip itself for careerStartPoint
        if (mapModName) {
            const modManager = require('./modManager');
            const modsDir = modManager.getModsPath();
            const modZip = path.join(modsDir, `${mapModName}.zip`);
            if (fs.existsSync(modZip)) {
                // 1. Check modDesc.xml maps config
                const modDescBuf = modManager.readEntryFromZip(modZip, 'modDesc.xml');
                let mapConfigFile = null;
                if (modDescBuf) {
                    const modDescXml = modDescBuf.toString('utf8');
                    const mdObj = parser.parse(modDescXml);
                    if (mdObj && mdObj.modDesc && mdObj.modDesc.maps && mdObj.modDesc.maps.map) {
                        const mNode = Array.isArray(mdObj.modDesc.maps.map) ? mdObj.modDesc.maps.map[0] : mdObj.modDesc.maps.map;
                        mapConfigFile = mNode['@_configFilename'];
                    }
                }

                // 2. Check map config XML for playerStart position
                if (mapConfigFile) {
                    const mapXmlBuf = modManager.readEntryFromZip(modZip, mapConfigFile) ||
                                     modManager.readEntryFromZip(modZip, mapConfigFile.replace(/\\/g, '/'));
                    if (mapXmlBuf) {
                        const mapXml = mapXmlBuf.toString('utf8');
                        const pMatch = mapXml.match(/<playerStart\s+[^>]*position=["']([^"']+)["']/i) ||
                                      mapXml.match(/position=["']([^"']+)["'][^>]*<playerStart/i);
                        if (pMatch && pMatch[1]) {
                            const coords = pMatch[1].trim().split(/\s+/).map(parseFloat);
                            if (coords.length >= 3 && !isNaN(coords[0])) {
                                return { x: coords[0], y: coords[1], z: coords[2] };
                            }
                        }
                    }
                }

                // 3. Search map .i3d entries for careerStartPoint
                const zipEntries = modManager.listZipEntries(modZip);
                const i3dEntries = zipEntries.filter(e => {
                    const n = e.entryName.toLowerCase();
                    return n.endsWith('.i3d') && !n.includes('shapes') && !n.includes('placeable') &&
                           !n.includes('vehicle') && !n.includes('foliage') && !n.includes('props') &&
                           !n.includes('particle');
                });

                i3dEntries.sort((a, b) => {
                    const aN = a.entryName.toLowerCase();
                    const bN = b.entryName.toLowerCase();
                    const aIsMain = aN.includes('map') ? 1 : 0;
                    const bIsMain = bN.includes('map') ? 1 : 0;
                    return bIsMain - aIsMain;
                });

                for (const entry of i3dEntries) {
                    const i3dBuf = modManager.readEntryFromZip(modZip, entry.entryName);
                    if (!i3dBuf) continue;
                    const text = i3dBuf.toString('utf8');
                    const match = text.match(/<TransformGroup\s+[^>]*name="[^"]*(?:careerStartPoint|playerStart)[^"]*"[^>]*translation="([^"]+)"/i) ||
                                  text.match(/name="[^"]*(?:careerStartPoint|playerStart)[^"]*"[^>]*translation="([^"]+)"/i) ||
                                  text.match(/translation="([^"]+)"[^>]*name="[^"]*(?:careerStartPoint|playerStart)[^"]*"/i);
                    if (match && match[1]) {
                        const coords = match[1].trim().split(/\s+/).map(parseFloat);
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
    
    return null;
}

function parseShopFromI3d(i3dText) {
    function degToRad(deg) { return deg * Math.PI / 180; }
    function applyTransform(pos, rotYDeg, localPos) {
        const rad = degToRad(rotYDeg);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const x = localPos[0]*cos + localPos[2]*sin + pos[0];
        const y = localPos[1] + pos[1];
        const z = -localPos[0]*sin + localPos[2]*cos + pos[2];
        return { x: parseFloat(x.toFixed(3)), y: parseFloat(y.toFixed(3)), z: parseFloat(z.toFixed(3)) };
    }

    // 1. Check for vehicleShopTrigger / vehicleShop parent containing vehicleShopPlayerSpawn
    const triggerMatch = i3dText.match(/<Shape\s+[^>]*name="[^"]*vehicleShopTrigger[^"]*"[^>]*translation="([^"]+)"[^>]*rotation="([^"]+)"[\s\S]*?<TransformGroup\s+[^>]*name="[^"]*vehicleShopPlayerSpawn[^"]*"[^>]*translation="([^"]+)"/i) ||
                         i3dText.match(/<TransformGroup\s+[^>]*name="[^"]*vehicleShop[^"]*"[^>]*translation="([^"]+)"[^>]*rotation="([^"]+)"[\s\S]*?<TransformGroup\s+[^>]*name="[^"]*vehicleShopPlayerSpawn[^"]*"[^>]*translation="([^"]+)"/i);
    if (triggerMatch) {
        const tPos = triggerMatch[1].split(' ').map(parseFloat);
        const tRot = triggerMatch[2].split(' ').map(parseFloat);
        const sPos = triggerMatch[3].split(' ').map(parseFloat);
        const rotY = tRot.length >= 2 ? tRot[1] : 0;
        return applyTransform(tPos, rotY, sPos);
    }

    // 2. Direct transform group match
    const match = i3dText.match(/<TransformGroup\s+[^>]*name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport)[^"]*"[^>]*translation="([^"]+)"/i) ||
                  i3dText.match(/name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport)[^"]*"[^>]*translation="([^"]+)"/i) ||
                  i3dText.match(/translation="([^"]+)"[^>]*name="[^"]*(?:vehicleShopPlayerSpawn|shopPlayerSpawn|playerShopTeleport)[^"]*"/i);
    if (match && match[1]) {
        const coords = match[1].split(' ').map(parseFloat);
        if (coords.length >= 3 && !isNaN(coords[0])) {
            return { x: coords[0], y: coords[1], z: coords[2] };
        }
    }
    return null;
}

function getGameDataDir() {
    const candidates = [
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Farming Simulator 25',
        'C:\\Program Files\\Steam\\steamapps\\common\\Farming Simulator 25',
        'D:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25',
        'E:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25',
        'C:\\Program Files (x86)\\Farming Simulator 2025',
        'C:\\Program Files\\Farming Simulator 2025'
    ];
    for (const c of candidates) {
        const d = path.join(c, 'data');
        if (fs.existsSync(d)) return d;
    }
    return null;
}

function readPlaceableXmlFile(filename, mapModName) {
    if (!filename) return null;
    const gameDataDir = getGameDataDir();
    
    if (filename.startsWith('data/') || filename.startsWith('data\\') || filename.startsWith('$data/') || filename.startsWith('$data\\')) {
        if (gameDataDir) {
            const cleanRel = filename.replace(/^\$?data[\\/]/i, '');
            const target = path.join(gameDataDir, cleanRel);
            if (fs.existsSync(target)) {
                try { return fs.readFileSync(target, 'utf8'); } catch (e) {}
            }
        }
    }
    
    const modManager = require('./modManager');
    const allPaths = modManager.getModsPaths();
    let modName = mapModName;
    let relPath = filename;
    
    if (filename.includes('$moddir$')) {
        const m = filename.match(/\$moddir\$([^\\/]+)[\\/](.*)/i);
        if (m) {
            modName = m[1];
            relPath = m[2];
        }
    } else if (filename.startsWith('$mapdir$')) {
        relPath = filename.replace(/^\$mapdir\$[\\/]?/i, '');
    }
    
    if (modName) {
        const cleanMod = modName.replace(/\.zip$/i, '');
        const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
        for (const p of allPaths) {
            const zipFile = path.join(p, cleanMod + '.zip');
            if (fs.existsSync(zipFile)) {
                const buf = modManager.readEntryFromZip(zipFile, cleanRel);
                if (buf) return buf.toString('utf8');
            }
            const dir = path.join(p, cleanMod);
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                const filePath = path.join(dir, cleanRel);
                if (fs.existsSync(filePath)) {
                    try { return fs.readFileSync(filePath, 'utf8'); } catch (e) {}
                }
            }
        }
    }
    return null;
}

function localToWorld(localPos, parentPos, parentRotDeg) {
    const px = parseFloat(parentPos[0]) || 0;
    const py = parseFloat(parentPos[1]) || 0;
    const pz = parseFloat(parentPos[2]) || 0;

    const lx = parseFloat(localPos[0]) || 0;
    const ly = parseFloat(localPos[1]) || 0;
    const lz = parseFloat(localPos[2]) || 0;

    const rx = (parseFloat(parentRotDeg[0]) || 0) * Math.PI / 180;
    const ry = (parseFloat(parentRotDeg[1]) || 0) * Math.PI / 180;
    const rz = (parseFloat(parentRotDeg[2]) || 0) * Math.PI / 180;

    // Giants Engine Euler YXZ: R = Ry * Rx * Rz
    const x1 = lx * Math.cos(rz) - ly * Math.sin(rz);
    const y1 = lx * Math.sin(rz) + ly * Math.cos(rz);
    const z1 = lz;

    const x2 = x1;
    const y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx);
    const z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx);

    const wx = x2 * Math.cos(ry) + z2 * Math.sin(ry);
    const wy = y2;
    const wz = -x2 * Math.sin(ry) + z2 * Math.cos(ry);

    return {
        x: parseFloat((px + wx).toFixed(3)),
        y: parseFloat((py + wy).toFixed(3)),
        z: parseFloat((pz + wz).toFixed(3))
    };
}

function extractTeleportFromI3d(i3dText) {
    if (!i3dText) return null;
    const teleMatch = i3dText.match(/<TransformGroup[^>]+name="teleportNode"[^>]+translation="([^"]+)"/i) ||
                      i3dText.match(/<TransformGroup[^>]+translation="([^"]+)"[^>]+name="teleportNode"/i);
    if (teleMatch && teleMatch[1]) {
        const parts = teleMatch[1].trim().split(/\s+/).map(parseFloat);
        if (parts.length >= 3 && !isNaN(parts[0])) {
            return parts;
        }
    }
    return null;
}

function extractHotspotNodeFromI3d(i3dText) {
    if (!i3dText) return null;
    const hsMatch = i3dText.match(/<TransformGroup[^>]+name="hotspotNode"[^>]+translation="([^"]+)"/i) ||
                    i3dText.match(/<TransformGroup[^>]+translation="([^"]+)"[^>]+name="hotspotNode"/i);
    if (hsMatch && hsMatch[1]) {
        const parts = hsMatch[1].trim().split(/\s+/).map(parseFloat);
        if (parts.length >= 3 && !isNaN(parts[0])) {
            return parts;
        }
    }
    return null;
}

function resolveVehicleShopFromMapI3d(mapModName) {
    if (!mapModName) return null;
    try {
        const modManager = require('./modManager');
        const allPaths = modManager.getModsPaths();
        const cleanMod = mapModName.replace(/\.zip$/i, '');

        for (const p of allPaths) {
            const zipFile = path.join(p, cleanMod + '.zip');
            if (!fs.existsSync(zipFile)) continue;
            const entries = modManager.listZipEntries(zipFile);

            let targetI3dFilenames = [];
            const mapXmlEntry = entries.find(e => e.entryName.toLowerCase().endsWith('map.xml'));
            if (mapXmlEntry) {
                const buf = modManager.readEntryFromZip(zipFile, mapXmlEntry.entryName);
                if (buf) {
                    const txt = buf.toString('utf8');
                    const fnM = txt.match(/<filename>(.*?)<\/filename>/i);
                    if (fnM && fnM[1]) {
                        targetI3dFilenames.push(fnM[1].trim().replace(/\\/g, '/').toLowerCase());
                    }
                }
            }

            const i3dEntries = entries.filter(e => {
                const n = e.entryName.toLowerCase();
                return n.endsWith('.i3d') && !n.includes('tree') && !n.includes('sound') && !n.includes('foliage') && !n.includes('character');
            });

            i3dEntries.sort((a, b) => {
                const aName = a.entryName.toLowerCase();
                const bName = b.entryName.toLowerCase();
                const aMatch = targetI3dFilenames.some(t => aName.endsWith(t));
                const bMatch = targetI3dFilenames.some(t => bName.endsWith(t));
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return b.uncompSize - a.uncompSize;
            });

            for (const i3dEntry of i3dEntries) {
                if (i3dEntry.uncompSize < 50000 || i3dEntry.uncompSize > 100 * 1024 * 1024) continue;
                const buf = modManager.readEntryFromZip(zipFile, i3dEntry.entryName);
                if (!buf) continue;
                const text = buf.toString('utf8');

                const spawnIdx = text.search(/<TransformGroup[^>]+name="vehicleShopPlayerSpawn"[^>]*>/i);
                if (spawnIdx !== -1) {
                    const spawnChunk = text.substring(spawnIdx, spawnIdx + 500);
                    const spawnTag = (spawnChunk.match(/<TransformGroup[^>]+name="vehicleShopPlayerSpawn"[^>]*>/i) || [])[0];
                    const sTransM = spawnTag ? spawnTag.match(/translation="([^"]+)"/i) : null;
                    const sTrans = sTransM ? sTransM[1].trim().split(/\s+/).map(parseFloat) : [0, 0, 0];

                    const beforeText = text.substring(Math.max(0, spawnIdx - 4000), spawnIdx);

                    let trigPos = [0, 0, 0];
                    let trigRot = [0, 0, 0];
                    const trigMatch = beforeText.match(/<Shape[^>]+name="vehicleShopTrigger"[^>]*>/i);
                    if (trigMatch) {
                        const tM = trigMatch[0].match(/translation="([^"]+)"/i);
                        const rM = trigMatch[0].match(/rotation="([^"]+)"/i);
                        if (tM) trigPos = tM[1].trim().split(/\s+/).map(parseFloat);
                        if (rM) trigRot = rM[1].trim().split(/\s+/).map(parseFloat);
                    }

                    let shopPos = [0, 0, 0];
                    let shopRot = [0, 0, 0];
                    const shopMatch = beforeText.match(/<TransformGroup[^>]+name="(?:vehicleShop|store)"[^>]*>/i);
                    if (shopMatch) {
                        const tM = shopMatch[0].match(/translation="([^"]+)"/i);
                        const rM = shopMatch[0].match(/rotation="([^"]+)"/i);
                        if (tM) shopPos = tM[1].trim().split(/\s+/).map(parseFloat);
                        if (rM) shopRot = rM[1].trim().split(/\s+/).map(parseFloat);
                    }

                    const step1 = localToWorld(sTrans, trigPos, trigRot);
                    const finalWorld = localToWorld([step1.x, step1.y, step1.z], shopPos, shopRot);
                    if (!isNaN(finalWorld.x) && !isNaN(finalWorld.y) && !isNaN(finalWorld.z)) {
                        return finalWorld;
                    }
                }
            }
        }
    } catch (e) {
        console.error('[SavegameManager] Error in resolveVehicleShopFromMapI3d:', e);
    }
    return null;
}

function resolveTeleportFromPlaceable(shopPlaceable, mapModName) {
    if (!shopPlaceable) return null;
    const placeableFn = shopPlaceable['@_filename'];
    const placeablePos = (shopPlaceable['@_position'] || '').split(' ').map(parseFloat);
    const placeableRot = (shopPlaceable['@_rotation'] || '0 0 0').split(' ').map(parseFloat);

    // 1. Try reading the placeable XML definition and its i3d
    if (placeableFn) {
        const defXml = readPlaceableXmlFile(placeableFn, mapModName);
        if (defXml) {
            // Check defXml for teleportWorldPosition (must not be unedited generic basegame copy-paste)
            const shopHotspotMatch = defXml.match(/<hotspot[^>]*type="SHOP"[^>]*teleportWorldPosition="([^"]+)"/i) ||
                                     defXml.match(/teleportWorldPosition="([^"]+)"/i);
            if (shopHotspotMatch && shopHotspotMatch[1]) {
                const rawCoords = shopHotspotMatch[1].trim();
                const isGenericDefault = rawCoords.startsWith('-128 49.2 -162') || rawCoords.startsWith('-263 60 44');
                if (!isGenericDefault) {
                    const coords = rawCoords.split(/\s+/).map(parseFloat);
                    if (coords.length >= 3 && !isNaN(coords[0])) {
                        return { x: coords[0], y: coords[1], z: coords[2] };
                    }
                }
            }

            // Check if placeable is purely a workshop placeable or points to workshopMarker
            const hotspotTag = (defXml.match(/<hotspot[^>]*type="SHOP"[^>]*>/i) || [])[0] || '';
            const tNodeAttr = (hotspotTag.match(/teleportNode="([^"]+)"/i) || [])[1];
            const isWorkshopTarget = tNodeAttr && (tNodeAttr.includes('workshop') || tNodeAttr.includes('playerInteraction'));
            const isWorkshopPlaceable = defXml.includes('type="workshop"') || defXml.includes('<name>Repair Shop</name>');

            const baseI3dMatch = defXml.match(/<base>[\s\S]*?<filename>(.*?)<\/filename>[\s\S]*?<\/base>/i);
            if (baseI3dMatch && baseI3dMatch[1] && placeablePos.length >= 3 && !isNaN(placeablePos[0])) {
                let rawI3d = baseI3dMatch[1].trim();
                const candidates = [rawI3d];
                if (rawI3d.startsWith('$data/')) candidates.push(rawI3d.replace('$data/', 'data/'));
                if (!rawI3d.startsWith('$') && placeableFn) {
                    candidates.push(path.posix.join(path.posix.dirname(placeableFn), rawI3d));
                }
                for (const cPath of candidates) {
                    const i3dText = readPlaceableXmlFile(cPath, mapModName);
                    if (isWorkshopPlaceable || isWorkshopTarget) {
                        // Workshop placeables: ONLY accept hotspotNode (which points to the store entrance)
                        const hsParts = extractHotspotNodeFromI3d(i3dText);
                        if (hsParts) {
                            return localToWorld(hsParts, placeablePos, placeableRot);
                        }
                    } else {
                        // Standard sellingStation / store placeable: accept teleportNode
                        const localParts = extractTeleportFromI3d(i3dText);
                        if (localParts) {
                            return localToWorld(localParts, placeablePos, placeableRot);
                        }
                    }
                }
            }

            // If it was a workshop placeable and no hotspotNode was found, return null to fall back to map i3d!
            if (isWorkshopPlaceable || isWorkshopTarget) {
                return null;
            }
        }
    }

    // Fallback to placeablePos (vehicle spawn/delivery area) only for non-workshop placeables
    if (placeablePos.length >= 3 && !isNaN(placeablePos[0])) {
        return { x: placeablePos[0], y: placeablePos[1], z: placeablePos[2] };
    }

    return null;
}

function resolvePreplacedShopFromMod(mapModName, shopPlaceable) {
    if (!mapModName) return null;
    const uid = shopPlaceable ? String(shopPlaceable['@_uniqueId'] || '') : '';
    const modManager = require('./modManager');
    const allPaths = modManager.getModsPaths();
    const cleanMod = mapModName.replace(/\.zip$/i, '');

    for (const p of allPaths) {
        const zipFile = path.join(p, cleanMod + '.zip');
        if (!fs.existsSync(zipFile)) continue;
        const entries = modManager.listZipEntries(zipFile);

        // 1. Check if the mod has an explicit shop xml in config/ or placeables/ (e.g. config/sellingStationVehicles.xml)
        const shopXmlEntry = entries.find(e => {
            const n = e.entryName.toLowerCase();
            return n.endsWith('.xml') && (n.includes('sellingstationvehicles') || n.includes('vehicletrader') || n.includes('vehicleshop') || n.includes('sellingstationstore'));
        });
        if (shopXmlEntry) {
            const buf = modManager.readEntryFromZip(zipFile, shopXmlEntry.entryName);
            if (buf) {
                const text = buf.toString('utf8');
                const hotspotMatch = text.match(/<hotspot[^>]*type="SHOP"[^>]*teleportWorldPosition="([^"]+)"/i) ||
                                     text.match(/teleportWorldPosition="([^"]+)"/i);
                if (hotspotMatch && hotspotMatch[1]) {
                    const coords = hotspotMatch[1].trim().split(/\s+/).map(parseFloat);
                    if (coords.length >= 3 && !isNaN(coords[0])) {
                        return { x: coords[0], y: coords[1], z: coords[2] };
                    }
                }
            }
        }

        // 2. Check i3d files in the mod
        const i3dEntries = entries.filter(e => e.entryName.toLowerCase().endsWith('.i3d'));
        for (const i3dEntry of i3dEntries) {
            if (i3dEntry.uncompSize > 25 * 1024 * 1024) continue;
            const buf = modManager.readEntryFromZip(zipFile, i3dEntry.entryName);
            if (!buf) continue;
            const text = buf.toString('utf8');

            let matchIndex = -1;
            if (uid) matchIndex = text.indexOf(uid);
            if (matchIndex === -1) {
                matchIndex = text.search(/<TransformGroup[^>]+name="[^"]*sellingStationVehicles[^"]*"/i);
                if (matchIndex === -1) {
                    matchIndex = text.search(/<TransformGroup[^>]+name="[^"]*vehicleShop[^"]*"/i);
                }
            }

            if (matchIndex !== -1) {
                let targetNodeId = null;
                let xmlFilename = null;

                // 1. Check if enclosed in <UserAttribute>...</UserAttribute>
                const uaStart = text.lastIndexOf('<UserAttribute', matchIndex);
                const uaEnd = text.indexOf('</UserAttribute>', matchIndex);
                if (uaStart !== -1 && uaEnd !== -1 && uaEnd > matchIndex && (matchIndex - uaStart < 1500)) {
                    const uaBlock = text.substring(uaStart, uaEnd + 16);
                    targetNodeId = (uaBlock.match(/nodeId="(\d+)"/i) || [])[1];
                    xmlFilename = (uaBlock.match(/<Attribute\s+name="xmlFilename"[^>]+value="([^"]+)"/i) || [])[1];
                }

                // If not found in UserAttribute, check direct attributes around match
                if (!targetNodeId) {
                    const subAround = text.substring(Math.max(0, matchIndex - 300), matchIndex + 300);
                    targetNodeId = (subAround.match(/nodeId="(\d+)"/i) || [])[1];
                }
                if (!xmlFilename) {
                    const subAround = text.substring(Math.max(0, matchIndex - 300), matchIndex + 300);
                    xmlFilename = (subAround.match(/<Attribute\s+name="xmlFilename"[^>]+value="([^"]+)"/i) || [])[1];
                }

                // If xmlFilename was found, check if that xml defines teleportWorldPosition directly
                if (xmlFilename) {
                    let rel = xmlFilename.replace(/\\/g, '/').replace(/^\/+/, '');
                    const xmlBuf = modManager.readEntryFromZip(zipFile, rel);
                    if (xmlBuf) {
                        const xmlText = xmlBuf.toString('utf8');
                        const hotspotMatch = xmlText.match(/<hotspot[^>]*type="SHOP"[^>]*teleportWorldPosition="([^"]+)"/i) ||
                                             xmlText.match(/teleportWorldPosition="([^"]+)"/i);
                        if (hotspotMatch && hotspotMatch[1]) {
                            const coords = hotspotMatch[1].trim().split(/\s+/).map(parseFloat);
                            if (coords.length >= 3 && !isNaN(coords[0])) {
                                return { x: coords[0], y: coords[1], z: coords[2] };
                            }
                        }
                    }
                }

                // Locate the TransformGroup
                let tgChunk = null;
                let tgIndex = -1;
                if (targetNodeId) {
                    const tgRegex = new RegExp(`<TransformGroup[^>]+nodeId="${targetNodeId}"[^>]*>`, 'i');
                    const tgM = text.match(tgRegex);
                    if (tgM) {
                        tgChunk = tgM[0];
                        tgIndex = tgM.index;
                    }
                }

                if (!tgChunk) {
                    const startSearch = Math.max(0, matchIndex - 1000);
                    const chunk = text.substring(startSearch, matchIndex + 1000);
                    const tgM = chunk.match(/<TransformGroup[^>]+name="[^"]*(?:sellingStationVehicles|vehicleShop|shop)[^"]*"[^>]*>/i) ||
                                chunk.match(/<TransformGroup[^>]*translation="([^"]+)"[^>]*>/i);
                    if (tgM) {
                        tgChunk = tgM[0];
                        tgIndex = startSearch + tgM.index;
                    }
                }

                if (tgChunk) {
                    const transMatch = tgChunk.match(/translation="([^"]+)"/i);
                    const rotMatch = tgChunk.match(/rotation="([^"]+)"/i);
                    if (transMatch) {
                        const parentPos = transMatch[1].trim().split(/\s+/).map(parseFloat);
                        const parentRot = rotMatch ? rotMatch[1].trim().split(/\s+/).map(parseFloat) : [0, 0, 0];

                        // If xmlFilename was found, try resolving via resolveTeleportFromPlaceable
                        if (xmlFilename) {
                            const resolved = resolveTeleportFromPlaceable({
                                '@_filename': xmlFilename,
                                '@_position': parentPos.join(' '),
                                '@_rotation': parentRot.join(' ')
                            }, mapModName);
                            if (resolved) return resolved;
                        }

                        // Search children of this TransformGroup for ReferenceNode
                        let childTeleport = null;
                        const childBlock = tgIndex !== -1 ? text.substring(tgIndex, tgIndex + 2000) : tgChunk;
                        const refMatch = childBlock.match(/<ReferenceNode[^>]+referenceId="(\d+)"/i);
                        if (refMatch) {
                            const refId = refMatch[1];
                            const fileMatch = text.match(new RegExp(`<File[^>]+fileId="${refId}"[^>]+filename="([^"]+)"`, 'i'));
                            if (fileMatch) {
                                let rel = fileMatch[1].replace(/\\/g, '/');
                                const i3dDir = path.posix.dirname(i3dEntry.entryName);
                                const targetI3dPath = path.posix.normalize(path.posix.join(i3dDir, rel));
                                const subBuf = modManager.readEntryFromZip(zipFile, targetI3dPath);
                                if (subBuf) {
                                    childTeleport = extractTeleportFromI3d(subBuf.toString('utf8'));
                                }
                            }
                        }

                        if (!childTeleport) {
                            childTeleport = extractTeleportFromI3d(childBlock);
                        }

                        const local = childTeleport || [0, 0, 0];
                        return localToWorld(local, parentPos, parentRot);
                    }
                }
            }
        }
    }
    return null;
}

function resolveShopHotspotCoords(shopPlaceable, mapModName) {
    return resolveTeleportFromPlaceable(shopPlaceable, mapModName);
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
        } else if (mapId && !['MapUS', 'MapEU', 'MapAS'].includes(mapId)) {
            mapModName = mapId;
        }
        
        const mapIdLower = String(mapId || '').toLowerCase();
        const mapTitleLower = String(mapTitle || '').toLowerCase();
        
        // 1. Official FS25 maps exact shop hotspot spawn positions (only for official base game maps)
        if (!mapModName) {
            if (mapId === 'MapUS') {
                return { x: -128.0, y: 49.2, z: -162.0 };
            } else if (mapId === 'MapEU') {
                return { x: -263.0, y: 60.0, z: 44.0 };
            } else if (mapId === 'MapAS') {
                return { x: -528.8, y: 19.8, z: -61.1 };
            }
        }
        
        if (mapIdLower.includes('highland') || mapTitleLower.includes('highland') || mapTitleLower.includes('kinlaig')) {
            return { x: -204.544, y: 82.996, z: -300.276 };
        }
        
        // Helper to identify shop placeables
        const isShopPlaceable = (p) => {
            if (!p) return false;
            const filename = String(p['@_filename'] || '').toLowerCase();
            const uniqueId = String(p['@_uniqueId'] || '').toLowerCase();
            return (
                filename.includes('sellingstationvehicles') || 
                filename.includes('vehicletrader') || 
                filename.includes('vehicleshop') || 
                filename.includes('sellingstationstore') ||
                filename.includes('workshopservice') ||
                uniqueId.includes('sellingstationvehicles') || 
                uniqueId.includes('vehicletrader') ||
                uniqueId.includes('vehicleshop') ||
                uniqueId.includes('workshopservice')
            );
        };

        // 2. Check savegame's own placeables.xml first
        const savePlaceablesPath = path.join(savePath, 'placeables.xml');
        if (fs.existsSync(savePlaceablesPath)) {
            try {
                const sPlaceablesXml = fs.readFileSync(savePlaceablesPath, 'utf8');
                const pParsed = parser.parse(sPlaceablesXml);
                if (pParsed?.placeables?.placeable) {
                    const plist = Array.isArray(pParsed.placeables.placeable) ? pParsed.placeables.placeable : [pParsed.placeables.placeable];
                    const shopPlaceable = plist.find(isShopPlaceable);
                    if (shopPlaceable) {
                        let shopCoords = resolveTeleportFromPlaceable(shopPlaceable, mapModName);
                        if (!shopCoords && shopPlaceable['@_isPreplaced'] === 'true') {
                            shopCoords = resolvePreplacedShopFromMod(mapModName, shopPlaceable);
                        }
                        if (!shopCoords && mapModName) {
                            shopCoords = resolveVehicleShopFromMapI3d(mapModName);
                        }
                        if (shopCoords) return shopCoords;
                    }
                }
            } catch (e) {
                console.error('[SavegameManager] Error parsing save placeables.xml for shop:', e);
            }
        }

        // 3. Check template folder (if ghost slot or custom template)
        const templateFolder = await resolveTemplateFolder(mapId, mapModName, mapTitle);
        if (templateFolder) {
            const sJsonText = readTemplateEntryText(templateFolder, 'shopPos.json');
            if (sJsonText) {
                try {
                    const shopData = JSON.parse(sJsonText);
                    if (shopData && shopData.x !== undefined && shopData.y !== undefined && shopData.z !== undefined) {
                        return { x: parseFloat(shopData.x), y: parseFloat(shopData.y), z: parseFloat(shopData.z) };
                    }
                } catch (e) {}
            }

            const tPlaceablesXml = readTemplateEntryText(templateFolder, 'placeables.xml');
            if (tPlaceablesXml) {
                try {
                    const pObj = parser.parse(tPlaceablesXml);
                    if (pObj?.placeables?.placeable) {
                        const placeables = Array.isArray(pObj.placeables.placeable) ? pObj.placeables.placeable : [pObj.placeables.placeable];
                        const shopPlaceable = placeables.find(isShopPlaceable);
                        if (shopPlaceable) {
                            let shopCoords = resolveTeleportFromPlaceable(shopPlaceable, mapModName);
                            if (!shopCoords && shopPlaceable['@_isPreplaced'] === 'true') {
                                shopCoords = resolvePreplacedShopFromMod(mapModName, shopPlaceable);
                            }
                            if (shopCoords) return shopCoords;
                        }
                    }
                } catch (e) {}
            }
        }

        // 4. Check map mod zip placeables / shop XML / map.xml / map.i3d!
        if (mapModName) {
            const modManager = require('./modManager');
            const modsDir = modManager.getModsPath();
            const cleanMod = mapModName.replace(/\.zip$/i, '');
            const modZip = path.join(modsDir, `${cleanMod}.zip`);
            if (fs.existsSync(modZip)) {
                const zipEntries = modManager.listZipEntries(modZip);

                // Check map.xml for placeables XML path
                let placeablesFilename = 'maps/placeables.xml';
                let mapXmlEntry = zipEntries.find(e => e.entryName.toLowerCase().endsWith('map.xml'));
                if (mapXmlEntry) {
                    const mapXmlBuf = modManager.readEntryFromZip(modZip, mapXmlEntry.entryName);
                    if (mapXmlBuf) {
                        const mapXml = mapXmlBuf.toString('utf8');
                        const mapObj = parser.parse(mapXml);
                        if (mapObj?.map?.placeables && mapObj.map.placeables['@_filename']) {
                            placeablesFilename = mapObj.map.placeables['@_filename'];
                        }
                    }
                }
                
                let placeablesEntry = zipEntries.find(e => e.entryName.toLowerCase() === placeablesFilename.toLowerCase()) ||
                                      zipEntries.find(e => e.entryName.toLowerCase().endsWith('placeables.xml'));
                
                if (placeablesEntry) {
                    const placeablesBuf = modManager.readEntryFromZip(modZip, placeablesEntry.entryName);
                    if (placeablesBuf) {
                        const xml = placeablesBuf.toString('utf8');
                        const pObj = parser.parse(xml);
                        if (pObj?.placeables?.placeable) {
                            const placeables = Array.isArray(pObj.placeables.placeable) ? pObj.placeables.placeable : [pObj.placeables.placeable];
                            const shopPlaceable = placeables.find(isShopPlaceable);
                            if (shopPlaceable) {
                                let shopCoords = resolveTeleportFromPlaceable(shopPlaceable, mapModName);
                                if (!shopCoords && shopPlaceable['@_isPreplaced'] === 'true') {
                                    shopCoords = resolvePreplacedShopFromMod(mapModName, shopPlaceable);
                                }
                                if (shopCoords) return shopCoords;
                            }
                        }
                    }
                }
                
                // Try resolving preplaced shop from mod i3d
                const preplacedPos = resolvePreplacedShopFromMod(mapModName, null);
                if (preplacedPos) return preplacedPos;

                // Try resolving vehicle shop from map i3d
                const mapI3dShop = resolveVehicleShopFromMapI3d(mapModName);
                if (mapI3dShop) return mapI3dShop;
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
        
        const defaultSpawn = await getMapDefaultStartCoordinates(savePath);

        // 1. Reset in players.xml
        const xmlPath = path.join(savePath, 'players.xml');
        if (fs.existsSync(xmlPath)) {
            const xmlData = fs.readFileSync(xmlPath, 'utf8');
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
            const obj = parser.parse(xmlData);
            if (obj && obj.players && obj.players.player) {
                let players = Array.isArray(obj.players.player) ? obj.players.player : [obj.players.player];
                for (let p of players) {
                    if (defaultSpawn && defaultSpawn.x !== undefined) {
                        p.spawn = {
                            '@_position': `${defaultSpawn.x.toFixed(3)} ${defaultSpawn.y.toFixed(3)} ${defaultSpawn.z.toFixed(3)}`
                        };
                    } else if (p.spawn) {
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
                if (defaultSpawn && defaultSpawn.x !== undefined) {
                    careerObj.careerSavegame.player['@_spawnPositionX'] = defaultSpawn.x.toFixed(3);
                    careerObj.careerSavegame.player['@_spawnPositionY'] = defaultSpawn.y.toFixed(3);
                    careerObj.careerSavegame.player['@_spawnPositionZ'] = defaultSpawn.z.toFixed(3);
                } else {
                    delete careerObj.careerSavegame.player['@_spawnPositionX'];
                    delete careerObj.careerSavegame.player['@_spawnPositionY'];
                    delete careerObj.careerSavegame.player['@_spawnPositionZ'];
                }
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

function ensureValidPlayerXml(savePath) {
    try {
        const fs = require('fs');
        const path = require('path');
        const { XMLParser, XMLBuilder } = require('fast-xml-parser');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        
        // 1. Check players.xml
        const pPath = path.join(savePath, 'players.xml');
        if (fs.existsSync(pPath)) {
            const pContent = fs.readFileSync(pPath, 'utf8');
            const pObj = parser.parse(pContent);
            if (pObj && pObj.players && pObj.players.player) {
                let players = Array.isArray(pObj.players.player) ? pObj.players.player : [pObj.players.player];
                let modified = false;
                for (let p of players) {
                    if (p['@_uniqueUserId'] && !p['@_uniqueUserId'].endsWith('=')) {
                        p['@_uniqueUserId'] += '=';
                        modified = true;
                    }
                    if (p.spawn && p.spawn['@_yaw'] !== undefined) {
                        delete p.spawn['@_yaw'];
                        modified = true;
                    }
                }
                if (modified) {
                    delete pObj['?xml'];
                    const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                    const newXml = builder.build(pObj);
                    fs.writeFileSync(pPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml, 'utf8');
                }
            }
        }

        // 2. Check careerSavegame.xml for invalid vehicleFilename
        const cPath = path.join(savePath, 'careerSavegame.xml');
        if (fs.existsSync(cPath)) {
            const cContent = fs.readFileSync(cPath, 'utf8');
            if (cContent.includes('vehicleFilename=')) {
                const cObj = parser.parse(cContent);
                if (cObj && cObj.careerSavegame && cObj.careerSavegame.player) {
                    delete cObj.careerSavegame.player['@_vehicleFilename'];
                    delete cObj.careerSavegame.player['@_spawnYaw'];
                    delete cObj['?xml'];
                    const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                    const newXml = builder.build(cObj);
                    fs.writeFileSync(cPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml, 'utf8');
                }
            }
        }
    } catch(e) {}
}

async function getPlayerPosition(savePath) {
    try {
        ensureValidPlayerXml(savePath);
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
                    pos = { 
                        x: parseFloat(coords[0]), 
                        y: parseFloat(coords[1]), 
                        z: parseFloat(coords[2]),
                        vehicleUniqueId: player.spawn['@_vehicleUniqueId'] || null
                    };
                } else if (player['@_lastPosition']) {
                    const coords = player['@_lastPosition'].split(' ');
                    pos = { x: parseFloat(coords[0]), y: parseFloat(coords[1]), z: parseFloat(coords[2]), vehicleUniqueId: null };
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
                            z: parseFloat(player['@_spawnPositionZ']),
                            vehicleUniqueId: player['@_vehicleId'] || null
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
                    delete p.spawn['@_yaw'];
                    if (p['@_uniqueUserId'] && !p['@_uniqueUserId'].endsWith('=')) {
                        p['@_uniqueUserId'] = p['@_uniqueUserId'] + '=';
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
                delete player['@_vehicleFilename'];
                delete player['@_spawnYaw'];
                
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
        const mapMatch = xmlData.match(/<mapId[^>]*>([^<]+)<\/mapId>/i) || xmlData.match(/mapId="([^"]+)"/i);
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

/**
 * Scans a savegame to identify all mods actively in use (placed vehicles, implements, buildings, items, map, and dependencies).
 */
async function getUsedModsInSavegame(savePath) {
    try {
        const usedModsMap = new Map(); // lowercase -> originalName

        if (!fs.existsSync(savePath)) {
            return { usedModNames: [], mapModName: null };
        }

        // 1. Map mod from careerSavegame.xml
        let mapModName = null;
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (fs.existsSync(careerPath)) {
            const xml = await fs.readFile(careerPath, 'utf8');
            const mapMatch = xml.match(/<mapId>([^<]+)<\/mapId>/i);
            if (mapMatch) {
                const mapId = mapMatch[1].trim();
                if (mapId.includes('.')) {
                    mapModName = mapId.split('.')[0];
                    usedModsMap.set(mapModName.toLowerCase(), mapModName);
                } else if (!['MapUS', 'MapEU', 'MapAS'].includes(mapId)) {
                    mapModName = mapId;
                    usedModsMap.set(mapModName.toLowerCase(), mapModName);
                }
            }
        }

        // Helper regex to extract $moddir$MODNAME or filename="...MODNAME/..."
        const extractModsFromXml = async (filePath) => {
            if (!fs.existsSync(filePath)) return;
            try {
                const content = await fs.readFile(filePath, 'utf8');
                
                // Pattern 1: $moddir$MODNAME/
                const modDirMatches = content.match(/\$moddir\$([^\/\\]+)/gi) || [];
                for (const m of modDirMatches) {
                    const modName = m.replace(/^\$moddir\$/i, '').trim();
                    if (modName) usedModsMap.set(modName.toLowerCase(), modName);
                }

                // Pattern 2: filename=".../mods/MODNAME/..."
                const genericMatches = content.match(/filename=["'][^"']*?mods\/([^\/\\]+)/gi) || [];
                for (const m of genericMatches) {
                    const modName = m.replace(/filename=["'][^"']*?mods\//i, '').trim();
                    if (modName) usedModsMap.set(modName.toLowerCase(), modName);
                }
            } catch (err) {}
        };

        // 2. Scan standard savegame XMLs for placed/bought assets
        await extractModsFromXml(path.join(savePath, 'vehicles.xml'));
        await extractModsFromXml(path.join(savePath, 'placeables.xml'));
        await extractModsFromXml(path.join(savePath, 'items.xml'));
        await extractModsFromXml(path.join(savePath, 'animatedObjects.xml'));
        await extractModsFromXml(path.join(savePath, 'farms.xml'));

        // 3. Check script mod config files present in save directory
        try {
            const saveFiles = await fs.readdir(savePath);
            for (const f of saveFiles) {
                const fLow = f.toLowerCase();
                if (fLow === 'storedeliveries.xml') usedModsMap.set('fs25_storedeliveries', 'FS25_storeDeliveries');
                if (fLow === 'courseplay.xml') usedModsMap.set('fs25_courseplay', 'FS25_Courseplay');
                if (fLow === 'autodrive_config.xml' || fLow === 'autodrive.xml') usedModsMap.set('fs25_autodrive', 'FS25_AutoDrive');
                if (fLow === 'enhancedvehicle.xml') usedModsMap.set('fs25_enhancedvehicle', 'FS25_EnhancedVehicle');
                if (fLow === 'guidancesteering.xml') usedModsMap.set('fs25_guidancesteering', 'FS25_GuidanceSteering');
                if (fLow === 'gps.xml') usedModsMap.set('fs25_guidancesteering', 'FS25_GuidanceSteering');
                if (fLow === 'proseed.xml') usedModsMap.set('fs25_proseed', 'FS25_proSeed');
            }
        } catch (e) {}

        // Always preserve core helper mod if present
        usedModsMap.set('fs25_quietloadingscreen', 'FS25_QuietLoadingScreen');

        // 4. Resolve dependencies of used mods so required vehicle/script packs aren't broken
        try {
            const modManager = require('./modManager');
            const scanRes = await modManager.scanLocalMods();
            const allMods = scanRes.mods || [];

            let addedNew = true;
            while (addedNew) {
                addedNew = false;
                const currentUsed = Array.from(usedModsMap.keys());
                for (const uName of currentUsed) {
                    const fullMod = allMods.find(m => (m.modName || '').toLowerCase() === uName);
                    if (fullMod && fullMod.dependencies && fullMod.dependencies.length > 0) {
                        for (const dep of fullMod.dependencies) {
                            const depStr = (typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || '')).toLowerCase();
                            if (!depStr) continue;
                            const matchedDep = allMods.find(m => 
                                (m.modName && m.modName.toLowerCase() === depStr) ||
                                (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === depStr)
                            );
                            if (matchedDep && !usedModsMap.has(matchedDep.modName.toLowerCase())) {
                                usedModsMap.set(matchedDep.modName.toLowerCase(), matchedDep.modName);
                                addedNew = true;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[USED_MODS] Failed to resolve dependencies:', e.message);
        }

        return {
            usedModNames: Array.from(usedModsMap.values()),
            mapModName
        };
    } catch (err) {
        console.error('[USED_MODS] Error detecting used mods:', err);
        return { usedModNames: [], mapModName: null };
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
        // Auto-compress harvested template into a lightweight .zip archive
        const zipPath = path.join(templatesDir, `${templateFolder}.zip`);
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip();
            zip.addLocalFolder(destPath);
            zip.writeZip(zipPath);
            const zipStats = fs.statSync(zipPath);
            console.log(`[HARVEST] Auto-compressed template "${templateFolder}" to ${path.basename(zipPath)} (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`);
            // Clean up uncompressed folder to save disk space
            await fs.remove(destPath);
        } catch (zErr) {
            console.warn(`[HARVEST] Could not compress template to .zip, keeping uncompressed folder:`, zErr.message);
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
    getMapDefaultStartCoordinates,
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
    getUsedModsInSavegame,
    createSavegameWithMods,
    importSavegame,
    isSavegame,
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
