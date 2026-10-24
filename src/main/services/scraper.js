const https = require('https');
const zlib = require('zlib');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.farming-simulator.com';
const CDN_BASE = 'https://cdn19.giants-software.com';
const MODS_URL = `${BASE_URL}/mods.php`;
const MOD_URL = `${BASE_URL}/mod.php`;

// Rate limit: one request per 1.5 seconds
let lastRequestTime = 0;
const MIN_DELAY = 150;
let phpsessid = null;
let sessionPromise = null;

/**
 * Ensures we have a valid PHPSESSID to bypass bot-detection fallback.
 * Uses a singleton promise to prevent concurrent handshake requests.
 */
async function ensureSession() {
  if (phpsessid) return phpsessid;
  if (sessionPromise) return sessionPromise;

  sessionPromise = new Promise((resolve) => {
    console.log('[SCRAPER] Establishing new session with ModHub...');
    const req = https.get(BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    }, (res) => {
      const cookies = res.headers['set-cookie'] || [];
      const sessionCookie = cookies.find(c => c.startsWith('PHPSESSID='));
      if (sessionCookie) {
        phpsessid = sessionCookie.split(';')[0];
        console.log(`[SCRAPER] Captured session: ${phpsessid}`);
      } else {
        console.warn('[SCRAPER] No PHPSESSID found, requests might fallback to Latest.');
      }
      res.resume();
      sessionPromise = null; // Clear promise but keep phpsessid
      resolve(phpsessid);
    });

    req.on('timeout', () => {
      console.warn('[SCRAPER] Session handshake timed out. Proceeding without session cookie.');
      req.destroy();
      sessionPromise = null;
      resolve(null);
    });

    req.on('error', (err) => {
      console.warn(`[SCRAPER] Session handshake error: ${err.message}. Proceeding without session cookie.`);
      sessionPromise = null;
      resolve(null);
    });
  });

  return sessionPromise;
}

/**
 * Accurately determines if a category string belongs to a map category.
 * Non-map categories like Gameplay, Prefab, Package, Objects, etc. are strictly false.
 */
function isMapCategory(category) {
  if (!category || typeof category !== 'string') return false;
  const c = category.trim().toLowerCase();
  // Any explicit non-map category is strictly false
  if (
    c.includes('gameplay') ||
    c.includes('prefab') ||
    c.includes('package') ||
    c.includes('object') ||
    c.includes('placeable') ||
    c.includes('drivable') ||
    c.includes('trailer') ||
    c.includes('tool') ||
    c.includes('animal') ||
    c.includes('baling') ||
    c.includes('harvest') ||
    c.includes('forestry') ||
    c.includes('grassland') ||
    c.includes('grape') ||
    c.includes('loader') ||
    c.includes('rootcrop') ||
    c.includes('seeding') ||
    c.includes('cultivation') ||
    c.includes('crop') ||
    c.includes('vegetable') ||
    c.includes('yield') ||
    c.includes('misc')
  ) {
    return false;
  }
  return /\bmaps?\b/i.test(c);
}

/**
 * Returns current session cookie if available.
 */
function getPHPSESSID() {
  return phpsessid;
}

function clearSession() {
  phpsessid = null;
  sessionPromise = null;
  console.log('[SCRAPER] Session cleared. Will fetch a fresh token on next request.');
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

    const req = https.get(url, options, (res) => {
      if (res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const contentEncoding = res.headers['content-encoding'];
      let bodyStream = res;

      res.on('error', (err) => {
        console.warn(`[SCRAPER] Response stream error for ${url}: ${err.message}`);
        reject(err);
      });

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }

      if (contentEncoding === 'gzip') {
        const gunzip = zlib.createGunzip();
        gunzip.on('error', (err) => {
          console.warn(`[SCRAPER] Gunzip error for ${url}: ${err.message}`);
          reject(err);
        });
        bodyStream = res.pipe(gunzip);
      } else if (contentEncoding === 'deflate') {
        const inflate = zlib.createInflate();
        inflate.on('error', (err) => {
          console.warn(`[SCRAPER] Inflate error for ${url}: ${err.message}`);
          reject(err);
        });
        bodyStream = res.pipe(inflate);
      }

      let data = '';
      bodyStream.on('data', (d) => { data += d; });
      bodyStream.on('end', () => resolve(data));
      bodyStream.on('error', (err) => reject(err));
    });

    req.on('error', (err) => {
      console.warn(`[SCRAPER] Network error for ${url}: ${err.message}`);
      reject(err);
    });

    req.setTimeout(12000, () => {
      req.destroy(new Error('Request timed out'));
    });
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
    let totalMods = mods.length;
    if (totalPages > 1) {
      if (page === totalPages - 1) {
        totalMods = ((totalPages - 1) * 24) + mods.length;
      } else {
        try {
          const lastPageUrl = `${MODS_URL}?title=fs2025&filter=${f}&page=${totalPages - 1}`;
          const lastPageHtml = await throttledFetch(lastPageUrl);
          const $last = cheerio.load(lastPageHtml);
          const lastModsCount = $last('.mod-item').length;
          totalMods = ((totalPages - 1) * 24) + (lastModsCount || 24);
        } catch (_) {
          totalMods = ((totalPages - 1) * 24) + 24;
        }
      }
    }

    return {
      mods,
      actualFilter, // Return what the server actually showed
      pagination: {
        current: page,
        total: totalPages,
        totalMods
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
  let totalMods = mods.length;
  if (totalPages > 1) {
    if (page === totalPages - 1) {
      totalMods = ((totalPages - 1) * 24) + mods.length;
    } else {
      try {
        const lastUrl = `${MODS_URL}?title=fs2025&filter=org&org_id=${authorId}&page=${totalPages - 1}&lang=en&country=gb`;
        const lastHtml = await throttledFetch(lastUrl);
        const $last = cheerio.load(lastHtml);
        const lastModsCount = $last('.mod-item').length;
        totalMods = ((totalPages - 1) * 24) + (lastModsCount || 24);
      } catch (_) {
        totalMods = ((totalPages - 1) * 24) + 24;
      }
    }
  }

  return {
    mods,
    pagination: {
      current: page,
      total: totalPages,
      totalMods
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
  return parseModDetailFromHtml(html, modId);
}

function parseModDetailFromHtml(html, modId) {
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

  // Helper to check if element is strictly inside a Required Mods list container
  const isExcluded = (el) => {
    const $el = $(el);

    // If it's the main download button or inside any download box/container, NEVER exclude
    if ($el.closest('.download-box, .mod-item__btn, .download-btn, [class*="download"]').length > 0) {
      return false;
    }

    // Only exclude if it's inside an explicit required mods list/container
    const listContainer = $el.closest('ul, ol, .required-mods, .dependencies-list');
    if (listContainer.length > 0) {
      const prevHeader = listContainer.prevAll('h2, h3, h4, .title-mods-label').first().text().toLowerCase();
      if (prevHeader.includes('required') || prevHeader.includes('erforderliche') || prevHeader.includes('nécessaires')) {
        return true;
      }
    }

    return false;
  };

  // Tier 1: Look for explicit download container & direct storage zip buttons (Highest Priority)
  const mainDownloadBtn = $('.download-box a[href*=".zip"], .mod-item__btn a[href*=".zip"], a.button-buy[href*=".zip"], a.button-dark-green[href*=".zip"], a[href*="/storage/"][href*=".zip"]').first();
  if (mainDownloadBtn.length) {
    downloadUrl = resolveUrl(mainDownloadBtn.attr('href'));
    console.log(`[SCRAPER] Found download URL via direct download button: ${downloadUrl}`);
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

  // ── Category & Type Flags ──
  const category = (metadata['Category'] || metadata['category'] || '').trim();
  const isMap = isMapCategory(category);
  const isPack = category.toLowerCase().includes('package') || title.toLowerCase().includes('pack');

  // ── Brand ──
  let brand = metadata['Manufacturer'] || metadata['Brand'] || '';
  if (!brand) {
    Object.entries(metadata).forEach(([k, v]) => {
      if (k.toLowerCase().includes('brand') || k.toLowerCase().includes('manufac')) brand = v;
    });
  }

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
    unitCapacity: 0,
    unitCapacityType: '',
    speed: 0,
    weight: 0,
    scraped: true
  };

  // Pattern 1: Standard numeric extraction
  // Helper to extract full clean integer from formatted numeric strings like "125,000 €", "125 000 $", "1,500 L", "32 m³"
  const parseCleanInt = (str) => {
    if (!str) return 0;
    const lower = str.toString().toLowerCase();
    const isCubicMeter = lower.includes('m³') || lower.includes('m3');
    
    if (isCubicMeter) {
        const match = lower.replace(/,/g, '.').match(/([\d.]+)/);
        if (match && match[1]) {
            const val = parseFloat(match[1]);
            return Math.round(val * 1000);
        }
        return 0;
    }
    
    const cleaned = lower.replace(/[$€£]/g, '').replace(/(\d+)[\s,.](\d{3})/g, '$1$2').replace(/[^0-9]/g, '');
    return parseInt(cleaned, 10) || 0;
  };

  // Helper to parse min and max from formatted strings (e.g. "16.500 - 30.000 l", "24,000 - 40,000 €", "100 - 150 hp")
  const parseRange = (str) => {
    if (!str) return { min: 0, max: 0 };
    const lower = str.toString().toLowerCase();
    const isCubicMeter = lower.includes('m³') || lower.includes('m3');
    
    if (isCubicMeter) {
      const match = lower.replace(/,/g, '.').match(/([\d.]+)/);
      if (match && match[1]) {
        const val = Math.round(parseFloat(match[1]) * 1000);
        return { min: val, max: val };
      }
      return { min: 0, max: 0 };
    }
    
    const parts = lower.split(/[\/–—~-]|(?:\s+to\s+)|(?:\s+bis\s+)|(?:\s+à\s+)|(?:\s+a\s+)/);
    const cleanedParts = parts.map(p => {
      const cleaned = p.replace(/[$€£]/g, '').replace(/(\d+)[\s,.](\d{3})/g, '$1$2').replace(/[^0-9]/g, '');
      return parseInt(cleaned, 10) || 0;
    }).filter(n => n > 0);
    
    if (cleanedParts.length === 0) return { min: 0, max: 0 };
    return { 
      min: Math.min(...cleanedParts), 
      max: Math.max(...cleanedParts) 
    };
  };

  Object.entries(metadata).forEach(([k, v]) => {
    const key = k.toLowerCase();
    const valStr = (v || '').toString().toLowerCase();

    if (key.includes('price') || key.includes('preis') || key.includes('prix') || key.includes('precio') || key.includes('prezzo') || key.includes('cena') || key.includes('preço')) {
      const p = parseRange(valStr); techData.price = p.max; techData.priceMin = p.min; techData.priceMax = p.max;
    }
    
    // Improved Horsepower/Power extraction (Table)
    if (key.includes('power') || key.includes('hp') || key.includes('performance') || key.includes('cv') || key.includes('ps') || key.includes('leistung') || key.includes('puissance')) {
      const explicitEngine = key.includes('engine') || key.includes('motor') || key.includes('motorleistung');
      
      // Look for explicit numbers followed by a power unit (e.g. "150 hp", "200 ps", "425 cv")
      const hpMatches = valStr.match(/(\d[\d\s,.]*)\s*(hp|cv|ps|pk|ch|kw|bhp|le)(?!\/)/gi);
      if (hpMatches) {
        const hpStr = hpMatches[0].toLowerCase();
        const hpNum = parseRange(hpStr).max;
        techData.hp = (hpStr.includes('kw') || hpStr.includes(' kw')) ? Math.round(hpNum * 1.36) : hpNum;
      } else {
        const val = parseRange(valStr).max;
        if (val > 0) {
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
      }
      
      if (key.includes('required') || key.includes('requirement')) techData.hpIsRequirement = true;
    }
    else if (key.includes('capacity') || key.includes('kapazität') || key.includes('capacité') || key.includes('fassungsvermögen') || key.includes('capacidad') || key.includes('capacità') || key.includes('pojemność')) {
      const c = parseRange(valStr); techData.capacity = c.max; techData.capacityMin = c.min; techData.capacityMax = c.max;
    }
    else if (key.includes('speed') || key.includes('km/h') || key.includes('mph') || key.includes('geschwindigkeit')) {
      techData.speed = parseRange(valStr).max;
    }
    else if (key.includes('weight') || key.includes('gewicht') || key.includes('poids')) {
      techData.weight = parseRange(valStr).max;
    }
  });

  // ── Description Deep Scan for Price, HP & Capacity Ranges/Fallbacks ──
  if (description) {
    const rawLines = description
      .replace(/<br[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    // 1. Price scan across lines (extracts min and max prices across packs & variants)
    const pricePrefixRe = /^(?:[-*•\s]*)(?:base\s+price|configuration\s+price|prices?\s*(?:and\s+capacity)?\s*(?:from|ab|à partir de)?|preis(?:\s*(?:ab|von))?|prix(?:\s*(?:à partir de))?|precio(?:\s*(?:desde))?|prezzo|cena|preço|cost|kosten)[:\-\s]*(.*)/i;
    const descPrices = [];
    const addonPrices = [];
    let inPriceBlock = false;
    const upgradeRe = /(?:\+\s*[$€£]?\s*([0-9][0-9'’\s,.]*[0-9]|[0-9]+)|[$€£]?\s*([0-9][0-9'’\s,.]*[0-9]|[0-9]+)\s*[$€£]?\s*(?:extra|more|zus[aä]tzlich|aufpreis|zusatzkosten)|(?:extra|aufpreis|zusatzkosten)[:\s]*[$€£]?\s*([0-9][0-9'’\s,.]*[0-9]|[0-9]+))/i;

    const extractPricesFromText = (str, list) => {
      // 1. Explicit currency range expressions like "$42,500 - $68,500", "24.000 - 40.000 €", "from $24,000 to $40,000"
      const currRangeRe = /(?:[$€£]\s*)(\d[\d'’\s,.]*\d|\d+)\s*(?:[-–—~]|\s+to\s+|\s+bis\s+|\s+à\s+|\s+a\s+)\s*(?:[$€£]\s*)?(\d[\d'’\s,.]*\d|\d+)|(\d[\d'’\s,.]*\d|\d+)\s*[$€£]?\s*(?:[-–—~]|\s+to\s+|\s+bis\s+|\s+à\s+|\s+a\s+)\s*(\d[\d'’\s,.]*\d|\d+)\s*[$€£]/gi;
      let rMatch;
      while ((rMatch = currRangeRe.exec(str)) !== null) {
        const p1Str = rMatch[1] || rMatch[3];
        const p2Str = rMatch[2] || rMatch[4];
        [p1Str, p2Str].forEach(s => {
          if (!s) return;
          s = s.replace(/['’]/g, '').trim();
          let val = 0;
          if (/^\d{1,3}[,.\s]\d{3}$/.test(s) || /^\d{1,3}(?:[,.\s]\d{3})+$/.test(s)) {
            val = parseInt(s.replace(/[,.\s]/g, ''), 10);
          } else {
            val = parseInt(s.replace(/[^0-9]/g, ''), 10);
          }
          if (val >= 100 && val < 50000000) list.push(val);
        });
      }

      // 2. Extract numbers with currency symbols: $1000 or 1000€
      const tokenWithCurrRe = /(?:[$€£]\s*)(\d[\d'’\s,.]*\d|\d+)|(\d[\d'’\s,.]*\d|\d+)\s*[$€£]/g;
      let match;
      while ((match = tokenWithCurrRe.exec(str)) !== null) {
        let s = (match[1] || match[2]).replace(/['’]/g, '');
        let val = 0;
        if (/^\d{1,3}[,.\s]\d{3}$/.test(s) || /^\d{1,3}(?:[,.\s]\d{3})+$/.test(s)) {
          val = parseInt(s.replace(/[,.\s]/g, ''), 10);
        } else {
          val = parseInt(s.replace(/[^0-9]/g, ''), 10);
        }
        if (val >= 100 && val < 50000000) list.push(val);
      }

      // 3. Numbers following explicit price keywords without currency symbol: Price: 15,000 or Base price: 25.000
      const kwPriceRe = /(?:base\s+price|configuration\s+price|prices?\s*(?:and\s+capacity)?\s*(?:from|ab|à partir de)?|preis(?:\s*(?:ab|von))?|prix(?:\s*(?:à partir de))?|precio(?:\s*(?:desde))?|prezzo|cena|preço|cost|kosten)[:\-\s]+([0-9][0-9'’\s,.]*[0-9]|[0-9]+)/gi;
      while ((match = kwPriceRe.exec(str)) !== null) {
        let s = match[1].replace(/['’]/g, '').trim();
        let val = 0;
        if (/^\d{1,3}[,.\s]\d{3}$/.test(s) || /^\d{1,3}(?:[,.\s]\d{3})+$/.test(s)) {
          val = parseInt(s.replace(/[,.\s]/g, ''), 10);
        } else {
          val = parseInt(s.replace(/[^0-9]/g, ''), 10);
        }
        if (val >= 500 && val < 50000000) list.push(val);
      }
    };

    for (const line of rawLines) {
      // Check for upgrade / option add-on prices (e.g. "+ $1,000 for extra capacity", "(+ 1.000 €)", "Aufpreis: 2.500 €")
      const um = line.match(upgradeRe);
      if (um) {
        let s = (um[1] || um[2] || um[3]).replace(/['’]/g, '').trim();
        let val = 0;
        if (/^\d{1,3}[,.\s]\d{3}$/.test(s) || /^\d{1,3}(?:[,.\s]\d{3})+$/.test(s)) {
          val = parseInt(s.replace(/[,.\s]/g, ''), 10);
        } else {
          val = parseInt(s.replace(/[^0-9]/g, ''), 10);
        }
        if (val >= 50 && val < 5000000) {
          addonPrices.push(val);
        }
      }

      const pm = line.match(pricePrefixRe);
      if (pm) {
        if (pm[1] && pm[1].trim()) {
          extractPricesFromText(pm[1], descPrices);
        } else {
          inPriceBlock = true;
          continue;
        }
      } else if (inPriceBlock) {
        if (/^[-*•]/.test(line)) {
          if (!um) extractPricesFromText(line, descPrices);
          continue;
        } else {
          inPriceBlock = false;
        }
      }

      // Model-level or inline prices (e.g. "- 60-21: from $42,500" or "Trailer: 44.000$" or "DBL8: 11500$")
      if (!um && /[$€£]/.test(line) && !/(?:kph|mph|km\/h|working\s*width|arbeitsbreite)/i.test(line)) {
        extractPricesFromText(line, descPrices);
      }
    }
    if (descPrices.length > 0) {
      const dMin = Math.min(...descPrices);
      const dMax = Math.max(...descPrices);
      if (!techData.price || techData.price === 0 || (techData.price < 500 && dMax >= 500)) {
        techData.price = dMax;
        techData.priceMin = dMin;
        techData.priceMax = dMax;
      } else {
        // Broaden known price range if description lists wider bounds
        if (!techData.priceMin || dMin < techData.priceMin) techData.priceMin = dMin;
        if (!techData.priceMax || dMax > techData.priceMax) techData.priceMax = dMax;
        // If table gave a single price (priceMin === priceMax) but description revealed multiple prices
        if (dMin < dMax && techData.priceMin === techData.priceMax) {
          techData.priceMin = Math.min(techData.priceMin, dMin);
          techData.priceMax = Math.max(techData.priceMax, dMax);
        }
      }
    } else if (techData.price === 0 || techData.price < 500) {
      // Fallback regex on stripped text
      const descText = description.replace(/<[^>]*>/g, ' ');
      const priceMatch = descText.match(/(?:base\s+price|configuration\s+price|prices?\s*(?:from|ab|à partir de)?|preis(?:\s*(?:ab|von))?|prix(?:\s*(?:à partir de))?|precio|prezzo|cena|cost|kosten)[:\-\s]*([$€£]?\s*[\d'’\s,.]*\d|\d+)/i) || descText.match(/([$€£]\s*[\d'’\s,.]*\d)/i);
      if (priceMatch && priceMatch[1]) {
        let s = priceMatch[1].replace(/[$€£'’]/g, '').trim();
        let parsedPrice = 0;
        if (/^\d{1,3}[,.\s]\d{3}$/.test(s)) {
          parsedPrice = parseInt(s.replace(/[,.\s]/g, ''), 10);
        } else {
          parsedPrice = parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
        }
        if (parsedPrice >= 50 && parsedPrice < 50000000) {
          techData.price = parsedPrice;
          techData.priceMin = parsedPrice;
          techData.priceMax = parsedPrice;
        }
      }
    }

    // Addon / upgrade configurations: add top upgrade cost to priceMax to form the complete price range
    if (addonPrices.length > 0) {
      const maxAddon = Math.max(...addonPrices);
      const currentBase = techData.priceMin || techData.price || 0;
      if (currentBase > 0) {
        techData.priceMin = currentBase;
        techData.priceMax = (techData.priceMax || currentBase) + maxAddon;
        techData.price = techData.priceMax;
      }
    }

    // 2. Horsepower scan across lines
    const hpLineRe = /^(?:[-*•\s]*)(?:power|leistung|puissance|horsepower|engine power|motorleistung|required power|leistung required|power requirement)[:\-\s]+(.*)$/i;
    const descHps = [];
    let hpRequirementDetected = false;
    for (const line of rawLines) {
      const hm = line.match(hpLineRe);
      if (hm && hm[1]) {
        const matches = hm[1].match(/(\d+)\s*(?:hp|cv|ps|pk|ch|kw|bhp|horsepower)?/gi);
        if (matches) {
          for (const mat of matches) {
            const numMatch = mat.match(/(\d+)/);
            if (numMatch) {
              let hp = parseInt(numMatch[1], 10);
              if (/kw/i.test(mat)) hp = Math.round(hp * 1.36);
              if (hp > 15 && hp < 2000) descHps.push(hp);
            }
          }
        }
        if (/required|requirement|benötigt/i.test(line)) hpRequirementDetected = true;
      }
    }
    if (descHps.length > 0) {
      const hMin = Math.min(...descHps);
      const hMax = Math.max(...descHps);
      if (!techData.hp || techData.hp === 0) {
        techData.hp = hMax;
        techData.hpMin = hMin;
        techData.hpMax = hMax;
        if (hpRequirementDetected) techData.hpIsRequirement = true;
      } else {
        if (!techData.hpMin || hMin < techData.hpMin) techData.hpMin = hMin;
        if (!techData.hpMax || hMax > techData.hpMax) techData.hpMax = hMax;
      }
    } else if (techData.hp === 0) {
      // Fallback single regex on stripped text
      const descText = description.replace(/<[^>]*>/g, ' ');
      const leadPatterns = [
        /(?:horsepower|power|performance|requirement|required|leistung|puissance|output)[:\-\s]*(\d+)/i,
        /(\d+)\s*(?:hp|cv|ps|pk|ch|kw|bhp|horsepower)/i,
        /\+\s*power[:\s]*(\d+)/i
      ];
      for (const pattern of leadPatterns) {
        const match = descText.match(pattern);
        if (match && match[1]) {
          const fullMatch = match[0];
          if (/[\/-]\d+/.test(fullMatch)) continue;
          let hp = parseInt(match[1], 10);
          if (descText.includes(match[1] + ' kw') || descText.includes(match[1] + 'kw')) {
            hp = Math.round(hp * 1.36);
          }
          if (hp > 15 && hp < 2000) {
            techData.hp = hp;
            techData.hpMin = hp;
            techData.hpMax = hp;
            if (pattern.source.includes('required') || pattern.source.includes('requirement') || descText.includes('required power')) {
              techData.hpIsRequirement = true;
            }
            break;
          }
        }
      }
    }

    const catStr = (metadata['Category'] || metadata['category'] || '').toLowerCase();
    const titleStr = (title || '').toLowerCase();
    const descStr = (description || '').toLowerCase();
    const noCapKeywords = [
      'gameplay', 'script', 'prefab', 'map', 'chainsaw', 'flashlight', 'handtool',
      'weight', 'fence', 'tree', 'decoration', 'generator', 'floodlight',
      'plow', 'cultivator', 'subsoiler', 'spader', 'mulcher', 'roller',
      'weeder', 'hoe', 'mower', 'tedder', 'windrower', 'tractor', 'traktor', 'car'
    ];
    const isNoCapCat = noCapKeywords.some(k => catStr.includes(k) || titleStr.includes(k)) ||
                       catStr.includes('gameplay') || catStr.includes('script') ||
                       titleStr.includes('script') || descStr.includes('with this script');

    // 3. Litre Capacity scan across lines — run even if base capacity exists to catch multi-capacity ranges!
    if (!isNoCapCat) {
      // Parse a numeric string with optional k-suffix (thousand). Supports European 16.500 / 30.000, 16,500, Swiss 21'000, or decimals.
      const parseCapNum = (str, kSuffix) => {
        if (!str) return 0;
        let s = str.replace(/['’]/g, '').trim();
        let k = kSuffix || '';
        if (s.toLowerCase().endsWith('k')) {
          k = 'k';
          s = s.slice(0, -1);
        }
        let val = 0;
        if (/^\d{1,3}[.,\s]\d{3}$/.test(s)) {
          val = parseInt(s.replace(/[.,\s]/g, ''), 10);
        } else if (/^\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d+)?$/.test(s)) {
          const parts = s.split(/[.,\s]/);
          const last = parts[parts.length - 1];
          if (last.length === 3) {
            val = parseInt(parts.join(''), 10);
          } else {
            val = parseFloat(parts.slice(0, -1).join('') + '.' + last);
          }
        } else {
          val = parseFloat(s.replace(/,/g, '.').replace(/\s/g, '')) || 0;
        }
        if (k.toLowerCase() === 'k') val *= 1000;
        return val;
      };

      // Headers that introduce a list of capacities below them
      const capHeaderOnlyRe = /^(?:[-*•\s]*)(?:capact?i(?:ty|ties)|kapazit[aä]t|capacit[eé]|volume|volumen|ladevolumen|pojemno[sś][cć]|capacidad|capacit[aà]|tank\s*inhalt|grain\s*tank|korntank|bunker|fassungsverm[oö]gen|inhalt|tank\s*capacity|load\s*capacity)[:\s-]*$/i;
      const capMentionRe = /(?:capact?i(?:ty|ties)|kapazit[aä]t|capacit[eé]|volume|volumen|ladevolumen|pojemno[sś][cć]|capacidad|capacit[aà]|tank\s*inhalt|grain\s*tank|korntank|bunker|fassungsverm[oö]gen|inhalt|tank\s*capacity|load\s*capacity)/i;
      const litreUnitRe = /liters?|litres?|\bl\b|m³|m3|cubic/i;

      // Numbers: not preceded by a letter (avoids model codes like NX200),
      // support space/comma/apostrophe thousand sep, optional trailing dot for decimals like "40."
      const numTokenRe = /(?<![a-zA-Z])(\d[\d'’\s,]*(?:\.\d*)?)(k?)/gi;

      // Regex for capacity expressions:
      // Pattern 1: Capacity keyword followed by number(s): "capacity from 20.25 m³ to 27.50 m³", "load capacity ranging from 20.25 m³ to 31.00 m³", "Kapazität: 14.000 - 39.000 l"
      const capAfterKeywordRe = /(?:capact?i(?:ty|ties)|kapazit[aä]t|capacit[eé]|volume|volumen|ladevolumen|pojemno[sś][cć]|capacidad|capacit[aà]|tank\s*inhalt|grain\s*tank|korntank|bunker|fassungsverm[oö]gen|inhalt|tank\s*capacity|load\s*capacity)[^0-9\n\r]*([0-9][0-9.,'\s]*[0-9]|[0-9]+)\s*(k?)\s*(m³|m3|cubic|liters?|litres?|\bl\b)?(?:\s*(?:[-–—~]|to|bis|à|a)\s*([0-9][0-9.,'\s]*[0-9]|[0-9]+)\s*(k?)\s*(m³|m3|cubic|liters?|litres?|\bl\b)?)?/gi;
      // Pattern 2: Number followed by capacity keyword: "33,000 liter capacity", "14000 l kapazität"
      const capBeforeKeywordRe = /([0-9][0-9.,'\s]*[0-9]|[0-9]+)\s*(k?)\s*(m³|m3|cubic|liters?|litres?|\bl\b)?(?:\s*(?:[-–—~]|to|bis|à|a)\s*([0-9][0-9.,'\s]*[0-9]|[0-9]+)\s*(k?)\s*(m³|m3|cubic|liters?|litres?|\bl\b)?)?\s*(?:capact?i(?:ty|ties)|kapazit[aä]t|capacit[eé]|volume|volumen|ladevolumen|pojemno[sś][cć]|capacidad|capacit[aà]|tank\s*inhalt|grain\s*tank|korntank|bunker|fassungsverm[oö]gen|inhalt)/gi;

      let overallMin = null;
      let overallMax = null;
      let inCapBlock = false;

      for (const line of rawLines) {
        if (capHeaderOnlyRe.test(line)) {
          inCapBlock = true;
          continue;
        }

        // Clean out prices first to avoid mistaking $8,500 as 8,500 L
        const cleanedText = line.replace(/[$€£]\s*\d[\d,.]*|\d[\d,.]*\s*[$€£]/g, '');
        const lineCaps = [];

        if (inCapBlock) {
          if (/(?:config|price|color|wheel|tire|fahr|engine|speed|power|working\s*speed)/i.test(cleanedText) && !litreUnitRe.test(cleanedText)) {
            inCapBlock = false;
          } else if (litreUnitRe.test(cleanedText) || /^[-*•]/.test(cleanedText)) {
            const isCubic = /(m³|m3|cubic)/i.test(cleanedText);
            const hasLitre = litreUnitRe.test(cleanedText);
            numTokenRe.lastIndex = 0;
            let nt;
            while ((nt = numTokenRe.exec(cleanedText)) !== null) {
              const val = parseCapNum(nt[1], nt[2]);
              if (isCubic ? val > 0 : (hasLitre ? val >= 100 : val >= 500)) {
                const litreVal = Math.round(isCubic && val < 1000 ? val * 1000 : val);
                if (litreVal >= 100 && litreVal < 50000000) lineCaps.push(litreVal);
              }
            }
          } else {
            inCapBlock = false;
          }
        }

        if (lineCaps.length === 0 && capMentionRe.test(cleanedText)) {
          // If a capacity line clarifies an overall total (e.g. "5,000L per side (10,000L total)" or "total: 10,000L"),
          // prioritize the vehicle's total capacity rather than the single-compartment partition.
          const parenMatch = cleanedText.match(/\(([^)]*?(?:total|in\s*total|gesamt|au\s*total|og[óo]lem)[^)]*)\)/i);
          let totalNumMatch = null;
          if (parenMatch) {
            totalNumMatch = parenMatch[1].match(/([0-9][0-9.,'\s]*[0-9]|[0-9]+)\s*(k?)\s*(m³|m3|cubic|liters?|litres?|l(?![a-zA-Z]))?/i);
          } else {
            const afterMatch = cleanedText.match(/(?:total|in\s*total|gesamt|au\s*total|og[óo]lem)[:\s]+([0-9][0-9.,'\s]*[0-9]|[0-9]+)\s*(k?)\s*(m³|m3|cubic|liters?|litres?|l(?![a-zA-Z]))?/i);
            const beforeMatch = cleanedText.match(/([0-9][0-9.,'\s]*[0-9]|[0-9]+)\s*(k?)\s*(m³|m3|cubic|liters?|litres?|l(?![a-zA-Z]))?\s*(?:total|in\s*total|gesamt|au\s*total|og[óo]lem)\b/i);
            totalNumMatch = afterMatch || beforeMatch;
          }

          if (totalNumMatch) {
            const isCubic = /(m³|m3|cubic)/i.test(totalNumMatch[3] || cleanedText);
            const hasLitre = /liters?|litres?|l(?![a-zA-Z])/i.test(totalNumMatch[3] || cleanedText);
            const v = parseCapNum(totalNumMatch[1], totalNumMatch[2]);
            if (isCubic ? v > 0 : (hasLitre ? v >= 100 : v >= 500)) {
              const litreVal = Math.round(isCubic && v < 1000 ? v * 1000 : v);
              if (litreVal >= 100 && litreVal < 50000000) lineCaps.push(litreVal);
            }
          }

          if (lineCaps.length === 0) {
            capAfterKeywordRe.lastIndex = 0;
            let m;
            while ((m = capAfterKeywordRe.exec(cleanedText)) !== null) {
              const isCubic = /(m³|m3|cubic)/i.test(m[3] || m[6] || cleanedText);
              const hasLitre = /liters?|litres?|\bl\b/i.test(m[3] || m[6] || cleanedText);
              [ { valStr: m[1], k: m[2] }, { valStr: m[4], k: m[5] } ].forEach(({ valStr, k }) => {
                if (!valStr) return;
                const v = parseCapNum(valStr, k);
                if (isCubic ? v > 0 : (hasLitre ? v >= 100 : v >= 500)) {
                  const litreVal = Math.round(isCubic && v < 1000 ? v * 1000 : v);
                  if (litreVal >= 100 && litreVal < 50000000) lineCaps.push(litreVal);
                }
              });
            }
          }

          if (lineCaps.length === 0) {
            capBeforeKeywordRe.lastIndex = 0;
            while ((m = capBeforeKeywordRe.exec(cleanedText)) !== null) {
              const isCubic = /(m³|m3|cubic)/i.test(m[3] || m[6] || cleanedText);
              const hasLitre = /liters?|litres?|\bl\b/i.test(m[3] || m[6] || cleanedText);
              [ { valStr: m[1], k: m[2] }, { valStr: m[4], k: m[5] } ].forEach(({ valStr, k }) => {
                if (!valStr) return;
                const v = parseCapNum(valStr, k);
                if (isCubic ? v > 0 : (hasLitre ? v >= 100 : v >= 500)) {
                  const litreVal = Math.round(isCubic && v < 1000 ? v * 1000 : v);
                  if (litreVal >= 100 && litreVal < 50000000) lineCaps.push(litreVal);
                }
              });
            }
          }
        } else if (lineCaps.length === 0 && litreUnitRe.test(cleanedText) && !/(?:speed|power|hp|kw|width|weight|version|v\d)/i.test(cleanedText)) {
          // Explicit litre unit token on line (e.g. "12000 liter" or "34.000 l")
          const isCubic = /(m³|m3|cubic)/i.test(cleanedText);
          const hasLitre = litreUnitRe.test(cleanedText);
          numTokenRe.lastIndex = 0;
          let nt;
          while ((nt = numTokenRe.exec(cleanedText)) !== null) {
            const val = parseCapNum(nt[1], nt[2]);
            if (isCubic ? val > 0 : (hasLitre ? val >= 100 : val >= 500)) {
              const litreVal = Math.round(isCubic && val < 1000 ? val * 1000 : val);
              if (litreVal >= 100 && litreVal < 50000000) lineCaps.push(litreVal);
            }
          }
        }

        if (lineCaps.length > 0) {
          const lineMin = Math.min(...lineCaps);
          const lineMax = Math.max(...lineCaps);
          if (overallMin === null || lineMin < overallMin) overallMin = lineMin;
          if (overallMax === null || lineMax > overallMax) overallMax = lineMax;
        }
      }

      if (overallMin !== null && overallMax !== null) {
        if (!techData.capacity || techData.capacity === 0) {
          techData.capacityMin = overallMin;
          techData.capacityMax = overallMax;
          techData.capacity = overallMax;
        } else {
          // Table capacity already exists — broaden bounds with description configs!
          if (!techData.capacityMin || overallMin < techData.capacityMin) techData.capacityMin = overallMin;
          if (!techData.capacityMax || overallMax > techData.capacityMax) {
            techData.capacityMax = overallMax;
            techData.capacity = overallMax;
          }
        }
      }
    }

    // Second fallback on full stripped text
    if (techData.capacity === 0) {
      const fullText = description.replace(/<[^>]*>/g, ' ');
      const litreMatch = fullText.match(/capact?ity[:\s-]*(from\s+)?(\d[\d\s,]*(?:\.\d*)?)(k?)\s*(?:[-–to]+\s*(\d[\d\s,]*(?:\.\d*)?)(k?))?\s*(liters?|litres?|l\b|m³|m3|cubic)/i);
      if (litreMatch) {
        const parseKNum = (s, k) => { const c = (s||'').replace(/[\s,]/g,'').replace(/\.(\d{3})/g,'$1'); let v = parseFloat(c)||0; if (k && k.toLowerCase()==='k') v*=1000; return v; };
        const isCubic = /(m³|m3|cubic)/i.test(litreMatch[6] || '');
        let vMin = parseKNum(litreMatch[2], litreMatch[3]);
        let vMax = litreMatch[4] ? parseKNum(litreMatch[4], litreMatch[5]) : vMin;
        if (isCubic) { vMin = Math.round(vMin * 1000); vMax = Math.round(vMax * 1000); }
        if (vMax >= 100 && vMax < 50000000) {
          techData.capacityMin = vMin;
          techData.capacityMax = vMax;
          techData.capacity = vMax;
        }
      }
    }

    // Unit-based capacity — always attempt, runs independently of litre capacity
    // Covers: animals, bales, logs, big bags, pallets, round bales, square bales etc.
    const isVehicleCat = /(?:tractor|traktor|truck|lkw|car|auto|pkw|harvester|mähdrescher|forage|häcksler|excavator|bagger|loader|radlader|teleskoplader|forklift|gabelstapler)/i.test(catStr);

    if (!techData.unitCapacity && !isVehicleCat) {
      const UNIT_TYPES = [
        'cows?', 'cattle', 'calves?', 'pigs?', 'piglets?', 'sheep', 'lambs?', 'horses?', 'chickens?',
        'goats?', 'rabbits?', 'animals?', 'kühe?', 'tiere?', 'schweine?',
        'bales?', 'round\\s*bales?', 'square\\s*bales?', 'rundballen', 'quader(?:ballen)?', 'ballen',
        'logs?', 'trunks?', 'stämme?',
        'bigbags?', 'big\\s*bags?', 'ibc',
        'pallets?', 'paletten?',
        'sacks?', 'bags?', 'säcke?',
        'skids?'
      ];
      const unitRegex = new RegExp(
        `(\\d[\\d,. ]*\\d|\\d+)\\s*(?:x\\s*)?(${UNIT_TYPES.join('|')})(?:[\\s,./]|$)`,
        'i'
      );
      // Search the raw HTML description (split on visual breaks) and metadata values
      const rawSearchLines = (description + '\n' + Object.values(metadata).join('\n'))
        .replace(/<br[^>]*>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      // Prefer lines that also contain a capacity/capacity-related keyword
      const capacityKeywordRe = /(capacity|kapazität|capacité|load|payload|volume|bale|tier|animal|aufnahme|fassungsverm|holds?|holds up to|plätze|stall)/i;
      let bestMatch = null;
      let bestCount = 0;
      for (const line of rawSearchLines) {
        // Skip lines that look like pack/version descriptions or mod titles
        if (/\b(?:mod\s*pack|pack|update|version|v\d)\b/i.test(line) && !capacityKeywordRe.test(line)) continue;

        const m = line.match(unitRegex);
        if (m) {
          const count = parseFloat(m[1].replace(/[, ]/g, ''));
          if (count > 0 && count < 100000) {
            const hasContext = capacityKeywordRe.test(line);
            // ONLY consider matches if they have capacity context, OR if the unit is explicitly an animal/bale/pallet type
            const isExplicitCargoType = /^(cows?|cattle|calves?|pigs?|piglets?|sheep|lambs?|horses?|chickens?|goats?|rabbits?|animals?|kühe?|tiere?|schweine?|bales?|round\s*bales?|square\s*bales?|rundballen|ballen|logs?|stämme?|pallets?|paletten?|bigbags?|ibc)$/i.test(m[2].trim());

            if (hasContext || isExplicitCargoType) {
              if (!bestMatch || (hasContext && !bestMatch.hasContext) || (hasContext === !!bestMatch.hasContext && count > bestCount)) {
                bestMatch = { count, type: m[2].toLowerCase().replace(/\s+/g, ' ').trim(), hasContext };
                bestCount = count;
              }
            }
          }
        }
      }
      if (bestMatch) {
        techData.unitCapacity = bestMatch.count;
        techData.unitCapacityType = bestMatch.type;
      }
    }

    // Safety guard: ensure drivable vehicles, script/gameplay mods, and bogus unit types are never assigned unit capacity
    const BOGUS_UNITS = ['pack', 'packs', 'paket', 'pakete', 'piece', 'pieces', 'unit', 'units', 'item', 'items', 'tonnes'];
    if (isNoCapCat || isVehicleCat || BOGUS_UNITS.includes((techData.unitCapacityType || '').toLowerCase())) {
      techData.unitCapacity = 0;
      techData.unitCapacityType = '';
    }
    if (isNoCapCat) {
      techData.capacity = 0;
      techData.capacityMin = 0;
      techData.capacityMax = 0;
    }

    // Safety guard: Maps and map packages are locations/environments, not purchasable store items.
    // Reset any prices, horsepowers, or capacities extracted from descriptions of maps.
    const isMap = isMapCategory(category) || isMapCategory(metadata['Category'] || metadata['category']) || catStr.includes('map') || titleStr.includes('map');
    if (isMap) {
      techData.price = 0;
      techData.priceMin = 0;
      techData.priceMax = 0;
      techData.hp = 0;
      techData.hpMin = 0;
      techData.hpMax = 0;
      techData.capacity = 0;
      techData.capacityMin = 0;
      techData.capacityMax = 0;
      techData.unitCapacity = 0;
      techData.unitCapacityType = '';
    }

    // Guard: if unit capacity was found but litre capacity is tiny (< 1000 L),
    // the litre value is almost certainly a mis-parse — discard it.
    if (techData.unitCapacity > 0 && techData.capacity > 0 && techData.capacity < 1000) {
      techData.capacity = 0;
      techData.capacityMin = 0;
      techData.capacityMax = 0;
    }
  }

  // ── Dependencies (Required Mods) ──
  const dependencies = [];
  const depSeenUrls = new Set();
  const seenTitles = new Set();

  try {
    let requiredSection = null;
    $('h2, h3, h4, .title-mods-label').each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (/required\s*mods|necessary\s*mods|erforderliche\s*mods|benötigte\s*mods|mods\s*nécessaires/i.test(text)) {
        requiredSection = $(el);
      }
    });

    if (requiredSection) {
      let sibling = requiredSection.next();
      while (sibling.length > 0) {
        if (sibling.is('h1, h2, h3, h4, h5, h6, hr')) {
          break;
        }
        sibling.find('a').each((_, el) => {
          let rawTitle = $(el).text().trim();
          if (!rawTitle) {
            rawTitle = $(el).attr('title') || $(el).find('img').attr('alt') || $(el).find('span').text().trim() || '';
          }
          const dHref = $(el).attr('href') || '';
          
          if (dHref && (dHref.includes('mod.php') || dHref.startsWith('/') || dHref.includes('farming-simulator.com') || dHref.includes('giants-software.com'))) {
            const resolved = resolveUrl(dHref);
            if (!depSeenUrls.has(resolved)) {
              let cleanTitle = rawTitle
                ? rawTitle
                    .replace(/^[\s\-\*\•\–\—]+/, '')
                    .replace(/\s*(?:\(|\[)?by:?[\s\S]*$/i, '')
                    .replace(/\s*\[[^\]]*\]/g, '')
                    .trim()
                : '';

              // If title is missing or generic, resolve from cache metadata pool
              if (!cleanTitle || /^mod\s*\d+$/i.test(cleanTitle)) {
                const idMatch = resolved.match(/mod_id=(\d+)/i) || resolved.match(/storage\/(\d+)\//i);
                if (idMatch && idMatch[1]) {
                  const cleanId = idMatch[1].replace(/^0+/, '');
                  const pool = cache.getModHubMetadataPool();
                  if (pool[cleanId]?.title) {
                    cleanTitle = pool[cleanId].title;
                  }
                }
              }

              const dTitle = cleanTitle || rawTitle;
              dependencies.push({ title: dTitle, url: resolved });
              depSeenUrls.add(resolved);
              if (dTitle) seenTitles.add(dTitle.toLowerCase());
            }
          }
        });
        sibling = sibling.next();
      }
    }
  } catch (err) {
    console.error('[SCRAPER] Error parsing dependencies:', err);
  }

  // Final deep deduplication of dependencies
  const dedupedDependencies = [];
  const finalSeen = new Set();
  
  // Sort so that entries with URLs (ModHub links) are processed first and take precedence
  const sortedDeps = [...dependencies].sort((a, b) => (b.url ? 1 : 0) - (a.url ? 1 : 0));

  for (const dep of sortedDeps) {
    // Ignore text note entries that have no download URL and contain credit lines or combined titles
    if (!dep.url && dep.title && (dep.title.includes('(By:') || dep.title.includes('(By ') || dep.title.includes(' (by '))) {
      continue;
    }

    // Normalize: strip authors, "Pack" suffixes, version numbers, and non-alphanumerics
    const raw = dep.title.toLowerCase()
      .replace(/\s*(?:\(|\[)?by:?.*?(?:\)|\])?$/i, '') // strip (by Author) or [by Author] or BY AUTHOR at end
      .replace(/\s+pack(?:age)?/i, '')               // strip " Pack" or " Package"
      .replace(/\s*v?\d+\.\d+\.\d+(?:\.\d+)?/i, '')    // strip version numbers
      .replace(/[^a-z0-9]/g, '');

    const filename = dep.url ? dep.url.toLowerCase() : '';

    if (raw.length > 2) {
      let isDuplicate = false;
      
      // Check for duplicates
      for (const entry of finalSeen) {
        // If both have distinct URLs, they are definitely different mods, do not deduplicate by title!
        if (filename && entry.filename && filename !== entry.filename) {
          continue;
        }
        
        const existing = entry.raw;
        if (existing.includes(raw) || raw.includes(existing)) {
          const ratio = Math.min(existing.length, raw.length) / Math.max(existing.length, raw.length);
          // Require a much stricter ratio to avoid matching "woodenshed" with "smallwoodenshed"
          if (ratio > 0.85) {
            isDuplicate = true;
            break;
          }
        }
      }

      if (!isDuplicate) {
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
    fileName: downloadUrl ? downloadUrl.split('/').pop().split('?')[0] : null,
    rating,
    metadata,
    version: versionVal,
    fileSize,
    changelog,
    techData,
    releasedDate,
    dependencies: dedupedDependencies,
    isMap: isMapCategory(category),
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
  let totalMods = mods.length;
  if (totalPages > 1) {
    if (page === totalPages - 1) {
      totalMods = ((totalPages - 1) * 24) + mods.length;
    } else {
      try {
        const lastUrl = `${MODS_URL}?title=${gameTitle}&searchMod=${encodeURIComponent(query)}&page=${totalPages - 1}&lang=en&country=gb`;
        const lastHtml = await throttledFetch(lastUrl);
        const $last = cheerio.load(lastHtml);
        const lastModsCount = $last('.mod-item').length;
        totalMods = ((totalPages - 1) * 24) + (lastModsCount || 24);
      } catch (_) {
        totalMods = ((totalPages - 1) * 24) + 24;
      }
    }
  }

  return {
    mods,
    pagination: {
      current: page,
      total: totalPages,
      totalMods
    }
  };
}

/**
 * Fetch the exact total count of downloadable community mods.
 * Applies an offset of 10 to account for Giants official DLC / expansion store placeholders.
 */
async function fetchTrueModCount() {
  try {
    const cache = require('./cache');
    const pool = cache.getModHubMetadataPool();
    // pool has both raw modIds and padded/variant keys. Count unique numeric items:
    const uniqueIds = new Set();
    Object.values(pool || {}).forEach(m => {
      if (m && m.modId && m.title && m.title !== 'Error: Mod not found' && !m.title.toLowerCase().includes('not found')) {
        uniqueIds.add(String(m.modId).replace(/^0+/, ''));
      }
    });

    if (uniqueIds.size > 6000) {
      return uniqueIds.size;
    }

    const bundledPath = require('path').join(__dirname, '../resources/bundled_cache.json');
    if (fs.existsSync(bundledPath)) {
      const bundled = JSON.parse(fs.readFileSync(bundledPath, 'utf8'));
      return Object.keys(bundled).length;
    }
    return 6916;
  } catch (err) {
    console.error('[SCRAPER] Failed to fetch true total: ' + err.message);
    return 6916;
  }
}

module.exports = { fetchModList, fetchModDetail, parseModDetailFromHtml, searchMods, fetchModsByAuthor, fetchTrueModCount, getPHPSESSID, clearSession };
