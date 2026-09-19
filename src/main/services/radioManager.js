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

function getRadioMetadataPath() {
    const dataRoot = pathProvider.getFS25DataRoot();
    return path.join(dataRoot, 'modSettings', 'MTRadioMetadata.json');
}

async function getRadioMetadata() {
    const filePath = getRadioMetadataPath();
    if (!fs.existsSync(filePath)) return {};
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) || {};
    } catch (e) {
        return {};
    }
}

async function saveRadioMetadata(metadata) {
    const filePath = getRadioMetadataPath();
    try {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (e) {
        console.error('[RADIO] Failed to save metadata:', e);
    }
}

function inferStationNameFromUrl(href) {
    if (!href) return 'Radio Station';
    try {
        const urlObj = new URL(href);
        const pathname = urlObj.pathname.replace(/^\//, '').replace(/\/$/, '');
        const filename = path.basename(pathname, path.extname(pathname));
        
        if (filename && filename !== ';' && filename !== 'stream' && filename !== 'radio' && filename.length > 2) {
            const name = filename
                .replace(/[-_]/g, ' ')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/\b\w/g, c => c.toUpperCase());
            return name.trim();
        }
        
        const host = urlObj.hostname.replace(/^www\./, '');
        return `Radio (${host})`;
    } catch (e) {
        return href;
    }
}

async function resolveMissingStationMetadata(radios) {
    if (!Array.isArray(radios) || radios.length === 0) return radios;

    const metadata = await getRadioMetadata();
    let metadataChanged = false;

    const knownPresets = {
        'https://simulatorradio.stream/stream.mp3': { name: 'Simulator Radio' },
        'https://live.truckers.fm/': { name: 'Truckers FM' },
        'https://oreo.truckstopradio.co.uk/listen/tsr_country/radio.mp3': { name: 'TruckStopRadio Country' },
        'https://oreo.truckstopradio.co.uk/listen/tsr_rock/radio.mp3': { name: 'TruckStopRadio Rock' }
    };

    for (const r of radios) {
        if (!r.href) continue;

        const normalizedHref = r.href.replace(/\/$/, '');
        const presetMatch = Object.entries(knownPresets).find(([k]) => k.replace(/\/$/, '') === normalizedHref);
        if (presetMatch && (!metadata[r.href] || !metadata[r.href].name)) {
            r.name = presetMatch[1].name;
            metadata[r.href] = { ...metadata[r.href], name: r.name };
            metadataChanged = true;
            continue;
        }

        // If metadata already has a clean custom name, keep it
        if (metadata[r.href] && metadata[r.href].name && metadata[r.href].isCustomName) {
            r.name = metadata[r.href].name;
            if (metadata[r.href].favicon) r.favicon = metadata[r.href].favicon;
            continue;
        }

        // Try Radio Browser byurl lookup for accurate exact station names
        try {
            const encodedUrl = encodeURIComponent(r.href);
            const searchRes = await apiGet(`https://de1.api.radio-browser.info/json/stations/byurl?url=${encodedUrl}`);
            if (Array.isArray(searchRes) && searchRes.length > 0 && searchRes[0].name) {
                const found = searchRes[0];
                r.name = found.name.trim();
                if (found.favicon) r.favicon = found.favicon;
                metadata[r.href] = { name: r.name, favicon: r.favicon };
                metadataChanged = true;
            }
        } catch (e) {
            // Silence lookup network errors
        }
    }

    if (metadataChanged) {
        await saveRadioMetadata(metadata);
    }

    return radios;
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

        const metadata = await getRadioMetadata();

        let parsed = radios
            .map(r => {
                const href = r['@_href'] || r.href;
                const xmlName = r['@_name'] || r.name;
                const meta = metadata[href] || {};
                const name = meta.name || xmlName || inferStationNameFromUrl(href);
                return { href, name, favicon: meta.favicon };
            })
            .filter(r => r.href && typeof r.href === 'string' && !r.href.includes('localhost:8000') && !r.href.includes('/spotify_account'));

        parsed = await resolveMissingStationMetadata(parsed);
        return parsed;
    } catch (err) {
        console.error('[RADIO] Failed to read radios:', err);
        return [];
    }
}

async function saveRadios(radios) {
    const filePath = getRadioFilePath();
    const metadata = await getRadioMetadata();
    
    // Sanitize radios: ensure they are valid URLs and remove dummy/broken URLs like localhost:8000
    const sanitizedRadios = (Array.isArray(radios) ? radios : [])
        .filter(r => r && (r.href || r['@_href'] || typeof r === 'string'))
        .map(r => {
            if (typeof r === 'string') return { href: r.trim() };
            return {
                href: (r.href || r['@_href']).trim(),
                name: r.name,
                favicon: r.favicon
            };
        })
        .filter(r => !r.href.includes('localhost:8000') && !r.href.includes('/spotify_account'));

    // Deduplicate by normalized href
    const seenHrefs = new Set();
    const uniqueRadios = [];
    for (const r of sanitizedRadios) {
        let norm = (r.href || '').trim().toLowerCase();
        if (norm.endsWith('/;')) norm = norm.slice(0, -2);
        else if (norm.endsWith(';')) norm = norm.slice(0, -1);
        if (norm.endsWith('/')) norm = norm.slice(0, -1);
        
        if (norm && !seenHrefs.has(norm)) {
            seenHrefs.add(norm);
            uniqueRadios.push(r);
        }
    }

    // Build XML manually for absolute control (Giants Engine is very picky)
    let xml = '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n\n';
    xml += '<streamingInternetRadios>\n';
    
    for (const item of uniqueRadios) {
        let cleanHref = item.href ? item.href.trim() : '';
        if (cleanHref.endsWith('/;')) {
            cleanHref = cleanHref.slice(0, -2);
        } else if (cleanHref.endsWith(';')) {
            cleanHref = cleanHref.slice(0, -1);
        }
        const escapedHref = cleanHref.replace(/&/g, '&amp;');
        const replacementAttr = item.name ? ` replacement="${item.name.replace(/"/g, '&quot;')}"` : '';
        xml += `    <streamingInternetRadio href="${escapedHref}"${replacementAttr} />\n`;
        if (item.name || item.favicon) {
            metadata[item.href] = { ...metadata[item.href], name: item.name, favicon: item.favicon };
        }
    }
    
    xml += '</streamingInternetRadios>';

    try {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, xml, 'utf-8');
        await saveRadioMetadata(metadata);
        await deployCompanionMod();
        return { success: true };
    } catch (err) {
        console.error('[RADIO] Failed to save radios:', err);
        return { success: false, error: err.message };
    }
}

async function addRadio(stationObj) {
    const href = typeof stationObj === 'string' ? stationObj : (stationObj?.url_resolved || stationObj?.url || stationObj?.href);
    if (!href) return { success: false, error: 'Invalid station URL' };

    const name = typeof stationObj === 'object' ? stationObj.name : undefined;
    const favicon = typeof stationObj === 'object' ? stationObj.favicon : undefined;

    const radios = await getRadios();
    const existingIdx = radios.findIndex(r => r.href === href);
    
    if (existingIdx >= 0) {
        if (name) radios[existingIdx].name = name;
        if (favicon) radios[existingIdx].favicon = favicon;
        return await saveRadios(radios);
    }

    radios.push({ href, name: name || inferStationNameFromUrl(href), favicon });
    return await saveRadios(radios);
}

async function updateRadioName(href, newName) {
    if (!href || !newName) return { success: false, error: 'Invalid arguments' };
    const radios = await getRadios();
    const station = radios.find(r => r.href === href);
    if (station) {
        station.name = newName.trim();
        const metadata = await getRadioMetadata();
        metadata[href] = { ...metadata[href], name: station.name, isCustomName: true };
        await saveRadioMetadata(metadata);
        return await saveRadios(radios);
    }
    return { success: false, error: 'Station not found' };
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

async function getGameMusicXmlPath() {
    try {
        const gameLauncher = require('./gameLauncher');
        const detected = await gameLauncher.detectGamePath();
        if (detected && detected.path) {
            const gameDir = path.dirname(detected.path);
            const musicXml = path.join(gameDir, '..', 'data', 'music', 'music.xml');
            if (fs.existsSync(musicXml) || fs.existsSync(musicXml + '.original')) {
                return musicXml;
            }
        }
    } catch (e) {
        console.error('[RADIO] Failed to resolve game music.xml path:', e.message);
    }
    return null;
}

async function applyGameMusicOverride() {
    try {
        const musicXmlPath = path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Farming Simulator 25', 'data', 'music', 'music.xml');
        const backupPath = path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Farming Simulator 25', 'data', 'music', 'music.xml.original');
        if (fs.existsSync(backupPath)) {
            await fs.copyFile(backupPath, musicXmlPath);
            await fs.remove(backupPath);
            console.log('[RADIO] Restored original base game music.xml from backup.');
        }
    } catch (err) {
        console.error('[RADIO] Restore music.xml failed:', err.message);
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
        await applyGameMusicOverride(overrideBuiltins);
        await deployCompanionMod();
        return { success: true };
    } catch (err) {
        console.error('[RADIO] Failed to save settings:', err);
        return { success: false, error: err.message };
    }
}

async function deployCompanionMod() {
    // Disabled automatic mod folder injection
    return { success: true };
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
            reverse: order === 'name' ? false : true,
            name: query?.trim() || undefined,
            countrycode: country?.trim() || undefined,
            language: language?.trim() || undefined,
            tag: tag?.trim() || undefined,
            tagExact: tag ? true : undefined
        };

        let res = await apiGet(`https://de1.api.radio-browser.info/json/stations/search`, params);
        if (tag && (!Array.isArray(res) || res.length === 0)) {
            delete params.tagExact;
            res = await apiGet(`https://de1.api.radio-browser.info/json/stations/search`, params);
        }
        return Array.isArray(res) ? res : [];
    } catch (err) {
        console.error('[RADIO] Search failed:', err);
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
    updateRadioName,
    removeRadio,
    searchStations,
    getRadioSettings,
    saveRadioSettings,
    applyGameMusicOverride,
    deployCompanionMod
};
