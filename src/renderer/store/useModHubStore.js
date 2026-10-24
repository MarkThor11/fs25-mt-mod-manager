import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';
import { isModMatch } from '../utils/modUtils';

const HARDCODED_BRANDS = [
  "John Deere", "Case IH", "New Holland", "Fendt", "Massey Ferguson", 
  "Valtra", "Claas", "JCB", "Deutz-Fahr", "Kubota", "Krone", "Kuhn", 
  "Amazone", "Horsch", "Pottinger", "Grimme", "Manitou", "Merlo", 
  "Lindner", "Steyr", "Rostselmash", "McCormick", "Landini", "Zetor", 
  "Hardi", "Holmer", "Ropa", "Volvo", "Mack Trucks", "Lizard"
];


const loadFavMods = () => {
  try {
    const raw = localStorage.getItem('fav_mods');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    let migrated = false;
    
    // Filter out ghost entries that are completely disabled
    const cleaned = parsed.filter(mod => {
      if (mod.isFavorite === false && !mod.isMustHave) {
        migrated = true;
        return false;
      }
      return true;
    });

    const fixed = cleaned.map(mod => {
      if (mod.isFavorite === undefined) {
        migrated = true;
        if (mod.isMustHave) {
          return { ...mod, isFavorite: false };
        }
        return { ...mod, isFavorite: true };
      }
      return mod;
    });

    // Deduplicate on load by modId or fileName
    const deduped = [];
    const seen = new Set();
    for (const m of fixed) {
      if (!m) continue;
      const cleanId = m.modId != null && m.modId !== '' ? String(m.modId).replace(/^0+/, '').trim() : null;
      const cleanFile = m.fileName ? m.fileName.replace(/\.zip$/i, '').toLowerCase().trim() : null;
      const key = cleanId ? `id_${cleanId}` : (cleanFile ? `file_${cleanFile}` : (m.title ? `title_${m.title.toLowerCase().trim()}` : null));
      if (key && !seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      } else if (key && seen.has(key)) {
        migrated = true;
      }
    }

    if (migrated) {
      localStorage.setItem('fav_mods', JSON.stringify(deduped));
    }
    return deduped;
  } catch (e) {
    return [];
  }
};

const loadFavAuthors = () => {
  try {
    const raw = localStorage.getItem('fav_authors');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let migrated = false;
    const seen = new Set();
    const fixed = [];
    for (const a of parsed) {
      if (!a) continue;
      const name = typeof a === 'string' ? a.trim() : (a.name || a.id || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) {
        migrated = true;
        continue;
      }
      seen.add(key);
      const id = (typeof a === 'object' && a.id !== undefined && a.id !== null) ? String(a.id) : name;
      if (typeof a !== 'object' || a.id !== id || a.name !== name) {
        migrated = true;
      }
      fixed.push({ id, name });
    }
    if (migrated) {
      localStorage.setItem('fav_authors', JSON.stringify(fixed));
    }
    return fixed;
  } catch (e) {
    return [];
  }
};

export const DEFAULT_ACTIVE_FILTERS = {
  brands: [],
  priceRange: [0, Infinity],
  hpRange: [0, Infinity],
  capRange: [0, Infinity],
  unitRange: [0, Infinity],
  platforms: [],
  hideRequired: false,
  hideInstalled: false,
};

export const DRIVABLE_FILTERS = [
  'tractorsS', 'tractorsM', 'tractorsL', 'trucks', 'cars', 'miscDrivables',
  'frontLoaderVehicles', 'teleLoaderVehicles', 'wheelLoaderVehicles', 'skidSteerVehicles', 'forklifts',
  'harvesters', 'forageHarvesters', 'beetHarvesters', 'potatoHarvesting', 'vegetableHarvesters',
  'riceHarvesters', 'sugarcaneHarvesters', 'cottonHarvesters', 'grapeHarvesters', 'oliveHarvesters',
  'forestryHarvesters', 'forestryForwarders', 'forestryExcavators'
];

export const BOGUS_UNIT_TYPES = ['pack', 'packs', 'paket', 'pakete', 'piece', 'pieces', 'unit', 'units', 'item', 'items', 'tonnes'];

export const NO_CAPACITY_KEYWORDS = [
  'gameplay', 'script', 'prefab', 'chainsaw', 'flashlight', 'handtool',
  'weight', 'fence', 'tree', 'decoration', 'generator', 'floodlight',
  'plow', 'cultivator', 'subsoiler', 'spader', 'mulcher', 'roller',
  'weeder', 'hoe', 'mower', 'tedder', 'windrower', 'tractor', 'traktor', 'car'
];

export const useModHubStore = create((set, get) => ({

  // State
  mods: [],
  hardcodedBrands: HARDCODED_BRANDS,
  currentFilter: localStorage.getItem('modhub_remember') === 'true' 
    ? (localStorage.getItem('modhub_filter') || 'latest') 
    : 'latest',
  currentPage: localStorage.getItem('modhub_remember') === 'true' 
    ? parseInt(localStorage.getItem('modhub_page') || '0', 10)
    : 0,
  totalPages: 1,
  pageSize: parseInt(localStorage.getItem('modhub_pagesize') || '24', 10),
  modCache: {}, 
  isCacheLoaded: false,
  isLoading: false,
  error: null,
  searchQuery: '',
  isDeepScanning: false,
  categories: [],
  activeFilters: { ...DEFAULT_ACTIVE_FILTERS },
  favoriteAuthors: loadFavAuthors(),
  favoriteMods: loadFavMods(),
  hiddenMods: JSON.parse(localStorage.getItem('hidden_mods') || '[]'),
  authorFilter: null, // { id: string, name: string }
  authorFilterSource: null, // 'favourites' | 'card' | 'category'
  previousFilter: null, // Preserved category filter when viewing an author
  categoryTotalMods: 0,
  selectedCompareIds: [],
  powerReference: null, // { modId, title, hp }
  isSmartMatchEnabled: localStorage.getItem('smart_match_enabled') === 'true',
  hpMatchMode: 'high', // 'low' | 'high' | 'range'
  selectedHP: 0, // Specifically selected HP from a pack/range
  lastRequestId: 0,
  ...(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('modhub_stats') || '{}');
      return {
        totalMods: cached.totalMods || 0,
        latestCount: cached.latestCount || 0,
        newCount: cached.newCount || 0,
        updateCount: cached.updateCount || 0,
      };
    } catch (_) {
      return { totalMods: 0, latestCount: 0, newCount: 0, updateCount: 0 };
    }
  })(),
  isFetchingStats: false,
  statsIntervalId: null,
  homeFeatured: JSON.parse(localStorage.getItem('home_featured') || '[]'),
  homeTopDownloaded: JSON.parse(localStorage.getItem('home_top') || '[]'),
  
  // Actions
  setHpMatchMode: (mode) => set({ hpMatchMode: mode, selectedHP: 0 }),
  setSelectedHP: (hp) => set({ selectedHP: hp }),
  setPowerReference: (mod) => set({ powerReference: mod, selectedHP: 0 }),
  isPrefetching: false,
  isWarming: false,
  warmingQueue: [],
  setHomeFeatured: (mods) => {
    localStorage.setItem('home_featured', JSON.stringify(mods));
    set({ homeFeatured: mods });
  },
  setHomeTopDownloaded: (mods) => {
    localStorage.setItem('home_top', JSON.stringify(mods));
    set({ homeTopDownloaded: mods });
  },

  loadCache: async () => {
    if (!window.api?.modhub) return;
    try {
      const cache = await window.api.modhub.getPersistentCache();
      // Prune old entries (>30 days)
      const now = Date.now();
      const pruned = {};
      let hasPruned = false;
      Object.entries(cache || {}).forEach(([k, v]) => {
        // Sanitize capacity and unit capacity in existing cached items
        if (v?.techData) {
          const catStr = (v.category || v.metadata?.Category || '').toLowerCase();
          const titleStr = (v.title || '').toLowerCase();
          const descStr = (v.description || '').toLowerCase();
          const isNoCap = NO_CAPACITY_KEYWORDS.some(k => catStr.includes(k) || titleStr.includes(k)) ||
                          catStr.includes('gameplay') || catStr.includes('script') ||
                          titleStr.includes('script') || descStr.includes('with this script');
          if (isNoCap) {
            if (v.techData.capacity > 0 || v.techData.unitCapacity > 0) hasPruned = true;
            v.techData.capacity = 0;
            v.techData.capacityMin = 0;
            v.techData.capacityMax = 0;
            v.techData.unitCapacity = 0;
            v.techData.unitCapacityType = '';
          } else if (v.techData.unitCapacity) {
            const uType = (v.techData.unitCapacityType || '').toLowerCase();
            const catFilter = (v.category || '').split(':')[1] || '';
            const isVehicle = DRIVABLE_FILTERS.includes(catFilter) || v.techData?.isDrivable;
            if (BOGUS_UNIT_TYPES.includes(uType) || isVehicle) {
              v.techData.unitCapacity = 0;
              v.techData.unitCapacityType = '';
              hasPruned = true;
            }
          }
          if (v.techData.price > 0) {
            // Repair corrupt price range if priceMin is ridiculously low (e.g. model code 60) or price is 2025
            if (v.techData.priceMin > 0 && v.techData.priceMin < 500 && v.techData.priceMax > 5000) {
              v.techData.priceMin = v.techData.priceMax;
              hasPruned = true;
            }
            if (v.techData.price === 2025 && v.techData.priceMax > 5000) {
              v.techData.price = v.techData.priceMax;
              hasPruned = true;
            }
            if (!v.techData.priceMin) v.techData.priceMin = v.techData.price;
            if (!v.techData.priceMax) v.techData.priceMax = v.techData.price;
          }
          // Repair corrupt capacity range (e.g. 1500 - 91000 L from old La Campagne)
          if (v.techData.capacityMin === 1500 && v.techData.capacityMax >= 50000) {
            v.techData.scraped = false; // forces re-scrape
            hasPruned = true;
          }
        }
        // If it has a timestamp, prune if older than 30 days. 
        // If it lacks a timestamp (like our new metadata pool), treat it as fresh.
        if (!v.timestamp || (now - v.timestamp < (30 * 24 * 60 * 60 * 1000))) {
          pruned[k] = v;
        } else {
          hasPruned = true;
        }
      });
      set({ modCache: pruned, isCacheLoaded: true });
      if (hasPruned) {
        await window.api.modhub.setPersistentCache(pruned);
      }
      // Start background repair of favorite metadata
      get().repairFavoriteMetadata();
    } catch (err) {
      console.error('Failed to load ModHub cache:', err);
      set({ isCacheLoaded: true });
    }
  },

  // Actions
  toggleCompare: (modId) => {
    set((state) => {
      const isSelected = state.selectedCompareIds.includes(modId);
      if (isSelected) {
        return { selectedCompareIds: state.selectedCompareIds.filter(id => id !== modId) };
      }
      if (state.selectedCompareIds.length >= 4) return state; // Max 4
      return { selectedCompareIds: [...state.selectedCompareIds, modId] };
    });
  },
  
  clearCompare: () => set({ selectedCompareIds: [] }),

  setPowerReference: (mod) => {
    if (!mod) {
      set({ powerReference: null });
      return;
    }
    set({
      powerReference: {
        modId: mod.modId,
        title: mod.title,
        hp: mod.techData?.hp || 0,
        hpIsRequirement: !!mod.techData?.hpIsRequirement
      }
    });
  },

  toggleSmartMatch: () => {
    set((state) => {
      const newVal = !state.isSmartMatchEnabled;
      localStorage.setItem('smart_match_enabled', newVal.toString());
      return { isSmartMatchEnabled: newVal };
    });
  },


  // Actions
  fetchDetailsForCurrentPage: async () => {
    const { mods, isDeepScanning } = get();
    if (isDeepScanning || mods.length === 0) return;
    
    // Re-scan mods scraped but with missing, suspiciously small, or model-bleed capacity, or missing pack price ranges
    const needsRescrape = (m) => {
      if (!m.techData?.scraped) return false;
      const cap = m.techData?.capacity ?? 0;
      const capMin = m.techData?.capacityMin ?? 0;
      const capMax = m.techData?.capacityMax ?? 0;
      const unitCap = m.techData?.unitCapacity ?? 0;
      const price = m.techData?.price ?? 0;
      const priceMin = m.techData?.priceMin ?? price;
      const priceMax = m.techData?.priceMax ?? price;
      const descHasPriceRange = m.description && (
        /(?:[$€£]?\s*\d[\d'’\s,.]*\d|\d+)\s*(?:[$€£]?)\s*(?:[-–—~]|\s+to\s+|\s+bis\s+|\s+à\s+)\s*(?:[$€£]?\s*\d[\d'’\s,.]*\d|\d+)\s*(?:[$€£]?)/i.test(m.description) ||
        (m.description.match(/(?:base\s+price|configuration\s+price|prices?\s*(?:from|ab|à partir de)?|preis(?:\s*(?:ab|von))?|prix(?:\s*(?:à partir de))?|cost|kosten)[:\-\s]*[$€£]?\s*[\d'’\s,.]+/gi) || []).length > 1 ||
        (m.description.match(/[$€£]\s*[\d'’\s,.]*\d/g) || []).length > 1
      );
      const descHasPrices = m.description && /(?:base\s+price|configuration\s+price|prices?\s*(?:from|ab|à partir de)?|preis(?:\s*(?:ab|von))?|prix(?:\s*(?:à partir de))?|cost|kosten)[:\-\s]*[$€£]?\s*[\d'’\s,.]+/i.test(m.description);
      const isMultiItem = /(?:pack|package|series|collection|set|trailers|haul|transporter)/i.test(m.title || '') || /(?:pack|package|collection|set)/i.test(m.category || '');
      const needsPriceRescrape = (
        ((isMultiItem || descHasPriceRange) && priceMin === priceMax && (descHasPriceRange || descHasPrices)) ||
        (price < 500 && descHasPrices) ||
        (priceMin > 0 && priceMin < 500 && descHasPrices) ||
        (!isMultiItem && priceMin > 0 && priceMin <= 2500 && priceMax >= 10000 && descHasPrices)
      );
      const isTrailerOrTanker = /(?:trailer|tipper|kipper|slurry|spreader|tanker|wagon|dumper|chaser|auger|manure)/i.test(m.category || m.title);
      const descHasCap = m.description && /(?:capact?i(?:ty|ties)|kapazit[aä]t|capacit[eé]|volume|volumen|inhalte?|fassungsverm[oö]gen|inhalt)[:\-\s/]+.*?\d/i.test(m.description);
      const descHasMultiChamberOrTotal = m.description && /(?:per\s*(?:side|chamber|compartment|tank|box)|pro\s*(?:seite|kammer)|par\s*c[oô]t[eé]|\b(?:total|in\s*total|gesamt|au\s*total|og[óo]lem)\b)/i.test(m.description);
      const needsTrailerCapRescrape = isTrailerOrTanker && (
        (cap === 0 && unitCap === 0 && descHasCap) ||
        (capMin === 1500 && capMax >= 50000) ||
        (descHasMultiChamberOrTotal && capMin === capMax)
      );

      return (
        needsTrailerCapRescrape ||
        (cap > 0 && cap < 1000 && unitCap === 0) ||
        (capMin > 0 && capMin < 1000 && capMax > 10000) || // model-number bleed (e.g. NX200 → cMin=200)
        needsPriceRescrape
      );
    };
    const needsScan = mods.some(m => !m.techData || !m.techData.scraped || !m.dependencies || needsRescrape(m));
    if (!needsScan) return;

    // Capture view state to prevent overwriting results if user navigates away
    const startFilter = get().currentFilter;
    const startPage = get().currentPage;
    const startAuthor = get().authorFilter?.id;

    set({ isDeepScanning: true });
    try {
      const idsToFetch = mods
        .filter(m => !m.techData || !m.techData.scraped || !m.dependencies || needsRescrape(m))
        .map(m => m.modId)
        .filter(Boolean);

      if (idsToFetch.length === 0) return;

      // 1. Fetch all cached details in ONE batch IPC call
      const batchResults = await window.api.modhub.getBatchDetails(idsToFetch);
      
      const updatedMods = [...mods];
      const stillMissingIds = [];

      updatedMods.forEach((mod, idx) => {
        const detail = batchResults[mod.modId];
        if (detail && detail.techData?.scraped) {
          updatedMods[idx] = get().enrichModWithDetail(mod, detail);
        } else if (!mod.techData || !mod.techData.scraped || !mod.dependencies || needsRescrape(mod)) {
          stillMissingIds.push(mod.modId);
        }
      });

      // Update UI with what we found in cache immediately
      const updatedMap = new Map(updatedMods.map(m => [m.modId, m]));
      set(state => {
        const newModCache = { ...state.modCache };
        updatedMods.forEach(m => {
          if (m.modId && m.techData) {
            newModCache[String(m.modId)] = { ...(newModCache[String(m.modId)] || {}), ...m };
          }
        });
        return {
          mods: [...updatedMods],
          categoryAllMods: (state.categoryAllMods || []).map(cm => updatedMap.get(cm.modId) || cm),
          modCache: newModCache
        };
      });

      // Deduplicate — a mod may appear in both "missing" and "needsRescrape" paths
      const uniqueMissingIds = [...new Set(stillMissingIds)];

      // 2. For anything still missing, fetch individually (will be throttled by scraper)
      if (uniqueMissingIds.length > 0) {
        for (let i = 0; i < uniqueMissingIds.length; i += 5) {
          const chunk = uniqueMissingIds.slice(i, i + 5);
          await Promise.all(chunk.map(async (modId) => {
             try {
               const detail = await window.api.modhub.fetchModDetail({ modId, bustCache: false });
               if (detail) {
                 set(state => {
                   const newMods = [...state.mods];
                   const idx = newMods.findIndex(m => m.modId === modId);
                   let enriched = null;
                   if (idx !== -1) {
                     enriched = get().enrichModWithDetail(newMods[idx], detail);
                     newMods[idx] = enriched;
                   }
                   const newModCache = {
                     ...state.modCache,
                     [String(modId)]: { ...(state.modCache[String(modId)] || {}), ...(enriched || detail) }
                   };
                   return {
                     mods: newMods,
                     categoryAllMods: (state.categoryAllMods || []).map(cm => (cm.modId === modId && enriched) ? enriched : cm),
                     modCache: newModCache
                   };
                 });
               }
             } catch (e) {
               console.warn(`[MODHUB] Failed deep fetch for ${modId}:`, e);
             }
          }));

          // Guard: stop if view changed
          if (get().currentFilter !== startFilter || get().currentPage !== startPage) break;
        }
      }
    } finally {
      set({ isDeepScanning: false });
    }
  },

  setFilters: (filters) => {
    set((state) => ({ 
      activeFilters: { ...DEFAULT_ACTIVE_FILTERS, ...(state.activeFilters || {}), ...filters },
      currentPage: 0
    }));
    get().fetchMods();
  },

  resetFilters: async () => {
    localStorage.removeItem('modhub_filter');
    localStorage.removeItem('modhub_page');
    // Also clear persistent cache
    await window.api.modhub.setPersistentCache({});
    const state = get();
    const restoredFilter = state.authorFilter ? (state.previousFilter || state.currentFilter) : state.currentFilter;
    set({
      activeFilters: { ...DEFAULT_ACTIVE_FILTERS },
      authorFilter: null,
      authorFilterSource: null,
      previousFilter: null,
      currentFilter: restoredFilter,
      isPrefetching: false
    });
    get().fetchMods();
  },

  prefetchCategories: async () => {
    // Lightweight prefetch only if needed
    console.log('[MODHUB] Prefetch skipped on launch to maximize responsiveness.');
  },

  startGlobalWarming: async () => {
    const { categories, fetchMods, pageSize, isWarming } = get();
    if (isWarming || !categories.length) return;

    const { lastGlobalWarming, setLastGlobalWarming } = useSettingsStore.getState();
    const now = Date.now();
    const isDeepRequired = (now - lastGlobalWarming) > (24 * 60 * 60 * 1000); // 24hr threshold

    set({ isWarming: true });
    console.log(`[WARMING] Initializing ${isDeepRequired ? "FULL DEEP" : "INCREMENTAL SNAP"} background scan...`);

    // ── PHASE 1: Always perform a "Snap Discovery" for New content ──
    const snapFilters = ['latest', 'downloads'];
    console.log(`[WARMING] Executing Snap Discovery for: ${snapFilters.join(', ')}`);
    
    try {
      const snapResults = await Promise.all(snapFilters.map(f => fetchMods(f, 0, true)));
      const newIds = snapResults.flatMap(r => (r || []).map(m => m.modId)).filter(Boolean);
      
      set(state => ({ 
        warmingQueue: [...new Set([...state.warmingQueue, ...newIds])] 
      }));
      
      // Kick off processing immediately for snap results
      get().processWarmingQueue();
    } catch (err) {
      console.warn("[WARMING] Snap discovery failed:", err);
    }

    // ── PHASE 2: Only proceed to deep scan if threshold reached ──
    if (!isDeepRequired) {
      console.log("[WARMING] Periodic threshold not reached (24h). Skipping deep scan.");
      set({ isWarming: false });
      return;
    }

    console.log("[WARMING] Threshold reached. Starting full library sweep...");
    
    // Collect all unique filters
    const priority = ['best', 'maps', 'tractorsS', 'tractorsM', 'tractorsL', 'trucks'];
    const otherFilters = [];
    categories.forEach(cat => {
      cat.items?.forEach(sub => {
        if (sub.filter && !snapFilters.includes(sub.filter) && !priority.includes(sub.filter)) {
          otherFilters.push(sub.filter);
        }
      });
    });

    const deepFilters = [...priority, ...otherFilters];
    const CHUNK_SIZE = 2;

    for (let i = 0; i < deepFilters.length; i += CHUNK_SIZE) {
      const chunk = deepFilters.slice(i, i + CHUNK_SIZE);
      console.log(`[WARMING] Deep Scanning: ${chunk.join(', ')}`);
      
      try {
        const results = await Promise.all(chunk.map(f => fetchMods(f, 0, true)));
        const discoveredIds = results.flatMap(r => (r || []).map(m => m.modId)).filter(Boolean);
        
        set(state => ({ 
          warmingQueue: [...new Set([...state.warmingQueue, ...discoveredIds])] 
        }));

        await new Promise(r => setTimeout(r, 2000));
        get().processWarmingQueue();
      } catch (err) {
        console.error(`[WARMING] Batch error in deep scan:`, err);
      }
    }

    setLastGlobalWarming(now);
    set({ isWarming: false });
    console.log("[WARMING] Global scan complete. Worker continuing in background.");
  },

  processWarmingQueue: async () => {
    const { warmingQueue, isDeepScanning, modCache } = get();
    if (isDeepScanning || warmingQueue.length === 0) return;

    set({ isDeepScanning: true });
    const queue = [...warmingQueue];
    set({ warmingQueue: [] });

    console.log(`[WARMING] Worker processing ${queue.length} mods...`);

    for (const modId of queue) {
      // Skip if already in detail cache
      if (modCache[String(modId)]?.description) continue;

      try {
        await window.api.modhub.fetchModDetail({ modId, bustCache: false });
        // small pause between details
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        console.error(`[WARMING] Failed mod ${modId}:`, e);
      }
    }

    set({ isDeepScanning: false });
    // Check if more items arrived while we were working
    if (get().warmingQueue.length > 0) get().processWarmingQueue();
  },

  toggleFavoriteAuthor: (author) => {
    if (!author) return;
    const authorName = (typeof author === 'string' ? author : (author.name || author.id || '')).trim();
    if (!authorName) return;
    const authorId = (typeof author === 'object' && author.id !== undefined && author.id !== null) ? String(author.id) : authorName;
    const normName = authorName.toLowerCase();
    const { favoriteAuthors } = get();

    const exists = favoriteAuthors.some(a => {
      const aName = (a.name || a.id || '').trim().toLowerCase();
      const aId = String(a.id ?? '');
      return (authorId && aId === authorId) || aName === normName;
    });

    let newFavs;
    if (exists) {
      newFavs = favoriteAuthors.filter(a => {
        const aName = (a.name || a.id || '').trim().toLowerCase();
        const aId = String(a.id ?? '');
        return !((authorId && aId === authorId) || aName === normName);
      });
    } else {
      newFavs = [...favoriteAuthors, { id: authorId, name: authorName }];
    }
    set({ favoriteAuthors: newFavs });
    localStorage.setItem('fav_authors', JSON.stringify(newFavs));
  },

  toggleHiddenMod: (mod) => {
    const { hiddenMods } = get();
    const exists = hiddenMods.find(m => m.modId === mod.modId);
    let newHidden;
    if (exists) {
      newHidden = hiddenMods.filter(m => m.modId !== mod.modId);
    } else {
      newHidden = [...hiddenMods, { modId: mod.modId, title: mod.title, image: mod.image, author: mod.author }];
    }
    set({ hiddenMods: newHidden });
    localStorage.setItem('hidden_mods', JSON.stringify(newHidden));
  },

  toggleFavoriteMod: async (mod) => {
    const { favoriteMods } = get();
    const exists = favoriteMods.find(m => isModMatch(m, mod));
    let newFavs;
    if (exists) {
      const nextIsFavorite = !(exists.isFavorite !== false);
      if (!nextIsFavorite && !exists.isMustHave) {
        newFavs = favoriteMods.filter(m => !isModMatch(m, mod));
      } else {
        newFavs = favoriteMods.map(m => isModMatch(m, mod) ? { ...m, isFavorite: nextIsFavorite } : m);
      }
    } else {
      // Enrichment: If favoriting from a local source, try to find the full remote data in our cache
      let enrichedMod = { ...mod };
      if (!mod.rating || !mod.image) {
          const targetId = mod.modId ? String(mod.modId) : null;
          const targetTitle = mod.title ? mod.title.toLowerCase().replace(/[^a-z0-9]/g, '') : null;

          for (const val of Object.values(get().modCache)) {
              if (val && typeof val === 'object') {
                if (Array.isArray(val.mods)) {
                    const match = val.mods.find(m => {
                        if (targetId && String(m.modId) === targetId) return true;
                        if (targetTitle && m.title) {
                            const mTitle = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                            return mTitle === targetTitle;
                        }
                        return false;
                    });
                    if (match) { enrichedMod = { ...enrichedMod, ...match }; break; }
                } else if (targetId && String(val.modId) === targetId) {
                    enrichedMod = { ...enrichedMod, ...val }; break;
                } else if (targetTitle && val.title) {
                    const vTitle = val.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (vTitle === targetTitle) {
                        enrichedMod = { ...enrichedMod, ...val }; break;
                    }
                }
              }
          }
      }

      // FINAL FALLBACK: If we still have no rating but have an ID, fetch it from ModHub
      if (!enrichedMod.rating && enrichedMod.modId) {
          try {
              const detail = await window.api.modhub.fetchModDetail({ modId: enrichedMod.modId });
              if (detail && detail.rating) {
                  enrichedMod.rating = detail.rating;
              }
          } catch (e) {
              console.warn(`[MODHUB] Failed to fetch rating for favorite ${enrichedMod.modId}:`, e);
          }
      }

      newFavs = [...favoriteMods, { 
        modId: enrichedMod.modId, 
        fileName: enrichedMod.fileName,
        title: enrichedMod.title, 
        image: enrichedMod.image, 
        iconData: enrichedMod.iconData, // PRESERVE LOCAL ICON DATA
        author: enrichedMod.author,
        version: enrichedMod.version,
        rating: enrichedMod.rating,
        dependencies: enrichedMod.dependencies || [],
        isMustHave: false,
        isFavorite: true
      }];
    }
    set({ favoriteMods: newFavs });
    localStorage.setItem('fav_mods', JSON.stringify(newFavs));
  },

  repairFavoriteMetadata: async () => {
    const { favoriteMods } = get();

    // CLEANUP Corrupted Favourites and Deduplicate
    const validFavs = [];
    const seen = new Set();
    
    favoriteMods.forEach(m => {
      if (m.modId === undefined && m.fileName === undefined) return; // Skip invalid
      
      const key = m.modId ? `id_${m.modId}` : `file_${m.fileName}`;
      if (!seen.has(key)) {
        seen.add(key);
        validFavs.push(m);
      }
    });

    if (validFavs.length !== favoriteMods.length) {
      console.warn(`[MODHUB] [CLEANUP] Removing ${favoriteMods.length - validFavs.length} corrupted or duplicate favorites.`);
      set({ favoriteMods: validFavs });
      localStorage.setItem('fav_mods', JSON.stringify(validFavs));
    }

    // Repair if missing rating OR if dependencies are missing/empty while having a modId
    const needsRepair = validFavs.filter(m => m.modId && (!m.rating || !m.dependencies));
    if (needsRepair.length === 0) return;

    console.log(`[MODHUB] [REPAIR] Found ${needsRepair.length} favorites missing metadata. Starting background repair...`);
    
    // Repair one by one to respect rate limits
    const updatedFavs = [...favoriteMods];
    for (const mod of needsRepair) {
        try {
            const detail = await window.api.modhub.fetchModDetail({ modId: mod.modId });
            if (detail) {
                const idx = updatedFavs.findIndex(m => m.modId && mod.modId && String(m.modId) === String(mod.modId));
                if (idx !== -1) {
                    updatedFavs[idx] = { 
                      ...updatedFavs[idx], 
                      rating: detail.rating || updatedFavs[idx].rating,
                      dependencies: detail.dependencies || []
                    };
                    set({ favoriteMods: [...updatedFavs] });
                    localStorage.setItem('fav_mods', JSON.stringify(updatedFavs));
                }
            }
        } catch (e) {
            console.error(`[MODHUB] [REPAIR] Failed for ${mod.modId}:`, e);
        }
    }
    console.log(`[MODHUB] [REPAIR] Completed.`);
  },

  toggleMustHaveMod: async (mod) => {
    const { favoriteMods } = get();
    const exists = favoriteMods.find(m => isModMatch(m, mod));

    if (!exists) {
      // Add as must-have only, NOT favorite
      let enrichedMod = { ...mod };
      if (!mod.rating || !mod.image) {
          const targetId = mod.modId ? String(mod.modId) : null;
          const targetTitle = mod.title ? mod.title.toLowerCase().replace(/[^a-z0-9]/g, '') : null;

          for (const val of Object.values(get().modCache)) {
              if (val && typeof val === 'object') {
                if (Array.isArray(val.mods)) {
                    const match = val.mods.find(m => {
                        if (targetId && String(m.modId) === targetId) return true;
                        if (targetTitle && m.title) {
                            const mTitle = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                            return mTitle === targetTitle;
                        }
                        return false;
                    });
                    if (match) { enrichedMod = { ...enrichedMod, ...match }; break; }
                } else if (targetId && String(val.modId) === targetId) {
                    enrichedMod = { ...enrichedMod, ...val }; break;
                } else if (targetTitle && val.title) {
                    const vTitle = val.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (vTitle === targetTitle) {
                        enrichedMod = { ...enrichedMod, ...val }; break;
                    }
                }
              }
          }
      }

      if (!enrichedMod.rating && enrichedMod.modId) {
          try {
              const detail = await window.api.modhub.fetchModDetail({ modId: enrichedMod.modId });
              if (detail && detail.rating) {
                  enrichedMod.rating = detail.rating;
              }
          } catch (e) {
              console.warn(`[MODHUB] Failed to fetch rating for must-have ${enrichedMod.modId}:`, e);
          }
      }

      const newFavs = [...favoriteMods, {
        modId: enrichedMod.modId,
        fileName: enrichedMod.fileName,
        title: enrichedMod.title,
        image: enrichedMod.image,
        iconData: enrichedMod.iconData,
        author: enrichedMod.author,
        version: enrichedMod.version,
        rating: enrichedMod.rating,
        dependencies: enrichedMod.dependencies || [],
        isMustHave: true,
        isFavorite: false
      }];
      set({ favoriteMods: newFavs });
      localStorage.setItem('fav_mods', JSON.stringify(newFavs));
      return;
    }

    const nextIsMustHave = !exists.isMustHave;
    const currentIsFavorite = exists.isFavorite !== false;

    let newFavs;
    if (!nextIsMustHave && !currentIsFavorite) {
      newFavs = favoriteMods.filter(m => !isModMatch(m, mod));
    } else {
      newFavs = favoriteMods.map(m => isModMatch(m, mod) ? { ...m, isMustHave: nextIsMustHave } : m);
    }

    set({ favoriteMods: newFavs });
    localStorage.setItem('fav_mods', JSON.stringify(newFavs));
  },
  setAuthorFilter: (author, shouldFetch = true, source = null) => {
    if (author) {
      const state = get();
      const prevFilter = state.authorFilter ? state.previousFilter : state.currentFilter;
      set({
        authorFilter: author,
        authorFilterSource: source || (state.authorFilter ? state.authorFilterSource : 'category'),
        previousFilter: prevFilter,
        mods: [],
        categoryAllMods: [],
        currentPage: 0
      });
    } else {
      const state = get();
      const restoredFilter = state.previousFilter || state.currentFilter || 'latest';
      set({
        authorFilter: null,
        authorFilterSource: null,
        previousFilter: null,
        currentFilter: restoredFilter,
        mods: [],
        categoryAllMods: [],
        currentPage: 0
      });
    }
    if (shouldFetch) get().fetchMods();
  },

  setFilters: (filters) => {
    set((state) => ({ 
      activeFilters: { ...DEFAULT_ACTIVE_FILTERS, ...(state.activeFilters || {}), ...filters },
      currentPage: 0
    }));
  },

  setPageSize: (size) => {
    localStorage.setItem('modhub_pagesize', size.toString());
    set({ pageSize: size, currentPage: 0 });
  },

  setFilter: (filter) => {
    localStorage.setItem('modhub_filter', filter);
    localStorage.setItem('modhub_page', '0');
    
    set({ 
      currentFilter: filter, 
      currentPage: 0, 
      categoryAllMods: [],
      mods: [],
      totalPages: 1,
      categoryTotalMods: 0,
      error: null,
      searchQuery: '',
      authorFilter: null,
      authorFilterSource: null,
      previousFilter: null
    });
    
    get().fetchMods(filter);
  },

  setPage: (page) => {
    localStorage.setItem('modhub_page', page.toString());
    set({ currentPage: page });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  fetchCategories: async () => {
    if (!window.api?.categories) return [];
    try {
      const categories = await window.api.categories.getAll();
      set({ categories });
      return categories;
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      return [];
    }
  },

  fetchStats: async () => {
    if (!window.api?.modhub || get().isFetchingStats) return;
    set({ isFetchingStats: true });
    try {
      const result = await window.api.modhub.getStats();
      if (result.success) {
        const prevNew = get().newCount;
        const prevTotal = get().totalMods;
        const statsObj = { 
          totalMods: result.totalMods, 
          latestCount: result.latestCount,
          newCount: result.newCount || 0,
          updateCount: result.updateCount || 0
        };
        set({ ...statsObj });
        try {
          localStorage.setItem('modhub_stats', JSON.stringify(statsObj));
        } catch (_) {}

        // If new mods are detected or total changed, bust latest cache and fetch fresh
        if (result.newCount > 0 && (result.newCount !== prevNew || result.totalMods !== prevTotal)) {
          console.log('[MODHUB] Stats change detected! Automatically refreshing latest feed...');
          get().fetchMods('latest', 0, false, true);
        }
      }
    } catch (err) {
      console.error('Failed to fetch ModHub stats:', err);
    } finally {
      set({ isFetchingStats: false });
    }
  },

  startPeriodicStats: () => {
    const { statsIntervalId, fetchStats } = get();
    if (statsIntervalId) return; // Already running

    // Refresh every 30 minutes
    const id = setInterval(fetchStats, 30 * 60 * 1000);
    set({ statsIntervalId: id });
    
    // Defer live network scraping fetch by 15 seconds after launch so startup is 100% idle
    setTimeout(() => {
      fetchStats();
    }, 15000);
  },

  stopPeriodicStats: () => {
    const { statsIntervalId } = get();
    if (statsIntervalId) {
      clearInterval(statsIntervalId);
      set({ statsIntervalId: null });
    }
  },

  fetchMods: async (filter, page, isPrefetch = false, bustCache = false) => {
    if (!window.api?.modhub) return [];
    const { currentFilter, authorFilter, modCache, categories } = get();
    
    // Determine target filter
    let f = filter !== undefined ? filter : currentFilter;
    if (f === 'search' && !get().searchQuery?.trim()) {
      f = get().previousFilter || localStorage.getItem('modhub_filter') || 'latest';
      set({ currentFilter: f, previousFilter: null, searchQuery: '' });
    }
    const targetPage = typeof page === 'number' ? page : (get().currentPage || 0);
    const searchPart = f === 'search' ? `_${get().searchQuery}` : '';
    const pagePart = f.toLowerCase() === 'all' ? `_p${targetPage}` : '';
    const cacheKey = `${f}_${authorFilter?.name || 'none'}${searchPart}${pagePart}`;
    const now = Date.now();
    const cached = modCache[cacheKey];

    // Snapshot the request ID
    if (!isPrefetch) {
      set((state) => ({ 
        lastRequestId: state.lastRequestId + 1,
        error: null 
      }));
    }
    const requestId = get().lastRequestId;

    // ── INSTANT RENDER FROM CACHE ──
    const isGlobalFeed = ['latest', 'downloads', 'mostdownloaded', 'best', 'rating'].includes(f.toLowerCase());
    const isOverpopulatedGlobalFeed = isGlobalFeed && (cached?.allMods?.length || 0) > 72;

    if (cached && !isPrefetch && !isOverpopulatedGlobalFeed && !bustCache) {
      const isStale = now - cached.timestamp > 1800000; // 30 minutes stale for UI
      
      const mappedMods = (cached.allMods || []).map(m => {
        if (!m?.modId) return m;
        const rawId = String(m.modId);
        const cleanId = rawId.replace(/^0+/, "");
        const individual = modCache[rawId] || (cleanId ? modCache[cleanId] : null);
        if (individual) {
          return {
            ...m,
            ...individual,
            techData: { ...(m.techData || {}), ...(individual.techData || {}) }
          };
        }
        return m;
      });

      set({ 
        categoryAllMods: mappedMods,
        mods: mappedMods,
        isLoading: false
      });

      if (!isStale) {
        console.log(`[MODHUB] [CACHE HIT] ${cacheKey}`);
        return mappedMods;
      }
      console.log(`[MODHUB] [STALE] Revalidating: ${cacheKey}`);
    }

    // Only show loader if we have nothing to show
    if (!cached && !isPrefetch) {
      set({ isLoading: true, categoryAllMods: [], mods: [] });
    }

    try {
      // Helper function to fetch all pages for a given filter/child
      const fetchAllPagesForFilter = async (filterName) => {
        if (authorFilter) {
          if (isNaN(authorFilter.id)) {
            const first = await window.api.modhub.search({ query: authorFilter.name, page: 0 });
            const total = first.pagination?.total || first.totalPages || 1;
            const resMods = [...(first.mods || [])];
            if (total > 1) {
              const extra = await Promise.all(Array.from({ length: total - 1 }, (_, i) => 
                window.api.modhub.search({ query: authorFilter.name, page: i + 1 })
              ));
              extra.forEach(r => { if (r.mods) resMods.push(...r.mods); });
            }
            return resMods;
          } else {
            const first = await window.api.modhub.fetchByAuthor({ authorId: authorFilter.id, page: 0 });
            const total = first.pagination?.total || first.totalPages || 1;
            const resMods = [...(first.mods || [])];
            if (total > 1) {
              const extra = await Promise.all(Array.from({ length: total - 1 }, (_, i) => 
                window.api.modhub.fetchByAuthor({ authorId: authorFilter.id, page: i + 1 })
              ));
              extra.forEach(r => { if (r.mods) resMods.push(...r.mods); });
            }
            return resMods;
          }
        } else if (filterName === 'search') {
          const first = await window.api.modhub.search({ query: get().searchQuery, page: 0 });
          const total = first.pagination?.total || first.totalPages || 1;
          const resMods = [...(first.mods || [])];
          if (total > 1) {
            const extra = await Promise.all(Array.from({ length: total - 1 }, (_, i) => 
              window.api.modhub.search({ query: get().searchQuery, page: i + 1 })
            ));
            extra.forEach(r => { if (r.mods) resMods.push(...r.mods); });
          }
          return resMods;
        } else if (filterName.toLowerCase() === 'all') {
          // 'All' category uses the full persistent database pool (6,800+ mods)
          // supplemented with the latest live mods from ModHub page 0
          const pool = new Map();
          try {
            const persistentCache = await window.api.modhub.getPersistentCache();
            Object.values(persistentCache || {}).forEach(m => {
              if (m?.modId && m?.title && m.title !== 'Error: Mod not found' && !m.title.toLowerCase().includes('not found') && (m.downloadUrl || m.fileName)) {
                const paddedId = String(m.modId).padStart(8, '0');
                const image = (m.images && m.images[0]) || m.image || ('https://cdn18.giants-software.com/modHub/storage/' + paddedId + '/iconBig.jpg');
                const candidates = (m.candidates && m.candidates.length > 0) ? m.candidates : [
                  'https://cdn16.giants-software.com/modHub/storage/' + paddedId + '/iconBig.jpg',
                  'https://cdn17.giants-software.com/modHub/storage/' + paddedId + '/iconBig.jpg',
                  'https://cdn18.giants-software.com/modHub/storage/' + paddedId + '/iconBig.jpg',
                  'https://cdn19.giants-software.com/modHub/storage/' + paddedId + '/iconBig.jpg',
                  'https://cdn20.giants-software.com/modHub/storage/' + paddedId + '/iconBig.jpg',
                  ...(m.images || [])
                ];
                pool.set(String(m.modId), { ...m, image, candidates });
              }
            });
          } catch (_) {}

          // Also merge existing known modCache items
          Object.values(get().modCache || {}).forEach(item => {
            if (item?.allMods && Array.isArray(item.allMods)) {
              item.allMods.forEach(m => { if (m?.modId && !pool.has(String(m.modId))) pool.set(String(m.modId), m); });
            } else if (item?.modId && !pool.has(String(item.modId))) {
              pool.set(String(item.modId), item);
            }
          });

          // Fetch the live latest pages (0 to 4) to ensure recent releases are included
          try {
            const livePages = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(p => window.api.modhub.fetchMods({ filter: 'latest', page: p, bustCache }).catch(() => null)));
            livePages.forEach(liveResult => {
              (liveResult?.mods || []).forEach(m => {
                if (m?.modId && m?.title && m.title !== 'Error: Mod not found' && !m.title.toLowerCase().includes('not found')) {
                  const existing = pool.get(String(m.modId));
                  pool.set(String(m.modId), existing ? { ...existing, ...m } : m);
                }
              });
            });
          } catch (_) {}

          const allPoolMods = Array.from(pool.values());
          const parseDate = (m) => {
            const rel = m.releasedDate || m.metadata?.Released || m.metadata?.['Release date'] || m.metadata?.['Release Date'] || m.metadata?.Date;
            if (rel && typeof rel === 'string') {
              const parts = rel.trim().split('.');
              if (parts.length === 3) {
                const d = parseInt(parts[0], 10);
                const mMonth = parseInt(parts[1], 10);
                const y = parseInt(parts[2], 10);
                if (!isNaN(d) && !isNaN(mMonth) && !isNaN(y)) {
                  return new Date(y, mMonth - 1, d).getTime();
                }
              }
            }
            return m.badgeFirstSeen || 0;
          };
          allPoolMods.sort((a, b) => parseDate(b) - parseDate(a));

          set({ totalPages: Math.max(1, Math.ceil(allPoolMods.length / get().pageSize)), categoryTotalMods: allPoolMods.length, totalMods: allPoolMods.length });
          return allPoolMods;
        } else {
          const first = await window.api.modhub.fetchMods({ filter: filterName, page: 0, bustCache });
          let total = first.pagination?.total || first.totalPages || 1;
          
          if (filterName.toLowerCase() === 'latest') {
            total = Math.min(total, 6); // Allow up to 6 pages (144 mods) for latest feed timeframe filtering
          } else if (['downloads', 'mostdownloaded', 'best', 'rating'].includes(filterName.toLowerCase())) {
            total = Math.min(total, 2); // Cap global feeds to 2 pages (48 mods)
          }

          const resMods = [...(first.mods || [])];
          if (total > 1) {
            const extra = await Promise.all(Array.from({ length: total - 1 }, (_, i) => 
              window.api.modhub.fetchMods({ filter: filterName, page: i + 1, bustCache })
            ));
            extra.forEach(r => { if (r.mods) resMods.push(...r.mods); });
          }

          // If latest feed, enrich with cached detail dates
          if (filterName.toLowerCase() === 'latest') {
            const modIds = resMods.map(m => m.modId).filter(Boolean);
            if (modIds.length > 0 && window.api?.modhub?.getBatchDetails) {
              try {
                const batchDetails = await window.api.modhub.getBatchDetails(modIds);
                if (batchDetails) {
                  for (let i = 0; i < resMods.length; i++) {
                    const d = batchDetails[resMods[i].modId];
                    if (d) {
                      resMods[i] = { ...resMods[i], ...d };
                    }
                  }
                }
              } catch (_) {}
            }
          }

          return resMods;
        }
      };

      let allRawMods = [];

      if (f.startsWith('aggregate:')) {
        const catLabel = f.split(':')[1];
        const parentCat = (categories || []).find(c => c.label.toLowerCase() === catLabel.toLowerCase());
        const childFilters = parentCat?.children?.map(c => c.filter).filter(Boolean) || [];

        const childResults = await Promise.all(childFilters.map(cf => fetchAllPagesForFilter(cf)));
        allRawMods = childResults.flat();
      } else {
        allRawMods = await fetchAllPagesForFilter(f);
      }

      if (get().lastRequestId !== requestId && !isPrefetch) return [];

      // Deduplicate by modId
      const seenMap = new Map();
      allRawMods.forEach(m => {
        if (m && m.modId && !seenMap.has(m.modId)) {
          seenMap.set(m.modId, m);
        }
      });
      const uniqueAllMods = Array.from(seenMap.values());

      // ── ENRICH WITH CENTRAL CACHE & BADGE DECAY ──
      const { badgeDuration } = useSettingsStore.getState();
      const durationMs = (() => {
          switch (badgeDuration) {
              case '24h': return 24 * 60 * 60 * 1000;
              case '48h': return 48 * 60 * 60 * 1000;
              case '72h': return 72 * 60 * 60 * 1000;
              case '1w': return 7 * 24 * 60 * 60 * 1000;
              case 'always': return Infinity;
              default: return 48 * 60 * 60 * 1000;
          }
      })();

      const enrichedMods = uniqueAllMods.map(mod => {
          const rawId = mod?.modId ? String(mod.modId) : '';
          const cleanId = rawId.replace(/^0+/, '');
          const cachedMod = modCache[rawId] || (cleanId ? modCache[cleanId] : null);
          if (cachedMod?.techData) {
            const catStr = (mod.category || cachedMod.category || cachedMod.metadata?.Category || '').toLowerCase();
            const titleStr = (mod.title || cachedMod.title || '').toLowerCase();
            const descStr = (cachedMod.description || '').toLowerCase();
            const isNoCap = NO_CAPACITY_KEYWORDS.some(k => catStr.includes(k) || titleStr.includes(k)) ||
                            catStr.includes('gameplay') || catStr.includes('script') ||
                            titleStr.includes('script') || descStr.includes('with this script');
            if (isNoCap) {
              cachedMod.techData.capacity = 0;
              cachedMod.techData.capacityMin = 0;
              cachedMod.techData.capacityMax = 0;
              cachedMod.techData.unitCapacity = 0;
              cachedMod.techData.unitCapacityType = '';
            } else if (cachedMod.techData.unitCapacity) {
              const uType = (cachedMod.techData.unitCapacityType || '').toLowerCase();
              const catFilter = (mod.category || cachedMod.category || '').split(':')[1] || '';
              const isVehicle = DRIVABLE_FILTERS.includes(catFilter) || cachedMod.techData?.isDrivable;
              if (BOGUS_UNIT_TYPES.includes(uType) || isVehicle) {
                cachedMod.techData.unitCapacity = 0;
                cachedMod.techData.unitCapacityType = '';
              }
            }
          }
          const cachedPrice = cachedMod?.techData?.price ?? 0;
          if (cachedMod?.techData) {
            if (!cachedMod.techData.priceMin && cachedPrice > 0) cachedMod.techData.priceMin = cachedPrice;
            if (!cachedMod.techData.priceMax && cachedPrice > 0) cachedMod.techData.priceMax = cachedPrice;
          }
          const effectiveCached = cachedMod || null;
          let enriched = effectiveCached ? { ...mod, ...effectiveCached } : { ...mod };

          // Badge First-Seen Tracking
          if (enriched.isNew || enriched.isUpdate) {
              if (!enriched.badgeFirstSeen) {
                  enriched.badgeFirstSeen = Date.now();
              } else {
                  const age = now - enriched.badgeFirstSeen;
                  if (age > durationMs) {
                      enriched.isNew = false;
                      enriched.isUpdate = false;
                  }
              }
          }

          return enriched;
      });

      let displayMods = enrichedMods;
      if (f === 'latest') {
        displayMods = enrichedMods;
      } else if (f && f !== 'search' && f !== 'all' && !authorFilter) {
        // Category cross-contamination guard at store level
        const fLower = f.toLowerCase();
        const isLoadersFilter = fLower === 'aggregate:loaders' || 
          ['frontloadervehicles', 'frontloaders', 'frontloadertools', 'teleloadervehicles', 'teleloadertools', 'wheelloadervehicles', 'wheelloadertools', 'skidsteervehicles', 'skidsteertools', 'forklifts'].includes(fLower);

        displayMods = enrichedMods.filter(m => {
          const modCat = (m.category || m.metadata?.Category || '').toLowerCase();
          if (!modCat) return true; // keep if metadata not yet fetched

          if (fLower === 'gameplay') {
            if (modCat.includes('placeable') || modCat.includes('storage') || modCat.includes('shed') || modCat.includes('silo')) {
              return false;
            }
          }

          if (isLoadersFilter) {
            if (modCat.includes('tractor') || modCat.includes('traktor') || modCat.includes('truck') || modCat.includes('car') || modCat.includes('combine')) {
              return false;
            }
          }

          const isGlobalFeed = ['all', 'latest', 'officialmods', 'downloads', 'mostdownloaded', 'best', 'rating'].includes(f.toLowerCase());
          if (categories && categories.length > 0 && !isGlobalFeed) {
            let activeParent = null;
            if (f.startsWith('aggregate:')) {
              const pName = f.split(':')[1];
              activeParent = categories.find(c => c.label.toLowerCase() === pName.toLowerCase());
            } else {
              for (const cat of categories) {
                if (cat.filter === f) { activeParent = cat; break; }
                if (cat.children?.some(sub => sub.filter === f)) { activeParent = cat; break; }
              }
            }

            if (activeParent) {
              const parentLabelLower = activeParent.label.toLowerCase();
              const topLevelNames = categories.map(c => c.label.toLowerCase());

              // 1. If modCat has " - " separator
              if (modCat.includes(' - ')) {
                const [modParent] = modCat.split(' - ').map(s => s.trim().toLowerCase());
                if (topLevelNames.includes(modParent) && modParent !== parentLabelLower) {
                  return false;
                }
              } else {
                // 2. Standalone mod category
                if (topLevelNames.includes(modCat) && modCat !== parentLabelLower) {
                  return false;
                }
              }

              // 3. Specific Objects guards: exclude barn/pen placeables and gameplay scripts that leaked into Objects
              if (parentLabelLower === 'objects') {
                if (modCat.includes('placeable') || modCat.includes('package') || modCat.includes('gameplay')) {
                  return false;
                }
                const titleLower = (m.title || '').toLowerCase();
                if (titleLower.includes('pig barn') || titleLower.includes('cow barn') || titleLower.includes('sheep barn') || titleLower.includes('horse barn') || titleLower.includes('animal pen') || titleLower.includes('traffic lights')) {
                  return false;
                }
              }
            }
          }

          return true;
        });
      }

      // ── UPDATE FRONTEND CACHE ──
      set(state => {
        const poolUpdate = {};
        enrichedMods.forEach(m => {
          if (m.modId) poolUpdate[String(m.modId)] = { ...m, timestamp: now };
        });

        const newCache = {
          ...state.modCache,
          ...poolUpdate, 
          [cacheKey]: {
            allMods: displayMods,
            timestamp: now
          }
        };

        const entries = Object.entries(newCache);
        let prunedCache = newCache;
        if (entries.length > 40) {
          entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
          prunedCache = Object.fromEntries(entries.slice(0, 40));
        }
        localStorage.setItem('modhub_cache_v2', JSON.stringify(prunedCache));
        window.api.modhub.setPersistentCache(prunedCache).catch(console.error);

        const isActuallyActive = f === get().currentFilter && (authorFilter?.id === get().authorFilter?.id);
        const shouldUpdateUI = isActuallyActive || (isPrefetch && isActuallyActive);

        return {
          modCache: prunedCache,
          ...(shouldUpdateUI ? {
            categoryAllMods: displayMods,
            mods: displayMods,
            isLoading: false
          } : {})
        };
      });

      if (isPrefetch) {
        console.log(`[MODHUB] [PREFETCHED] ${cacheKey}`);
      } else {
        console.log(`[MODHUB] [FETCHED] ${cacheKey} (${enrichedMods.length} total mods)`);
      }

      return enrichedMods;

    } catch (err) {
      if (!isPrefetch && requestId === get().lastRequestId) {
        set({ error: err.message, isLoading: false });
      }
      return [];
    }
  },

  searchMods: async (query) => {
    if (!query || !query.trim()) {
      const state = get();
      const restoredFilter = (state.previousFilter && state.previousFilter !== 'search')
        ? state.previousFilter
        : ((state.currentFilter && state.currentFilter !== 'search')
            ? state.currentFilter
            : (localStorage.getItem('modhub_filter') || 'latest'));

      set({
        searchQuery: '',
        currentFilter: restoredFilter,
        previousFilter: null,
        currentPage: 0,
        error: null,
        categoryAllMods: [],
        mods: []
      });

      return await get().fetchMods(restoredFilter, 0);
    }

    const state = get();
    const prevFilter = state.currentFilter === 'search'
      ? (state.previousFilter || 'latest')
      : (state.currentFilter || 'latest');

    const requestId = state.lastRequestId + 1;
    set({ 
      isLoading: true, 
      error: null, 
      searchQuery: query.trim(), 
      lastRequestId: requestId, 
      mods: [],
      currentFilter: 'search',
      previousFilter: prevFilter,
      authorFilter: null,
      activeFilters: { ...DEFAULT_ACTIVE_FILTERS },
      isSmartMatchEnabled: false,
      powerReference: null,
    });
    
    // Now just call fetchMods with the 'search' filter - it will handle pageSize/multi-fetching correctly
    return await get().fetchMods('search', 0);
  },

  enrichModWithDetail: (mod, detail) => {
    const filter = (mod.category || detail.category || '').split(':')[1] || '';
    const isVehicleCategory = DRIVABLE_FILTERS.includes(filter);

    const priceValue = parseInt((detail.metadata?.['Price'] || '0').replace(/\D/g,'')) || 0;
    
    // Technical Data Parsing
    let hpValues = [];
    Object.entries(detail.metadata || {}).forEach(([k, v]) => {
      const val = (v || '').toString().toLowerCase();
      const matches = val.match(/(\d+)\s*(hp|cv|ps|pk|kw)/gi);
      if (matches) {
        matches.forEach(m => {
          let p = parseInt(m.match(/\d+/)[0], 10);
          if (m.toLowerCase().includes('kw')) p = Math.round(p * 1.36);
          if (p > 0 && !hpValues.includes(p)) hpValues.push(p);
        });
      }
    });

    const uniqueHpValues = [...new Set(hpValues)].sort((a,b) => a-b);
    const hpMin = uniqueHpValues[0] || 0;
    const hpMax = uniqueHpValues[uniqueHpValues.length - 1] || 0;

    const rawTechData = detail.techData || {
      price: priceValue,
      priceMin: priceValue,
      priceMax: priceValue,
      hp: hpMax,
      hpMin: hpMin,
      hpMax: hpMax,
      hpValues: uniqueHpValues,
      hpIsRequirement: !isVehicleCategory,
      isDrivable: isVehicleCategory,
      techSpecs: detail.techSpecs || {}
    };
    const techData = {
      priceMin: rawTechData.priceMin || rawTechData.price || priceValue,
      priceMax: rawTechData.priceMax || rawTechData.price || priceValue,
      ...rawTechData,
      scraped: true
    };
    const catStr = (mod.category || detail.category || detail.metadata?.Category || '').toLowerCase();
    const titleStr = (mod.title || detail.title || '').toLowerCase();
    const isNoCap = NO_CAPACITY_KEYWORDS.some(k => catStr.includes(k) || titleStr.includes('script'));
    if (isNoCap) {
      techData.capacity = 0;
      techData.capacityMin = 0;
      techData.capacityMax = 0;
      techData.unitCapacity = 0;
      techData.unitCapacityType = '';
    } else if (isVehicleCategory || BOGUS_UNIT_TYPES.includes((techData.unitCapacityType || '').toLowerCase())) {
      techData.unitCapacity = 0;
      techData.unitCapacityType = '';
    }

    let brand = detail.metadata?.['Manufacturer'] || detail.metadata?.['Brand'] || '';
    return { ...mod, ...detail, techData, brand };
  },
}));
