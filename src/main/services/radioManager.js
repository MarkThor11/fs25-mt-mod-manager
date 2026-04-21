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
                    'User-Agent': 'FS25-MT-Mod-Manager/1.0.6',
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

        // Map from XML attributes (@_href) back to simple href
        return radios.map(r => ({ href: r['@_href'] || r.href }));
    } catch (err) {
        console.error('[RADIO] Failed to read radios:', err);
        return [];
    }
}

async function saveRadios(radios) {
    const filePath = getRadioFilePath();
    
    // Sanitize radios: ensure they are valid URLs
    const sanitizedRadios = (Array.isArray(radios) ? radios : [])
        .filter(r => r && (r.href || r['@_href']))
        .map(r => (r.href || r['@_href']).trim());

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
    searchStations
};
