const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { app } = require('electron');
const nodeFs = require('fs');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const AdmZip = require('adm-zip');
const pathProvider = require('./pathProvider');
const dependencyResolver = require('./dependencyResolver');

function ultraNormalize(str) {
    if (!str) return '';
    let s = str.toLowerCase();
    s = s.replace(/[^a-z0-9]/g, '');
    s = s.replace(/v\d+.*$/, '');
    s = s.replace(/(?:fs25|fs22|fs19|pdlc)+/g, '');
    s = s.replace(/(?:mod|pack|prefab|map)+/g, '');
    return s;
}
const INTERNAL_HELPER_MODS = ['fs25_rememberpositions', 'fs25_storedeliveries', 'fs25_managerpersistencebridge'];
const INCOMPATIBLE_ENGINE_MODS = new Set(['fs25_maxdensityheighttypesbymap']);

// 🛠️ DIAGNOSTIC UTILITY 🛠️
const logFile = (app && typeof app.getPath === 'function') 
    ? path.join(app.getPath('userData'), 'download_debug.log')
    : path.join(process.cwd(), 'download_debug.log');
function debugLog(...args) {
    console.log(...args);
}

function isSavegameGdm(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    try {
        const fd = nodeFs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        nodeFs.readSync(fd, buf, 0, 4, 0);
        nodeFs.closeSync(fd);
        // Savegame GDM binary files start with "MDF (0x22 0x4D 0x44 0x46)
        // Map source asset GDM files start with !MDF (0x21 0x4D 0x44 0x46)
        return buf[0] === 0x22 && buf[1] === 0x4D && buf[2] === 0x44 && buf[3] === 0x46;
    } catch (_) {
        return false;
    }
}

const parser = new XMLParser({ 
    ignoreAttributes: false, 
    attributeNamePrefix: '@_',
    parseAttributeValue: false, // CRITICAL: Keep as string to prevent stripping ="true"
    parseTagValue: false
});

function sanitizeCareerSavegameXml(xmlContent) {
    if (!xmlContent) return xmlContent;
    
    // Ensure <careerSavegame ...> has valid="true" (preventing fast-xml-parser boolean attribute suppression from breaking direct map load)
    xmlContent = xmlContent.replace(/<careerSavegame\b([^>]*?)>/gi, (match, attrs) => {
        if (!/valid=/i.test(attrs)) {
            return `<careerSavegame${attrs} valid="true">`;
        } else {
            return match.replace(/valid=(["']?)(?:true|false|\w*)\1/i, 'valid="true"');
        }
    });

    // Fix malformed <mod .../> tags with extra attribute garbage caused by quotes in mod titles
    return xmlContent.replace(/<mod\s+([^>]+)\/?>/gi, (match, attrString) => {
        const modNameMatch = attrString.match(/modName=["']([^"']+)["']/i);
        if (!modNameMatch) return match;
        const modName = modNameMatch[1];

        let title = modName;
        const titleMatch = attrString.match(/title=["']([^"']+)["']/i);
        if (titleMatch) {
            title = titleMatch[1];
        }

        let version = '1.0.0.0';
        const versionMatch = attrString.match(/version=["']([^"']+)["']/i);
        if (versionMatch) {
            version = versionMatch[1];
        }

        let required = 'false';
        const reqMatch = attrString.match(/required=["']([^"']+)["']/i);
        if (reqMatch) {
            required = reqMatch[1];
        }

        let fileHash = '';
        const hashMatch = attrString.match(/fileHash=["']([^"']+)["']/i);
        if (hashMatch) {
            fileHash = hashMatch[1];
        }

        const safeTitle = title.replace(/"/g, "'").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        return `<mod modName="${modName}" title="${safeTitle}" version="${version}" required="${required}" fileHash="${fileHash}"/>`;
    });
}

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
            const filesToPurge = [
                'densityMap_fruits_broken14.gdm', 'densityMap_fruits_fixed14.gdm',
                'fieldGround.xml', 'densityMap_fruits_growthState.xml',
                'stone_growthState.xml', 'weed_growthState.xml', 'densityMapHeight.xml', 'densityMap_height.gdm'
            ];
            for (const mf of masterFolders) {
                const srcMf = path.join(bundledTemplates, mf);
                const dstMf = path.join(p, mf);
                if (fs.existsSync(srcMf)) {
                    if (!fs.existsSync(dstMf)) {
                        fs.copySync(srcMf, dstMf);
                    } else {
                        // Ensure all essential template files match pristine master versions
                        const filesToCheck = fs.readdirSync(srcMf);
                        for (const file of filesToCheck) {
                            const sf = path.join(srcMf, file);
                            const df = path.join(dstMf, file);
                            if (fs.existsSync(sf) && fs.statSync(sf).isFile()) {
                                if (!fs.existsSync(df) || fs.statSync(df).size !== fs.statSync(sf).size) {
                                    fs.copySync(sf, df);
                                    console.log(`[TEMPLATES] Synced master template file ${mf}/${file}`);
                                }
                            }
                        }
                    }
                    // Purge bad/bloated/crop-freezing files from user master template folder
                    for (const badFile of filesToPurge) {
                        const badPath = path.join(dstMf, badFile);
                        if (fs.existsSync(badPath)) {
                            try { fs.unlinkSync(badPath); } catch (_) {}
                        }
                    }
                }
            }
        }
        // Purge bad/bloated/crop-freezing files from ALL user templates in modManagerTemplates
        const allTemplateDirs = fs.readdirSync(p);
        const allFilesToPurge = [
            'densityMap_fruits_broken14.gdm', 'densityMap_fruits_fixed14.gdm',
            'fieldGround.xml', 'densityMap_fruits_growthState.xml',
            'stone_growthState.xml', 'weed_growthState.xml', 'densityMapHeight.xml', 'densityMap_height.gdm'
        ];
        const masterFoldersSet = new Set(['mapas', 'mapeu', 'mapus', 'pdlc_highlandsfishingpack_highlandsfishingmap']);
        for (const tItem of allTemplateDirs) {
            const tItemLower = tItem.replace(/\.zip$/i, '').toLowerCase();
            const tPath = path.join(p, tItem);
            if (!fs.existsSync(tPath)) continue;
            
            // If custom map template lacks complete engine terrain or economy files, purge it so it's treated as fresh uninitialized map
            if (!masterFoldersSet.has(tItemLower)) {
                try {
                    const stat = fs.statSync(tPath);
                    if (stat.isFile() && tItem.toLowerCase().endsWith('.zip')) {
                        const AdmZip = require('adm-zip');
                        const zip = new AdmZip(tPath);
                        if (!zip.getEntry('terrain.heightmap.png') || !zip.getEntry('economy.xml')) {
                            fs.unlinkSync(tPath);
                            console.log(`[TEMPLATES] Purged incomplete template ZIP: ${tItem}`);
                            continue;
                        }
                    } else if (stat.isDirectory()) {
                        if (!fs.existsSync(path.join(tPath, 'terrain.heightmap.png')) || !fs.existsSync(path.join(tPath, 'economy.xml'))) {
                            fs.removeSync(tPath);
                            console.log(`[TEMPLATES] Purged incomplete template folder: ${tItem}`);
                            continue;
                        }
                    }
                } catch (pErr) {}
            }

            if (fs.existsSync(tPath) && fs.statSync(tPath).isDirectory()) {
                for (const badFile of allFilesToPurge) {
                    const badPath = path.join(tPath, badFile);
                    if (fs.existsSync(badPath)) {
                        try { fs.unlinkSync(badPath); } catch (_) {}
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
            const templateModName = (mapId && mapId.includes('.')) ? mapId.split('.')[0] : null;
            const tTitleClean = (mapTitle || '').toLowerCase().trim();
            const tModClean = (templateModName || '').toLowerCase();
            const fLower = baseName.toLowerCase();

            // Find the most specific matching mod (longest matching modName first)
            const matchedMod = mapMods
                .filter(m => {
                    const mName = (m.modName || '').toLowerCase();
                    if (!mName) return false;
                    if (tModClean && mName === tModClean) return true;
                    if (fLower === mName) return true;
                    if (fLower.startsWith(mName + '_')) return true;
                    return false;
                })
                .sort((a, b) => (b.modName || '').length - (a.modName || '').length)[0] || null;

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
                modName: matchedMod ? matchedMod.modName : (dlcInfo ? dlcInfo.dlcId : templateModName || (baseName.startsWith('FS25_') ? baseName.split('_').slice(0, 2).join('_') : null)),
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
    const OFFICIAL_TEMPLATE_FOLDERS = ['mapus', 'mapeu', 'mapas', 'pdlc_highlandsfishingpack_highlandsfishingmap'];
    return results.filter(t => t !== null && !OFFICIAL_TEMPLATE_FOLDERS.includes(t.id.toLowerCase()));
}

/**
 * Delete a template from the library.
 */
async function deleteMapTemplate(folderName) {
    const templatesDir = getTemplatesPath();
    const backupDir = path.join(getFs25Path(), 'modManagerTemplates_backup');
    const cleanName = folderName.replace(/\.zip$/i, '').toLowerCase();
    const baseName = cleanName.replace(/_crossplay$/i, '').replace(/_cp$/i, '').replace(/_samplemodmap$/i, '').replace(/_templatemap$/i, '');
    let deleted = false;

    if (fs.existsSync(templatesDir)) {
        const files = await fs.readdir(templatesDir);
        for (const f of files) {
            const fLow = f.toLowerCase();
            const fClean = fLow.replace(/\.zip$/i, '');
            if (fClean === cleanName || fClean === baseName || fClean.includes(baseName) || (baseName.length >= 4 && fClean.startsWith(baseName))) {
                // Do not delete official base templates
                const OFFICIAL_MASTER_TEMPLATES = new Set([
                    'mapus', 'mapeu', 'mapas', 'pdlc_highlandsfishingpack_highlandsfishingmap'
                ]);
                if (OFFICIAL_MASTER_TEMPLATES.has(fClean)) continue;

                const targetPath = path.join(templatesDir, f);
                try {
                    await fs.remove(targetPath);
                    deleted = true;
                    console.log(`[TEMPLATES] Purged map template variation: ${f}`);
                } catch (e) {}
            }
        }
    }

    if (fs.existsSync(backupDir)) {
        try { await fs.remove(backupDir); } catch (e) {}
    }
    
    return { success: deleted };
}

async function resolveTemplateFolder(mapId, mapModName = null, mapTitle = null) {
    if (!mapId && !mapModName) return null;
    const templatesDir = getTemplatesPath();
    if (!fs.existsSync(templatesDir)) return null;

    const cleanStr = (s) => {
        if (!s) return '';
        return s.toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    const ultraNorm = (s) => cleanStr(s).replace(/^(?:fs\d{2}|pdlc)/, '');

    const GENERIC_MAP_IDS = new Set([
        'samplemodmap', 'templatemap', 'multifruitmodmap', 'modmap', 
        'map', 'maps4s', 'novabase', 'mountain', 'firstmap', 
        'davidsmap', 'baseblack', 'camposgauchos', 'elmcreek',
        'mapus', 'mapeu', 'mapas', 'highlandsfishingmap', 'pdlchighlandsfishingpack', 'mapforest'
    ]);

    let effectiveModName = mapModName;
    if (!effectiveModName && mapId && mapId.includes('.')) {
        effectiveModName = mapId.split('.')[0];
    }
    if (!effectiveModName && mapId && mapId.toLowerCase().startsWith('fs25_')) {
        effectiveModName = mapId;
    }

    const OFFICIAL_MASTER_TEMPLATES = new Set([
        'mapus', 'mapeu', 'mapas', 'highlandsfishingmap', 'pdlchighlandsfishingpackhighlandsfishingmap'
    ]);

    const targetMapIdNorm = ultraNorm(mapId);
    const targetTitleNorm = ultraNorm(mapTitle);

    const isBaseGameLaunch = (!effectiveModName || isOfficialMap(effectiveModName)) &&
        (isOfficialMap(mapId) || ['riverbendsprings', 'zielonka', 'hutanpantai', 'kinlaig'].includes(targetTitleNorm));

    if (isBaseGameLaunch) {
        const OFFICIAL_FOLDER_MAP = {
            'mapus': 'MapUS',
            'mapeu': 'MapEU',
            'mapas': 'MapAS',
            'highlandsfishingmap': 'pdlc_highlandsFishingPack_HighlandsFishingMap',
            'highlandsfishingpackhighlandsfishingmap': 'pdlc_highlandsFishingPack_HighlandsFishingMap',
            'pdlchighlandsfishingpackhighlandsfishingmap': 'pdlc_highlandsFishingPack_HighlandsFishingMap',
        };
        const officialByTitle = {
            'riverbendsprings': 'MapUS',
            'zielonka': 'MapEU',
            'hutanpantai': 'MapAS',
            'kinlaig': 'pdlc_highlandsFishingPack_HighlandsFishingMap'
        };
        const officialTarget = OFFICIAL_FOLDER_MAP[targetMapIdNorm] || officialByTitle[targetTitleNorm];
        if (officialTarget) {
            const folderPath = path.join(templatesDir, officialTarget);
            if (fs.existsSync(folderPath) || fs.existsSync(`${folderPath}.zip`)) {
                return officialTarget;
            }
        }
        return null;
    }

    // Helper: Verify template is complete with required career configuration and engine world files
    const isCompleteTemplate = async (fPath, isZip = false) => {
        if (isZip) {
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(fPath);
                const hasCareer = !!zip.getEntry('careerSavegame.xml');
                const hasFarms = !!zip.getEntry('farms.xml') || !!zip.getEntry('farmland.xml');
                const hasHeightmap = !!zip.getEntry('terrain.heightmap.png');
                const hasEconomy = !!zip.getEntry('economy.xml');
                return hasCareer && hasFarms && hasHeightmap && hasEconomy;
            } catch (e) {
                return false;
            }
        }
        const hasCareer = fs.existsSync(path.join(fPath, 'careerSavegame.xml'));
        const hasFarms = fs.existsSync(path.join(fPath, 'farms.xml')) || fs.existsSync(path.join(fPath, 'farmland.xml'));
        const hasHeightmap = fs.existsSync(path.join(fPath, 'terrain.heightmap.png'));
        const hasEconomy = fs.existsSync(path.join(fPath, 'economy.xml'));
        return hasCareer && hasFarms && hasHeightmap && hasEconomy;
    };

    const folders = await fs.readdir(templatesDir);
    const effModLower = (effectiveModName || '').toLowerCase();
    const effModBase = effModLower.replace(/_crossplay$/i, '').replace(/_cp$/i, '');
    const effModClean = cleanStr(effectiveModName);

    for (const folder of folders) {
        const cleanFolder = folder.replace(/\.zip$/i, '');
        const cleanFolderLower = cleanFolder.toLowerCase();
        const fNorm = cleanStr(cleanFolder);

        // Never match official base templates for custom mod maps
        if (OFFICIAL_MASTER_TEMPLATES.has(fNorm) || OFFICIAL_MASTER_TEMPLATES.has(cleanFolderLower)) continue;

        const folderPath = path.join(templatesDir, folder);
        const stat = await fs.stat(folderPath).catch(() => null);
        if (!stat) continue;
        const isZip = stat.isFile() && folder.toLowerCase().endsWith('.zip');
        if (!stat.isDirectory() && !isZip) continue;

        // Strict 1:1 exact modName match only - NO fuzzy matching, NO title matching, NO suffix matching
        if (effModLower && cleanFolderLower === effModLower) {
            if (await isCompleteTemplate(folderPath, isZip)) {
                return folder;
            }
        }
    }
    return null;
}

async function hasMapTemplate(mapId, mapTitle = null, modName = null) {
    // Support object argument if passed: { mapId, mapTitle, modName } or positional arguments
    let id = mapId;
    let title = mapTitle;
    let mod = modName;
    if (typeof mapId === 'object' && mapId !== null) {
        id = mapId.mapId;
        title = mapId.mapTitle;
        mod = mapId.modName;
    }
    const folder = await resolveTemplateFolder(id, mod, title);
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
        const internalMods = ['fs25_rememberpositions', 'fs25_storedeliveries', 'fs25_managerpersistencebridge', 'fs25_quietloadingscreen', 'fs25_mtradiomanager'];
        
        for (const entry of entries) {
            if (entry && entry['@_modName']) {
                const nameLow = entry['@_modName'].toLowerCase();
                if (internalMods.includes(nameLow)) continue;
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

    // Build the new mod array
    const newModsMap = new Map();
    
    // Create a lookup for all existing mods to preserve their hashes and properties
    const existingLookup = new Map();
    existingModsArray.forEach(m => {
        if (m && m['@_modName']) {
            existingLookup.set(m['@_modName'].toLowerCase(), m);
        }
    });

    // Preserve required existing mods (excluding internal app helper mods)
    existingModsArray.forEach(m => {
        if (m && m['@_modName']) {
            const nameLow = m['@_modName'].toLowerCase();
            if (m['@_required'] === 'true' && !INTERNAL_HELPER_MODS.includes(nameLow)) {
                newModsMap.set(m['@_modName'], {
                    '@_modName': m['@_modName'],
                    '@_title': String(m['@_title'] || m['@_modName']).replace(/"/g, "'"),
                    '@_version': m['@_version'] || '1.0.0.0',
                    '@_required': m['@_required'] || 'false',
                    '@_fileHash': m['@_fileHash'] || ''
                });
            }
        }
    });

    // Add/update user-selected mods (excluding internal app helper mods)
    mods.forEach(m => {
        if (m && m.modName && INTERNAL_HELPER_MODS.includes(m.modName.toLowerCase())) return;
        const isMap = m.required || (mapId && m.modName === mapId.split('.')[0]) || (mapTitle && m.title === mapTitle);
        const existing = existingLookup.get(m.modName.toLowerCase());
        const rawTitle = m.title || (existing && existing['@_title']) || m.modName || '';
        const cleanTitle = String(rawTitle).replace(/"/g, "'");
        newModsMap.set(m.modName, {
            '@_modName': m.modName,
            '@_title': cleanTitle,
            '@_version': m.version || (existing && existing['@_version']) || '1.0.0.0',
            '@_required': isMap ? 'true' : (existing && existing['@_required'] ? existing['@_required'] : 'false'),
            '@_fileHash': (existing && existing['@_fileHash']) || m.fileHash || ''
        });
    });

    // Ensure internal app companion mods are declared in careerSavegame.xml so the engine loads their lua subsystems
    const appHelpers = [
        { modName: 'FS25_MTRadioManager', title: 'MT Radio Manager Subsystem' },
        { modName: 'FS25_storeDeliveries', title: 'Store Delivery Subsystem' },
        { modName: 'FS25_rememberPositions', title: 'Vehicle Position Persistence' },
        { modName: 'FS25_QuietLoadingScreen', title: 'Quiet Loading Screen' }
    ];
    for (const h of appHelpers) {
        if (!newModsMap.has(h.modName)) {
            newModsMap.set(h.modName, {
                '@_modName': h.modName,
                '@_title': h.title,
                '@_version': '1.0.0.0',
                '@_required': 'false',
                '@_fileHash': ''
            });
        }
    }

    data.careerSavegame.mod = Array.from(newModsMap.values());
    
    // Remove the old wrapper if it exists
    if (data.careerSavegame.mods) delete data.careerSavegame.mods;
    
    // Crucially ensure valid="true" is present, otherwise the engine treats it as an Empty Slot
    data.careerSavegame['@_valid'] = 'true';

    let newXml = builder.build(data);
    newXml = sanitizeCareerSavegameXml(newXml);
    
    // Ensure XML declaration is strictly formatted so the engine accepts it
    if (!newXml.startsWith('<?xml')) {
        newXml = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + newXml;
    }
    
    await fs.writeFile(careerPath, newXml);
    
    // Auto-inject any missing map dependencies and declared mod dependencies
    await syncSubfolderMapDependencies(savegamePath);
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
                        if (/defaultFarmProperty=["'](true|1)["']/i.test(attrs) || /farmId=["']1["']/i.test(attrs)) {
                            defaultFarmIds.add(id);
                        }
                    }
                }
                if (defaultFarmIds.size === 0 && allFarmlandIds.length > 0) {
                    defaultFarmIds.add(allFarmlandIds[0]);
                    if (allFarmlandIds.length > 1) defaultFarmIds.add(allFarmlandIds[1]);
                    if (allFarmlandIds.length > 2) defaultFarmIds.add(allFarmlandIds[2]);
                }
            }
        } catch (e) {
            console.warn('[CREATE] Could not parse default farmlands from mod zip:', e.message);
        }
    }

    if (defaultFarmIds.size === 0) {
        // Ultimate fallback for any mod map where zip parsing didn't find specific default properties
        defaultFarmIds.add('1');
        defaultFarmIds.add('2');
        defaultFarmIds.add('3');
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
                        existingXml = existingXml.replace(reg, (match, p1, p2) => p1 + '1' + p2);
                    } else {
                        const regNoFarmId = new RegExp(`(<farmland\\s+[^>]*id=["']${id}["'])([^>]*\/?>)`, 'i');
                        if (regNoFarmId.test(existingXml)) {
                            existingXml = existingXml.replace(regNoFarmId, (match, p1, p2) => p1 + ' farmId="1"' + p2);
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
        startMonth = 'DEFAULT',
        startTime = 'DEFAULT',
        startWeather = 'DEFAULT',
        mode = 'NEW_FARMER',
        playerName = 'Farmer'
    } = opts;
    const includeStartFarm = opts.includeStartFarm !== false && opts.includeStartFarm !== 'false';
    const includeStartVehicles = opts.includeStartVehicles !== false && opts.includeStartVehicles !== 'false';
    const startFarmFlag = includeStartFarm ? 'true' : 'false';

    const isOfficialBaseMap = isOfficialMap(mapId) || isOfficialMap(mapModName) || 
        ['riverbend springs', 'zielonka', 'hutan pantai'].includes((mapTitle || '').toLowerCase()) ||
        ['mapus', 'mapeu', 'mapas', 'highlandsfishingmap'].includes((mapId || '').toLowerCase()) ||
        ['mapus', 'mapeu', 'mapas', 'highlandsfishingmap'].includes((mapModName || '').toLowerCase());

    // 1. Prepare Slot
    if (fs.existsSync(slotPath)) {
        await fs.emptyDir(slotPath);
    } else {
        await fs.ensureDir(slotPath);
    }

    // Use cached mods for instant resolution of map zip, dependencies, and placeables
    const modManager = require('./modManager');
    const cache = require('./cache');
    let allMods = (modManager.getLastScanResult() && modManager.getLastScanResult().mods)
        ? modManager.getLastScanResult().mods
        : (cache.getAllLocalModCache() || []);

    if ((!allMods || allMods.length === 0) && typeof modManager.scanLocalMods === 'function') {
        try {
            const scanRes = await modManager.scanLocalMods();
            allMods = (scanRes && scanRes.mods) ? scanRes.mods : [];
        } catch (e) {
            console.warn('[SavegameManager] Error scanning local mods for createSavegameWithMods:', e.message);
        }
    }

    const GENERIC_MAP_IDS = new Set([
        'samplemodmap', 'templatemap', 'multifruitmodmap', 'modmap', 
        'map', 'maps4s', 'novabase', 'mountain', 'firstmap', 
        'davidsmap', 'baseblack', 'camposgauchos', 'elmcreek',
        'mapus', 'mapeu', 'mapas', 'highlandsfishingmap', 'pdlchighlandsfishingpack', 'mapforest'
    ]);

    let modZipPath = null;
    const findMapZip = (name, title, id, directFilePath) => {
        if (directFilePath && fs.existsSync(directFilePath)) return directFilePath;

        const nLow = (name || '').toLowerCase();
        const tLow = (title || '').toLowerCase();
        
        // Pass 0: Direct filesystem lookup by mapModName — fastest and most reliable even with cold cache
        const modsRootForDirect = pathProvider.getDefaultModsPath();
        if (name) {
            const directZip = path.join(modsRootForDirect, `${name}.zip`);
            if (fs.existsSync(directZip) && fs.statSync(directZip).size > 0) {
                console.log(`[CREATE] Direct mod ZIP resolved: ${directZip}`);
                return directZip;
            }
            // Also search one level deep in subfolders (map packs often live in their own folder)
            try {
                const subFolders = fs.readdirSync(modsRootForDirect, { withFileTypes: true })
                    .filter(d => d.isDirectory())
                    .map(d => d.name);
                for (const sub of subFolders) {
                    const subZip = path.join(modsRootForDirect, sub, `${name}.zip`);
                    if (fs.existsSync(subZip) && fs.statSync(subZip).size > 0) {
                        console.log(`[CREATE] Direct mod ZIP resolved in subfolder: ${subZip}`);
                        return subZip;
                    }
                }
            } catch (_) {}
        }

        // Pass 1: Match by exact mod name or file basename (unique per mod)
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

        return null;
    };
    if (!isOfficialBaseMap) {
        modZipPath = findMapZip(mapModName, mapTitle, mapId, opts.mapFilePath);
        console.log(`[CREATE] modZipPath resolved: ${modZipPath || '(null - no map ZIP found)'}`);
    }


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
            if (copiedTemplate) {
                // Sanitize stale growth states and flat heightmap placeholders while keeping genuine crop density and field files intact
                try {
                    const filesInSlot = await fs.readdir(slotPath);
                    for (const file of filesInSlot) {
                        const lower = file.toLowerCase();
                        const isStaleGrowth = lower.endsWith('growthstate.xml') || lower === 'densitymapheight.xml' || lower === 'densitymap_height.gdm' || lower.includes('broken14');
                        const isPf = lower.startsWith('precisionfarming') && !finalMods.some(m => (m?.modName || '').toLowerCase().includes('precisionfarming'));
                        if (isStaleGrowth || isPf) {
                            await fs.remove(path.join(slotPath, file)).catch(() => {});
                        }
                    }
                } catch (purgeErr) {
                    console.warn('[CREATE] Failed to sanitize slot files:', purgeErr.message);
                }
            }
        }
    }

    if (!copiedTemplate) {
        console.log(`[CREATE] No specific master template found for map ${mapId}. Save slot ${savegameIndex} will require first-time engine initialization (Ghost Save).`);
        requiresEngineInit = true;
    }

    // 3. Update careerSavegame.xml
    const careerPath = path.join(slotPath, 'careerSavegame.xml');
    const today = new Date().toISOString().split('T')[0];

    let finalMods = (Array.isArray(selectedMods) ? selectedMods : []).filter(m => m && m.modName !== 'FS25_rememberPositions');
    // Add map mod if not already there
    const mapBaseName = (mapModName || '').split('.')[0];
    const matchedMapMod = isOfficialBaseMap ? null : allMods.find(m => {
        if (!m || !m.modName) return false;
        if (modZipPath && m.filePath && path.resolve(m.filePath).toLowerCase() === path.resolve(modZipPath).toLowerCase()) {
            return true;
        }
        const mLow = m.modName.toLowerCase();
        const rawLow = (mapModName || '').toLowerCase();
        const baseLow = mapBaseName.toLowerCase();
        const fLow = (m.fileName || '').replace(/\.zip$/i, '').toLowerCase();
        const tLow = (mapTitle || '').toLowerCase();
        const idLow = (mapId || '').toLowerCase();
        return (m.isMap && (mLow === rawLow || mLow === baseLow || fLow === baseLow || fLow === rawLow ||
               (m.title && m.title.toLowerCase() === tLow) ||
               (idLow && !GENERIC_MAP_IDS.has(idLow) && m.mapId && m.mapId.toLowerCase() === idLow))) ||
               mLow === rawLow || mLow === baseLow || fLow === baseLow || fLow === rawLow;
    });
    const canonicalBaseMapName = isOfficialMap(mapId) ? mapId : ((mapTitle || '').toLowerCase() === 'riverbend springs' ? 'MapUS' : (mapTitle || '').toLowerCase() === 'zielonka' ? 'MapEU' : 'MapAS');
    const trueMapModName = isOfficialBaseMap ? canonicalBaseMapName : (matchedMapMod ? matchedMapMod.modName : (mapModName || mapBaseName));

    let mapModObj = finalMods.find(m => {
        if (!m || !m.modName) return false;
        const mLow = m.modName.toLowerCase();
        return mLow === (mapModName || '').toLowerCase() || mLow === mapBaseName.toLowerCase() || mLow === (trueMapModName || '').toLowerCase();
    });

    if (!isOfficialBaseMap && (mapModName || trueMapModName) && !mapModObj) {
        mapModObj = { 
            modName: trueMapModName, 
            title: mapTitle || matchedMapMod?.title || trueMapModName, 
            version: matchedMapMod?.version || '1.0.0.0', 
            required: true 
        };
        finalMods.unshift(mapModObj);
    } else if (!isOfficialBaseMap && mapModObj) {
        mapModObj.required = true;
        mapModObj.modName = trueMapModName;
        if (matchedMapMod?.version) mapModObj.version = matchedMapMod.version;
    }

    // Auto-include map dependencies declared in map's modDesc.xml (<dependency>ModName</dependency>) and subfolders
    try {
        if (modZipPath && fs.existsSync(modZipPath) && fs.statSync(modZipPath).isFile()) {
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(modZipPath);
                const mdEntry = zip.getEntry('modDesc.xml');
                if (mdEntry) {
                    const mdXml = mdEntry.getData().toString('utf8');
                    const depMatches = mdXml.match(/<dependency>([\s\S]*?)<\/dependency>/gi) || [];
                    for (const depTag of depMatches) {
                        const depName = depTag.replace(/<\/?dependency>/gi, '').trim();
                        if (!depName) continue;
                        const foundMod = allMods.find(m => {
                            if (!m || !m.modName) return false;
                            const mLow = m.modName.toLowerCase();
                            const dLow = depName.toLowerCase();
                            const fLow = (m.fileName || '').replace(/\.zip$/i, '').toLowerCase();
                            return mLow === dLow || fLow === dLow;
                        });
                        const targetName = foundMod ? foundMod.modName : depName;
                        if (!finalMods.some(m => (m.modName || '').toLowerCase() === targetName.toLowerCase())) {
                            console.log(`[CREATE] Auto-including map dependency declared in modDesc.xml: ${targetName}`);
                            finalMods.push({
                                modName: targetName,
                                title: foundMod?.title || targetName,
                                version: foundMod?.version || '1.0.0.0',
                                required: true,
                                fileHash: foundMod?.fileHash || ''
                            });
                        }
                    }
                }
            } catch (dErr) {
                console.warn('[CREATE] Error parsing map modDesc.xml dependencies:', dErr.message);
            }
        }

        const mapDepMods = allMods.filter(m => {
            if (!m || m.isMap) return false;
            const fLow = (m.folder || '').toLowerCase();
            const mapFLow = matchedMapMod && matchedMapMod.folder ? matchedMapMod.folder.toLowerCase() : '';
            return Boolean(mapFLow && fLow === mapFLow && fLow !== 'mods');
        });

        for (const depMod of mapDepMods) {
            if (depMod.modName && !finalMods.some(m => (m.modName || '').toLowerCase() === depMod.modName.toLowerCase())) {
                console.log(`[CREATE] Auto-including map dependency mod from subfolder: ${depMod.title || depMod.modName}`);
                finalMods.push({
                    modName: depMod.modName,
                    title: depMod.title || depMod.modName,
                    version: depMod.version || '1.0.0.0',
                    required: true,
                    fileHash: depMod.fileHash || ''
                });
            }
        }
    } catch (subErr) {
        console.warn('[CREATE] Failed to resolve map dependencies:', subErr.message);
    }

    // --- AUTO-INJECT DEPENDENCIES FOR ALL SELECTED MODS ---
    // If we don't do this, the FS25 engine pauses the launch and prompts: "Do you want to select all required mods?"
    try {
        let addedNewDep = true;
        let passes = 0;
        while(addedNewDep && passes < 10) {
            passes++;
            addedNewDep = false;
            const currentMods = [...finalMods];
            const existingSet = new Set(currentMods.map(m => (m && m.modName ? m.modName.toLowerCase() : '')).filter(Boolean));

            for (const selMod of currentMods) {
                if (!selMod || !selMod.modName) continue;
                const fullMod = allMods.find(m => 
                    (m.modName && m.modName.toLowerCase() === selMod.modName.toLowerCase()) ||
                    (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === selMod.modName.toLowerCase())
                );
                if (fullMod && fullMod.dependencies && Array.isArray(fullMod.dependencies) && fullMod.dependencies.length > 0) {
                    for (const dep of fullMod.dependencies) {
                        const installedDep = allMods.find(m => dependencyResolver.matchModWithDependency(m, dep));

                        if (installedDep && installedDep.modName) {
                            const depModNameLow = installedDep.modName.toLowerCase();
                            if (installedDep.modName !== mapModName && !existingSet.has(depModNameLow)) {
                                console.log(`[CREATE] Auto-injecting dependency: ${installedDep.title || installedDep.modName} (required by ${selMod.title || selMod.modName})`);
                                finalMods.push({
                                    modName: installedDep.modName,
                                    title: installedDep.title || installedDep.modName,
                                    version: installedDep.version || '1.0.0.0',
                                    required: true,
                                    fileHash: installedDep.fileHash || ''
                                });
                                existingSet.add(depModNameLow);
                                addedNewDep = true;
                            } else {
                                const alreadySelected = finalMods.find(m => m && m.modName && m.modName.toLowerCase() === depModNameLow);
                                if (alreadySelected) {
                                    alreadySelected.required = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('[CREATE] Failed to auto-inject dependencies:', err);
    }

    // Filter out any known engine-crashing/incompatible mods
    finalMods = finalMods.filter(m => m && m.modName && !INCOMPATIBLE_ENGINE_MODS.has(m.modName.toLowerCase()));

    // Extract true map id from the mod's modDesc.xml if available
    let internalMapId = matchedMapMod?.mapId || mapId;
    if (modZipPath && fs.existsSync(modZipPath)) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(modZipPath);
            const entry = zip.getEntry('modDesc.xml');
            if (entry) {
                const xmlContent = entry.getData().toString('utf8');
                const mMatch = xmlContent.match(/<map\s+[^>]*id=["']([^"']+)["']/i) || xmlContent.match(/<mapId>([^<]+)<\/mapId>/i);
                if (mMatch && mMatch[1]) {
                    internalMapId = mMatch[1];
                    console.log(`[CREATE] Extracted real internal mapId "${internalMapId}" from ${path.basename(modZipPath)}`);
                }
            }
        } catch (e) {
            console.warn(`[CREATE] Could not read mapId from zip: ${e.message}`);
        }
    }

    // Determine engineMapId:
    // For official base maps, use canonical base ID (MapUS, MapEU, MapAS, pdlc_highlandsFishingPack...).
    // For custom mod maps, FS25 engine REQUIRES {mapModName}.{internalMapId} (e.g. FS25_BackRoadsCounty4x.mapUS)
    const effectiveMapModName = isOfficialBaseMap ? '' : (trueMapModName || mapModName);
    let engineMapId = internalMapId || mapId;

    if (isOfficialBaseMap) {
        const lowEngineId = (engineMapId || '').toLowerCase();
        if (lowEngineId === 'mapus' || (mapTitle || '').toLowerCase() === 'riverbend springs') engineMapId = 'MapUS';
        else if (lowEngineId === 'mapeu' || (mapTitle || '').toLowerCase() === 'zielonka') engineMapId = 'MapEU';
        else if (lowEngineId === 'mapas' || (mapTitle || '').toLowerCase() === 'hutan pantai') engineMapId = 'MapAS';
        else if (lowEngineId.includes('highlandsfishing') || (effectiveMapModName || '').toLowerCase().includes('highlandsfishing')) {
            engineMapId = 'pdlc_highlandsFishingPack.HighlandsFishingMap';
        }
    } else if (effectiveMapModName) {
        // Strip any previous mod prefix if mismatched
        if (!engineMapId.startsWith(effectiveMapModName + '.')) {
            const dotIdx = engineMapId.indexOf('.');
            const cleanId = dotIdx !== -1 ? engineMapId.substring(dotIdx + 1) : engineMapId;
            engineMapId = `${effectiveMapModName}.${cleanId || 'mapUS'}`;
        }
    }

    const modData = finalMods.map(mod => {
        // We explicitly set required above for injected deps and the map.
        const isRequired = mod.required === true;
        return {
            '@_modName': mod.modName,
            '@_title': String(mod.title || mod.modName || '').replace(/"/g, '&quot;'),
            '@_version': mod.version || '1.0.0.0',
            '@_required': isRequired ? 'true' : 'false',
            '@_fileHash': mod.fileHash || ''
        };
    });

    // Dynamically set map densityMap revision matching map file or default to 1
    let mapDeclaredRev = '1';
    if (modZipPath && fs.existsSync(modZipPath)) {
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(modZipPath);
            const mapXmlEntry = zip.getEntries().find(e => /map.*\.xml$/i.test(e.entryName));
            if (mapXmlEntry) {
                const mText = mapXmlEntry.getData().toString('utf8');
                const revMatch = mText.match(/<densityMap\s+[^>]*revision=["'](\d+)["']/i);
                if (revMatch && revMatch[1]) {
                    mapDeclaredRev = revMatch[1];
                }
            }
        } catch (_) {}
    }

    let savegameData;
    if (!requiresEngineInit && fs.existsSync(careerPath)) {
        // We copied a template, so preserve its initialized state!
        try {
            const xml = await fs.readFile(careerPath, 'utf8');
            savegameData = parser.parse(xml);
            
            // Only update necessary fields
            if (!savegameData.careerSavegame.settings) savegameData.careerSavegame.settings = {};
            savegameData.careerSavegame.settings.savegameName = savegameName;
            savegameData.careerSavegame.settings.playerName = playerName;
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

            savegameData.careerSavegame.settings.densityMapRevision = mapDeclaredRev;
            savegameData.careerSavegame.settings.mapDensityMapRevision = mapDeclaredRev;

            // Critically ensure valid="true" is present — without it FS25 engine treats slot as empty
            savegameData.careerSavegame['@_valid'] = 'true';
            
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
                            '@_title': String(tMod['@_title'] || tName || '').replace(/"/g, '&quot;'),
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

            // Ensure MTRadioManager is included for in-game radio station overrides
            if (!modData.some(m => (m['@_modName'] || '').toLowerCase() === 'fs25_mtradiomanager')) {
                modData.push({
                    '@_modName': 'FS25_MTRadioManager',
                    '@_title': 'In-Game Audio Subsystem',
                    '@_version': '1.0.0.0',
                    '@_required': 'false',
                    '@_fileHash': ''
                });
            }

            // Update careerSavegame mods list
            savegameData.careerSavegame.mod = modData;

            // Configure player spawn: official maps always use their canonical default start coordinates.
            // Custom mod maps use the map author's designated start (from the map files).
            // Never read spawn from the template's saved player position — that reflects wherever the
            // player last was when the template was snapshotted, not the map's actual start.
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
                // Kinlaig and custom mod maps: use the map's actual default start from its i3d/config files,
                // or omit coordinates completely so Giants Engine spawns the player at the author's designated playerStart
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
                        let spawnForPlayers = null;
                        if (engineMapId === 'MapUS')       spawnForPlayers = { x: -128.0,  y: 49.2,  z: -162.0 };
                        else if (engineMapId === 'MapEU')  spawnForPlayers = { x: -263.0,  y: 60.0,  z: 44.0   };
                        else if (engineMapId === 'MapAS')  spawnForPlayers = { x: -528.8,  y: 19.8,  z: -61.1  };
                        else spawnForPlayers = await getMapDefaultStartCoordinates(slotPath);

                        for (const p of plist) {
                            if (spawnForPlayers && spawnForPlayers.x !== undefined) {
                                p.spawn = {
                                    '@_position': `${spawnForPlayers.x.toFixed(3)} ${spawnForPlayers.y.toFixed(3)} ${spawnForPlayers.z.toFixed(3)}`
                                };
                            } else if (p.spawn) {
                                delete p.spawn;
                            }
                        }
                        await fs.writeFile(playersPath, builder.build(pData));
                    }
                } catch (e) {}
            }

            // Configure template environment.xml: Preserve map default weather, date and time unless explicitly changed
            const envTemplatePath = path.join(slotPath, 'environment.xml');
            if (fs.existsSync(envTemplatePath)) {
                try {
                    const eXml = await fs.readFile(envTemplatePath, 'utf8');
                    const eData = parser.parse(eXml);
                    if (eData?.environment) {
                        if (fixedSeasonLength) {
                            eData.environment.daysPerPeriod = String(fixedSeasonLength);
                        }
                        // Only change date/month if user did not choose DEFAULT
                        if (startMonth && startMonth !== 'DEFAULT') {
                            const dpp = parseInt(fixedSeasonLength || eData.environment.daysPerPeriod || 1);
                            const pNum = parseInt(startMonth);
                            eData.environment.currentPeriod = String(pNum);
                            eData.environment.currentDay = String((pNum - 1) * dpp + 1);
                            eData.environment.currentMonotonicDay = eData.environment.currentDay;
                        }
                        // Only change time of day if user did not choose DEFAULT
                        if (startTime && startTime !== 'DEFAULT') {
                            let minutes = 480;
                            if (typeof startTime === 'string' && startTime.includes(':')) {
                                const [h, m] = startTime.split(':').map(Number);
                                minutes = (h || 0) * 60 + (m || 0);
                            } else {
                                minutes = parseFloat(startTime) || 480;
                            }
                            eData.environment.dayTime = Number(minutes).toFixed(6);
                            eData.environment.time = Number(minutes).toFixed(6);
                        }
                        // Only change weather if user did not choose DEFAULT
                        if (startWeather && startWeather !== 'DEFAULT') {
                            applyWeatherToEnvironment(eData.environment, startWeather);
                        }
                        // Reset runtime timer to 0 so fresh career starts cleanly
                        eData.environment.realHourTimer = '0.000000';

                        await fs.writeFile(envTemplatePath, builder.build(eData));
                    }
                } catch (e) {}
            }

            // If starting vehicles are disabled by user, strip starting farm vehicles from vehicles.xml
            if (!includeStartVehicles) {
                const vehiclesPath = path.join(slotPath, 'vehicles.xml');
                if (fs.existsSync(vehiclesPath)) {
                    try {
                        let vXml = await fs.readFile(vehiclesPath, 'utf8');
                        // Remove vehicles owned by farm 1
                        vXml = vXml.replace(/<vehicle\s+[^>]*farmId="1"[^>]*>[\s\S]*?<\/vehicle>/gi, '');
                        vXml = vXml.replace(/<vehicle\s+[^>]*farmId="1"[^>]*\/>/gi, '');
                        await fs.writeFile(vehiclesPath, vXml);
                        console.log('[CREATE] Stripped starting farm vehicles because includeStartVehicles is false.');
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
                                    playerObj['@_lastNickname'] = playerName;
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
        // Fallback for fresh uninitialized maps — uses clean FS25 settings (matches savegame3 backup)
        const settingsBlock = {
            savegameName: savegameName,
            playerName: playerName,
            creationDate: today,
            mapId: engineMapId,
            mapTitle: mapTitle,
            saveDateFormatted: today,
            saveDate: today,
            initialMoney: String(money),
            initialLoan: String(initialLoan),
            difficulty: String(difficulty),
            economicDifficulty: String(economicDifficulty || 'NORMAL').toUpperCase(),
            hasInitiallyOwnedFarmlands: startFarmFlag,
            loadDefaultFarm: startFarmFlag,
            loadDefaultVehicles: startFarmFlag,
            startWithGuidedTour: 'true',
            trafficEnabled: 'true',
            stopAndGoBraking: 'true',
            growthMode: '1',
            plannedDaysPerPeriod: String(fixedSeasonLength || 1),
            fruitDestruction: 'true',
            plowingRequiredEnabled: 'false',
            stonesEnabled: 'true',
            weedsEnabled: 'true',
            limeRequired: 'true',
            isSnowEnabled: 'true',
            timeScale: String(timeScale || 1.0),
            isCrossPlatformSavegame: 'false',
            initialPlatformName: 'WIN'
        };
        savegameData = {
            careerSavegame: {
                '@_revision': '2',
                '@_valid': 'true',
                settings: settingsBlock,
                statistics: {
                    money: String(money),
                    playTime: '0.000000'
                },
                mod: modData
            }
        };
    }

    // Ensure densityMapRevision is set in careerSavegame.xml for custom maps
    if (!savegameData.careerSavegame.settings) savegameData.careerSavegame.settings = {};
    if (!savegameData.careerSavegame.settings.densityMapRevision) {
        savegameData.careerSavegame.settings.densityMapRevision = mapDeclaredRev || '1';
    }
    if (!savegameData.careerSavegame.settings.mapDensityMapRevision) {
        savegameData.careerSavegame.settings.mapDensityMapRevision = mapDeclaredRev || '1';
    }

    let xmlOutput = builder.build(savegameData);
    xmlOutput = sanitizeCareerSavegameXml(xmlOutput);

    // Ensure XML declaration
    if (!xmlOutput.startsWith('<?xml')) {
        xmlOutput = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + xmlOutput;
    }

    await fs.writeFile(careerPath, xmlOutput);

    // Auto-generate starting farmland.xml for fresh saves
    if (requiresEngineInit) {
        await setupSavegameFarmlands(slotPath, modZipPath, engineMapId, mapModName, includeStartFarm);
    }

    // For no-template first-run slots, skip extracting anything from the map ZIP.
    // The engine handles everything from scratch via its native new-career init path.
    // Extracting files (even non-GDM ones) can interfere with that init.
    let extractedGrles = 0;
    if (modZipPath && !requiresEngineInit) {
        try {
            if (fs.existsSync(modZipPath)) {
                try {
                    const modManager = require('./modManager');
                    if (modManager.patchMapDensityHeightTypesIfNeeded) {
                        modManager.patchMapDensityHeightTypesIfNeeded(modZipPath);
                    }
                } catch (_) {}

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

                    // Create a lookup map of entry basenames, prioritizing entries in maps/config/, config/, maps/, or map/ and larger size
                    const zipEntries = zip.getEntries();
                    const entryByFullPath = new Map();
                    const entryByBaseName = new Map();
                    for (const entry of zipEntries) {
                        if (entry.isDirectory) continue;
                        const normPath = entry.entryName.replace(/\\/g, '/').toLowerCase();
                        entryByFullPath.set(normPath, entry);
                        const baseName = path.basename(normPath);
                        const existing = entryByBaseName.get(baseName);
                        if (!existing) {
                            entryByBaseName.set(baseName, entry);
                        } else {
                            const ePath = existing.entryName.replace(/\\/g, '/').toLowerCase();
                            const eConfig = ePath.includes('config/') || ePath.includes('maps/') || ePath.includes('map/');
                            const cConfig = normPath.includes('config/') || normPath.includes('maps/') || normPath.includes('map/');
                            if ((cConfig && !eConfig) || (cConfig === eConfig && entry.header.size > existing.header.size)) {
                                entryByBaseName.set(baseName, entry);
                            }
                        }
                    }

                    // Helper to extract a specific entry from zip to destination file in slotPath
                    const extractExactZipFile = async (relPath, destFilename) => {
                        if (!relPath || relPath.startsWith('$data')) return false;
                        const normPath = relPath.replace(/\\/g, '/').toLowerCase();
                        const baseName = path.basename(normPath);
                        const entry = entryByFullPath.get(normPath) || entryByBaseName.get(baseName);
                        if (entry) {
                            const targetPath = path.join(slotPath, destFilename);
                            if (!fs.existsSync(targetPath)) {
                                await fs.writeFile(targetPath, entry.getData());
                                console.log(`[CREATE] Fast-extracted ${entry.entryName} -> ${destFilename}`);
                                return true;
                            }
                        }
                        return false;
                    };

                    // Extract template starting XML files for all custom map saves (excluding fields.xml so engine seeds crops natively)
                    if (includeStartVehicles && defaultVehiclesFile) await extractExactZipFile(defaultVehiclesFile, 'vehicles.xml');
                    if (defaultPlaceablesFile) await extractExactZipFile(defaultPlaceablesFile, 'placeables.xml');
                    if (defaultItemsFile) await extractExactZipFile(defaultItemsFile, 'items.xml');
                    if (defaultHandToolsFile) await extractExactZipFile(defaultHandToolsFile, 'handTools.xml');
                    if (farmlandsFile) await extractExactZipFile(farmlandsFile, 'farmland.xml');

                    // Fallback extraction for starting XML files if missing
                    for (const [targetXml, destName] of [
                        ['placeables.xml', 'placeables.xml'],
                        ['items.xml', 'items.xml'],
                        ['handTools.xml', 'handTools.xml'],
                        ['farmlands.xml', 'farmland.xml'],
                        ['farmland.xml', 'farmland.xml']
                    ]) {
                        if (!fs.existsSync(path.join(slotPath, destName))) {
                            const entry = entryByBaseName.get(targetXml);
                            if (entry) {
                                await fs.writeFile(path.join(slotPath, destName), entry.getData());
                                console.log(`[CREATE] Fast fallback extracted ${entry.entryName} -> ${destName}`);
                            }
                        }
                    }

                    if (includeStartVehicles && !fs.existsSync(path.join(slotPath, 'vehicles.xml'))) {
                        const entry = entryByBaseName.get('vehicles.xml');
                        if (entry) {
                            await fs.writeFile(path.join(slotPath, 'vehicles.xml'), entry.getData());
                            console.log(`[CREATE] Fast fallback extracted vehicles.xml`);
                        }
                    }

                    // Extract author starting density infoLayers and fields.xml from map mod ZIP
                    // NOTE: Do NOT extract densityMap_fruits.gdm or infoLayers into fresh uninitialized save slots.
                    // Letting GIANTS Engine perform native initial seeding from the map ZIP preserves crop growth and ground layers.
                    if (modZipPath && fs.existsSync(modZipPath) && !requiresEngineInit) {
                        try {
                            const extractedCount = await extractMapDensityFiles(modZipPath, slotPath, false, true);
                            console.log(`[CREATE] Extracted ${extractedCount} starting infoLayer files into slot ${savegameIndex}`);

                            // Also extract fields.xml from map ZIP if available and not yet extracted
                            if (!fs.existsSync(path.join(slotPath, 'fields.xml'))) {
                                if (fieldsFile) {
                                    await extractExactZipFile(fieldsFile, 'fields.xml');
                                } else {
                                    const fEntry = entryByBaseName.get('fields.xml');
                                    if (fEntry) {
                                        await fs.writeFile(path.join(slotPath, 'fields.xml'), fEntry.getData());
                                        console.log(`[CREATE] Extracted author fields.xml from map ZIP`);
                                    }
                                }
                            }
                        } catch (dErr) {
                            console.warn('[CREATE] Failed to extract map density files:', dErr.message);
                        }
                    }

                    // Extract pre-rendered terrain.occluders.cache from map mod ZIP to prevent 55% load hang
                    if (modZipPath && fs.existsSync(modZipPath)) {
                        try {
                            const occTarget = path.join(slotPath, 'terrain.occluders.cache');
                            if (!fs.existsSync(occTarget)) {
                                const AdmZip = require('adm-zip');
                                const zip = new AdmZip(modZipPath);
                                const occEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.terrain.occluders.cache'));
                                if (occEntry) {
                                    await fs.writeFile(occTarget, occEntry.getData());
                                    console.log(`[CREATE] Extracted pre-rendered terrain occluder cache to ${occTarget}`);
                                }
                            }
                        } catch (occErr) {
                            console.warn('[CREATE] Occluder extraction warning:', occErr.message);
                        }
                    }

                    // If starting farm or vehicles is disabled, strip farm 1 vehicles
                    if (!includeStartFarm || !includeStartVehicles) {
                        const vehiclesPath = path.join(slotPath, 'vehicles.xml');
                        if (fs.existsSync(vehiclesPath)) {
                            try {
                                let vXml = await fs.readFile(vehiclesPath, 'utf8');
                                vXml = vXml.replace(/<vehicle\s+[^>]*farmId="1"[^>]*>[\s\S]*?<\/vehicle>/gi, '');
                                vXml = vXml.replace(/<vehicle\s+[^>]*farmId="1"[^>]*\/>/gi, '');
                                await fs.writeFile(vehiclesPath, vXml);
                                console.log('[CREATE] Stripped starting farm vehicles because start farm or vehicles is false.');
                            } catch (e) {}
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`[CREATE] Failed to extract map files from zip:`, err);
        }
    }

    // Auto-discover and inject all starting placeable/vehicle mod dependencies into careerSavegame.xml
    try {
        const placeableFiles = ['placeables.xml', 'vehicles.xml', 'items.xml'];
        const discoveredMods = new Set();
        for (const pf of placeableFiles) {
            const pFullPath = path.join(slotPath, pf);
            if (fs.existsSync(pFullPath)) {
                const content = await fs.readFile(pFullPath, 'utf8');
                const matches = content.match(/\$moddir\$([^\/\\<">]+)/gi);
                if (matches) {
                    for (const m of matches) {
                        const cleanName = m.replace(/^\$moddir\$/i, '').trim();
                        if (cleanName && cleanName.toLowerCase() !== (mapModName || '').toLowerCase()) {
                            discoveredMods.add(cleanName);
                        }
                    }
                }
            }
        }

        if (discoveredMods.size > 0 && fs.existsSync(careerPath)) {
            const cXml = await fs.readFile(careerPath, 'utf8');
            const cData = parser.parse(cXml);
            if (cData && cData.careerSavegame) {
                const currentMods = Array.isArray(cData.careerSavegame.mod) 
                    ? cData.careerSavegame.mod 
                    : (cData.careerSavegame.mod ? [cData.careerSavegame.mod] : []);
                const existingNames = new Set(currentMods.map(m => (m['@_modName'] || '').toLowerCase()));
                let modified = false;

                for (const dModName of discoveredMods) {
                    if (!existingNames.has(dModName.toLowerCase())) {
                        const matchedMod = allMods.find(m => 
                            (m.modName && m.modName.toLowerCase() === dModName.toLowerCase()) || 
                            (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === dModName.toLowerCase())
                        );
                        currentMods.push({
                            '@_modName': matchedMod ? matchedMod.modName : dModName,
                            '@_title': String(matchedMod?.title || dModName).replace(/"/g, '&quot;'),
                            '@_version': matchedMod?.version || '1.0.0.0',
                            '@_required': 'true',
                            '@_fileHash': matchedMod?.fileHash || ''
                        });
                        existingNames.add(dModName.toLowerCase());
                        modified = true;
                        console.log(`[CREATE] Injected required placeable mod into careerSavegame.xml: ${dModName}`);
                    }
                }

                if (modified) {
                    cData.careerSavegame.mod = currentMods;
                    let updatedOutput = builder.build(cData);
                    if (!updatedOutput.startsWith('<?xml')) {
                        updatedOutput = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' + updatedOutput;
                    }
                    await fs.writeFile(careerPath, updatedOutput);
                }
            }
        }
    } catch (placeErr) {
        console.warn('[CREATE] Failed to scan placeables for required mods:', placeErr.message);
    }

    // Configure starting farmlands for pre-initialized save templates (skip for fresh saves so GIANTS Engine seeds fields natively from fields.xml)
    if (!requiresEngineInit && fs.existsSync(path.join(slotPath, 'terrain.heightmap.png'))) {
        await setupSavegameFarmlands(slotPath, modZipPath, engineMapId, mapModName, includeStartFarm);
    }

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
        let pNum = 6;
        if (startMonth && startMonth !== 'DEFAULT') pNum = parseInt(startMonth);
        const dpp = fixedSeasonLength || 1;
        const curDay = (pNum - 1) * dpp + 1;
        let dayMinutes = 480;
        if (startTime && startTime !== 'DEFAULT') {
            if (typeof startTime === 'string' && startTime.includes(':')) {
                const [h, m] = startTime.split(':').map(Number);
                dayMinutes = (h || 0) * 60 + (m || 0);
            } else {
                dayMinutes = parseFloat(startTime) || 480;
            }
        }
        const wType = (startWeather && startWeather !== 'DEFAULT') ? startWeather.toUpperCase() : 'SUN';
        const initialEnv = {
            environment: {
                dayTime: Number(dayMinutes).toFixed(6),
                currentDay: String(curDay),
                currentMonotonicDay: String(curDay),
                realHourTimer: '0.000000',
                daysPerPeriod: String(dpp),
                currentPeriod: String(pNum),
                time: Number(dayMinutes).toFixed(6),
                weather: {
                    '@_timeSinceLastRain': wType === 'RAIN' ? '0' : '24',
                    forecast: {
                        instance: [
                            {
                                '@_typeName': wType,
                                '@_season': 'SUMMER',
                                '@_variationIndex': '1',
                                '@_startDay': String(curDay),
                                '@_startDayTime': '28800000',
                                '@_duration': '39600000'
                            },
                            {
                                '@_typeName': wType === 'RAIN' ? 'CLOUDY' : 'SUN',
                                '@_season': 'SUMMER',
                                '@_variationIndex': '2',
                                '@_startDay': String(curDay),
                                '@_startDayTime': '68400000',
                                '@_duration': '18000000'
                            }
                        ]
                    },
                    ground: {
                        '@_wetness': wType === 'RAIN' ? '1.000000' : '0.000000'
                    }
                }
            }
        };
        await fs.writeFile(envPath, builder.build(initialEnv));
    }

    // Final clean pass: Sanitize stale growth XML and unused Precision Farming files
    // NOTE: Strictly preserve genuine densityMap_fruits.gdm, fields.xml, terrain.occluders.cache,
    // vehicleNavigationCostmap.dat, info layers, split shapes, and placeables.
    try {
        const hasFruits = fs.existsSync(path.join(slotPath, 'densityMap_fruits.gdm'));
        const remainingFiles = await fs.readdir(slotPath);
        for (const file of remainingFiles) {
            const lower = file.toLowerCase();
            const isStaleGrowth = (!hasFruits && lower.endsWith('growthstate.xml')) || lower === 'densitymapheight.xml' || lower === 'densitymap_height.gdm' || lower.includes('broken14');
            const isPf = lower.startsWith('precisionfarming') && !finalMods.some(m => (m?.modName || '').toLowerCase().includes('precisionfarming'));
            if (isStaleGrowth || isPf) {
                await fs.remove(path.join(slotPath, file)).catch(() => {});
            }
        }

        // Ensure careerSavegame.xml density map revisions are consistent.
        const finalCareerPath = path.join(slotPath, 'careerSavegame.xml');
        if (fs.existsSync(finalCareerPath)) {
            let fcXml = await fs.readFile(finalCareerPath, 'utf8');
            let mapRev = '1';
            if (modZipPath && fs.existsSync(modZipPath)) {
                try {
                    const AdmZip = require('adm-zip');
                    const zip = new AdmZip(modZipPath);
                    const mapEntry = zip.getEntries().find(e => {
                        const norm = e.entryName.toLowerCase();
                        return norm.endsWith('.xml') && !norm.includes('sound') && !norm.includes('moddesc') && (
                            norm.endsWith('map.xml') || norm.endsWith('mapeu.xml') || norm.endsWith('mapus.xml') || 
                            norm.endsWith('mapas.xml') || norm.includes('map')
                        );
                    });
                    if (mapEntry) {
                        const xml = mapEntry.getData().toString('utf8');
                        const m = xml.match(/<densityMap\s+[^>]*revision=["'](\d+)["']/i);
                        if (m) mapRev = m[1];
                    }
                } catch (_) {}
            }

            const revisionTags = [
                ['terrainTextureRevision', '1'],
                ['terrainLodTextureRevision', '2'],
                ['splitShapesRevision', '2'],
                ['tipCollisionRevision', '2'],
                ['placementCollisionRevision', '2'],
                ['navigationCollisionRevision', '2'],
                ['mapDensityMapRevision', mapRev || '1'],
                ['mapTerrainTextureRevision', '1'],
                ['mapTerrainLodTextureRevision', '1'],
                ['mapSplitShapesRevision', '1'],
                ['mapTipCollisionRevision', '1'],
                ['mapPlacementCollisionRevision', '1'],
                ['mapNavigationCollisionRevision', '1']
            ];
            if (isOfficialBaseMap || hasFruitsGdm) {
                revisionTags.unshift(['densityMapRevision', isOfficialBaseMap ? '4' : (mapRev || '1')]);
            }

            for (const [tag, val] of revisionTags) {
                const tagRegex = new RegExp(`<${tag}>.*?<\\/${tag}>`, 'i');
                if (tagRegex.test(fcXml)) {
                    fcXml = fcXml.replace(tagRegex, `<${tag}>${val}</${tag}>`);
                } else {
                    fcXml = fcXml.replace(/<settings>/i, `<settings>\n        <${tag}>${val}</${tag}>`);
                }
            }
            await fs.writeFile(finalCareerPath, fcXml, 'utf8');
        }
    } catch (_) {}

    return { success: true, path: slotPath, requiresEngineInit, mapId };
}

/**
 * Synchronize and apply weather states cleanly to an environment object
 */
function applyWeatherToEnvironment(env, weatherType) {
    if (!env) return;
    if (!env.weather) env.weather = {};
    const w = env.weather;
    const curDay = parseInt(env.currentDay) || 6;
    const normType = (weatherType || 'SUN').toUpperCase();

    if (!w.ground) w.ground = {};
    if (!w.twister) w.twister = { '@_position': '0.00 0.00 0.00', '@_isSpawned': 'false' };

    if (normType === 'RAIN') {
        w['@_timeSinceLastRain'] = '0';
        w.ground['@_wetness'] = '1.000000';
    } else if (normType === 'CLOUDY') {
        w['@_timeSinceLastRain'] = String(Math.max(12, parseInt(w['@_timeSinceLastRain'] || 12)));
        w.ground['@_wetness'] = '0.000000';
    } else { // SUN
        w['@_timeSinceLastRain'] = String(Math.max(24, parseInt(w['@_timeSinceLastRain'] || 24)));
        w.ground['@_wetness'] = '0.000000';
    }

    if (w.forecast && w.forecast.instance) {
        const instances = Array.isArray(w.forecast.instance) ? w.forecast.instance : [w.forecast.instance];
        if (instances.length > 0) {
            instances[0]['@_typeName'] = normType;
            if (instances.length > 1 && normType === 'SUN') {
                instances[1]['@_typeName'] = 'SUN';
            }
        }
    } else {
        w.forecast = {
            instance: [
                {
                    '@_typeName': normType,
                    '@_season': 'SUMMER',
                    '@_variationIndex': '1',
                    '@_startDay': String(curDay),
                    '@_startDayTime': '28800000',
                    '@_duration': '39600000'
                },
                {
                    '@_typeName': normType === 'RAIN' ? 'CLOUDY' : 'SUN',
                    '@_season': 'SUMMER',
                    '@_variationIndex': '2',
                    '@_startDay': String(curDay),
                    '@_startDayTime': '68400000',
                    '@_duration': '18000000'
                }
            ]
        };
    }
}

/**
 * Surgical attribute update for a savegame XML
 */
async function updateSavegameAttribute(savePath, fileType, attribute, value) {
    // Audio settings are global (not per-savegame) — write to gameSettings.xml / game.xml
    if (fileType === 'audio') {
        const fs25Path = getFs25Path();
        const floatVal = parseFloat(value);
        try {
            if (attribute === 'masterVolume') {
                // master volume is in game.xml as <audio volume="x.xx"/>
                const gamePath = path.join(fs25Path, 'game.xml');
                if (fs.existsSync(gamePath)) {
                    let gameXml = await fs.readFile(gamePath, 'utf8');
                    // Use regex to safely replace the volume attribute in the <audio> tag
                    gameXml = gameXml.replace(/(<audio\s[^>]*volume=")[^"]*(")/,
                        `$1${floatVal.toFixed(6)}$2`);
                    await fs.writeFile(gamePath, gameXml);
                }
            } else {
                // All other volumes go into gameSettings.xml <volume> section
                const gsPath = path.join(fs25Path, 'gameSettings.xml');
                if (fs.existsSync(gsPath)) {
                    let gsXml = await fs.readFile(gsPath, 'utf8');
                    const volKey = {
                        vehicleVolume: 'vehicle',
                        environmentVolume: 'environment',
                        musicVolume: 'music',
                        radioVolume: 'radio',
                        guiVolume: 'gui',
                        voiceVolume: 'voice',
                    }[attribute];
                    if (volKey) {
                        const regex = new RegExp(`<${volKey}>[^<]*</${volKey}>`, 'i');
                        if (regex.test(gsXml)) {
                            gsXml = gsXml.replace(regex, `<${volKey}>${floatVal.toFixed(6)}</${volKey}>`);
                        } else if (gsXml.includes('<volume>')) {
                            gsXml = gsXml.replace('<volume>', `<volume>\n        <${volKey}>${floatVal.toFixed(6)}</${volKey}>`);
                        }
                        await fs.writeFile(gsPath, gsXml, 'utf8');
                    }
                }
            }
            return { success: true };
        } catch(e) {
            return { success: false, error: e.message };
        }
    }

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
        else if (attribute === 'growthMode') settings.growthMode = stringValue;
        else if (attribute === 'fixedSeasonalVisuals') settings.fixedSeasonalVisuals = stringValue;
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
    } else if (fileType === 'environment') {
        if (!data.environment) data.environment = {};
        const env = data.environment;
        if (attribute === 'currentPeriod') {
            const pNum = Math.max(1, Math.min(12, parseInt(value) || 1));
            env.currentPeriod = String(pNum);
            const dpp = parseInt(env.daysPerPeriod) || 1;
            const newDay = (pNum - 1) * dpp + 1;
            env.currentDay = String(newDay);
            env.currentMonotonicDay = String(newDay);

            if (env.weather?.forecast?.instance) {
                const instances = Array.isArray(env.weather.forecast.instance) 
                    ? env.weather.forecast.instance 
                    : [env.weather.forecast.instance];
                if (instances.length > 0) {
                    const oldFirstDay = parseInt(instances[0]['@_startDay']) || newDay;
                    const diff = newDay - oldFirstDay;
                    for (const inst of instances) {
                        const cur = parseInt(inst['@_startDay']) || oldFirstDay;
                        inst['@_startDay'] = String(cur + diff);
                    }
                }
            }
        } else if (attribute === 'daysPerPeriod') {
            env.daysPerPeriod = stringValue;
        } else if (attribute === 'dayTime') {
            let minutes = 480;
            if (typeof value === 'string' && value.includes(':')) {
                const [h, m] = value.split(':').map(Number);
                minutes = (h || 0) * 60 + (m || 0);
            } else {
                minutes = parseFloat(value) || 480;
            }
            env.dayTime = Number(minutes).toFixed(6);
            env.time = Number(minutes).toFixed(6);
        } else if (attribute === 'weather') {
            applyWeatherToEnvironment(env, String(value));
        }
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
    await restoreStashedSinglePlayerSaves().catch(err => console.error('[SAVEGAMES] Auto-restore stashed saves failed:', err));
    const fs25Path = getFs25Path();
    const savegames = [];
    debugLog(`[SAVEGAMES] Scanning slots 1-20 in ${fs25Path}...`);
    for (let i = 1; i <= 20; i++) {
        try {
            const savePath = path.join(fs25Path, `savegame${i}`);
            if (!fs.existsSync(savePath) || !fs.existsSync(path.join(savePath, 'careerSavegame.xml'))) continue;

            const xml = await fs.readFile(path.join(savePath, 'careerSavegame.xml'), 'utf8');
            const data = parser.parse(xml);
            if (!data || !data.careerSavegame) continue;
            if (data.careerSavegame['@_valid'] === 'false' || data.careerSavegame['@_valid'] === false) {
                debugLog(`[SAVEGAMES] Slot ${i} has valid="false", skipping empty/deleted slot.`);
                continue;
            }
            debugLog(`[SAVEGAMES] Found slot ${i}: size=${xml.length} bytes`);
            const settings = data.careerSavegame.settings || {};
            const stats = data.careerSavegame.statistics || {};

            // Read global gameSettings.xml and game.xml for audio volumes
            let masterVolume = 1.0;
            let vehicleVolume = 1.0;
            let environmentVolume = 0.7;
            let musicVolume = 0.0;
            let radioVolume = 1.0;
            let guiVolume = 0.0;
            let voiceVolume = 1.0;
            let isRadioEnabled = true;
            let radioVehicleOnly = false;
            try {
                const gameSettingsPath = path.join(fs25Path, 'gameSettings.xml');
                if (fs.existsSync(gameSettingsPath)) {
                    const gsXml = await fs.readFile(gameSettingsPath, 'utf8');
                    const gsData = parser.parse(gsXml);
                    const gs = gsData.gameSettings || {};
                    const vol = gs.volume || {};
                    vehicleVolume = parseFloat(vol.vehicle ?? 1.0);
                    environmentVolume = parseFloat(vol.environment ?? 0.7);
                    musicVolume = parseFloat(vol.music ?? 0.0);
                    radioVolume = parseFloat(vol.radio ?? 1.0);
                    guiVolume = parseFloat(vol.gui ?? 0.0);
                    voiceVolume = parseFloat(vol.voice ?? 1.0);
                    isRadioEnabled = gs.radioIsActive !== 'false' && gs.radioIsActive !== false;
                    radioVehicleOnly = gs.radioVehicleOnly === 'true' || gs.radioVehicleOnly === true;
                }
                const gamePath = path.join(fs25Path, 'game.xml');
                if (fs.existsSync(gamePath)) {
                    const gameXml = await fs.readFile(gamePath, 'utf8');
                    const gameData = parser.parse(gameXml);
                    const audio = gameData?.gameProfile?.audio || gameData?.game?.audio || gameData?.audio || null;
                    if (audio) {
                        masterVolume = parseFloat(audio['@_volume'] ?? audio.volume ?? 1.0);
                    }
                }
            } catch(e) {
                debugLog('[SAVEGAMES] Could not read audio settings:', e.message);
            }


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
            // Must have core files AND genuine engine data (densityMap_fruits.gdm, densityMap_ground.gdm, or guidedTour.xml)
            const hasEngineData = fs.existsSync(path.join(savePath, 'densityMap_fruits.gdm')) ||
                                  fs.existsSync(path.join(savePath, 'densityMap_ground.gdm')) ||
                                  fs.existsSync(path.join(savePath, 'guidedTour.xml'));
            const isInitialized = fs.existsSync(farmsFile) && fs.existsSync(initFile) && fs.existsSync(placeablesFile) && hasEngineData;

            // Auto-harvest requires genuine gameplay engine generation (fruit/ground density map)
            const canAutoHarvest = isInitialized && (fs.existsSync(path.join(savePath, 'densityMap_fruits.gdm')) || fs.existsSync(path.join(savePath, 'densityMap_ground.gdm')));

            let hasTemplate = false;
            try {
                hasTemplate = await hasMapTemplate(mapId, mapTitle, mapModName);
            } catch (e) {
                console.error('[SAVEGAMES] Failed to check template for', mapId, e);
            }

            // Read environment.xml for accurate current month, day, time, and weather
            let currentPeriod = 6;
            let currentDay = 6;
            let dayTime = 480;
            let formattedTime = '08:00';
            let currentWeather = 'SUN';
            const envFile = path.join(savePath, 'environment.xml');
            if (fs.existsSync(envFile)) {
                try {
                    const eXml = await fs.readFile(envFile, 'utf8');
                    const eData = parser.parse(eXml);
                    const env = eData?.environment;
                    if (env) {
                        currentDay = parseInt(env.currentDay) || 1;
                        const dpp = parseInt(env.daysPerPeriod) || parseInt(settings['@_plannedDaysPerPeriod'] || settings.plannedDaysPerPeriod) || 1;
                        if (env.currentPeriod) {
                            currentPeriod = parseInt(env.currentPeriod);
                        } else {
                            currentPeriod = Math.floor((currentDay - 1) / dpp) + 1;
                            if (currentPeriod > 12) currentPeriod = ((currentPeriod - 1) % 12) + 1;
                        }
                        dayTime = parseFloat(env.dayTime != null ? env.dayTime : env.time) || 480;
                        const hrs = Math.floor(dayTime / 60) % 24;
                        const mins = Math.floor(dayTime % 60);
                        formattedTime = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
                        
                        const forecast = env.weather?.forecast?.instance;
                        const instances = Array.isArray(forecast) ? forecast : (forecast ? [forecast] : []);
                        const activeInst = instances.find(inst => {
                            const sDay = parseInt(inst['@_startDay']);
                            const sTime = parseFloat(inst['@_startDayTime']) / 60000;
                            const dur = parseFloat(inst['@_duration']) / 60000;
                            return sDay === currentDay && dayTime >= sTime && dayTime < (sTime + dur);
                        }) || instances[0];
                        if (activeInst && activeInst['@_typeName']) {
                            currentWeather = activeInst['@_typeName'].toUpperCase();
                        }
                    }
                } catch (e) {}
            }

            // Read server metadata if this is a multiplayer server save
            let serverMeta = null;
            const serverMetaPath = path.join(savePath, 'server_meta.json');
            if (fs.existsSync(serverMetaPath)) {
                try {
                    serverMeta = await fs.readJson(serverMetaPath);
                    // Auto-heal local host saves: host on their own machine always has admin rights
                    if (serverMeta && serverMeta.accessLevel === 'player' && !serverMeta.isImportedPlayerZip) {
                        serverMeta.accessLevel = 'admin';
                        serverMeta.isLocked = false;
                        try { fs.writeJsonSync(serverMetaPath, serverMeta, { spaces: 2 }); } catch (e) {}
                    }
                } catch (e) {
                    debugLog('[SAVEGAMES] Error reading server_meta.json: ' + e.message);
                }
            }

            savegames.push({
                index: i,
                folderName: `savegame${i}`,
                path: savePath,
                farmName: settings['@_savegameName'] || settings.savegameName || 'Unnamed Farm',
                playerName: settings['@_playerName'] || settings.playerName || 'Farmer',
                mapId,
                mapTitle,
                isInitialized,
                hasTemplate,
                isGhost: !hasTemplate && !isInitialized,
                isServerSave: !!serverMeta,
                serverAccessLevel: serverMeta?.accessLevel || (serverMeta ? 'admin' : null),
                isEditorLocked: serverMeta ? (serverMeta.accessLevel === 'player' || serverMeta.isLocked === true) : false,
                serverName: serverMeta?.serverName || null,
                serverModUrl: serverMeta?.serverModUrl || null,
                serverExportedAt: serverMeta?.exportedAt || null,
                money: parseFloat(stats?.['@_money'] || stats?.money || 0),
                playTime: parseFloat(stats?.['@_playTime'] || stats?.playTime || 0),
                lastSaveDate: settings['@_saveDateFormatted'] || settings.saveDateFormatted,
                modCount: (Array.isArray(data.careerSavegame.mod) ? data.careerSavegame.mod : (data.careerSavegame.mod ? [data.careerSavegame.mod] : (data.careerSavegame.mods?.mod || [])))
                    .filter(m => !['fs25_rememberpositions', 'fs25_storedeliveries', 'fs25_managerpersistencebridge', 'fs25_quietloadingscreen', 'fs25_mtradiomanager'].includes((m['@_modName'] || m.modName || '').toLowerCase())).length,
                // Add more settings for the editor
                economicDifficulty: settings['@_economicDifficulty'] || settings.economicDifficulty,
                autoSaveInterval: settings['@_autoSaveInterval'] || settings.autoSaveInterval,
                timeScale: settings['@_timeScale'] || settings.timeScale,
                currentPeriod: currentPeriod || 6,
                currentDay: currentDay || 6,
                dayTime: dayTime != null ? dayTime : 480,
                formattedTime: formattedTime || '08:00',
                weather: currentWeather,
                plannedDaysPerPeriod: settings['@_plannedDaysPerPeriod'] || settings.plannedDaysPerPeriod,
                growthMode: settings['@_growthMode'] || settings.growthMode || 'SEASONAL',
                fixedSeasonalVisuals: settings['@_fixedSeasonalVisuals'] || settings.fixedSeasonalVisuals || 'OFF',
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
                // Audio settings (from global gameSettings.xml / game.xml)
                masterVolume,
                vehicleVolume,
                environmentVolume,
                musicVolume,
                radioVolume,
                guiVolume,
                voiceVolume,
                isRadioEnabled,
                radioVehicleOnly,
                mods: (Array.isArray(data.careerSavegame.mod) ? data.careerSavegame.mod : (data.careerSavegame.mod ? [data.careerSavegame.mod] : (data.careerSavegame.mods?.mod || [])))
                    .filter(m => !['fs25_rememberpositions', 'fs25_storedeliveries', 'fs25_managerpersistencebridge', 'fs25_quietloadingscreen', 'fs25_mtradiomanager'].includes((m['@_modName'] || m.modName || '').toLowerCase()))
                    .map(m => ({
                        modName: m['@_modName'] || m.modName,
                        title: m['@_title'] || m.title,
                        version: m['@_version'] || m.version
                    }))
            });
        } catch (slotErr) {
            console.error(`[SAVEGAMES] Error scanning savegame slot ${i}:`, slotErr);
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

async function exportSavegame(savePath, targetZipPath) {
    const AdmZip = require('adm-zip');
    try {
        if (!fs.existsSync(savePath)) {
            throw new Error(`Savegame folder not found: ${savePath}`);
        }
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(careerPath)) {
            throw new Error('Savegame is missing careerSavegame.xml');
        }

        const zip = new AdmZip();
        zip.addLocalFolder(savePath);
        
        await fs.ensureDir(path.dirname(targetZipPath));
        zip.writeZip(targetZipPath);

        console.log(`[EXPORT] Successfully exported savegame from ${savePath} to ${targetZipPath}`);
        return { success: true, filePath: targetZipPath };
    } catch (err) {
        console.error('[EXPORT] Failed to export savegame:', err);
        return { success: false, error: err.message };
    }
}

async function renameSavegame(savePath, newName) {
    const careerPath = path.join(savePath, 'careerSavegame.xml');
    if (!fs.existsSync(careerPath)) return { success: false, error: 'careerSavegame.xml not found' };
    
    return updateSavegameAttribute(savePath, 'career', 'savegameName', newName);
}

function removeSlotFromVdf(vdfContent, slotIndex) {
    if (!vdfContent || !slotIndex) return vdfContent;
    const lines = vdfContent.split(/\r?\n/);
    const result = [];
    let skipping = false;
    let skipDepth = 0;
    const targetPrefixes = [
        `"FarmingSimulator2025/savegame${slotIndex}/`,
        `"savegame${slotIndex}/`,
        `"FarmingSimulator2022/savegame${slotIndex}/`
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!skipping) {
            if (targetPrefixes.some(prefix => trimmed.startsWith(prefix))) {
                skipping = true;
                skipDepth = 0;
                continue;
            }
            result.push(line);
        } else {
            if (trimmed === '{') {
                skipDepth++;
            } else if (trimmed === '}') {
                skipDepth--;
                if (skipDepth <= 0) {
                    skipping = false;
                }
            }
        }
    }
    return result.join('\n');
}

async function cleanSteamRemoteCacheForSlot(slotIndex) {
    if (!slotIndex) return;
    try {
        const steamPaths = [
            'C:\\Program Files (x86)\\Steam\\userdata',
            'C:\\Program Files\\Steam\\userdata'
        ];
        try {
            const { execSync } = require('child_process');
            const regOut = execSync('reg query "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v "SteamPath" 2>nul').toString();
            const match = regOut.match(/SteamPath\s+REG_SZ\s+(.*)/i);
            if (match && match[1]) {
                const regSteamUserdata = path.join(match[1].trim(), 'userdata');
                if (!steamPaths.includes(regSteamUserdata)) {
                    steamPaths.unshift(regSteamUserdata);
                }
            }
        } catch (_) {}

        const appIds = ['2621490', '2300320'];

        for (const basePath of steamPaths) {
            if (!fs.existsSync(basePath)) continue;
            const accounts = await fs.readdir(basePath);
            for (const acc of accounts) {
                for (const appId of appIds) {
                    const vdfPath = path.join(basePath, acc, appId, 'remotecache.vdf');
                    if (fs.existsSync(vdfPath)) {
                        try {
                            const content = await fs.readFile(vdfPath, 'utf8');
                            if (content.includes(`savegame${slotIndex}/`)) {
                                const cleaned = removeSlotFromVdf(content, slotIndex);
                                await fs.writeFile(vdfPath, cleaned, 'utf8');
                                console.log(`[STEAM-CLOUD] Removed savegame${slotIndex} entries from Steam remotecache.vdf (app ${appId}): ${vdfPath}`);
                            }
                        } catch (e) {
                            console.warn(`[STEAM-CLOUD] Could not clean remotecache for account ${acc} app ${appId}:`, e.message);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[STEAM-CLOUD] Error scanning userdata for remotecache cleanup:', err.message);
    }
}

async function deleteSavegame(target) {
    let savePath = typeof target === 'object' ? (target?.path || '') : String(target || '');
    let slotIndex = typeof target === 'object' ? target?.slotIndex : null;

    if (!slotIndex) {
        const match = savePath.match(/savegame(\d+)/i);
        if (match) slotIndex = match[1];
        else if (/^\d+$/.test(savePath.trim())) slotIndex = savePath.trim();
    }

    const fs25Path = getFs25Path();
    if (slotIndex && (!savePath || !path.isAbsolute(savePath))) {
        savePath = path.join(fs25Path, `savegame${slotIndex}`);
    }
    if (savePath) {
        savePath = path.resolve(savePath);
    }

    // 1. Steam Cloud sync prevention: Clean up entries from Steam's remotecache.vdf
    if (slotIndex) {
        await cleanSteamRemoteCacheForSlot(slotIndex);
    }

    // 2. Clean up stashed Single Player save if present
    if (slotIndex) {
        try {
            const stashedSlot = path.join(fs25Path, 'stashed_sp_saves', `savegame${slotIndex}`);
            if (fs.existsSync(stashedSlot)) {
                await fs.remove(stashedSlot);
                console.log(`[SAVEGAMES] Cleaned up stashed save for slot ${slotIndex}`);
            }
        } catch (e) {
            console.warn(`[SAVEGAMES] Note: Stashed save cleanup for slot ${slotIndex}:`, e.message);
        }
    }

    // 3. Fast cleanup: Remove virtual active mods staging directory for this slot
    if (slotIndex) {
        try {
            const fs25DataRoot = pathProvider.getFS25DataRoot();
            const primaryVirtualDir = path.join(fs25DataRoot, '.fs25_virtual_mods', `VirtualActiveMods_Savegame${slotIndex}`);
            if (fs.existsSync(primaryVirtualDir)) {
                await fs.remove(primaryVirtualDir).catch(() => {});
            }
        } catch (e) {
            console.warn(`[SAVEGAMES] Note: Virtual folder cleanup for slot ${slotIndex}:`, e.message);
        }
    }

    // If folder does not exist on disk, we have already cleaned up Steam cache and stashed saves, so return success
    if (!savePath || !fs.existsSync(savePath)) {
        return { success: true };
    }

    // 4. Mark careerSavegame.xml as invalid tombstone first so any pending sync treats it as empty
    try {
        const careerFile = path.join(savePath, 'careerSavegame.xml');
        if (fs.existsSync(careerFile)) {
            await fs.writeFile(careerFile, '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<careerSavegame revision="2" valid="false"/>\n', 'utf8');
        }
    } catch (_) {}

    // 5. Remove the savegame directory from disk
    let retries = 5;
    let deleted = false;
    while (retries > 0) {
        try {
            await fs.remove(savePath);
            deleted = true;
            break;
        } catch (err) {
            retries--;
            if (retries === 0) {
                console.error(`[SAVEGAMES] Error deleting savegame at ${savePath}: ${err.message}. Attempting inner file cleanup fallback...`);
                // Fallback: If folder is locked by OS/Cloud sync, delete inner files first
                try {
                    const files = await fs.readdir(savePath);
                    for (const file of files) {
                        await fs.remove(path.join(savePath, file)).catch(() => {});
                    }
                    await fs.remove(savePath).catch(() => {});
                    deleted = true;
                } catch (fallbackErr) {
                    return { success: false, error: `File locked by OS or cloud sync: ${err.message}` };
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
    }

    return { success: deleted };
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

async function cleanInternalHelperModsFromSavegame(savePath) {
    try {
        const fs = require('fs');
        const path = require('path');
        const xmlPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(xmlPath)) return;
        
        let xmlData = fs.readFileSync(xmlPath, 'utf8');
        const modRegex = /<mod\s+[^>]*modName=["']([^"']+)["'][^>]*\/>\r?\n?/gi;
        let modified = false;

        xmlData = xmlData.replace(modRegex, (match, modName) => {
            const mLow = (modName || '').toLowerCase();
            if (INTERNAL_HELPER_MODS.includes(mLow) || INCOMPATIBLE_ENGINE_MODS.has(mLow)) {
                modified = true;
                return '';
            }
            return match;
        });

        if (modified) {
            fs.writeFileSync(xmlPath, xmlData, 'utf8');
            console.log(`[CLEANUP] Stripped internal helper mods from careerSavegame.xml in ${savePath}`);
        }
    } catch (e) {
        console.error('[CLEANUP] Failed to strip internal helper mods:', e.message);
    }
}

async function cleanupBridgeModFromSavegame(savePath) {
    return cleanInternalHelperModsFromSavegame(savePath);
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

async function repairSavegameMapId(savePath) {
    try {
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(careerPath)) return;
        const xmlContent = fs.readFileSync(careerPath, 'utf8');
        const { XMLParser, XMLBuilder } = require('fast-xml-parser');
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false, allowBooleanAttributes: true });
        const obj = parser.parse(xmlContent);
        if (!obj?.careerSavegame?.settings) return;

        const currentMapId = obj.careerSavegame.settings.mapId || '';
        const rawMods = obj.careerSavegame.mod;
        const modsList = Array.isArray(rawMods) ? rawMods : (rawMods ? [rawMods] : []);

        const modManager = require('./modManager');
        const { mods: allMods } = await modManager.scanLocalMods();

        let customMapMod = null;
        for (const mEntry of modsList) {
            const mName = mEntry['@_modName'];
            if (!mName) continue;
            const found = allMods.find(m => (m.modName || '').toLowerCase() === mName.toLowerCase() && m.isMap);
            if (found) {
                customMapMod = found;
                break;
            }
        }

        if (!customMapMod) {
            for (const mEntry of modsList) {
                const mName = mEntry['@_modName'];
                if (!mName) continue;
                if (!['MapUS', 'MapEU', 'MapAS', 'FS25_QuietLoadingScreen', 'FS25_MTRadioManager', 'FS25_storeDeliveries'].includes(mName)) {
                    const found = allMods.find(m => (m.modName || '').toLowerCase() === mName.toLowerCase());
                    if (found && (found.isMap || found.mapId)) {
                        customMapMod = found;
                        break;
                    }
                }
            }
        }

        if (customMapMod) {
            const mapModName = customMapMod.modName;
            const officialIds = ['mapus', 'mapeu', 'mapas', 'pdlc_highlandsfishingpack.highlandsfishingmap'];
            const curLow = (currentMapId || '').toLowerCase();

            // If careerSavegame.xml currently points to an official base map ID (like MapUS) BUT this save belongs to a custom map mod!
            if (officialIds.includes(curLow) || !currentMapId.startsWith(mapModName + '.')) {
                let internalId = customMapMod.mapId || 'mapUS';
                if (internalId.startsWith(mapModName + '.')) {
                    internalId = internalId.substring(mapModName.length + 1);
                }
                const correctEngineMapId = `${mapModName}.${internalId}`;

                console.log(`[MAP-REPAIR] Repairing mapId in ${path.basename(savePath)}: "${currentMapId}" -> "${correctEngineMapId}" for custom map ${mapModName}`);

                obj.careerSavegame.settings.mapId = correctEngineMapId;
                if (customMapMod.title) {
                    obj.careerSavegame.settings.mapTitle = customMapMod.title;
                }

                // If Riverbend/Zielonka spawn coordinates were mistakenly set on this custom map, clear them so engine uses custom map spawn
                if (obj.careerSavegame.player) {
                    const posX = obj.careerSavegame.player['@_spawnPositionX'];
                    if (posX === '-128.000' || posX === '-263.000' || posX === '-528.800') {
                        delete obj.careerSavegame.player['@_spawnPositionX'];
                        delete obj.careerSavegame.player['@_spawnPositionY'];
                        delete obj.careerSavegame.player['@_spawnPositionZ'];
                    }
                }

                delete obj['?xml'];
                const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressBooleanAttributes: false, suppressEmptyNode: true });
                const updatedXml = builder.build(obj);
                fs.writeFileSync(careerPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + updatedXml, 'utf8');
                console.log(`[MAP-REPAIR] Successfully repaired ${path.basename(savePath)}!`);
            }
        }
    } catch (err) {
        console.warn(`[MAP-REPAIR] Could not repair savegame mapId for ${savePath}:`, err.message);
    }
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
        
        // NOTE: Do NOT read spawn from template's careerSavegame.xml player tag or players.xml —
        // those reflect wherever the player last saved (e.g. inside a vehicle), not the map's
        // true default start. Use hardcoded official-map defaults below, or read from the map files.

        if (!mapModName || isOfficialMap(mapModName) || isOfficialMap(mapId)) {
            if (mapId === 'MapUS' || mapTitle === 'Riverbend Springs') {
                return { x: -128.0, y: 49.2, z: -162.0 };
            } else if (mapId === 'MapEU' || mapTitle === 'Zielonka') {
                return { x: -263.0, y: 60.0, z: 44.0 };
            } else if (mapId === 'MapAS' || mapTitle === 'Hutan Pantai') {
                return { x: -528.8, y: 19.8, z: -61.1 };
            } else if (mapId === 'pdlc_highlandsFishingPack.HighlandsFishingMap' || (mapId || '').toLowerCase().includes('highlandsfishing') || (mapTitle || '').toLowerCase() === 'kinlaig') {
                return { x: -896.0, y: 135.7, z: 190.0 };
            }
        }

        // Fallback: parse map mod zip itself for careerStartPoint
        if (mapModName) {
            const modManager = require('./modManager');
            const modsPaths = modManager.getModsPaths();
            let modZip = null;
            for (const root of modsPaths) {
                if (!fs.existsSync(root)) continue;
                const directP = path.join(root, `${mapModName}.zip`);
                if (fs.existsSync(directP)) { modZip = directP; break; }
                try {
                    const subDirs = fs.readdirSync(root);
                    for (const sub of subDirs) {
                        const subP = path.join(root, sub);
                        if (fs.existsSync(subP) && fs.statSync(subP).isDirectory()) {
                            const nestedP = path.join(subP, `${mapModName}.zip`);
                            if (fs.existsSync(nestedP)) { modZip = nestedP; break; }
                        }
                    }
                } catch (_) {}
                if (modZip) break;
            }

            if (modZip && fs.existsSync(modZip)) {
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

        // Fallback: parse vehicles.xml in savePath to spawn at player's starter vehicle / farm
        const vehiclesPath = path.join(savePath, 'vehicles.xml');
        if (fs.existsSync(vehiclesPath)) {
            try {
                const vXml = fs.readFileSync(vehiclesPath, 'utf8');
                const vMatch = vXml.match(/<vehicle\s+[^>]*farmId=["']1["'][^>]*position=["']([^"']+)["']/i) ||
                               vXml.match(/<vehicle\s+[^>]*position=["']([^"']+)["'][^>]*farmId=["']1["']/i) ||
                               vXml.match(/position=["']([^"']+)["'][^>]*propertyState=["']1["']/i) ||
                               vXml.match(/<vehicle\s+[^>]*position=["']([^"']+)["']/i);
                if (vMatch && vMatch[1]) {
                    const vCoords = vMatch[1].trim().split(/\s+/).map(parseFloat);
                    if (vCoords.length >= 3 && !isNaN(vCoords[0])) {
                        return { x: parseFloat((vCoords[0] + 2.0).toFixed(3)), y: parseFloat(vCoords[1].toFixed(3)), z: parseFloat((vCoords[2] + 2.0).toFixed(3)) };
                    }
                }
            } catch (_) {}
        }

        // Fallback: parse placeables.xml in savePath for farm building spawn
        const placeablesPath = path.join(savePath, 'placeables.xml');
        if (fs.existsSync(placeablesPath)) {
            try {
                const pXml = fs.readFileSync(placeablesPath, 'utf8');
                const pMatch = pXml.match(/<placeable\s+[^>]*farmId=["']1["'][^>]*position=["']([^"']+)["']/i) ||
                               pXml.match(/<placeable\s+[^>]*position=["']([^"']+)["'][^>]*farmId=["']1["']/i);
                if (pMatch && pMatch[1]) {
                    const pCoords = pMatch[1].trim().split(/\s+/).map(parseFloat);
                    if (pCoords.length >= 3 && !isNaN(pCoords[0])) {
                        return { x: parseFloat((pCoords[0] + 3.0).toFixed(3)), y: parseFloat(pCoords[1].toFixed(3)), z: parseFloat((pCoords[2] + 3.0).toFixed(3)) };
                    }
                }
            } catch (_) {}
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
                        const installedDep = allMods.find(m => dependencyResolver.matchModWithDependency(m, dep));
                        if (installedDep) {
                            const depStrMatch = typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || '');
                            // REMOVED DESTRUCTIVE FILE RENAMING BLOCK HERE. The Virtual Folder 
                            // transparently symlinks `m.modName.zip` so renaming the physical file is unnecessary.
                            
                            const alreadySelected = mods.find(m => m['@_modName'] === installedDep.modName);
                            if (!alreadySelected) {
                                console.log(`[AUTO-INJECT] Injecting dependency: ${installedDep.title} (required by ${selMod['@_title'] || selMod['@_modName']})`);
                                mods.push({
                                    '@_modName': installedDep.modName,
                                    '@_title': String(installedDep.title || '').replace(/"/g, '&quot;'),
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

async function _legacyCleanupBridgeModFromSavegame(savePath) {
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

/**
 * Reliably finds the map mod object corresponding to a savegame from careerSavegame.xml data.
 */
function findMapModInSavegame(xmlData, localMods = []) {
    if (!xmlData || !localMods || localMods.length === 0) return null;

    // 1. Check <careerSavegame><mod modName="..." .../></careerSavegame> list
    // In FS25, every mod map is recorded as an active mod tag in careerSavegame.xml
    const modMatches = [...xmlData.matchAll(/<mod\s+[^>]*modName=["']([^"']+)["']/gi)];
    const saveModNames = modMatches.map(m => m[1]);

    for (const sName of saveModNames) {
        const matched = localMods.find(m => m.isMap && m.modName && m.modName.toLowerCase() === sName.toLowerCase());
        if (matched) return matched;
    }

    // 2. Extract mapId and mapTitle from <settings>
    const mapIdMatch = xmlData.match(/<mapId[^>]*>([^<]+)<\/mapId>/i) || xmlData.match(/mapId=["']([^"']+)["']/i);
    const rawMapId = mapIdMatch ? mapIdMatch[1].trim() : null;

    // Skip default base-game maps
    if (rawMapId && (isOfficialMap(rawMapId) || ['mapus', 'mapeu', 'mapas', 'highlandsfishingmap'].includes(rawMapId.toLowerCase()))) {
        return null;
    }

    const mapTitleMatch = xmlData.match(/<mapTitle[^>]*>([^<]+)<\/mapTitle>/i) || xmlData.match(/mapTitle=["']([^"']+)["']/i);
    const rawMapTitle = mapTitleMatch ? mapTitleMatch[1].trim() : null;

    if (rawMapId) {
        // If mapId is "FS25_Courtright_Line.CourtrightLineModMap", split('.')[0] gives "FS25_Courtright_Line"
        const prefix = rawMapId.split('.')[0];
        const matchByPrefix = localMods.find(m => m.isMap && m.modName && m.modName.toLowerCase() === prefix.toLowerCase());
        if (matchByPrefix) return matchByPrefix;


    }

    if (rawMapTitle) {
        const titleLower = rawMapTitle.toLowerCase();
        const matchByTitle = localMods.find(m => m.isMap && (
            (m.title && m.title.toLowerCase() === titleLower) ||
            (m.mapTitle && m.mapTitle.toLowerCase() === titleLower)
        ));
        if (matchByTitle) return matchByTitle;
    }

    // Fallback: match by file basename or modName
    if (rawMapId) {
        const rawLower = rawMapId.toLowerCase();
        const fallbackMatch = localMods.find(m => m.isMap && (
            (m.modName && m.modName.toLowerCase() === rawLower) ||
            (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === rawLower)
        ));
        if (fallbackMatch) return fallbackMatch;
    }

    return null;
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

        // Scan local mods
        const modManager = require('./modManager');
        const { mods: localMods } = await modManager.scanLocalMods();
        if (!localMods || localMods.length === 0) return;

        // Identify the map mod using robust detection
        const mapModObj = findMapModInSavegame(xmlData, localMods);

        let modsToEnsure = [];
        const seenModNames = new Set();
        if (mapModObj && mapModObj.modName) {
            seenModNames.add(mapModObj.modName.toLowerCase());
        }

        // 1. Check if the map resides in a dedicated subfolder
        if (mapModObj && mapModObj.filePath) {
            try {
                const mapDir = path.dirname(mapModObj.filePath);
                const configuredRoots = modManager.getModsPaths().map(p => path.resolve(p).toLowerCase());
                const mapDirResolved = path.resolve(mapDir).toLowerCase();
                const parentOfMapDir = path.resolve(path.dirname(mapDir)).toLowerCase();

                // It's a dedicated subfolder if its parent is a configured root and it is not a root itself
                if (configuredRoots.includes(parentOfMapDir) && !configuredRoots.includes(mapDirResolved)) {
                    // Collect all non-map sibling mods in the subfolder
                    const siblingMods = localMods.filter(m => {
                        if (!m.filePath) return false;
                        const mDir = path.resolve(path.dirname(m.filePath)).toLowerCase();
                        if (mDir !== mapDirResolved) return false;
                        if (m.modName && m.modName.toLowerCase() === mapModObj.modName.toLowerCase()) return false;
                        // Exclude alternate map versions in same subfolder (e.g. PC vs CP)
                        if (m.isMap) return false;
                        return true;
                    });

                    // Also check physical directory for any un-indexed zip files
                    try {
                        const dirEntries = fs.readdirSync(mapDir);
                        for (const entry of dirEntries) {
                            if (!entry.toLowerCase().endsWith('.zip')) continue;
                            const sibName = entry.replace(/\.zip$/i, '');
                            if (sibName.toLowerCase() === mapModObj.modName.toLowerCase()) continue;
                            if (!siblingMods.some(s => s.modName && s.modName.toLowerCase() === sibName.toLowerCase())) {
                                const matched = localMods.find(m => m.modName && m.modName.toLowerCase() === sibName.toLowerCase());
                                if (matched && !matched.isMap) {
                                    siblingMods.push(matched);
                                } else if (!matched) {
                                    siblingMods.push({
                                        modName: sibName,
                                        title: sibName,
                                        version: '1.0.0.0',
                                        fileHash: ''
                                    });
                                }
                            }
                        }
                    } catch (dErr) {}

                    for (const sib of siblingMods) {
                        const sLow = (sib.modName || '').toLowerCase();
                        if (sLow && !seenModNames.has(sLow)) {
                            seenModNames.add(sLow);
                            modsToEnsure.push(sib);
                        }
                    }
                }
            } catch (dirErr) {
                console.warn('[SYNC-DEPS] Error checking subfolder siblings:', dirErr.message);
            }
        }

        // Auto-include non-map mods from the map's own subfolder
        const mapDepFolderMods = localMods.filter(m => !m.isMap && m.folder && (mapModObj && mapModObj.folder && m.folder.toLowerCase() === mapModObj.folder.toLowerCase() && m.folder.toLowerCase() !== 'mods'));
        for (const depMod of mapDepFolderMods) {
            if (depMod.modName) {
                const sLow = depMod.modName.toLowerCase();
                if (!seenModNames.has(sLow)) {
                    seenModNames.add(sLow);
                    modsToEnsure.push(depMod);
                }
            }
        }

        // 2. In-memory recursive resolution for declared local dependencies
        const queue = (mapModObj ? [mapModObj, ...modsToEnsure] : [...modsToEnsure]);
        while (queue.length > 0) {
            const current = queue.shift();
            if (current && current.dependencies && Array.isArray(current.dependencies) && current.dependencies.length > 0) {
                for (const dep of current.dependencies) {
                    const matchedDep = localMods.find(m => dependencyResolver.matchModWithDependency(m, dep));
                    if (matchedDep && matchedDep.modName) {
                        const dLow = matchedDep.modName.toLowerCase();
                        if (!seenModNames.has(dLow)) {
                            seenModNames.add(dLow);
                            modsToEnsure.push(matchedDep);
                            queue.push(matchedDep);
                        }
                    }
                }
            }
        }

        // Filter out any known engine-crashing/incompatible mods
        modsToEnsure = modsToEnsure.filter(m => m && m.modName && !INCOMPATIBLE_ENGINE_MODS.has(m.modName.toLowerCase()));

        if (modsToEnsure.length === 0) return;

        let mods = obj.careerSavegame.mod;
        if (!mods) mods = [];
        else if (!Array.isArray(mods)) mods = [mods];

        let modified = false;
        for (const item of modsToEnsure) {
            const hasMod = mods.some(m => m['@_modName'] && m['@_modName'].toLowerCase() === item.modName.toLowerCase());
            if (!hasMod) {
                console.log(`[SYNC-DEPS] Auto-activating required map mod/dependency in careerSavegame.xml: ${item.modName}`);
                mods.push({
                    '@_modName': item.modName,
                    '@_title': String(item.title || item.modName || '').replace(/"/g, '&quot;'),
                    '@_version': item.version || '1.0.0.0',
                    '@_required': 'true',
                    '@_fileHash': item.fileHash || ''
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
            console.log(`[SYNC-DEPS] Successfully updated careerSavegame.xml with ${modsToEnsure.length} map dependencies/siblings.`);
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

        const modManager = require('./modManager');
        const scanRes = await modManager.scanLocalMods();
        const allMods = scanRes.mods || [];

        // 1. Map mod from careerSavegame.xml
        let mapModName = null;
        let mapModObj = null;
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (fs.existsSync(careerPath)) {
            const xml = await fs.readFile(careerPath, 'utf8');
            mapModObj = findMapModInSavegame(xml, allMods);
            if (mapModObj && mapModObj.modName) {
                mapModName = mapModObj.modName;
                usedModsMap.set(mapModName.toLowerCase(), mapModName);
            } else {
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

            // If map has dedicated subfolder siblings, include them
            if (mapModObj && mapModObj.filePath) {
                try {
                    const mapDir = path.dirname(mapModObj.filePath);
                    const configuredRoots = modManager.getModsPaths().map(p => path.resolve(p).toLowerCase());
                    const mapDirResolved = path.resolve(mapDir).toLowerCase();
                    const parentOfMapDir = path.resolve(path.dirname(mapDir)).toLowerCase();

                    if (configuredRoots.includes(parentOfMapDir) && !configuredRoots.includes(mapDirResolved)) {
                        const sibs = allMods.filter(m => {
                            if (!m.filePath) return false;
                            const mDir = path.resolve(path.dirname(m.filePath)).toLowerCase();
                            return mDir === mapDirResolved && !m.isMap && m.modName && m.modName.toLowerCase() !== mapModObj.modName.toLowerCase();
                        });
                        for (const s of sibs) {
                            usedModsMap.set(s.modName.toLowerCase(), s.modName);
                        }
                    }
                } catch (subErr) {}
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

        // Always preserve core helper mods if present
        usedModsMap.set('fs25_quietloadingscreen', 'FS25_QuietLoadingScreen');
        usedModsMap.set('fs25_mtradiomanager', 'FS25_MTRadioManager');

        // 4. Resolve dependencies of used mods so required vehicle/script packs aren't broken
        try {
            let addedNew = true;
            while (addedNew) {
                addedNew = false;
                const currentUsed = Array.from(usedModsMap.keys());
                for (const uName of currentUsed) {
                    const fullMod = allMods.find(m => (m.modName || '').toLowerCase() === uName);
                    if (fullMod && fullMod.dependencies && fullMod.dependencies.length > 0) {
                        for (const dep of fullMod.dependencies) {
                            const matchedDep = allMods.find(m => dependencyResolver.matchModWithDependency(m, dep));
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
            if (!templateFolder.toLowerCase().startsWith(cleanMod.toLowerCase())) {
                templateFolder = `${cleanMod}_${templateFolder}`;
            }
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
        
        // Clean up temporary/user files in template and sanitize growth XML
        const filesToRemove = [
            'steam_autocloud.vdf', 'modManager.json', 'fieldGround.xml',
            'densityMap_fruits_growthState.xml', 'stone_growthState.xml', 'weed_growthState.xml',
            'densityMapHeight.xml'
        ];
        for (const f of filesToRemove) {
            const p = path.join(destPath, f);
            if (fs.existsSync(p)) {
                await fs.remove(p);
            }
        }
        await ensureSavegameDensityMaps(destPath);
        // Defer template ZIP compression so post-game processing finishes immediately without UI lag
        const zipPath = path.join(templatesDir, `${templateFolder}.zip`);
        setImmediate(async () => {
            try {
                const AdmZip = require('adm-zip');
                const zip = new AdmZip();
                zip.addLocalFolder(destPath);
                await new Promise((resolve, reject) => {
                    zip.writeZip(zipPath, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                const zipStats = fs.statSync(zipPath);
                console.log(`[HARVEST] Auto-compressed template "${templateFolder}" to ${path.basename(zipPath)} (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`);
                await fs.remove(destPath);
            } catch (zErr) {
                console.warn(`[HARVEST] Could not compress template to .zip, keeping uncompressed folder:`, zErr.message);
            }
        });
        
        cachedMapMods = null;
        return { success: true };
    } catch (err) {
        console.error('[HARVEST] Failed to adopt template:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Reads farm permissions from farms.xml for a given savegame.
 */
async function getFarmPermissions(savePath) {
    try {
        const farmsPath = path.join(savePath, 'farms.xml');
        if (!fs.existsSync(farmsPath)) {
            return { success: false, error: 'farms.xml not found' };
        }
        const xml = await fs.readFile(farmsPath, 'utf8');
        const parsed = parser.parse(xml);
        const farms = getXMLArray(parsed, 'farms', 'farm');
        const mainFarm = farms[0] || {};
        
        const farmId = parseInt(mainFarm['@_farmId'] || 1);
        const farmName = mainFarm['@_name'] || 'My Farm';
        const loan = parseFloat(mainFarm['@_loan'] || 0);
        const money = parseFloat(mainFarm['@_money'] || 0);
        
        let players = [];
        if (mainFarm.players) {
            const raw = mainFarm.players.player;
            players = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        }

        const permKeys = [
            'buyVehicle', 'sellVehicle', 'buyPlaceable', 'sellPlaceable',
            'manageContracts', 'tradeAnimals', 'createFields', 'landscaping',
            'hireAssistant', 'resetVehicle', 'manageProductions', 'cutTrees',
            'manageRights', 'transferMoney', 'updateFarm', 'manageContracting',
            'farmManager'
        ];

        const primaryPlayer = players[0] || {};
        const permissions = {};
        for (const k of permKeys) {
            const val = primaryPlayer['@_' + k] !== undefined ? primaryPlayer['@_' + k] : primaryPlayer[k];
            permissions[k] = val !== 'false' && val !== false;
        }

        return {
            success: true,
            farmId,
            farmName,
            loan,
            money,
            permissions,
            playersCount: players.length
        };
    } catch (err) {
        console.error('[FARMS] Failed to get farm permissions:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Updates player permission flags in farms.xml for a given savegame.
 */
async function updateFarmPermissions(savePath, permissions) {
    try {
        const farmsPath = path.join(savePath, 'farms.xml');
        if (!fs.existsSync(farmsPath)) {
            return { success: false, error: 'farms.xml not found' };
        }
        const xml = await fs.readFile(farmsPath, 'utf8');
        const parsed = parser.parse(xml);
        
        if (!parsed.farms) {
            return { success: false, error: 'Invalid farms.xml structure' };
        }

        let farmsList = parsed.farms.farm;
        if (!Array.isArray(farmsList)) {
            farmsList = farmsList ? [farmsList] : [];
            parsed.farms.farm = farmsList;
        }

        if (farmsList.length === 0) {
            farmsList.push({ '@_farmId': '1', '@_name': 'My Farm', '@_money': '500000', '@_loan': '0' });
        }

        const mainFarm = farmsList[0];
        if (!mainFarm.players) {
            mainFarm.players = { player: [] };
        }
        if (!Array.isArray(mainFarm.players.player)) {
            mainFarm.players.player = mainFarm.players.player ? [mainFarm.players.player] : [];
        }
        if (mainFarm.players.player.length === 0) {
            mainFarm.players.player.push({
                '@_uniqueUserId': 'master',
                '@_farmManager': 'true',
                '@_lastNickname': 'Farm Member'
            });
        }

        // Apply permission updates to all registered players on the farm
        for (const player of mainFarm.players.player) {
            for (const [key, value] of Object.entries(permissions)) {
                player['@_' + key] = value ? 'true' : 'false';
            }
        }

        const updatedXml = builder.build(parsed);
        await fs.writeFile(farmsPath, updatedXml, 'utf8');
        console.log(`[FARMS] Successfully updated farm permissions in ${farmsPath}`);
        return { success: true };
    } catch (err) {
        console.error('[FARMS] Failed to update farm permissions:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Prepares a dedicated, isolated mod directory for a multiplayer server save.
 * Uses symlinks for matching versions from main library, preventing duplication and keeping original mods safe.
 */
async function prepareServerModsFolder(slotIndex, savePath) {
    try {
        const fs25Path = getFs25Path();
        const serverMetaPath = path.join(savePath, 'server_meta.json');
        let serverMeta = null;
        if (fs.existsSync(serverMetaPath)) {
            try {
                serverMeta = await fs.readJson(serverMetaPath);
            } catch (e) {}
        }

        const rawName = serverMeta?.serverName || `Server_Slot${slotIndex}`;
        const safeServerName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const targetFolder = path.join(fs25Path, 'mods', 'Server_Saves', `Slot_${slotIndex}_${safeServerName}`);
        await fs.ensureDir(targetFolder);

        // Get required mods from careerSavegame.xml
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(careerPath)) {
            return { success: true, targetFolder, serverMeta, linkedCount: 0 };
        }

        const xml = await fs.readFile(careerPath, 'utf8');
        const data = parser.parse(xml);
        const APP_HELPER_MODS = ['fs25_rememberpositions', 'fs25_storedeliveries', 'fs25_managerpersistencebridge', 'fs25_quietloadingscreen', 'fs25_mtradiomanager'];
        const requiredMods = (Array.isArray(data.careerSavegame?.mod) ? data.careerSavegame.mod : (data.careerSavegame?.mod ? [data.careerSavegame.mod] : (data.careerSavegame?.mods?.mod || [])))
            .filter(m => !APP_HELPER_MODS.includes((m['@_modName'] || m.modName || '').toLowerCase()))
            .map(m => ({
                modName: m['@_modName'] || m.modName,
                version: m['@_version'] || m.version
            }));

        const modManager = require('./modManager');
        const { mods: allInstalledMods } = await modManager.scanLocalMods();

        // 1. Resolve custom map mod and add to requiredMods if not present
        const mapModObj = findMapModInSavegame(xml, allInstalledMods);
        if (mapModObj && mapModObj.modName) {
            const alreadyInReq = requiredMods.some(m => (m.modName || '').toLowerCase() === mapModObj.modName.toLowerCase());
            if (!alreadyInReq) {
                requiredMods.unshift({
                    modName: mapModObj.modName,
                    version: mapModObj.version || null
                });
            }

            // Also include non-map sibling mods in map's dedicated subfolder if applicable
            if (mapModObj.filePath) {
                try {
                    const mapDir = path.dirname(mapModObj.filePath);
                    const configuredRoots = modManager.getModsPaths().map(p => path.resolve(p).toLowerCase());
                    const mapDirResolved = path.resolve(mapDir).toLowerCase();
                    const parentOfMapDir = path.resolve(path.dirname(mapDir)).toLowerCase();
                    if (configuredRoots.includes(parentOfMapDir) && !configuredRoots.includes(mapDirResolved)) {
                        const siblingMods = allInstalledMods.filter(m => {
                            if (!m.filePath) return false;
                            const mDir = path.resolve(path.dirname(m.filePath)).toLowerCase();
                            return mDir === mapDirResolved && !m.isMap && m.modName;
                        });
                        for (const sib of siblingMods) {
                            if (!requiredMods.some(m => (m.modName || '').toLowerCase() === sib.modName.toLowerCase())) {
                                requiredMods.push({
                                    modName: sib.modName,
                                    version: sib.version || null
                                });
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        // 2. Direct fallback for mapId setting (e.g. FS25_JasperRiverValley.JRV)
        const settings = data.careerSavegame?.settings || {};
        const mapIdSetting = settings.mapId || settings['@_mapId'];
        if (mapIdSetting && typeof mapIdSetting === 'string' && !isOfficialMap(mapIdSetting)) {
            const mapPrefix = mapIdSetting.includes('.') ? mapIdSetting.split('.')[0] : mapIdSetting;
            const alreadyInReq = requiredMods.some(m => (m.modName || '').toLowerCase() === mapPrefix.toLowerCase());
            if (!alreadyInReq) {
                requiredMods.unshift({
                    modName: mapPrefix,
                    version: null
                });
            }
        }

        let linkedCount = 0;
        let serverSpecificCount = 0;
        let mismatchedCount = 0;
        let missingCount = 0;

        for (const req of requiredMods) {
            const reqNameLower = (req.modName || '').toLowerCase();
            const installed = allInstalledMods.find(m => (m.modName || '').toLowerCase() === reqNameLower);
            const targetFilePath = path.join(targetFolder, `${req.modName}.zip`);

            // If a server-specific file already exists in target folder, leave it intact
            if (fs.existsSync(targetFilePath) && !fs.lstatSync(targetFilePath).isSymbolicLink()) {
                serverSpecificCount++;
                continue;
            }

            if (installed && installed.filePath && fs.existsSync(installed.filePath)) {
                const versionMatches = !req.version || !installed.version || req.version === installed.version;
                if (versionMatches) {
                    // Safe symlink to original mod in main library (or hardlink/copy fallback)
                    if (!fs.existsSync(targetFilePath)) {
                        try {
                            await fs.symlink(installed.filePath, targetFilePath, 'file');
                        } catch (symErr) {
                            try {
                                await fs.link(installed.filePath, targetFilePath);
                            } catch (linkErr) {
                                await fs.copy(installed.filePath, targetFilePath);
                            }
                        }
                    }
                    linkedCount++;
                } else {
                    mismatchedCount++;
                }
            } else {
                const internalZipPath = path.join(__dirname, '..', 'resources', 'internalMods', `${req.modName}.zip`);
                if (fs.existsSync(internalZipPath)) {
                    if (!fs.existsSync(targetFilePath)) {
                        try {
                            await fs.copy(internalZipPath, targetFilePath);
                        } catch (e) {}
                    }
                    linkedCount++;
                } else {
                    missingCount++;
                }
            }
        }

        // Copy internal companion helper mods into server isolated mods folder
        const companionMods = ['FS25_MTRadioManager.zip', 'FS25_storeDeliveries.zip', 'FS25_rememberPositions.zip', 'FS25_QuietLoadingScreen.zip'];
        for (const compMod of companionMods) {
            const internalModPath = path.join(__dirname, '..', 'resources', 'internalMods', compMod);
            if (fs.existsSync(internalModPath)) {
                const destPath = path.join(targetFolder, compMod);
                if (!fs.existsSync(destPath)) {
                    try { await fs.copy(internalModPath, destPath); } catch (e) {}
                }
            }
        }

        return {
            success: true,
            targetFolder,
            serverMeta,
            stats: {
                totalRequired: requiredMods.length,
                linkedCount,
                serverSpecificCount,
                mismatchedCount,
                missingCount
            }
        };
    } catch (err) {
        console.error('[SERVER-MODS] Failed to prepare server mods folder:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Exports a savegame as a dedicated multiplayer server pack.
 */
async function exportServerSavegame({ savePath, accessLevel, serverName, serverModUrl, targetZipPath }) {
    const AdmZip = require('adm-zip');
    try {
        if (!fs.existsSync(savePath)) {
            throw new Error(`Savegame folder not found: ${savePath}`);
        }

        const serverMeta = {
            isServerSave: true,
            accessLevel: accessLevel || 'player',
            isLocked: accessLevel === 'player',
            serverName: serverName || 'Multiplayer Server',
            serverModUrl: serverModUrl || '',
            exportedAt: new Date().toISOString()
        };

        // Write server_meta.json into savegame folder before zipping
        await fs.writeJson(path.join(savePath, 'server_meta.json'), serverMeta, { spaces: 2 });

        const zip = new AdmZip();
        zip.addLocalFolder(savePath);

        await fs.ensureDir(path.dirname(targetZipPath));
        zip.writeZip(targetZipPath);

        console.log(`[EXPORT-SERVER] Exported server package (${accessLevel}) to ${targetZipPath}`);
        return { success: true, filePath: targetZipPath, serverMeta };
    } catch (err) {
        console.error('[EXPORT-SERVER] Export server save failed:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Toggles a savegame slot between Single Player and Multiplayer Server mode.
 */
async function toggleServerMode(savePath, enableServerMode, options = {}) {
    try {
        const serverMetaPath = path.join(savePath, 'server_meta.json');
        if (enableServerMode) {
            let existingMeta = {};
            if (fs.existsSync(serverMetaPath)) {
                try { existingMeta = await fs.readJson(serverMetaPath); } catch (e) {}
            }
            const serverMeta = {
                isServerSave: true,
                accessLevel: options.accessLevel || existingMeta.accessLevel || 'admin',
                isLocked: (options.accessLevel || existingMeta.accessLevel || 'admin') === 'player',
                serverName: options.serverName || existingMeta.serverName || 'Multiplayer Server',
                serverModUrl: options.serverModUrl !== undefined ? options.serverModUrl : (existingMeta.serverModUrl || ''),
                updatedAt: new Date().toISOString()
            };
            await fs.writeJson(serverMetaPath, serverMeta, { spaces: 2 });
            console.log(`[SERVER-MODE] Enabled server mode for save: ${savePath}`);
            return { success: true, isServerSave: true, serverMeta };
        } else {
            if (fs.existsSync(serverMetaPath)) {
                await fs.remove(serverMetaPath);
            }
            console.log(`[SERVER-MODE] Disabled server mode (converted to single player) for save: ${savePath}`);
            return { success: true, isServerSave: false };
        }
    } catch (err) {
        console.error('[SERVER-MODE] Failed to toggle server mode:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Stashes all active Single Player save slots to a quarantine folder (stashed_sp_saves)
 * so that when launching a Multiplayer Server save, in-game FS25 Host Game save menu
 * ONLY displays multiplayer server saves.
 */
async function stashSinglePlayerSaves() {
    try {
        const fs25Path = getFs25Path();
        const stashPath = path.join(fs25Path, 'stashed_sp_saves');
        await fs.ensureDir(stashPath);

        let stashedCount = 0;
        for (let i = 1; i <= 20; i++) {
            const savePath = path.join(fs25Path, `savegame${i}`);
            const careerXml = path.join(savePath, 'careerSavegame.xml');
            if (fs.existsSync(savePath) && fs.existsSync(careerXml)) {
                const serverMetaPath = path.join(savePath, 'server_meta.json');
                const isServerSave = fs.existsSync(serverMetaPath);
                if (!isServerSave) {
                    const targetStash = path.join(stashPath, `savegame${i}`);
                    if (fs.existsSync(targetStash)) {
                        await fs.remove(targetStash);
                    }
                    await fs.move(savePath, targetStash);
                    stashedCount++;
                    console.log(`[STASH-SAVES] Quarantined Single Player Save Slot ${i} -> ${targetStash}`);
                }
            }
        }
        return { success: true, stashedCount };
    } catch (err) {
        console.error('[STASH-SAVES] Error stashing single player saves:', err);
        return { success: false, error: err.message };
    }
}



/**
 * Exports a savegame as a dedicated multiplayer server pack.
 */
async function exportServerSavegame({ savePath, accessLevel, serverName, serverModUrl, targetZipPath }) {
    const AdmZip = require('adm-zip');
    try {
        if (!fs.existsSync(savePath)) {
            throw new Error(`Savegame folder not found: ${savePath}`);
        }

        const serverMeta = {
            isServerSave: true,
            accessLevel: accessLevel || 'player',
            isLocked: accessLevel === 'player',
            serverName: serverName || 'Multiplayer Server',
            serverModUrl: serverModUrl || '',
            exportedAt: new Date().toISOString()
        };

        // Write server_meta.json into savegame folder before zipping
        await fs.writeJson(path.join(savePath, 'server_meta.json'), serverMeta, { spaces: 2 });

        const zip = new AdmZip();
        zip.addLocalFolder(savePath);

        await fs.ensureDir(path.dirname(targetZipPath));
        zip.writeZip(targetZipPath);

        console.log(`[EXPORT-SERVER] Exported server package (${accessLevel}) to ${targetZipPath}`);
        return { success: true, filePath: targetZipPath, serverMeta };
    } catch (err) {
        console.error('[EXPORT-SERVER] Export server save failed:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Toggles a savegame slot between Single Player and Multiplayer Server mode.
 */
async function toggleServerMode(savePath, enableServerMode, options = {}) {
    try {
        const serverMetaPath = path.join(savePath, 'server_meta.json');
        if (enableServerMode) {
            let existingMeta = {};
            if (fs.existsSync(serverMetaPath)) {
                try { existingMeta = await fs.readJson(serverMetaPath); } catch (e) {}
            }
            const serverMeta = {
                isServerSave: true,
                accessLevel: options.accessLevel || existingMeta.accessLevel || 'admin',
                isLocked: (options.accessLevel || existingMeta.accessLevel || 'admin') === 'player',
                serverName: options.serverName || existingMeta.serverName || 'Multiplayer Server',
                serverModUrl: options.serverModUrl !== undefined ? options.serverModUrl : (existingMeta.serverModUrl || ''),
                updatedAt: new Date().toISOString()
            };
            await fs.writeJson(serverMetaPath, serverMeta, { spaces: 2 });
            console.log(`[SERVER-MODE] Enabled server mode for save: ${savePath}`);
            return { success: true, isServerSave: true, serverMeta };
        } else {
            if (fs.existsSync(serverMetaPath)) {
                await fs.remove(serverMetaPath);
            }
            console.log(`[SERVER-MODE] Disabled server mode (converted to single player) for save: ${savePath}`);
            return { success: true, isServerSave: false };
        }
    } catch (err) {
        console.error('[SERVER-MODE] Failed to toggle server mode:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Stashes all active Single Player save slots to a quarantine folder (stashed_sp_saves)
 * so that when launching a Multiplayer Server save, in-game FS25 Host Game save menu
 * ONLY displays multiplayer server saves.
 */
async function stashSinglePlayerSaves() {
    try {
        const fs25Path = getFs25Path();
        const stashPath = path.join(fs25Path, 'stashed_sp_saves');
        await fs.ensureDir(stashPath);

        let stashedCount = 0;
        for (let i = 1; i <= 20; i++) {
            const savePath = path.join(fs25Path, `savegame${i}`);
            const careerXml = path.join(savePath, 'careerSavegame.xml');
            if (fs.existsSync(savePath) && fs.existsSync(careerXml)) {
                const serverMetaPath = path.join(savePath, 'server_meta.json');
                const isServerSave = fs.existsSync(serverMetaPath);
                if (!isServerSave) {
                    const targetStash = path.join(stashPath, `savegame${i}`);
                    if (fs.existsSync(targetStash)) {
                        await fs.remove(targetStash);
                    }
                    await fs.move(savePath, targetStash);
                    stashedCount++;
                    console.log(`[STASH-SAVES] Quarantined Single Player Save Slot ${i} -> ${targetStash}`);
                }
            }
        }
        return { success: true, stashedCount };
    } catch (err) {
        console.error('[STASH-SAVES] Error stashing single player saves:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Restores all stashed Single Player save slots from quarantine (stashed_sp_saves)
 * back to their active savegame1..20 slot folders in FS25 root.
 */
async function restoreStashedSinglePlayerSaves() {
    try {
        const fs25Path = getFs25Path();
        const stashPath = path.join(fs25Path, 'stashed_sp_saves');
        if (!fs.existsSync(stashPath)) return { success: true, restoredCount: 0 };

        const items = await fs.readdir(stashPath);
        let restoredCount = 0;

        for (const item of items) {
            if (/^savegame\d+$/i.test(item)) {
                const sourceStash = path.join(stashPath, item);
                const targetSave = path.join(fs25Path, item);
                if (fs.existsSync(sourceStash)) {
                    if (fs.existsSync(targetSave)) {
                        await fs.remove(targetSave);
                    }
                    await fs.move(sourceStash, targetSave);
                    restoredCount++;
                    console.log(`[RESTORE-SAVES] Restored Single Player Save ${item} to active slots.`);
                }
            }
        }

        try { await fs.remove(stashPath); } catch (e) {}
        return { success: true, restoredCount };
    } catch (err) {
        console.error('[RESTORE-SAVES] Error restoring stashed saves:', err);
        return { success: false, error: err.message };
    }
}

function isGdmRuntimeFormat(gdmBuffer) {
    if (!gdmBuffer || gdmBuffer.length < 24) return false;
    // Runtime GDM magic header is "MDF (0x22 0x4D 0x44 0x46)
    if (gdmBuffer[0] === 0x22 && gdmBuffer[1] === 0x4D && gdmBuffer[2] === 0x44 && gdmBuffer[3] === 0x46) {
        return true;
    }
    const sig = gdmBuffer.slice(16, 20).toString('hex');
    return sig.startsWith('0500') || sig.startsWith('0502') || sig.startsWith('0505');
}

/**
 * Safely extracts all density maps, info layers, and field data from a map mod (zip or folder)
 * into a target savegame directory.
 * @param {boolean} skipGdm - If true, skip extracting .gdm files.
 */
async function extractMapDensityFiles(modZipOrDirPath, targetSavePath, overwrite = false, skipGdm = false) {
    if (!modZipOrDirPath || !fs.existsSync(modZipOrDirPath) || !targetSavePath || !fs.existsSync(targetSavePath)) {
        return 0;
    }
    let extractedCount = 0;
    try {
        const stats = fs.statSync(modZipOrDirPath);
        if (stats.isFile() && modZipOrDirPath.toLowerCase().endsWith('.zip')) {
            const zip = new AdmZip(modZipOrDirPath);
            const entries = zip.getEntries();

            // Group entries by lower-case basename to select best candidate
            const candidateMap = new Map();
            for (const entry of entries) {
                if (entry.isDirectory) continue;
                const baseName = path.basename(entry.entryName);
                const lowerBase = baseName.toLowerCase();

                // Skip GDM files when requested
                if (skipGdm && lowerBase.endsWith('.gdm')) continue;

                const isDensityFile = 
                    (lowerBase.startsWith('densitymap_') && lowerBase !== 'densitymap_height.gdm') || 
                    lowerBase.startsWith('infolayer_');

                if (isDensityFile && (lowerBase.endsWith('.gdm') || lowerBase.endsWith('.grle') || lowerBase.endsWith('.png'))) {
                    const normPath = entry.entryName.replace(/\\/g, '/').toLowerCase();
                    const existing = candidateMap.get(lowerBase);
                    if (!existing) {
                        candidateMap.set(lowerBase, { entry, baseName, normPath, size: entry.header.size });
                    } else {
                        const existingInMaps = existing.normPath.includes('maps/') || existing.normPath.includes('map/');
                        const currentInMaps = normPath.includes('maps/') || normPath.includes('map/');
                        if ((currentInMaps && !existingInMaps) || (currentInMaps === existingInMaps && entry.header.size > existing.size)) {
                            candidateMap.set(lowerBase, { entry, baseName, normPath, size: entry.header.size });
                        }
                    }
                }
            }

            for (const { entry, baseName } of candidateMap.values()) {
                const destPath = path.join(targetSavePath, baseName);
                const dataBuf = entry.getData();
                if (baseName.toLowerCase().endsWith('.gdm')) {
                    if (!isGdmRuntimeFormat(dataBuf)) {
                        console.log(`[DENSITY-EXTRACT] Skipping editor-format GDM: ${entry.entryName} (not runtime format)`);
                        continue;
                    }
                }
                if (overwrite || !fs.existsSync(destPath)) {
                    await fs.writeFile(destPath, dataBuf);
                    extractedCount++;
                    console.log(`[DENSITY-EXTRACT] Extracted runtime GDM/infoLayer: ${entry.entryName} -> ${destPath}`);
                }
            }
        } else if (stats.isDirectory()) {
            const processDirectory = async (dir) => {
                const items = await fs.readdir(dir, { withFileTypes: true });
                for (const item of items) {
                    const fullP = path.join(dir, item.name);
                    if (item.isDirectory()) {
                        await processDirectory(fullP);
                    } else {
                        // Skip GDM files when requested
                        if (skipGdm && lowerBase.endsWith('.gdm')) continue;

                        const isDensityFile = 
                            (lowerBase.startsWith('densitymap_') && lowerBase !== 'densitymap_height.gdm') || 
                            lowerBase.startsWith('infolayer_') ||
                            lowerBase === 'fields.xml';

                        if (isDensityFile && (lowerBase.endsWith('.gdm') || lowerBase.endsWith('.grle') || lowerBase.endsWith('.png') || lowerBase === 'fields.xml')) {
                            if (lowerBase.endsWith('.gdm')) {
                                if (isSavegameGdm(fullP) === false && fs.existsSync(fullP)) {
                                    const fd = nodeFs.openSync(fullP, 'r');
                                    const buf = Buffer.alloc(4);
                                    nodeFs.readSync(fd, buf, 0, 4, 0);
                                    nodeFs.closeSync(fd);
                                    if (buf[0] === 0x21 && buf[1] === 0x4D && buf[2] === 0x44 && buf[3] === 0x46) {
                                        console.log(`[DENSITY-EXTRACT] Skipped map editor asset (!MDF) ${item.name}`);
                                        continue;
                                    }
                                }
                            }
                            const destPath = path.join(targetSavePath, item.name);
                            if (overwrite || !fs.existsSync(destPath)) {
                                await fs.copy(fullP, destPath);
                                extractedCount++;
                                console.log(`[DENSITY-EXTRACT] Copied ${item.name} -> ${destPath}`);
                            }
                        }
                    }
                }
            };
            await processDirectory(modZipOrDirPath);
        }
    } catch (err) {
        console.error('[DENSITY-EXTRACT] Error during density extraction:', err.message);
    }

    // Ensure all 6 essential ground state infoLayers exist in the savegame directory.
    // Maps that inherit $data/maps/map.../config/fieldGround.xml (e.g. Alliklepa, CalmLands, etc.)
    // do not bundle sprayLevel, plowLevel, limeLevel, etc. in their zip.
    // If these files are missing from the savegame directory, Giants Engine logs:
    // 'Failed to load DensityMap image .../savegameX/infoLayer_sprayLevel.png ... Loading default density map.'
    // and resets all fields to bare cultivated dirt!
    try {
        const gameDataDir = getGameDataDir();
        if (gameDataDir) {
            const groundInfoLayers = [
                'infoLayer_sprayLevel.grle',
                'infoLayer_limeLevel.grle',
                'infoLayer_plowLevel.grle',
                'infoLayer_stubbleShredLevel.grle',
                'infoLayer_rollerLevel.grle',
                'infoLayer_weed.grle'
            ];

            // Check if any of these are missing
            const missingLayers = groundInfoLayers.filter(l => !fs.existsSync(path.join(targetSavePath, l)));
            if (missingLayers.length > 0) {
                // Determine base map folder: check mod map's map XML or default to mapEU then mapUS
                let baseFolder = 'mapEU';
                if (modZipOrDirPath && typeof modZipOrDirPath === 'string' && modZipOrDirPath.toLowerCase().includes('us')) {
                    baseFolder = 'mapUS';
                } else if (modZipOrDirPath && typeof modZipOrDirPath === 'string' && modZipOrDirPath.toLowerCase().includes('as')) {
                    baseFolder = 'mapAS';
                }

                let sourceDir = path.join(gameDataDir, 'maps', baseFolder, 'data');
                if (!fs.existsSync(sourceDir)) {
                    sourceDir = path.join(gameDataDir, 'maps', 'mapEU', 'data');
                }
                if (!fs.existsSync(sourceDir)) {
                    sourceDir = path.join(gameDataDir, 'maps', 'mapUS', 'data');
                }

                if (fs.existsSync(sourceDir)) {
                    for (const layerName of missingLayers) {
                        const srcFile = path.join(sourceDir, layerName);
                        const dstFile = path.join(targetSavePath, layerName);
                        if (fs.existsSync(srcFile) && !fs.existsSync(dstFile)) {
                            await fs.copy(srcFile, dstFile);
                            extractedCount++;
                            console.log(`[DENSITY-EXTRACT] Supplied base game fallback infoLayer: ${layerName} -> ${dstFile}`);
                        }
                    }
                }
            }
        }
    } catch (baseErr) {
        console.warn('[DENSITY-EXTRACT] Warning checking base game fallback infoLayers:', baseErr.message);
    }

    return extractedCount;
}

/**
 * Resolves the map mod ZIP/directory path for a savegame directory based on careerSavegame.xml mapId
 */
async function resolveMapModPath(savePath) {
    try {
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (!fs.existsSync(careerPath)) return null;
        const xmlContent = await fs.readFile(careerPath, 'utf8');
        const parsed = parser.parse(xmlContent);
        const settings = parsed?.careerSavegame?.settings || {};
        const mapId = settings['@_mapId'] || settings.mapId;
        if (!mapId || isOfficialMap(mapId)) return null;

        let mapModName = mapId;
        if (mapId.includes('.')) {
            mapModName = mapId.split('.')[0];
        }

        // Pass 0: Direct filesystem lookup — most reliable, no scan dependency
        const modsRoot = pathProvider.getModsPath();
        const directZip = path.join(modsRoot, `${mapModName}.zip`);
        if (fs.existsSync(directZip) && fs.statSync(directZip).size > 0) {
            return directZip;
        }
        // Search one level deep in subfolders
        try {
            const subFolders = fs.readdirSync(modsRoot, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
            for (const sub of subFolders) {
                const subZip = path.join(modsRoot, sub, `${mapModName}.zip`);
                if (fs.existsSync(subZip) && fs.statSync(subZip).size > 0) {
                    return subZip;
                }
            }
        } catch (_) {}

        const modManager = require('./modManager');
        const { mods: allMods } = await modManager.scanLocalMods();
        const mapMod = allMods.find(m => m.isMap && (
            (m.modName && m.modName.toLowerCase() === mapModName.toLowerCase()) ||
            (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === mapModName.toLowerCase())
        ));

        if (mapMod && mapMod.filePath && fs.existsSync(mapMod.filePath)) {
            return mapMod.filePath;
        }
    } catch (e) {
        console.warn('[RESOLVE-MAP] Failed to resolve map mod path:', e.message);
    }
    return null;
}


/**
 * Ensures that a savegame directory has required crop/ground density maps.
 * If missing on a mod map save, automatically extracts them from the map mod ZIP.
 */
async function ensureSavegameDensityMaps(savePath) {
    if (!savePath || !fs.existsSync(savePath)) return 0;
    try {
        // If the save slot has not been initialized/saved by GIANTS Engine yet, do not inject density files,
        // revisions, or growth XMLs. Doing so corrupts engine initialization and causes fields to reset to cultivated dirt.
        const isEngineInitialized = fs.existsSync(path.join(savePath, 'terrain.heightmap.png'));
        if (!isEngineInitialized) {
            console.log(`[DENSITY-CHECK] Save slot at ${savePath} is not yet engine-initialized. Skipping density check to allow native engine initialization.`);
            return 0;
        }

        // 1. Ensure foliage growth state updater XML files exist ONLY when densityMap_fruits.gdm is present
        const hasFruitsGdm = fs.existsSync(path.join(savePath, 'densityMap_fruits.gdm'));
        if (hasFruitsGdm) {
            const growthXmlPath = path.join(savePath, 'densityMap_fruits_growthState.xml');
            const fruitsGrowth = `<?xml version="1.0" encoding="iso-8859-1"?>\n<foliageCropsUpdater currentGrowthIndex="0" applyGrowthCurrentIndex="4294967295" applyGrowthMaxTimePerFrame="0.000000">\n  <growthMasks64 numCells="16384"><![CDATA[XQAAEAAAf+/7v/6jsV7l+D+yqiZV+GhwQXAVD439HkwbikK3GfRpGHGuZiOKik0vow3Zf6bjjCMRU+BZGMV1iuJ3+LaUfwxqwN50SWTi6VxTsgTY90QMq1nkPx4AAA==]]></growthMasks64>\n</foliageCropsUpdater>\n`;
            const densityUpdater = `<?xml version="1.0" encoding="iso-8859-1"?>\n<densityMapUpdater updateCycleTime="0.000000" currentUpdateTime="0.000000" currentUpdateIndex="-1" numCellsToUpdate="0.000000" applyUpdateCurrentIndex="-1" applyUpdateMaxTimePerFrame="0.000000">\n</densityMapUpdater>\n`;

            if (!fs.existsSync(growthXmlPath)) {
                try {
                    await fs.writeFile(growthXmlPath, fruitsGrowth, 'utf8');
                    console.log(`[DENSITY-CHECK] Created default densityMap_fruits_growthState.xml in ${savePath}`);
                } catch (e) {}
            }
            const weedGrowthPath = path.join(savePath, 'weed_growthState.xml');
            if (!fs.existsSync(weedGrowthPath)) {
                try {
                    await fs.writeFile(weedGrowthPath, densityUpdater, 'utf8');
                } catch (e) {}
            }
            const stoneGrowthPath = path.join(savePath, 'stone_growthState.xml');
            if (!fs.existsSync(stoneGrowthPath)) {
                try {
                    await fs.writeFile(stoneGrowthPath, densityUpdater, 'utf8');
                } catch (e) {}
            }
            const peatGdmPath = path.join(savePath, 'densityMap_peat.gdm');
            const peatGrowthPath = path.join(savePath, 'densityMap_peat_growthState.xml');
            if (fs.existsSync(peatGdmPath) && !fs.existsSync(peatGrowthPath)) {
                try {
                    await fs.writeFile(peatGrowthPath, fruitsGrowth, 'utf8');
                } catch (e) {}
            }
        } else {
            // On fresh un-initialized slots, remove stale growth XMLs so GIANTS Engine loads natively without 55% hang
            for (const stateXml of ['densityMap_fruits_growthState.xml', 'weed_growthState.xml', 'stone_growthState.xml', 'densityMapHeight.xml']) {
                const sPath = path.join(savePath, stateXml);
                if (fs.existsSync(sPath)) {
                    try { await fs.remove(sPath); } catch (e) {}
                }
            }
        }

        // 2. Validate fields.xml (only remove if completely devoid of field definitions)
        const fieldsXmlPath = path.join(savePath, 'fields.xml');
        if (fs.existsSync(fieldsXmlPath)) {
            try {
                const fContent = await fs.readFile(fieldsXmlPath, 'utf8');
                if (!fContent.includes('<fields') && !fContent.includes('<field ')) {
                    await fs.remove(fieldsXmlPath);
                    console.log(`[DENSITY-CHECK] Removed invalid fields.xml from ${savePath}`);
                }
            } catch (e) {}
        }

        // 3. Remove flat placeholder densityMap_height.gdm and lock caches that cause elevation bugs
        const heightGdmPath = path.join(savePath, 'densityMap_height.gdm');
        if (fs.existsSync(heightGdmPath)) {
            try {
                if (fs.statSync(heightGdmPath).size <= 131349) {
                    await fs.remove(heightGdmPath);
                    console.log(`[DENSITY-CHECK] Removed flat template densityMap_height.gdm to avoid floating objects in ${savePath}`);
                }
            } catch (e) {}
        }

        const cachesToRemove = ['fieldGround.xml', 'densityMapHeight.xml'];
        for (const cf of cachesToRemove) {
            const cp = path.join(savePath, cf);
            if (fs.existsSync(cp)) {
                try { await fs.remove(cp); } catch (_) {}
            }
        }

        // 4. Ensure densityMapRevision in careerSavegame.xml is 1 (matches both base game and mod maps)
        const careerPath = path.join(savePath, 'careerSavegame.xml');
        if (fs.existsSync(careerPath)) {
            try {
                let careerXml = await fs.readFile(careerPath, 'utf8');
                const parsed = parser.parse(careerXml);
                const settings = parsed?.careerSavegame?.settings || {};
                const mapId = settings['@_mapId'] || settings.mapId;

                let expectedRev = '1';
                if (mapId && !isOfficialMap(mapId)) {
                    const modPath = await resolveMapModPath(savePath);
                    if (modPath && fs.existsSync(modPath)) {
                        // ONLY extract density files if the save has already been initialized and saved by GIANTS engine!
                        if (isEngineInitialized) {
                            await extractMapDensityFiles(modPath, savePath, true, true);
                        }

                        const farmlandPath = path.join(savePath, 'farmland.xml');
                        if (!fs.existsSync(farmlandPath)) {
                            console.log(`[DENSITY-CHECK] Save slot at ${savePath} missing farmland.xml! Setting up farmlands...`);
                            await setupSavegameFarmlands(savePath, modPath, mapId, null, true);
                        }

                        try {
                            const AdmZip = require('adm-zip');
                            const zip = new AdmZip(modPath);
                            const mapEntry = zip.getEntries().find(e => {
                                const norm = e.entryName.toLowerCase();
                                return norm.endsWith('.xml') && !norm.includes('sound') && !norm.includes('moddesc') && (
                                    norm.endsWith('map.xml') || norm.endsWith('mapeu.xml') || norm.endsWith('mapus.xml') || 
                                    norm.endsWith('mapas.xml') || norm.includes('map')
                                );
                            });
                            if (mapEntry) {
                                const xml = mapEntry.getData().toString('utf8');
                                const m = xml.match(/<densityMap\s+[^>]*revision=["'](\d+)["']/i);
                                if (m) expectedRev = m[1];
                            }
                        } catch (_) {}
                    }
                }

                const curRev = settings['@_densityMapRevision'] || settings.densityMapRevision || '';
                const curMapRev = settings['@_mapDensityMapRevision'] || settings.mapDensityMapRevision || '';
                let modified = false;

                const hasFruitsGdm = fs.existsSync(path.join(savePath, 'densityMap_fruits.gdm'));

                if (!hasFruitsGdm) {
                    const revRegex = /<(?:densityMapRevision|mapDensityMapRevision)>.*?<\/(?:densityMapRevision|mapDensityMapRevision)>\r?\n?/gi;
                    if (revRegex.test(careerXml)) {
                        careerXml = careerXml.replace(revRegex, '');
                        modified = true;
                    }
                } else {
                    const targetDensityRev = isOfficialMap(mapId) ? '4' : '1';
                    if (curRev !== targetDensityRev || !careerXml.includes('<densityMapRevision>')) {
                        if (careerXml.includes('<densityMapRevision>')) {
                            careerXml = careerXml.replace(/<densityMapRevision>.*?<\/densityMapRevision>/i, `<densityMapRevision>${targetDensityRev}</densityMapRevision>`);
                        } else {
                            careerXml = careerXml.replace(/<settings>/i, `<settings>\n        <densityMapRevision>${targetDensityRev}</densityMapRevision>`);
                        }
                        modified = true;
                    }
                    if (curMapRev !== expectedRev || !careerXml.includes('<mapDensityMapRevision>')) {
                        if (careerXml.includes('<mapDensityMapRevision>')) {
                            careerXml = careerXml.replace(/<mapDensityMapRevision>.*?<\/mapDensityMapRevision>/i, `<mapDensityMapRevision>${expectedRev}</mapDensityMapRevision>`);
                        } else {
                            careerXml = careerXml.replace(/<settings>/i, `<settings>\n        <mapDensityMapRevision>${expectedRev}</mapDensityMapRevision>`);
                        }
                        modified = true;
                    }

                    const standardRevisions = [
                        ['terrainTextureRevision', '1'],
                        ['terrainLodTextureRevision', '2'],
                        ['splitShapesRevision', '2'],
                        ['tipCollisionRevision', '2'],
                        ['placementCollisionRevision', '2'],
                        ['navigationCollisionRevision', '2'],
                        ['mapTerrainTextureRevision', '1'],
                        ['mapTerrainLodTextureRevision', '1'],
                        ['mapSplitShapesRevision', '1'],
                        ['mapTipCollisionRevision', '1'],
                        ['mapPlacementCollisionRevision', '1'],
                        ['mapNavigationCollisionRevision', '1']
                    ];
                    let revAdditions = '';
                    for (const [tag, val] of standardRevisions) {
                        const tagRegex = new RegExp(`<${tag}>.*?<\\/${tag}>`, 'i');
                        if (!tagRegex.test(careerXml)) {
                            revAdditions += `\n        <${tag}>${val}</${tag}>`;
                            modified = true;
                        }
                    }
                    if (revAdditions) {
                        careerXml = careerXml.replace(/<settings>/i, `<settings>${revAdditions}`);
                    }
                }

                if (modified) {
                    await fs.writeFile(careerPath, careerXml);
                    console.log(`[DENSITY-CHECK] Ensured density revisions (densityMapRevision=${isOfficialMap(mapId) ? '4' : '1'}, mapDensityMapRevision=${expectedRev}) in ${savePath}`);
                }

                // 5. Remove leftover Precision Farming files if Precision Farming mod is not active
                const hasPf = careerXml.includes('FS25_precisionFarming') || careerXml.includes('precisionFarming');
                if (!hasPf) {
                    const files = await fs.readdir(savePath);
                    for (const f of files) {
                        if (f.toLowerCase().startsWith('precisionfarming')) {
                            await fs.remove(path.join(savePath, f));
                            console.log(`[DENSITY-CHECK] Removed unused Precision Farming file ${f} from ${savePath}`);
                        }
                    }
                }
            } catch (e) {}
        }
    } catch (e) {
        console.warn('[DENSITY-CHECK] Failed density map auto-repair check:', e.message);
    }
    return 0;
}

/**
 * Resets/refreshes starting field states (crops, foliage, ground state) for an existing savegame slot
 * by extracting original density maps & infoLayers from the map zip archive into the savegame directory.
 */
async function resetSavegameFieldStates(savePath) {
    if (!savePath || !fs.existsSync(savePath)) {
        return { success: false, error: 'Invalid savegame path.' };
    }
    try {
        const files = await fs.readdir(savePath);
        let removedCount = 0;

        for (const file of files) {
            const baseLower = file.toLowerCase();
            const isFieldStateFile = 
                baseLower.startsWith('densitymap_') || 
                baseLower.startsWith('infolayer_') ||
                baseLower === 'fields.xml' ||
                baseLower === 'fieldground.xml' ||
                baseLower === 'weed_growthstate.xml' ||
                baseLower === 'stone_growthstate.xml' ||
                baseLower === 'densitymapheight.xml' ||
                baseLower === 'terrain.heightmap.png';

            if (isFieldStateFile) {
                const target = path.join(savePath, file);
                await fs.remove(target);
                removedCount++;
            }
        }

        // Re-extract fresh starting density map & infoLayer files from the map mod ZIP / folder if available
        const modPath = await resolveMapModPath(savePath);
        let restoredCount = 0;
        if (modPath) {
            restoredCount = await extractMapDensityFiles(modPath, savePath, true);
        } else {
            // Official map fallback: restore from master templates
            const careerPath = path.join(savePath, 'careerSavegame.xml');
            if (fs.existsSync(careerPath)) {
                try {
                    const cXml = await fs.readFile(careerPath, 'utf8');
                    const cData = parser.parse(cXml);
                    const mapId = cData?.careerSavegame?.settings?.['@_mapId'] || cData?.careerSavegame?.settings?.mapId;
                    if (mapId) {
                        const tPath = path.join(getTemplatesPath(), mapId);
                        if (fs.existsSync(tPath)) {
                            for (const fn of ['densityMap_fruits.gdm', 'fields.xml', 'densityMap_ground.gdm', 'densityMap_weed.gdm', 'densityMap_stones.gdm']) {
                                const srcF = path.join(tPath, fn);
                                if (fs.existsSync(srcF)) {
                                    await fs.copy(srcF, path.join(savePath, fn));
                                    restoredCount++;
                                }
                            }
                        }
                    }
                } catch (_) {}
            }
        }

        console.log(`[REPAIR-FIELDS] Reset field states: removed ${removedCount} cached density layers and restored ${restoredCount} fresh density map files at ${savePath}`);
        return { success: true, removedCount, restoredCount };
    } catch (err) {
        console.error('[REPAIR-FIELDS] Failed to reset field state layers:', err.message);
        return { success: false, error: err.message };
    }
}

async function processPostGameExit(saveIndex) {
    if (!saveIndex) return;
    try {
        const fs25Path = getFs25Path();
        const savePath = path.join(fs25Path, `savegame${saveIndex}`);
        const careerPath = path.join(savePath, 'careerSavegame.xml');

        const pendingSettingsPath = path.join(savePath, '.mm_pending_settings.json');

        // ── FIRST-RUN SETTINGS PATCH ─────────────────────────────────────────
        // If the slot was created without a template (empty slot, engine does
        // native first-run init), .mm_pending_settings.json holds the user's
        // app-configured values. Once the player saves in-game and the engine
        // writes careerSavegame.xml, we patch our settings back in.
        if (fs.existsSync(pendingSettingsPath) && fs.existsSync(careerPath)) {
            try {
                const pending = JSON.parse(await fs.readFile(pendingSettingsPath, 'utf8'));

                let engineXml = await fs.readFile(careerPath, 'utf8');

                // Patch savegame name
                if (pending.savegameName) {
                    engineXml = engineXml.replace(/<savegameName>[^<]*<\/savegameName>/i,
                        `<savegameName>${pending.savegameName}</savegameName>`);
                }

                await fs.writeFile(careerPath, engineXml, 'utf8');

                // Patch starting money in farms.xml
                if (pending.money != null) {
                    const farmsPath = path.join(savePath, 'farms.xml');
                    if (fs.existsSync(farmsPath)) {
                        let farmsXml = await fs.readFile(farmsPath, 'utf8');
                        farmsXml = farmsXml.replace(/(<farm\s[^>]*money=")[^"]*/i, `$1${pending.money}.000000`);
                        await fs.writeFile(farmsPath, farmsXml, 'utf8');
                    }
                }

                await fs.remove(pendingSettingsPath);
                console.log(`[POST-GAME] Patched app settings into engine careerSavegame.xml for slot ${saveIndex}`);

                // Capture a template so future slots skip the first-run flow
                await adoptSaveAsTemplate(saveIndex);
                console.log(`[POST-GAME] Auto-captured template from first engine init for slot ${saveIndex}`);
            } catch (pErr) {
                console.warn('[POST-GAME] Failed to apply pending settings:', pErr.message);
                await fs.remove(pendingSettingsPath).catch(() => {});
            }
        }

        if (!fs.existsSync(careerPath)) return;

        const xml = await fs.readFile(careerPath, 'utf8');
        const data = parser.parse(xml);
        if (!data || !data.careerSavegame) return;
        const settings = data.careerSavegame.settings || {};
        const mapId = settings['@_mapId'] || settings.mapId;
        const mapTitle = settings['@_mapTitle'] || settings.mapTitle;
        let mapModName = null;
        if (mapId && mapId.includes('.')) {
            mapModName = mapId.split('.')[0];
        }

        const farmsFile = path.join(savePath, 'farms.xml');
        const initFile = path.join(savePath, 'terrain.heightmap.png');
        const placeablesFile = path.join(savePath, 'placeables.xml');
        const hasEngineData = fs.existsSync(path.join(savePath, 'densityMap_fruits.gdm')) ||
                              fs.existsSync(path.join(savePath, 'densityMap_ground.gdm')) ||
                              fs.existsSync(path.join(savePath, 'guidedTour.xml'));
        const isInitialized = fs.existsSync(farmsFile) && fs.existsSync(initFile) && fs.existsSync(placeablesFile) && hasEngineData;
        const canAutoHarvest = isInitialized && (fs.existsSync(path.join(savePath, 'densityMap_fruits.gdm')) || fs.existsSync(path.join(savePath, 'densityMap_ground.gdm')));

        if (isInitialized && mapId && !isOfficialMap(mapId) && canAutoHarvest) {
            const hasTemplate = await hasMapTemplate(mapId, mapTitle, mapModName);
            if (!hasTemplate) {
                console.log(`[AUTO-HARVEST] Automatically learning master template for map ${mapId} from slot ${saveIndex}...`);
                await adoptSaveAsTemplate(saveIndex);
            }
        }
    } catch (err) {
        console.error(`[POST-GAME] Failed targeted exit processing for slot ${saveIndex}:`, err);
    }
}

module.exports = {
    processPostGameExit,
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
    exportSavegame,
    exportServerSavegame,
    toggleServerMode,
    getFarmPermissions,
    updateFarmPermissions,
    prepareServerModsFolder,
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
    autoInjectDependencies,
    findMapModInSavegame,
    syncSubfolderMapDependencies,
    stashSinglePlayerSaves,
    restoreStashedSinglePlayerSaves,
    repairSavegameMapId,
    resetSavegameFieldStates,
    ensureSavegameDensityMaps
};
