const https = require('https');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs-extra');
const { net } = require('electron');

/**
 * Universal Mod Tracker:
 * Scrapes external URLs for version numbers and updates.
 */

async function fetchHtml(url) {
  try {
    const response = await net.fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    return html;
  } catch (err) {
    console.error(`[TRACKER] Fetch failed for ${url}:`, err.message);
    throw err;
  }
}

/**
 * Extract version from HTML using common patterns.
 */
function extractVersion(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, .ad-container').remove();
  const text = $('body').text().replace(/\s+/g, ' ');
  const headText = text.substring(0, 10000); // Expanded scan area

  const potentialVersions = [];
  const sizeUnits = ['mb', 'gb', 'kb', 'bytes', 'kbps', 'downloads', 'views', 'px', 'hz', 'fps', 'dpi'];

  // Patterns to look for
  const patterns = [
    { regex: /Version[:\s]*([vV]?\d+\.\d+(?:\.\d+)*)/gi, score: 100 },
    { regex: /v(\d+\.\d+(?:\.\d+)*)/gi, score: 80 },
    { regex: /\[([vV]?\d+\.\d+(?:\.\d+)*)\]/gi, score: 90 }, // Support for [1.0.0.0]
    { regex: /Update[:\s]*([vV]?\d+\.\d+(?:\.\d+)*)/gi, score: 70 },
    { regex: /(\d+\.\d+\.\d+\.\d+)/g, score: 60 }, // FS Standard
    { regex: /(\d+\.\d+\.\d+)/g, score: 30 },
    { regex: /(\d+\.\d+)/g, score: 10 }
  ];

  patterns.forEach(p => {
    const matches = headText.matchAll(p.regex);
    for (const match of matches) {
      const v = (match[1] || match[0]).replace(/^[vV]/, '').trim();
      
      // Basic filtering
      if (v.length > 20 || v.length < 3) continue;
      if (/^(19|20)\d{2}$/.test(v)) continue; // Ignore years
      
      // Check surrounding context for size units
      const start = Math.max(0, match.index - 15);
      const end = Math.min(headText.length, match.index + match[0].length + 25);
      const context = headText.substring(start, end).toLowerCase();
      
      if (sizeUnits.some(unit => context.includes(unit))) continue;

      // Scoring: prefer strings that look like FS versions
      let finalScore = p.score;
      const parts = v.split('.');
      if (parts.length === 4) finalScore += 50;
      if (parts.length === 3) finalScore += 20;
      if (v.startsWith('1.0')) finalScore += 15;
      
      // Bonus if found near "download" keyword (but not a size unit)
      if (context.includes('download') || context.includes('file')) finalScore += 10;

      potentialVersions.push({ v, score: finalScore });
    }
  });

  if (potentialVersions.length === 0) {
    console.log('[TRACKER] No versions found in scan area.');
    return null;
  }

  // Sort by score and return the best one
  potentialVersions.sort((a, b) => b.score - a.score);
  
  console.log('[TRACKER] Best version candidate:', potentialVersions[0]);
  return potentialVersions[0].v;
}

/**
 * Specialized itch.io scraper.
 */
function parseItch(html) {
  const $ = cheerio.load(html);
  
  let version = '';
  $('.game_info_panel_widget .table_row').each((_, el) => {
    const label = $(el).find('td').first().text().trim().toLowerCase();
    const value = $(el).find('td').last().text().trim();
    
    // Prioritize "Version" label
    if (label.includes('version')) {
      version = value;
    } 
    // Only use "Updated" if we haven't found a version yet AND the value looks like a version number (not a date)
    else if (!version && (label.includes('updated') || label.includes('published'))) {
      if (/^\d+\.\d+/.test(value)) {
        version = value;
      }
    }
  });

  if (!version) {
      version = extractVersion(html);
  }

  return { version };
}

/**
 * Specialized KingMods scraper.
 */
function parseKingMods(html) {
  const $ = cheerio.load(html);
  // KingMods usually has version in a specific meta tag or div
  const version = $('.mod-version').text().trim() || extractVersion(html);
  return { version };
}

async function checkUrl(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    let result = { version: null };

    if (url.includes('itch.io')) {
      result = parseItch(html);
    } else if (url.includes('kingmods')) {
      result = parseKingMods(html);
    } else {
      result.version = extractVersion(html);
    }

    // Create a stable fingerprint:
    // 1. Remove common dynamic sections
    $('.game_info_panel_widget, .game_comments_widget, .sidebar, footer, header, .ads, .user_panel').remove();
    // 2. Get body text and remove all numbers (to ignore view counts, timestamps, etc.)
    const stableText = $('body').text().toLowerCase().replace(/[\d\s\W]+/g, '');
    const fingerprint = stableText.substring(0, 1000); // Take a sample

    return { 
      success: true, 
      version: result.version,
      fingerprint: fingerprint 
    };
  } catch (err) {
    console.error(`[TRACKER] Error checking ${url}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function findDownloadUrl(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    
    if (url.includes('itch.io')) {
      // Itch.io: look for the primary download button
      const downloadBtn = $('.download_btn, .buy_btn').first();
      if (downloadBtn.length) {
        return url; 
      }
    }
    
    // Generic: look for ANY link ending in .zip
    let zipUrl = null;
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.toLowerCase().endsWith('.zip')) {
        zipUrl = href;
      }
    });
    
    if (zipUrl) {
      if (!zipUrl.startsWith('http')) {
        const urlObj = new URL(url);
        zipUrl = `${urlObj.protocol}//${urlObj.host}${zipUrl.startsWith('/') ? '' : '/'}${zipUrl}`;
      }
      return zipUrl;
    }

    return url; // Fallback to page URL
  } catch (err) {
    return url;
  }
}

module.exports = { checkUrl, findDownloadUrl };
