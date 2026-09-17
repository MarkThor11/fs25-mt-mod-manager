const path = require('path');
const fs = require('fs-extra');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const pathProvider = require('./pathProvider');
const https = require('https');

let radioFilePath = null;

function getRadioFilePath() {
    if (radioFilePath) return radioFilePath;
    const dataRoot = pathProvider.getFS25DataRoot();
    radioFilePath = path.join(dataRoot, 'music', 'streamingInternetRadios.xml');
    return radioFilePath;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true, suppressEmptyNode: true });

/**
 * Custom fetcher to avoid axios dependency and handle redirects
 */
async function apiGet(url, params = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) urlObj.searchParams.append(key, value);
        });

        const request = (targetUrl) => {
            const options = {
                headers: {
                    'User-Agent': 'FS25-MT-Mod-Manager/1.1.0',
                    'Accept': 'application/json'
                }
            };

            https.get(targetUrl, options, (res) => {
                // Follow redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const nextUrl = new URL(res.headers.location, targetUrl).toString();
                    return request(nextUrl);
                }

                if (res.statusCode !== 200) {
                    return reject(new Error(`API returned status ${res.statusCode}`));
                }

                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        if (!data || data.trim() === '') return resolve([]);
                        resolve(JSON.parse(data));
                    } catch (e) {
                        console.error('[RADIO] JSON Parse Error:', e.message);
                        resolve([]); // Return empty instead of crashing
                    }
                });
            }).on('error', (err) => {
                console.error('[RADIO] Network Error:', err.message);
                reject(err);
            });
        };

        request(urlObj.toString());
    });
}

async function getRadios() {
    const filePath = getRadioFilePath();
    if (!fs.existsSync(filePath)) {
        return [];
    }

    try {
        const xmlData = await fs.readFile(filePath, 'utf-8');
        const jsonObj = parser.parse(xmlData);
        
        if (!jsonObj.streamingInternetRadios || !jsonObj.streamingInternetRadios.streamingInternetRadio) {
            return [];
        }
        
        let radios = jsonObj.streamingInternetRadios.streamingInternetRadio;
        if (!Array.isArray(radios)) radios = [radios];

        // Map from XML attributes (@_href) back to simple href and filter out broken dummy links
        return radios
            .map(r => ({ href: r['@_href'] || r.href }))
            .filter(r => r.href && typeof r.href === 'string' && !r.href.includes('localhost:8000') && !r.href.includes('/spotify_account'));
    } catch (err) {
        console.error('[RADIO] Failed to read radios:', err);
        return [];
    }
}

async function saveRadios(radios) {
    const filePath = getRadioFilePath();
    
    // Sanitize radios: ensure they are valid URLs and remove dummy/broken URLs like localhost:8000
    const sanitizedRadios = (Array.isArray(radios) ? radios : [])
        .filter(r => r && (r.href || r['@_href']))
        .map(r => (r.href || r['@_href']).trim())
        .filter(href => !href.includes('localhost:8000') && !href.includes('/spotify_account'));

    // Build XML manually for absolute control (Giants Engine is very picky)
    let xml = '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n\n';
    xml += '<streamingInternetRadios>\n';
    
    for (const href of sanitizedRadios) {
        // Escape & for XML compatibility
        const escapedHref = href.replace(/&/g, '&amp;');
        xml += `    <streamingInternetRadio href="${escapedHref}" />\n`;
    }
    
    xml += '</streamingInternetRadios>';

    try {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, xml, 'utf-8');
        // Keep companion mod deployed and sync settings
        await deployCompanionMod();
        return { success: true };
    } catch (err) {
        console.error('[RADIO] Failed to save radios:', err);
        return { success: false, error: err.message };
    }
}

async function addRadio(href) {
    const radios = await getRadios();
    if (radios.some(r => r.href === href)) {
        return { success: true, message: 'Already exists' };
    }

    radios.push({ href });
    return await saveRadios(radios);
}

async function removeRadio(href) {
    if (href === '__ALL__') {
        return await saveRadios([]);
    }
    const radios = await getRadios();
    const filtered = radios.filter(r => r.href !== href);
    return await saveRadios(filtered);
}

function getRadioSettingsPath() {
    const dataRoot = pathProvider.getFS25DataRoot();
    return path.join(dataRoot, 'modSettings', 'MTRadioManager.xml');
}

async function getRadioSettings() {
    const filePath = getRadioSettingsPath();
    const companionPath = path.join(pathProvider.getDefaultModsPath(), 'FS25_MTRadioManager.zip');
    const isCompanionInstalled = fs.existsSync(companionPath);

    if (!fs.existsSync(filePath)) {
        return {
            overrideBuiltins: true,
            isCompanionInstalled
        };
    }

    try {
        const xml = await fs.readFile(filePath, 'utf-8');
        const jsonObj = parser.parse(xml);
        const overrideBuiltins = jsonObj?.MTRadioSettings?.overrideBuiltins !== false && jsonObj?.MTRadioSettings?.overrideBuiltins !== 'false';
        return {
            overrideBuiltins,
            isCompanionInstalled
        };
    } catch (err) {
        console.error('[RADIO] Failed to read settings:', err);
        return {
            overrideBuiltins: true,
            isCompanionInstalled
        };
    }
}

async function saveRadioSettings(settings) {
    const filePath = getRadioSettingsPath();
    const overrideBuiltins = settings?.overrideBuiltins !== false;

    let xml = '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n\n';
    xml += '<MTRadioSettings>\n';
    xml += `    <overrideBuiltins>${overrideBuiltins}</overrideBuiltins>\n`;
    xml += '</MTRadioSettings>';

    try {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, xml, 'utf-8');
        await deployCompanionMod();
        return { success: true };
    } catch (err) {
        console.error('[RADIO] Failed to save settings:', err);
        return { success: false, error: err.message };
    }
}

async function deployCompanionMod() {
    try {
        const internalMod = path.join(__dirname, '..', 'resources', 'internalMods', 'FS25_MTRadioManager.zip');
        if (!fs.existsSync(internalMod)) {
            console.warn('[RADIO] Internal FS25_MTRadioManager.zip not found at:', internalMod);
            return { success: false, error: 'Internal companion mod not found' };
        }

        const modsDir = pathProvider.getDefaultModsPath();
        if (modsDir && fs.existsSync(modsDir)) {
            const destPath = path.join(modsDir, 'FS25_MTRadioManager.zip');
            await fs.copyFile(internalMod, destPath);
            console.log('[RADIO] Native audio subsystem deployed to:', destPath);
        }

        // Also ensure registered in existing savegame slots
        const fs25Path = pathProvider.getFS25DataRoot();
        if (fs25Path && fs.existsSync(fs25Path)) {
            const entries = await fs.readdir(fs25Path);
            for (const entry of entries) {
                if (entry.toLowerCase().startsWith('savegame')) {
                    const careerFile = path.join(fs25Path, entry, 'careerSavegame.xml');
                    if (fs.existsSync(careerFile)) {
                        try {
                            let xml = await fs.readFile(careerFile, 'utf8');
                            let modified = false;
                            if (!xml.includes('FS25_MTRadioManager')) {
                                xml = xml.replace('</careerSavegame>', '  <mod modName="FS25_MTRadioManager" title="In-Game Audio Subsystem" version="1.0.0.0" required="false" fileHash=""/>\n</careerSavegame>');
                                modified = true;
                            }
                            if (!xml.includes('FS25_QuietLoadingScreen')) {
                                xml = xml.replace('</careerSavegame>', '  <mod modName="FS25_QuietLoadingScreen" title="Quiet Loading Screen" version="1.0.0.0" required="false" fileHash=""/>\n</careerSavegame>');
                                modified = true;
                            }
                            if (modified) {
                                await fs.writeFile(careerFile, xml, 'utf8');
                            }
                        } catch (e) {}
                    }
                }
            }
        }
        return { success: true };
    } catch (err) {
        console.error('[RADIO] Failed to deploy companion mod:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Search for radio stations using the Radio Browser API.
 * Mirror: all.api.radio-browser.info (automatic load balancing)
 */
async function searchStations(filters = {}) {
    try {
        const { query, country, language, tag, order = 'votes' } = filters;
        
        const params = {
            limit: 100,
            hidebroken: true,
            order: order,
            reverse: true,
            name: query?.trim() || undefined,
            countrycode: country?.trim() || undefined,
            language: language?.trim() || undefined,
            tag: tag?.trim() || undefined
        };

        // Using de1 as primary stable node
        return await apiGet(`https://de1.api.radio-browser.info/json/stations/search`, params);
    } catch (err) {
        console.error('[RADIO] Search failed:', err);
        // Fallback to another node if de1 fails
        try {
            return await apiGet(`https://at1.api.radio-browser.info/json/stations/search`, params);
        } catch (err2) {
            return [];
        }
    }
}

module.exports = {
    getRadios,
    addRadio,
    removeRadio,
    searchStations,
    getRadioSettings,
    saveRadioSettings,
    deployCompanionMod
};
