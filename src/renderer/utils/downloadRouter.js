import { parseModCategory, isMapCategory } from './categoryUtils';
import { useSettingsStore } from '../store/useSettingsStore';

/**
 * Resolves the destination folder/path for a mod based on user preferences.
 * 
 * @param {Object} params
 * @param {string} params.category - Raw mod category string or filter
 * @param {boolean} params.isMap - Whether mod is a map
 * @param {string} [params.subFolder] - Explicit destination subfolder if provided
 * @returns {string|null} - Destination subfolder name, absolute path, or null (for primary root)
 */
export function resolveDownloadDestination({ category, isMap, subFolder = null }) {
  // If an explicit subfolder is passed (e.g. Map subfolder or Map Dependencies), honor it
  if (subFolder) return subFolder;

  // Maps always manage their own subfolders unless explicitly overridden
  if (isMap || isMapCategory(category)) return null;

  const { downloadRoutingMode, downloadCategoryRoutes } = useSettingsStore.getState();

  // If routing mode ignores rules (e.g. direct to primary or prompt only with no rules fallback), return null
  if (downloadRoutingMode === 'direct') {
    return null;
  }

  // Check category rules
  if (category && downloadCategoryRoutes && Object.keys(downloadCategoryRoutes).length > 0) {
    // 1. Direct match
    if (downloadCategoryRoutes[category]) {
      return downloadCategoryRoutes[category];
    }

    // 2. Parsed main category match (e.g. 'Drivables', 'Gameplay', 'Trailers')
    const parsed = parseModCategory(category);
    if (parsed && parsed.main && downloadCategoryRoutes[parsed.main]) {
      return downloadCategoryRoutes[parsed.main];
    }

    // 3. Parsed sub category match
    if (parsed && parsed.sub && downloadCategoryRoutes[parsed.sub]) {
      return downloadCategoryRoutes[parsed.sub];
    }
  }

  return null;
}

/**
 * Checks whether the user should be prompted before downloading a mod.
 * 
 * @param {Object} params
 * @param {string} params.category - Raw mod category
 * @param {boolean} params.isMap - Whether mod is a map
 * @returns {boolean}
 */
export function shouldPromptForDownload({ category, isMap }) {
  // Never prompt for Maps (they automatically get their own map subfolder)
  if (isMap || isMapCategory(category)) return false;

  const { downloadRoutingMode, downloadCategoryRoutes } = useSettingsStore.getState();

  if (downloadRoutingMode === 'direct') return false;
  if (downloadRoutingMode === 'prompt_only') return true;

  if (downloadRoutingMode === 'rules_only') {
    // Never prompt, only use rules or primary
    return false;
  }

  if (downloadRoutingMode === 'prompt_and_rules') {
    // If a category rule is already defined, auto-route without interrupting the user.
    // Otherwise prompt them to choose.
    const rule = resolveDownloadDestination({ category, isMap });
    if (rule) return false;
    return true;
  }

  return false;
}
