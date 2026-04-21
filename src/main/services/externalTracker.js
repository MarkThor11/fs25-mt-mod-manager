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
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract version from HTML using common patterns.
 */
function extractVersion(html) {
  // Common patterns for version numbers: v1.2, version 3.0, 1.2.3.0
  const patterns = [
    /Version[:\s]+([vV]?\d+\.\d+(?:\.\d+)*(?:\.\d+)?)/i,
    /v(\d+\.\d+(?:\.\d+)*(?:\.\d+)?)/i,
    /(\d+\.\d+\.\d+\.\d+)/,
    /(\d+\.\d+\.\d+)/,
    /(\d+\.\d+)/
  ];

  // Look specifically near keywords
  const lowerHtml = html.toLowerCase();
  const searchIndex = lowerHtml.indexOf('version') || lowerHtml.indexOf('v ') || 0;
  const context = html.substring(Math.max(0, searchIndex - 20), Math.min(html.length, searchIndex + 100));

  for (const pattern of patterns) {
    const match = context.match(pattern) || html.match(pattern);
    if (match && match[1]) {
      // Clean version string
      return match[1].replace(/^[vV]/, '').trim();
    }
  }
  return null;
}

/**
 * Specialized itch.io scraper.
 */
function parseItch(html) {
  const $ = cheerio.load(html);
  
  // Look for "Updated" or "Version" in the sidebar info
  let version = '';
  $('.game_info_panel_widget .table_row').each((_, el) => {
    const label = $(el).find('td').first().text().trim().toLowerCase();
    const value = $(el).find('td').last().text().trim();
    if (label.includes('version') || label.includes('updated') || label.includes('published')) {
      version = value;
    }
  });

  if (!version) {
      // Check for version strings in the body
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
    let result = { version: null };

    if (url.includes('itch.io')) {
      result = parseItch(html);
    } else if (url.includes('kingmods')) {
      result = parseKingMods(html);
    } else {
      result.version = extractVersion(html);
    }

    return { 
      success: true, 
      version: result.version,
      // Create a small fingerprint of the page's body to detect silent updates
      fingerprint: html.length.toString() 
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
