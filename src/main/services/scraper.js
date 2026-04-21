const https = require('https');
const zlib = require('zlib');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.farming-simulator.com';
const CDN_BASE = 'https://cdn19.giants-software.com';
const MODS_URL = `${BASE_URL}/mods.php`;
const MOD_URL = `${BASE_URL}/mod.php`;

// Rate limit: one request per 1.5 seconds
let lastRequestTime = 0;
const MIN_DELAY = 500;
let phpsessid = null;
let sessionPromise = null;

/**
 * Ensures we have a valid PHPSESSID to bypass bot-detection fallback.
 * Uses a singleton promise to prevent concurrent handshake requests.
 */
async function ensureSession() {
  if (phpsessid) return phpsessid;
  if (sessionPromise) return sessionPromise;

  sessionPromise = new Promise((resolve, reject) => {
    console.log('[SCRAPER] Establishing new session with ModHub...');
    https.get(BASE_URL, (res) => {
      const cookies = res.headers['set-cookie'] || [];
      const sessionCookie = cookies.find(c => c.startsWith('PHPSESSID='));
      if (sessionCookie) {
        phpsessid = sessionCookie.split(';')[0];
        console.log(`[SCRAPER] Captured session: ${phpsessid}`);
      } else {
        console.warn('[SCRAPER] No PHPSESSID found, requests might fallback to Latest.');
      }
      sessionPromise = null; // Clear promise but keep phpsessid
      resolve(phpsessid);
    }).on('error', (err) => {
      sessionPromise = null;
      reject(err);
    });
  });

  return sessionPromise;
}

/**
 * Returns current session cookie if available.
 */
function getPHPSESSID() {
  return phpsessid;
}

async function throttledFetch(url) {
  await ensureSession();

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY) {
    await new Promise((r) => setTimeout(r, MIN_DELAY - elapsed));
  }
  lastRequestTime = Date.now();

  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.farming-simulator.com/mods.php?title=fs2025',
        'Connection': 'keep-alive'
      }
    };

    if (phpsessid) {
      options.headers['Cookie'] = phpsessid;
    }

    https.get(url, options, (res) => {
      if (res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const contentEncoding = res.headers['content-encoding'];
      let bodyStream = res;

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }

      if (contentEncoding === 'gzip') {
        bodyStream = res.pipe(zlib.createGunzip());
      } else if (contentEncoding === 'deflate') {
        bodyStream = res.pipe(zlib.createInflate());
      }

      let data = '';
      bodyStream.on('data', (d) => { data += d; });
      bodyStream.on('end', () => resolve(data));
      bodyStream.on('error', reject);
    }).on('error', reject);
  });
}

function resolveImageUrl(src, modId) {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  
  // Protocol-relative URLs
  if (src.startsWith('//')) return `https:${src}`;
  
  // Absolute URLs
  if (src.startsWith('http')) return src;
  
  // Site-relative URLs
  if (src.startsWith('/')) return `${BASE_URL}${src}`;
  
  // If it's a known placeholder or missing, try to construct a CDN URL
  if (src.includes('placeholders/cube') || src.includes('placeholders/placeholder')) {
    if (modId) {
      const paddedId = modId.padStart(8, '0');
      return `https://cdn18.giants-software.com/modHub/storage/${paddedId}/iconBig.jpg`;
    }
  }
  
  // Last resort: assume it's relative to BASE_URL
  return `${BASE_URL}/${src}`;
}

function resolveUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return `${BASE_URL}/${url}`;
}

/**
 * Extracts total pages from ModHub pagination HTML safely.
 */
function extractTotalPages($) {
  let totalPages = 1;
  $('.pagination li').each((_, el) => {
    const text = $(el).text().replace(/[^\d]/g, '').trim();
    if (text) {
      const pageNum = parseInt(text, 10);
      if (!isNaN(pageNum) && pageNum > totalPages) {
        totalPages = pageNum;
      }
    }
  });
  return totalPages;
}

/**
 * Normalizes strings like "1.2k" or "150M" into integers.
 */
function parseNumericValue(val) {
  if (!val) return 0;
  const clean = val.toString().toLowerCase().replace(/,/g, '').trim();
  const match = clean.match(/([\d.]+)([km])?/);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === 'k') num *= 1000;
  if (suffix === 'm') num *= 1000000;
  return Math.round(num);
}

// Helper to get all potential image URLs for a mod
function getModImageCandidate(modId, type = 'iconBig') {
  if (!modId) return null;
  const paddedId = modId.padStart(8, '0');
  return [
    `https://cdn16.giants-software.com/modHub/storage/${paddedId}/${type}.jpg`,
    `https://cdn17.giants-software.com/modHub/storage/${paddedId}/${type}.jpg`,
    `https://cdn18.giants-software.com/modHub/storage/${paddedId}/${type}.jpg`,
    `https://cdn19.giants-software.com/modHub/storage/${paddedId}/${type}.jpg`,
    `https://cdn20.giants-software.com/modHub/storage/${paddedId}/${type}.jpg`,
  ];
}

/**
 * Parse a single .mod-item card from a listing page.
 */
function parseModItem($, el) {
  const $el = $(el);

  // Extract modId
  let modId = null;
  $el.find('a[href*="mod_id="]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const match = href.match(/mod_id=(\d+)/);
    if (match) modId = match[1];
  });
  if (!modId) return null;

  // Image
  const imgEl = $el.find('.mod-item__img img, img').first();
  let image = imgEl.attr('src') || imgEl.attr('data-src') || '';
  image = resolveImageUrl(image, modId);
  
  // If we still don't have a good image, use our candidates
  const candidates = getModImageCandidate(modId, 'iconBig');
  if (!image && candidates) {
    image = candidates[0]; // Start with cdn18
  }

  // Title
  let title = $el.find('.mod-item__content h4').first().text().trim()
    || $el.find('.mod-item__content h3').first().text().trim()
    || $el.find('h4, h3').first().text().trim()
    || imgEl.attr('alt')
    || '';

  // Author: <p><span>By: Author</span></p>
  let author = '';
  let authorId = null;
  const authorLink = $el.find('.mod-item__content p a[href*="org_id="]').first();
  if (authorLink.length) {
    author = authorLink.text().trim();
    const idMatch = authorLink.attr('href').match(/org_id=(\d+)/);
    if (idMatch) authorId = idMatch[1];
  } else {
    const authorSpan = $el.find('.mod-item__content p span').first().text().trim();
    if (authorSpan) {
      author = authorSpan.replace(/^By:\s*/i, '').trim();
    }
  }

  // Rating: .mod-item__rating-num "4.4 (5910)"
  let rating = 0;
  let downloads = 0;
  const ratingNumEl = $el.find('.mod-item__rating-num');
  if (ratingNumEl.length) {
    const ratingText = ratingNumEl.text().trim();
    const ratingMatch = ratingText.match(/([\d.]+)/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
    const dlMatch = ratingText.match(/\(([^)]+)\)/);
    if (dlMatch) downloads = parseNumericValue(dlMatch[1]);
  }
  if (rating === 0) {
    const fullStars = $el.find('.icon-star:not(.grey)').length;
    if (fullStars > 0) rating = fullStars;
  }

  // Badges (Improved detection for NEW and UPDATE)
  const isNew = $el.find('.mod-label-new, .label-new, .mod-item__label--new, [data-label="new"]').length > 0 
                || $el.text().includes('NEW!');
  const isUpdate = $el.find('.mod-label-update, .label-update, .mod-item__label--update, [data-label="update"]').length > 0 
                   || $el.text().includes('UPDATE!');

  return {
    modId,
    title: title || 'Unknown Mod',
    author: author || 'Unknown',
    authorId,
    image,
    candidates: getModImageCandidate(modId, 'iconBig'),
    rating,
    downloads,
    isNew,
    isUpdate,
    url: `${MOD_URL}?mod_id=${modId}&title=fs2025`,
  };
}

/**
 * Fetch a paginated mod list from ModHub.
 * @param {string} filter - Category filter string (e.g. 'mapEurope')
 * @param {number} page - Result page (0-indexed)
 * @param {boolean} bustCache - If true, appends a unique timestamp
 */
async function fetchModList(filter, page = 0, bustCache = false) {
  // Map internal filters to website-friendly ones
  const filterMap = {
    'downloads': 'mostDownloaded',
    'best': 'rating',
    'latest': 'latest'
  };

  const f = filterMap[filter] || filter || 'latest';

  // Final working URL format confirmed by diagnostics
  let url = `${MODS_URL}?title=fs2025&filter=${f}&page=${page}`;

  console.log(`[SCRAPER] Fetching: ${url}`);
  
  try {
    const data = await throttledFetch(url);
    const $ = cheerio.load(data);
    const mods = [];
    const seenIds = new Set();

    $('.mod-item').each((_, el) => {
      const mod = parseModItem($, el);
      if (mod && mod.modId && !seenIds.has(mod.modId)) {
        seenIds.add(mod.modId);
        mods.push(mod);
      }
    });

    // Detect the actual active filter on the page to catch redirects/fallbacks
    let actualFilter = 'latest';
    const activeLink = $('.mod-hub-navigation__item.active a').attr('href');
    if (activeLink) {
      const match = activeLink.match(/filter=([^&?]+)/);
      if (match) actualFilter = match[1];
    }

    const totalPages = extractTotalPages($);

    return {
      mods,
      actualFilter, // Return what the server actually showed
      pagination: {
        current: page,
        total: totalPages
      }
    };
  } catch (err) {
    console.error(`[SCRAPER] Error fetching mod list: ${err.message}`);
    throw err;
  }
}

/**
 * Fetch mods by author (org_id).
 */
async function fetchModsByAuthor(authorId, page = 0) {
  const url = `${MODS_URL}?title=fs2025&filter=org&org_id=${authorId}&page=${page}&lang=en&country=gb`;
  const html = await throttledFetch(url);
  const $ = cheerio.load(html);

  const mods = [];
  const seenIds = new Set();
  $('.mod-item').each((_, el) => {
    const mod = parseModItem($, el);
    if (mod && mod.modId && !seenIds.has(mod.modId)) {
      seenIds.add(mod.modId);
      mods.push(mod);
    }
  });

  const totalPages = extractTotalPages($);

  return {
    mods,
    pagination: {
      current: page,
      total: totalPages
    }
  };
}

/**
 * Fetch detailed info for a single mod.
 *
 * The actual HTML structure from the ModHub detail page:
 *
 * <div class="row box-mods-item-info">
 *   <h2 class="column title-label">Mod Title</h2>
 *   <div class="medium-12 large-8 columns">
 *     <!-- Description text is here -->
 *   </div>
 *   <div class="medium-6 large-4 columns">
 *     <!-- Metadata table with div.table-row > div.table-cell pairs -->
 *     <div class="table-row">
 *       <div class="table-cell"><b>Category</b></div>
 *       <div class="table-cell"><a href="...">Gameplay</a></div>
 *     </div>
 *   </div>
 * </div>
 *
 * Screenshots: <img src="https://cdn19.giants-software.com/modHub/storage/00XXXXXX/screenshot0.jpg">
 * Author: <a href="...org_id=XXXXX">Author Name</a>
 * Download: <a href="https://cdnXX.giants-software.com/modHub/storage/00XXXXXX/FileName.zip">DOWNLOAD</a>
 * Rating: <div class="mod-item__rating-num">4.4 (5910)</div>
 */
async function fetchModDetail(modId) {
  const url = `${MOD_URL}?mod_id=${modId}&title=fs2025&lang=en&country=gb`;
  const html = await throttledFetch(url);
  const $ = cheerio.load(html);

  const paddedId = String(modId).padStart(8, '0');

  // ── Title ── from h2.title-label or first meaningful h2
  let title = '';
  const titleLabel = $('h2.title-label').first().text().trim();
  if (titleLabel) {
    title = titleLabel;
  } else {
    $('h2').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 2 && text !== text.toUpperCase() && !title &&
          !text.includes('Mod Powered') && !text.includes('Screenshots') && !text.includes('Social Media')) {
        title = text;
      }
    });
  }
  if (!title) title = 'Unknown Mod';

  // ── Author ── from <a href="...org_id=...">Author Name</a> (skip nav duplicates)
  let author = '';
  let authorId = null;
  // The org_id link inside .box-mods-item-info or .table-cell is the correct one
  const authorLinks = $('a[href*="org_id="]');
  authorLinks.each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    const $parent = $(el).parent();
    // Prefer links inside table-cell or info section, not nav
    if (text && text.length > 1 && text.length < 100 && !$parent.hasClass('menu-link')) {
      if (!author) author = text;
      const idMatch = href.match(/org_id=(\d+)/);
      if (idMatch && !authorId) authorId = idMatch[1];
    }
  });
  if (!author) author = 'Unknown';

  // ── Description ── from the div.medium-12.large-8.columns sibling of the title h2
  let description = '';
  const infoRow = $('.box-mods-item-info').first();
  if (infoRow.length) {
    const descDiv = infoRow.find('.large-8.columns, .medium-12.columns').first();
    if (descDiv.length) {
      description = descDiv.html().trim();
    }
  }
  // Fallback: just grab the first large text block after the title
  if (!description) {
    $('h2').each((_, el) => {
      const text = $(el).text().trim();
      if (text === title) {
        const $next = $(el).next();
        if ($next.length && $next.text().trim().length > 20) {
          description = $next.html().trim();
        }
      }
    });
  }

  // ── Images ── screenshots from CDN (screenshot0.jpg through screenshot5.jpg)
  const images = [];
  const seenUrls = new Set();

  // Find actual screenshot images on the page first
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    const resolved = resolveImageUrl(src, modId);
    if (
      resolved &&
      !seenUrls.has(resolved) &&
      resolved.includes('modHub/storage') &&
      !resolved.includes('orgLogo')
    ) {
      images.push(resolved);
      seenUrls.add(resolved);
    }
  });

  const iconUrl = `${CDN_BASE}/modHub/storage/${paddedId}/iconBig.jpg`;
  if (!seenUrls.has(iconUrl) && images.length === 0) {
    images.push(iconUrl);
  }

  // De-duplicate images based on filename (e.g. screenshot0.jpg)
  const uniqueImages = [];
  const seenFilenames = new Set();
  
  images.forEach(img => {
    const filename = img.split('/').pop().split('?')[0];
    if (filename && !seenFilenames.has(filename)) {
      uniqueImages.push(img);
      seenFilenames.add(filename);
    }
  });

  // Re-map images to unique list
  images.length = 0;
  images.push(...uniqueImages);
  
  // ── Download URL ── link to .zip on giants-software CDN
  let downloadUrl = '';

  // Helper to check if element is inside a dependencies section
  const isExcluded = (el) => {
    // 1. Direct check of parent text (for simple lists)
    const $el = $(el);
    const container = $el.closest('.row, .columns, section, div, ul');
    
    // Check if the container itself or any immediate predecessor is a "Required Mods" area
    const containerText = container.text().toLowerCase();
    const prevText = container.prevAll('h2, h3, h4').first().text().toLowerCase();
    
    const isRequiredArea = containerText.includes('required mods') || containerText.includes('necessary') 
                           || prevText.includes('required mods') || prevText.includes('necessary');

    // 2. But if it's inside the EXPLICIT download section, it's never excluded
    if ($el.closest('.download-box').length > 0) return false;
    
    return isRequiredArea;
  };

  // Tier 1: Look for explicit download container (Highest Priority)
  const mainDownloadBtn = $('.download-box a[href*=".zip"], .download-box a.button-buy, .download-box a.button-dark-green').first();
  if (mainDownloadBtn.length) {
    downloadUrl = resolveUrl(mainDownloadBtn.attr('href'));
    console.log(`[SCRAPER] Found download URL via explicit container: ${downloadUrl}`);
  }

  // Tier 2: Look for specific download-related patterns in the href
  if (!downloadUrl) {
    $('a[href*="/storage/"][href*=".zip"]').each((i, el) => {
      if (downloadUrl || isExcluded(el)) return;
      downloadUrl = resolveUrl($(el).attr('href'));
      console.log(`[SCRAPER] Found download URL via storage pattern: ${downloadUrl}`);
    });
  }

  // Tier 3: Identify via specific CSS buttons
  if (!downloadUrl) {
    $('.button-buy, .button-dark-green, [class*="button-download"], .btn-download').each((i, el) => {
      if (downloadUrl || isExcluded(el)) return;
      const href = $(el).attr('href');
      if (href && (href.includes('/storage/') || href.toLowerCase().includes('.zip'))) {
        downloadUrl = resolveUrl(href);
        console.log(`[SCRAPER] Found download URL via button selector: ${downloadUrl}`);
      }
    });
  }

  // Tier 4: Search for text content "DOWNLOAD"
  if (!downloadUrl) {
    $('a').each((i, el) => {
      if (downloadUrl || isExcluded(el)) return;
      const $el = $(el);
      const text = $el.text().trim().toUpperCase();
      const href = $el.attr('href') || '';
      if ((text === 'DOWNLOAD' || text.includes('GET MOD') || text === 'ZIP') && href.toLowerCase().includes('.zip')) {
        downloadUrl = resolveUrl(href);
        console.log(`[SCRAPER] Found download URL via text match: ${downloadUrl}`);
      }
    });
  }

  // Tier 5: Last resort fallback to any .zip link that isn't excluded
  if (!downloadUrl) {
    $('a[href*=".zip"]').each((i, el) => {
      if (downloadUrl || isExcluded(el)) return;
      downloadUrl = resolveUrl($(el).attr('href'));
      console.log(`[SCRAPER] Found download URL via broad fallback: ${downloadUrl}`);
    });
  }

  // ── Rating ── from .mod-item__rating-num "4.4 (5910)"
  let rating = 0;
  const ratingEl = $('.mod-item__rating-num').first();
  if (ratingEl.length) {
    const match = ratingEl.text().match(/([\d.]+)/);
    if (match) rating = parseFloat(match[1]);
  }
  if (rating === 0) {
    const stars = $('.mods-rating .icon-star:not(.grey)').length;
    if (stars > 0) rating = stars;
  }

  // ── Metadata ── from .table-row > .table-cell pairs
  const metadata = {};
  $('.table-row').each((_, el) => {
    const cells = $(el).find('.table-cell');
    if (cells.length >= 2) {
      const label = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      if (label && value && label.length < 50) {
        metadata[label] = value;
      }
    }
  });

  // ── Version ──
  let version = metadata['Released'] || metadata['Released date'] || ''; // Prioritize Released date for decay tracking
  let releasedDate = metadata['Released'] || metadata['Released date'] || '';
  
  let versionVal = metadata['Version'] || '';
  if (!versionVal) {
    Object.entries(metadata).forEach(([k, v]) => {
      if (k.toLowerCase().includes('version')) versionVal = v;
    });
  }
  if (!versionVal) versionVal = '—';

  // ── File Size ──
  let fileSize = metadata['File size'] || metadata['Filesize'] || '';
  if (!fileSize) {
    Object.entries(metadata).forEach(([k, v]) => {
      if (k.toLowerCase().includes('size')) fileSize = v;
    });
  }

  // ── Version History (Changelogs) ──
  const changelog = [];
  $('h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text.toLowerCase().includes('version history') || text.toLowerCase().includes('changelog')) {
      const $parent = $(el).closest('.row, .columns');
      $parent.find('h4, p, li').each((__, child) => {
        const item = $(child).text().trim();
        if (item && item.length > 1) changelog.push(item);
      });
    }
  });

  // ── Technical Stats (Price, HP, Capacity, Speed, Weight) ──
  const techData = {
    price: 0,
    hp: 0,
    hpIsRequirement: false,
    capacity: 0,
    speed: 0,
    weight: 0,
  };

  Object.entries(metadata).forEach(([k, v]) => {
    const key = k.toLowerCase();
    const valStr = (v || '').toString().toLowerCase();
    
    // Pattern 1: Standard numeric extraction
    const numMatch = valStr.match(/\d+/);
    const val = numMatch ? parseInt(numMatch[0], 10) : 0;
    
    if (key.includes('price')) techData.price = val;
    
    // Improved Horsepower/Power extraction (Table)
    if (key.includes('power') || key.includes('hp') || key.includes('performance') || key.includes('cv') || key.includes('ps') || key.includes('leistung') || key.includes('puissance')) {
      const explicitEngine = key.includes('engine') || key.includes('motor') || key.includes('motorleistung');
      
      // Look for explicit numbers followed by a power unit (e.g. "150 hp", "200 ps", "425 cv")
      const hpMatches = valStr.match(/(\d+)\s*(hp|cv|ps|pk|ch|kw|bhp|le)(?!\/)/gi);
      if (hpMatches) {
        const hpStr = hpMatches[0].toLowerCase();
        const hpNum = parseInt(hpStr.match(/\d+/)[0], 10);
        techData.hp = (hpStr.includes('kw') || hpStr.includes(' kw')) ? Math.round(hpNum * 1.36) : hpNum;
      } else if (val > 0) {
        // Handle range strings "100 - 150" by taking the last (highest) value
        const allNums = valStr.match(/\d+/g);
        if (allNums && allNums.length > 1) {
            techData.hp = parseInt(allNums[allNums.length - 1], 10);
        } else {
            // Standard single number
            const isModelString = /[\/-]\d+/.test(valStr) || /[a-z]\s*\d+[\/-]/i.test(valStr);
            if (explicitEngine || !isModelString) {
                techData.hp = val;
            }
        }
      }
      
      if (key.includes('required') || key.includes('requirement')) techData.hpIsRequirement = true;
    }
    else if (key.includes('capacity')) techData.capacity = val;
    else if (key.includes('speed') || key.includes('km/h') || key.includes('mph')) techData.speed = val;
    else if (key.includes('weight') || key.includes('kg') || key.includes(' t')) techData.weight = val;
  });

  // ── Description Deep Scan (Secondary Fallback) ──
  if (techData.hp === 0 && description) {
    const descText = description.replace(/<[^>]*>/g, ' ').toLowerCase();
    
    // Catch common patterns in sentences: "Power: 150 hp", "425 Horsepower", "150 CV", etc.
    const leadPatterns = [
        /(?:horsepower|power|performance|requirement|required|leistung|puissance|output)[:\-\s]*(\d+)/i,
        /(\d+)\s*(?:hp|cv|ps|pk|ch|kw|bhp|horsepower)/i,
        /\+\s*power[:\s]*(\d+)/i // Used in packs (e.g. + Power: 100)
    ];
    
    for (const pattern of leadPatterns) {
        const match = descText.match(pattern);
        if (match && match[1]) {
            const fullMatch = match[0];
            // Exclusion check for model strings or version numbers
            if (/[\/-]\d+/.test(fullMatch)) continue;

            let hp = parseInt(match[1], 10);
            if (descText.includes(match[1] + ' kw') || descText.includes(match[1] + 'kw')) {
                hp = Math.round(hp * 1.36);
            }

            // Sanity check: ensure it's a realistic tractor power value
            if (hp > 15 && hp < 2000) { 
                techData.hp = hp;
                // If the pattern implies requirement, mark it
                if (pattern.source.includes('required') || pattern.source.includes('requirement') || descText.includes('required power')) {
                    techData.hpIsRequirement = true;
                }
                break;
            }
        }
    }
  }

  // ── Brand ──
  let brand = metadata['Manufacturer'] || metadata['Brand'] || '';
  if (!brand) {
    Object.entries(metadata).forEach(([k, v]) => {
      if (k.toLowerCase().includes('brand') || k.toLowerCase().includes('manufac')) brand = v;
    });
  }

  // ── Category ──
  // ── Category & Type Flags ──
  const category = (metadata['Category'] || metadata['category'] || '').trim();
  const isMap = category.toLowerCase().includes('map') || title.toLowerCase().includes('map');
  const isPack = category.toLowerCase().includes('package') || title.toLowerCase().includes('pack');

  // ── Dependencies (Required Mods) ──
  const dependencies = [];
  // FS25 ModHub uses various heading levels and text for required mods
  const headings = $('h3, h4, h2');
  const requiredHeading = headings.filter((_, el) => {
    // Normalize spaces (convert &nbsp; or multiple spaces to single space)
    const text = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
    return /required.*mods|necessary.*mods|nécessaires|erforderliche|benötigte|necessary/i.test(text);
  }).first();

  if (requiredHeading.length) {
    seenUrls.clear(); // Re-use for dependency de-duping
    const seenTitles = new Set();
    
    // We must traverse ALL siblings (including text nodes) after the heading 
    // because some ModHub layouts list them as shared siblings, not in a container.
    let foundHeading = false;
    requiredHeading.parent().contents().each((_, node) => {
      if (node === requiredHeading[0]) {
        foundHeading = true;
        return;
      }
      if (!foundHeading) return;
      
      // Stop if we hit another major heading
      if (node.type === 'tag' && /^h[1-6]$/i.test(node.tagName)) {
        foundHeading = false;
        return;
      }

      const $node = $(node);

      // Strategy A: Direct matches (Links)
      if (node.type === 'tag' && node.tagName === 'a') {
        const dTitle = $node.text().trim();
        const dHref = $node.attr('href') || '';
        if (dTitle && dHref && dTitle.length > 2) {
          const resolved = resolveUrl(dHref);
          if (!seenUrls.has(resolved)) {
            dependencies.push({ title: dTitle, url: resolved });
            seenUrls.add(resolved);
            seenTitles.add(dTitle.toLowerCase());
          }
        }
      } 
      // Strategy B: Deep search in elements (if they aren't anchor tags themselves)
      else if (node.type === 'tag') {
        $node.find('a').each((_, el) => {
          const dTitle = $(el).text().trim();
          const dHref = $(el).attr('href') || '';
          if (dTitle && dHref && dTitle.length > 2) {
            const resolved = resolveUrl(dHref);
            if (!seenUrls.has(resolved)) {
              dependencies.push({ title: dTitle, url: resolved });
              seenUrls.add(resolved);
              seenTitles.add(dTitle.toLowerCase());
            }
          }
        });
      }

      // Strategy C: Text parsing (for mods listed without links)
      // Capture text from text nodes OR non-anchor tags
      const rawText = (node.type === 'text') ? node.data : $node.text();
      if (rawText && rawText.trim().length > 3) {
        // Split by typical list delimiters
        const lines = rawText.split(/,|\n|;|•|\|/);
        lines.forEach(line => {
          let clean = line.trim()
            .replace(/^[•\-\+]\s*/, '') // Remove bullets
            .replace(/\(By:.*?\)/i, '') // Remove author info
            .trim();
          
          if (clean && clean.length > 3 && clean.length < 100 &&
              !seenTitles.has(clean.toLowerCase()) && 
              !clean.toLowerCase().includes('required mods') &&
              !clean.toLowerCase().includes('necessary') &&
              !clean.toLowerCase().includes('included')) {
            dependencies.push({ title: clean, url: '' });
            seenTitles.add(clean.toLowerCase());
          }
        });
      }
    });
  }

  // Final deep deduplication of dependencies
  const dedupedDependencies = [];
  const finalSeen = new Set();
  
  // Sort so that entries with URLs (ModHub links) are processed first and take precedence
  const sortedDeps = [...dependencies].sort((a, b) => (b.url ? 1 : 0) - (a.url ? 1 : 0));

  for (const dep of sortedDeps) {
    // Normalize: strip authors, "Pack" suffixes, version numbers, and non-alphanumerics
    const raw = dep.title.toLowerCase()
      .replace(/\s*(?:\(|\[)?by:?.*?(?:\)|\])?$/i, '') // strip (by Author) or [by Author] or BY AUTHOR at end
      .replace(/\s+pack(?:age)?/i, '')               // strip " Pack" or " Package"
      .replace(/\s*v?\d+\.\d+\.\d+(?:\.\d+)?/i, '')    // strip version numbers
      .replace(/[^a-z0-9]/g, '');

    if (raw.length > 2) {
      let isDuplicate = false;
      
      // Fuzzy Containment check:
      // If "Kinlaig" is already seen, "KinlaigPack" or "Kinlaig (by GIANTS)" will be flagged as duplicates.
      for (const entry of finalSeen) {
        const existing = entry.raw;
        if (existing.includes(raw) || raw.includes(existing)) {
          const ratio = Math.min(existing.length, raw.length) / Math.max(existing.length, raw.length);
          if (ratio > 0.6) {
            isDuplicate = true;
            break;
          }
        }
      }

      // Filename check: prevent "FS25_SiloPack" from appearing if "Small Grain Silos Pack" is already there
      // because they share the same ZIP link.
      if (!isDuplicate) {
        for (const entry of finalSeen) {
          if (entry.filename && (entry.filename.includes(raw) || raw.includes(entry.filename))) {
            isDuplicate = true;
            break;
          }
        }
      }

      if (!isDuplicate) {
        const filename = dep.url ? dep.url.split('/').pop().toLowerCase().replace(/\.zip$/, '').replace(/[^a-z0-9]/g, '') : '';
        dedupedDependencies.push(dep);
        finalSeen.add({ raw, filename });
      }
    }
  }

  return {
    modId,
    title,
    author,
    authorId,
    description,
    images,
    downloadUrl,
    rating,
    metadata,
    version: versionVal,
    fileSize,
    changelog,
    techData,
    releasedDate,
    dependencies: dedupedDependencies,
    isMap: category.toUpperCase().includes('MAP') || category.toUpperCase().includes('TERRAIN') || title.toUpperCase().includes('MAP') || (fileSize && fileSize.includes('GB')),
    category
  };
}

/**
 * Search mods by query.
 */
async function searchMods(query, page = 0, gameTitle = 'fs2025') {
  const url = `${MODS_URL}?title=${gameTitle}&searchMod=${encodeURIComponent(query)}&page=${page}&lang=en&country=gb`;
  const html = await throttledFetch(url);
  const $ = cheerio.load(html);

  const mods = [];
  const seenIds = new Set();

  $('.mod-item').each((_, el) => {
    const mod = parseModItem($, el);
    if (mod && mod.modId && !seenIds.has(mod.modId)) {
      seenIds.add(mod.modId);
      mods.push(mod);
    }
  });

  if (mods.length === 0) {
    // Only attempt fallback if we find the main mod container to avoid sidebar pollution
    const $mainContent = $('.mod-hub-items, .medium-12.large-9.columns').first();
    if ($mainContent.length) {
      $mainContent.find('a[href*="mod.php?mod_id="]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const match = href.match(/mod_id=(\d+)/);
        if (!match) return;
        const modId = match[1];
        if (seenIds.has(modId)) return;
        seenIds.add(modId);

      const $parent = $a.closest('.mod-item, div[class*="mod"]').first();
      const scope = $parent.length ? $parent : $a;
      const imgEl = scope.find('img').first();
      let image = imgEl.attr('src') || '';
      image = resolveImageUrl(image);
      if (!image) {
        const paddedId = modId.padStart(8, '0');
        image = `${CDN_BASE}/modHub/storage/${paddedId}/iconBig.jpg`;
      }

      const title = $a.text().trim() || imgEl.attr('alt') || '';
      if (title && title.length > 2 && title.length < 200 && title !== title.toUpperCase()) {
        mods.push({
          modId,
          title,
          author: 'Unknown',
          image,
          rating: 0,
          downloads: 0,
          url: `${MOD_URL}?mod_id=${modId}&title=fs2025`,
        });
      }
    });
    }
  }

  const totalPages = extractTotalPages($);

  return {
    mods,
    pagination: {
      current: page,
      total: totalPages
    }
  };
}

/**
 * Fetch the exact total count of mods by checking the last page.
 */
async function fetchTrueModCount() {
  try {
    // 1. Get total pages from page 0
    const firstPageUrl = `${MODS_URL}?title=fs2025&filter=latest&page=0`;
    const firstPageHtml = await throttledFetch(firstPageUrl);
    const $ = cheerio.load(firstPageHtml);
    
    const totalPages = extractTotalPages($);

    if (totalPages <= 1) {
      return $('.mod-item').length;
    }

    // 2. Fetch the last page (totalPages-1)
    const lastPageUrl = `${MODS_URL}?title=fs2025&filter=latest&page=${totalPages - 1}`;
    const lastPageHtml = await throttledFetch(lastPageUrl);
    const $last = cheerio.load(lastPageHtml);
    const modsOnLastPage = $last('.mod-item').length;

    // 3. Exact calculation: All full pages (24 mods) + last page remainder
    return ((totalPages - 1) * 24) + modsOnLastPage;
  } catch (err) {
    console.error(`[SCRAPER] Failed to fetch true total: ${err.message}`);
    return 0;
  }
}

module.exports = { fetchModList, fetchModDetail, searchMods, fetchModsByAuthor, fetchTrueModCount, getPHPSESSID };
