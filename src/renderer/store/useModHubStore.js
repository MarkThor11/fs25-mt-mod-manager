import { create } from 'zustand';
import { useSettingsStore } from './useSettingsStore';

const HARDCODED_BRANDS = [
  "John Deere", "Case IH", "New Holland", "Fendt", "Massey Ferguson", 
  "Valtra", "Claas", "JCB", "Deutz-Fahr", "Kubota", "Krone", "Kuhn", 
  "Amazone", "Horsch", "Pottinger", "Grimme", "Manitou", "Merlo", 
  "Lindner", "Steyr", "Rostselmash", "McCormick", "Landini", "Zetor", 
  "Hardi", "Holmer", "Ropa", "Volvo", "Mack Trucks", "Lizard"
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
  activeFilters: {
    brands: [],
    priceRange: [0, 1000000],
    hpRange: [0, 2000],
    capRange: [0, 1000000],
    platforms: [],
    hideRequired: false,
    hideInstalled: false,
  },
  favoriteAuthors: JSON.parse(localStorage.getItem('fav_authors') || '[]'),
  favoriteMods: JSON.parse(localStorage.getItem('fav_mods') || '[]'),
  hiddenMods: JSON.parse(localStorage.getItem('hidden_mods') || '[]'),
  authorFilter: null, // { id: string, name: string }
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
    
    // Check if we already have tech data AND dependencies for all
    const needsScan = mods.some(m => !m.techData || !m.dependencies);
    if (!needsScan) return;

    // Capture view state to prevent overwriting results if user navigates away
    const startFilter = get().currentFilter;
    const startPage = get().currentPage;
    const startAuthor = get().authorFilter?.id;

    set({ isDeepScanning: true });
    try {
      const idsToFetch = mods
        .filter(m => !m.techData || !m.dependencies)
        .map(m => m.modId)
        .filter(Boolean);

      if (idsToFetch.length === 0) return;

      // 1. Fetch all cached details in ONE batch IPC call
      const batchResults = await window.api.modhub.getBatchDetails(idsToFetch);
      
      const updatedMods = [...mods];
      const stillMissingIds = [];

      updatedMods.forEach((mod, idx) => {
        const detail = batchResults[mod.modId];
        if (detail) {
          updatedMods[idx] = get().enrichModWithDetail(mod, detail);
        } else if (!mod.techData || !mod.dependencies) {
          stillMissingIds.push(mod.modId);
        }
      });

      // Update UI with what we found in cache immediately
      set({ mods: [...updatedMods] });

      // 2. For anything still missing, fetch individually (will be throttled by scraper)
      if (stillMissingIds.length > 0) {
        for (let i = 0; i < stillMissingIds.length; i += 5) {
          const chunk = stillMissingIds.slice(i, i + 5);
          await Promise.all(chunk.map(async (modId) => {
             try {
               const detail = await window.api.modhub.fetchModDetail({ modId, bustCache: false });
               if (detail) {
                 set(state => {
                   const newMods = [...state.mods];
                   const idx = newMods.findIndex(m => m.modId === modId);
                   if (idx !== -1) {
                     newMods[idx] = get().enrichModWithDetail(newMods[idx], detail);
                   }
                   return { mods: newMods };
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
      activeFilters: { ...state.activeFilters, ...filters },
      currentPage: 0
    }));
    get().fetchMods();
  },

  resetFilters: async () => {
    localStorage.removeItem('modhub_filter');
    localStorage.removeItem('modhub_page');
    // Also clear persistent cache
    await window.api.modhub.setPersistentCache({});
    set({
      activeFilters: {
        brands: [],
        priceRange: [0, 1000000],
        hpRange: [0, 2000],
        capRange: [0, 1000000],
        platforms: [],
        hideRequired: false,
        hideInstalled: false
      },
      // Note: We intentionally DO NOT reset currentFilter or searchQuery here
      // so that "Reset All" in the filter panel stays on the current page/search results.
      isPrefetching: false
    });
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
    const { favoriteAuthors } = get();
    const exists = favoriteAuthors.find(a => a.id === author.id);
    let newFavs;
    if (exists) {
      newFavs = favoriteAuthors.filter(a => a.id !== author.id);
    } else {
      newFavs = [...favoriteAuthors, author];
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
    const exists = favoriteMods.find(m => 
      (m.modId && mod.modId && String(m.modId) === String(mod.modId)) || 
      (m.fileName && mod.fileName && m.fileName === mod.fileName)
    );
    let newFavs;
    if (exists) {
      newFavs = favoriteMods.filter(m => 
        !((m.modId && mod.modId && String(m.modId) === String(mod.modId)) || 
          (m.fileName && mod.fileName && m.fileName === mod.fileName))
      );
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
                            return mTitle === targetTitle || mTitle.includes(targetTitle) || targetTitle.includes(mTitle);
                        }
                        return false;
                    });
                    if (match) { enrichedMod = { ...enrichedMod, ...match }; break; }
                } else if (targetId && String(val.modId) === targetId) {
                    enrichedMod = { ...enrichedMod, ...val }; break;
                } else if (targetTitle && val.title) {
                    const vTitle = val.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (vTitle === targetTitle || vTitle.includes(targetTitle) || targetTitle.includes(vTitle)) {
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
        isMustHave: false
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

  toggleMustHaveMod: (mod) => {
    const { favoriteMods, toggleFavoriteMod } = get();
    const modId = mod.modId;
    const fileName = mod.fileName;

    const exists = favoriteMods.find(m => 
      (m.modId && modId && String(m.modId) === String(modId)) || 
      (m.fileName && fileName && m.fileName === fileName)
    );

    if (!exists) {
      // If not even a favorite, toggle favorite first then set must-have
      get().toggleFavoriteMod(mod).then(() => {
        set((state) => ({
          favoriteMods: state.favoriteMods.map(m => {
            if ((m.modId && modId && String(m.modId) === String(modId)) || (m.fileName && fileName && m.fileName === fileName)) {
              return { ...m, isMustHave: true };
            }
            return m;
          })
        }));
        localStorage.setItem('fav_mods', JSON.stringify(get().favoriteMods));
      });
      return;
    }

    const newFavs = favoriteMods.map(m => {
      if ((m.modId && modId && String(m.modId) === String(modId)) || (m.fileName && fileName && m.fileName === fileName)) {
        return { ...m, isMustHave: !m.isMustHave };
      }
      return m;
    });
    set({ favoriteMods: newFavs });
    localStorage.setItem('fav_mods', JSON.stringify(newFavs));
  },


  setAuthorFilter: (author, shouldFetch = true) => {
    // Only reset currentFilter to 'latest' if we are actually SETTING an author
    // If clearing (author === null), we leave currentFilter alone
    set((state) => ({ 
      authorFilter: author, 
      currentFilter: author ? 'latest' : state.currentFilter, 
      mods: [], 
      currentPage: 0 
    }));
    if (shouldFetch) get().fetchMods();
  },

  setFilters: (filters) => {
    set((state) => ({ 
      activeFilters: { ...state.activeFilters, ...filters },
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
      authorFilter: null 
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

  fetchMods: async (filter, page, isPrefetch = false) => {
    if (!window.api?.modhub) return [];
    const { currentFilter, authorFilter, modCache, categories } = get();
    
    // Determine target filter
    const f = filter !== undefined ? filter : currentFilter;
    const searchPart = f === 'search' ? `_${get().searchQuery}` : '';
    const cacheKey = `${f}_${authorFilter?.name || 'none'}${searchPart}`;
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

    if (cached && !isPrefetch && !isOverpopulatedGlobalFeed) {
      const isStale = now - cached.timestamp > 300000; // 5 minutes stale for UI
      
      set({ 
        categoryAllMods: cached.allMods || [],
        mods: cached.allMods || [],
        isLoading: false
      });

      if (!isStale) {
        console.log(`[MODHUB] [CACHE HIT] ${cacheKey}`);
        return cached.allMods;
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
        } else {
          const first = await window.api.modhub.fetchMods({ filter: filterName, page: 0 });
          let total = first.pagination?.total || first.totalPages || 1;
          
          if (['latest', 'downloads', 'mostdownloaded', 'best', 'rating'].includes(filterName.toLowerCase())) {
            total = Math.min(total, 2); // Cap global feeds to 2 pages (48 mods)
          }

          const resMods = [...(first.mods || [])];
          if (total > 1) {
            const extra = await Promise.all(Array.from({ length: total - 1 }, (_, i) => 
              window.api.modhub.fetchMods({ filter: filterName, page: i + 1 })
            ));
            extra.forEach(r => { if (r.mods) resMods.push(...r.mods); });
          }
          return resMods;
        }
      };

      let allRawMods = [];

      if (f.startsWith('aggregate:')) {
        const catLabel = f.split(':')[1];
        const parentCat = (categories || []).find(c => c.label === catLabel);
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
          const cachedMod = modCache[String(mod.modId)];
          let enriched = cachedMod ? { ...mod, ...cachedMod } : { ...mod };

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
        const recentMods = enrichedMods.filter(m => m.isNew || m.isUpdate);
        displayMods = recentMods.length > 0 ? recentMods : enrichedMods.slice(0, 24);
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
    if (!query.trim()) {
      get().fetchMods();
      return;
    }
    const requestId = get().lastRequestId + 1;
    set({ 
      isLoading: true, 
      error: null, 
      searchQuery: query, 
      lastRequestId: requestId, 
      mods: [],
      currentFilter: 'search',
      authorFilter: null,
      activeFilters: {
        brands: [],
        priceRange: [0, 1000000],
        hpRange: [0, 2000],
        capRange: [0, 1000000],
        platforms: [],
      },
      isSmartMatchEnabled: false,
      powerReference: null,
    });
    
    // Now just call fetchMods with the 'search' filter - it will handle pageSize/multi-fetching correctly
    return await get().fetchMods('search', 0);
  },

  enrichModWithDetail: (mod, detail) => {
    const filter = (mod.category || detail.category || '').split(':')[1] || '';
    const drivableFilters = [
      'tractorsS', 'tractorsM', 'tractorsL', 'trucks', 'cars', 'miscDrivables',
      'frontLoaderVehicles', 'teleLoaderVehicles', 'wheelLoaderVehicles', 'skidSteerVehicles', 'forklifts',
      'harvesters', 'forageHarvesters', 'beetHarvesters', 'potatoHarvesting', 'vegetableHarvesters',
      'riceHarvesters', 'sugarcaneHarvesters', 'cottonHarvesters', 'grapeHarvesters', 'oliveHarvesters',
      'forestryHarvesters', 'forestryForwarders', 'forestryExcavators'
    ];
    const isVehicleCategory = drivableFilters.includes(filter);

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

    const techData = detail.techData || {
      price: priceValue,
      hp: hpMax,
      hpMin: hpMin,
      hpMax: hpMax,
      hpValues: uniqueHpValues,
      hpIsRequirement: !isVehicleCategory,
      isDrivable: isVehicleCategory,
      techSpecs: detail.techSpecs || {}
    };

    let brand = detail.metadata?.['Manufacturer'] || detail.metadata?.['Brand'] || '';
    return { ...mod, ...detail, techData, brand };
  },
}));
