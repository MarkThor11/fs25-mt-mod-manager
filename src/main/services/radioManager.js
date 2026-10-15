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
                    'User-Agent': 'FS25-MT-Mod-Manager/1.1.6',
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

let cachedRadioFeeds = null;
let lastRadioFeedsFetch = 0;

async function resolvePlaylistUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (!url.includes('.pls') && !url.includes('.m3u')) return url;
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : require('http');
        client.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(resolvePlaylistUrl(new URL(res.headers.location, url).toString()));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const plsMatch = data.match(/File1=(http[s]?:\/\/[^\r\n]+)/i);
                if (plsMatch) return resolve(plsMatch[1].trim());
                const m3uMatch = data.split('\n').map(l => l.trim()).find(l => l.startsWith('http://') || l.startsWith('https://'));
                if (m3uMatch) return resolve(m3uMatch);
                resolve(url);
            });
        }).on('error', () => resolve(url));
    });
}

async function fetchRadioFeedsStations() {
    const NOW = Date.now();
    if (cachedRadioFeeds && (NOW - lastRadioFeedsFetch < 3600000)) {
        return cachedRadioFeeds;
    }

    return new Promise((resolve) => {
        const http = require('http');
        http.get('http://www.radiofeeds.co.uk/mp3.asp', (res) => {
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                const stations = [];
                const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let match;
                let idx = 0;
                while ((match = trRegex.exec(html)) !== null) {
                    const trContent = match[1];
                    const nameMatch = trContent.match(/&#149;\s*<a [^>]*>([^<]+)<\/a>/i) || trContent.match(/<a [^>]*target="NEW"[^>]*>([^<]+)<\/a>/i);
                    const streamMatch = trContent.match(/href=[\"'](http[s]?:\/\/[^\"'\s>]+\.(?:pls|m3u|asx|mp3)[^\"'\s>]*)[\"']/i) || trContent.match(/href=[\"'](http[s]?:\/\/[^\"'\s>]*(?:stream|listen|\/live)[^\"'\s>]*)[\"']/i);
                    
                    if (nameMatch && streamMatch) {
                        const name = nameMatch[1].trim();
                        let url = streamMatch[1].trim();
                        let url_resolved = url;

                        const nameLower = name.toLowerCase();
                        if (nameLower.includes('6 music') || nameLower.includes('6music')) {
                            url_resolved = 'http://as-hls-ww-live.akamaized.net/pool_904/live/ww/bbc_6music/bbc_6music.isml/bbc_6music-audio%3d128000.norewind.m3u8';
                            url = url_resolved;
                        } else if (nameLower.includes('flashback') || url.includes('carolineflashback') || url.includes('10568')) {
                            url_resolved = 'http://sc2.radiocaroline.net:10558/';
                            url = 'http://sc2.radiocaroline.net:10558/';
                        }
                        
                        const tdCells = [...trContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
                        let genre = '';
                        if (tdCells.length >= 4) {
                            genre = tdCells[3] || tdCells[2] || '';
                        }

                        stations.push({
                            stationuuid: `rf-${idx++}`,
                            name,
                            url,
                            url_resolved,
                            tags: genre ? `UK, RadioFeeds, ${genre}` : 'UK, RadioFeeds',
                            country: 'United Kingdom',
                            countrycode: 'GB',
                            votes: 200,
                            source: 'RadioFeeds UK'
                        });
                    }
                }
                if (stations.length > 0) {
                    cachedRadioFeeds = stations;
                    lastRadioFeedsFetch = NOW;
                }
                resolve(stations);
            });
        }).on('error', (err) => {
            console.error('[RADIO] RadioFeeds fetch error:', err.message);
            resolve(cachedRadioFeeds || []);
        });
    });
}

async function addRadio(stationObj) {
    let href = typeof stationObj === 'string' ? stationObj : (stationObj?.url_resolved || stationObj?.url || stationObj?.href);
    if (!href) return { success: false, error: 'Invalid station URL' };

    // Automatically resolve PLS/M3U playlist URLs to direct audio stream before adding
    try {
        href = await resolvePlaylistUrl(href);
    } catch (e) {
        console.warn('[RADIO] Could not resolve playlist URL, proceeding with raw URL:', href);
    }

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

async function applyGameMusicOverride(overrideBuiltins = true) {
    try {
        const musicXmlPath = await getGameMusicXmlPath();
        if (!musicXmlPath) return;

        const backupPath = musicXmlPath + '.original';

        if (!overrideBuiltins) {
            // User disabled override -> restore original base game music.xml if backup exists
            if (fs.existsSync(backupPath)) {
                await fs.copyFile(backupPath, musicXmlPath);
                await fs.remove(backupPath);
                console.log('[RADIO] Restored original base game music.xml from backup.');
            }
            return;
        }

        // Override enabled: mute/replace base game menu music XML items
        if (fs.existsSync(musicXmlPath)) {
            if (!fs.existsSync(backupPath)) {
                await fs.copyFile(musicXmlPath, backupPath);
            }
            const content = await fs.readFile(musicXmlPath, 'utf-8');
            // Mute or strip music tracks in music.xml
            const mutedContent = content.replace(/<music[^>]*>/gi, '<music volume="0.0">');
            await fs.writeFile(musicXmlPath, mutedContent, 'utf-8');
            console.log('[RADIO] Applied zero-volume menu music override in music.xml');
        }
    } catch (err) {
        console.error('[RADIO] Restore/apply music.xml failed:', err.message);
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
 * Search for radio stations using Radio Browser API and RadioFeeds UK.
 */
async function searchStations(filters = {}) {
    const { query, country, language, tag, order = 'votes', source } = filters;

    let radioBrowserResults = [];
    let radioFeedsResults = [];

    // Fetch RadioFeeds UK stations if requested, or if UK/GB is selected or source is radiofeeds
    const shouldFetchRadioFeeds = source === 'radiofeeds' || country === 'GB' || (source !== 'radiobrowser' && (!country || country === 'GB'));

    if (shouldFetchRadioFeeds) {
        try {
            const rfAll = await fetchRadioFeedsStations();
            let filteredRf = [...rfAll];

            if (query && query.trim()) {
                const qLower = query.trim().toLowerCase();
                filteredRf = filteredRf.filter(s => s.name.toLowerCase().includes(qLower) || s.tags.toLowerCase().includes(qLower));
            }
            if (tag && tag.trim()) {
                const tLower = tag.trim().toLowerCase();
                filteredRf = filteredRf.filter(s => s.tags.toLowerCase().includes(tLower) || s.name.toLowerCase().includes(tLower));
            }
            radioFeedsResults = filteredRf;
        } catch (e) {
            console.warn('[RADIO] RadioFeeds search failed:', e.message);
        }
    }

    if (source === 'radiofeeds') {
        return radioFeedsResults;
    }

    try {
        const params = {
            limit: 5000,
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
        radioBrowserResults = Array.isArray(res) ? res : [];
    } catch (err) {
        console.error('[RADIO] Search failed:', err);
        try {
            const params = {
                limit: 5000,
                hidebroken: true,
                order: order,
                reverse: order === 'name' ? false : true,
                name: query?.trim() || undefined,
                countrycode: country?.trim() || undefined,
                language: language?.trim() || undefined,
                tag: tag?.trim() || undefined
            };
            radioBrowserResults = await apiGet(`https://at1.api.radio-browser.info/json/stations/search`, params);
        } catch (err2) {
            radioBrowserResults = [];
        }
    }

    let combined = [];
    if (radioFeedsResults.length > 0) {
        combined = [...radioFeedsResults, ...radioBrowserResults];
    } else {
        combined = radioBrowserResults;
    }

    // Deduplicate by station name key and normalized stream URL
    const seenNames = new Set();
    const seenUrls = new Set();
    const deduped = [];

    for (const station of combined) {
        if (!station || !station.name) continue;
        const lowerName = station.name.trim().toLowerCase();
        
        // Filter out BBC Radio 6 Music as requested
        if (lowerName.includes('6 music') || lowerName.includes('6music') || lowerName.includes('bbc radio 6')) {
            continue;
        }

        // Brand rule for Caroline
        let nameKey = lowerName.replace(/\s+/g, ' ');
        if (lowerName.includes('caroline')) {
            nameKey = lowerName.includes('flashback') ? 'caroline-flashback' : 'caroline-main';
        }

        const rawUrl = (station.url_resolved || station.url || station.href || '').trim().toLowerCase();
        const normUrl = rawUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/;$/, '').replace(/;stream\.mp3$/, '');

        if (seenNames.has(nameKey) || (normUrl && seenUrls.has(normUrl))) {
            continue;
        }

        seenNames.add(nameKey);
        if (normUrl) seenUrls.add(normUrl);
        deduped.push(station);
    }

    return deduped;
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
    deployCompanionMod,
    fetchRadioFeedsStations,
    resolvePlaylistUrl
};

