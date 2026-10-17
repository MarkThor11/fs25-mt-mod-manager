import { CustomSlider } from '../components/common/CustomSlider';
import CustomSelect from '../components/common/CustomSelect';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, RefreshCw, SlidersHorizontal, Tag, Zap, Layers, X, DollarSign, Heart, ArrowLeft, LayoutGrid, ChevronLeft, ChevronRight, Milestone, Globe, Package, Download } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CategoryTree from '../components/modhub/CategoryTree';
import ModCard from '../components/modhub/ModCard';
import CompareOverlay from '../components/modhub/CompareOverlay';
import DependencyDownloadModal from '../components/common/DependencyDownloadModal';
import { useModHubStore } from '../store/useModHubStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useScrollPersistence } from '../hooks/useScrollPersistence';
import { useInstalledLookup } from '../hooks/useInstalledLookup';

const matchesBrand = (mod, targetBrands) => {
  if (!targetBrands || targetBrands.length === 0) return true;
  
  const modBrand = (mod.brand || '').toLowerCase();
  const metadata = mod.metadata || {};
  const metaBrand = (metadata['Manufacturer'] || metadata['Brand'] || metadata['manufacturer'] || metadata['brand'] || '').toLowerCase();
  const title = (mod.title || '').toLowerCase();

  return targetBrands.some(b => {
    const bLower = b.toLowerCase();
    return modBrand === bLower || metaBrand === bLower || title.includes(bLower);
  });
};

export default function ModHubPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isCategoriesCollapsed, setIsCategoriesCollapsed] = useState(() => localStorage.getItem('modhub_sidebar_collapsed') === 'true');
  
  const sidebarRef = useScrollPersistence('modhub-sidebar');
  const mainRef = useScrollPersistence('modhub-main');
  const {
    mods, currentFilter, currentPage, totalPages,
    isLoading, error, categories, isDeepScanning, modCache,
    activeFilters: rawActiveFilters, favoriteAuthors, authorFilter, authorFilterSource, previousFilter, hardcodedBrands, hiddenMods,
    setFilter, setPage, fetchMods, fetchCategories, searchMods,
    fetchDetailsForCurrentPage, setFilters, resetFilters, setAuthorFilter,
    selectedCompareIds, clearCompare, pageSize, setPageSize,
    isSmartMatchEnabled, toggleSmartMatch, powerReference, setPowerReference,
    selectedHP, setSelectedHP, hpMatchMode, setHpMatchMode,
    categoryTotalMods, categoryAllMods
  } = useModHubStore();

  const activeFilters = useMemo(() => {
    const f = rawActiveFilters || {};
    return {
      brands: Array.isArray(f.brands) ? f.brands : [],
      priceRange: Array.isArray(f.priceRange) && f.priceRange.length >= 2 ? f.priceRange : [0, Infinity],
      hpRange: Array.isArray(f.hpRange) && f.hpRange.length >= 2 ? f.hpRange : [0, Infinity],
      capRange: Array.isArray(f.capRange) && f.capRange.length >= 2 ? f.capRange : [0, Infinity],
      unitRange: Array.isArray(f.unitRange) && f.unitRange.length >= 2 ? f.unitRange : [0, Infinity],
      platforms: Array.isArray(f.platforms) ? f.platforms : [],
      hideRequired: Boolean(f.hideRequired),
      hideInstalled: Boolean(f.hideInstalled)
    };
  }, [rawActiveFilters]);
  
  const isOnline = useSettingsStore(s => s.isOnline);
  const { modHubZoom, setModHubZoom, modHubIconOnly, setModHubIconOnly } = useSettingsStore();
  const getInstalledVersion = useInstalledLookup();

  const toggleCategories = () => {
    const newVal = !isCategoriesCollapsed;
    setIsCategoriesCollapsed(newVal);
    localStorage.setItem('modhub_sidebar_collapsed', newVal);
  };

  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [missingDeps, setMissingDeps] = useState(null);
  const [pendingMapTask, setPendingMapTask] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [sortOrder, setSortOrder] = useState('latest');
  const [latestTimeframe, setLatestTimeframe] = useState(() => {
    const saved = localStorage.getItem('modhub_latest_timeframe');
    return (saved && ['today', '3days', 'week', 'month'].includes(saved)) ? saved : 'week';
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showUnits, setShowUnits] = useState(false);

  useEffect(() => {
    // Initial fetch of the active mods page 
    // This is still needed to show the "Latest" list (or whichever filter is active)
    // because prefetching runs in the background and might not have cached the 
    // current active filter yet.
    const initialSearch = searchParams.get('search');
    if (initialSearch) {
      setSearchInput(initialSearch);
      searchMods(initialSearch);
    } else if (mods.length === 0) {
      fetchMods();
    }
  }, []);

  useEffect(() => {
    console.log('[MODHUB] Current categories:', categories?.length || 0);
  }, [categories]);

  useEffect(() => {
    console.log('[MODHUB] Categories updated:', categories);
  }, [categories]);

  const breadcrumb = React.useMemo(() => {
    if (authorFilter) return `Author: ${authorFilter.name}`;
    if (currentFilter === 'search') return `Search: ${searchInput || 'Results'}`;
    if (!categories || categories.length === 0) return null;
    if (currentFilter === 'latest') return 'Latest';
    if (currentFilter.startsWith('aggregate:')) return currentFilter.split(':')[1];
    
    for (const cat of categories) {
      if (cat.filter === currentFilter) return cat.label;
      if (cat.children) {
        for (const sub of cat.children) {
          if (sub.filter === currentFilter) {
            return { parent: cat.label, child: sub.label };
          }
        }
      }
    }
    return null;
  }, [categories, currentFilter, searchInput, authorFilter]);

  useEffect(() => {
    // Trigger deep scan to discover technical data and dependencies for all visible mods
    fetchDetailsForCurrentPage();
  }, [sortOrder, mods.length, activeFilters, isSmartMatchEnabled]);

  const handleSearch = useCallback((value) => {
    setSearchInput(value);
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      setSearchTimeout(null);
    }
    if (!value || !value.trim()) {
      searchMods('');
      return;
    }
    const timeout = setTimeout(() => {
      searchMods(value);
    }, 500);
    setSearchTimeout(timeout);
  }, [searchTimeout, searchMods]);

  const sourceMods = useMemo(() => {
    const raw = (categoryAllMods && categoryAllMods.length > 0) ? categoryAllMods : (mods || []);
    return raw.map(m => {
      if (!m) return m;
      const rawId = m.modId ? String(m.modId) : '';
      const cleanId = rawId.replace(/^0+/, '');
      const cached = modCache[rawId] || (cleanId ? modCache[cleanId] : null);
      if (cached) {
        return {
          ...m,
          ...cached,
          techData: cached.techData ? { ...(m.techData || {}), ...cached.techData } : m.techData,
          dependencies: cached.dependencies || m.dependencies
        };
      }
      return m;
    });
  }, [categoryAllMods, mods, modCache]);

  // Calculate actual overall maximum bounds scraped across ALL mods in the cache/list
  const globalMax = useMemo(() => {
    let maxPrice = 0;
    let maxHp = 0;
    let maxCap = 0;
    let maxUnit = 0;

    const allModsPool = [...sourceMods, ...Object.values(modCache || {})];

    allModsPool.forEach(m => {
      if (m?.techData) {
        if (m.techData.price > maxPrice) maxPrice = m.techData.price;
        if (m.techData.hp > maxHp) maxHp = m.techData.hp;
        if (m.techData.capacity > maxCap) maxCap = m.techData.capacity;
        if (m.techData.unitCapacity > maxUnit) {
          const isBogus = ['pack', 'packs', 'paket', 'pakete', 'piece', 'pieces', 'unit', 'units', 'item', 'items', 'tonnes'].includes((m.techData.unitCapacityType || '').toLowerCase());
          if (!isBogus && !m.techData.isDrivable) maxUnit = m.techData.unitCapacity;
        }
      }
    });

    return {
      price: Math.min(maxPrice > 0 ? maxPrice : 500000, 500000), // Cap slider at 500k to prevent 30M cheat mods ruining scale
      hp: Math.min(maxHp > 0 ? maxHp : 1000, 1000),             // Cap slider at 1000 HP
      cap: Math.min(maxCap > 0 ? maxCap : 500000, 500000),       // Cap slider at 500k L to prevent 45M cheat mods ruining scale
      unit: maxUnit > 0 ? maxUnit : 1000                          // Max unit capacity (cows, bales, logs, etc.)
    };
  }, [sourceMods, modCache]);

  const brands = useMemo(() => {
    const scannedBrands = sourceMods.map(m => m.brand).filter(Boolean);
    return Array.from(new Set([...hardcodedBrands, ...scannedBrands])).sort();
  }, [sourceMods, hardcodedBrands]);

  // Filter mods based on active filters
  const filteredMods = useMemo(() => {
    return sourceMods.filter(mod => {
      if (!mod) return false;

      // Hidden mod filter — always exclude hidden mods from browsing
      const hiddenModIds = hiddenMods.map(m => m.modId);
      if (hiddenModIds.includes(mod.modId)) return false;

      // Category cross-contamination guard
      if (currentFilter && currentFilter !== 'search' && !authorFilter) {
        const modCat = (mod.category || mod.metadata?.Category || '').toLowerCase();
        
        if (currentFilter === 'gameplay') {
          if (modCat.includes('placeable') || modCat.includes('storage') || modCat.includes('shed') || modCat.includes('silo')) {
            return false;
          }
        }

        // Check if viewing Loaders (aggregate or subcategories)
        const isLoadersFilter = currentFilter === 'aggregate:Loaders' || 
          ['frontloadervehicles', 'frontloaders', 'frontloadertools', 'teleloadervehicles', 'teleloadertools', 'wheelloadervehicles', 'wheelloadertools', 'skidsteervehicles', 'skidsteertools', 'forklifts'].includes(currentFilter.toLowerCase());

        if (isLoadersFilter && modCat) {
          // If the mod has category metadata and is explicitly classified under Tractors, Cars, Trucks, Combines, etc., exclude it
          if (modCat.includes('tractor') || modCat.includes('traktor') || modCat.includes('truck') || modCat.includes('car') || modCat.includes('combine')) {
            return false;
          }
        }

        // Generic category family guard: when viewing a known category parent/sub, verify mod metadata category matches if available
        // Do NOT apply this cross-contamination check to global feeds like 'all', 'latest', 'downloads', 'best', etc.
        const isGlobalFeed = ['all', 'latest', 'officialmods', 'downloads', 'mostdownloaded', 'best', 'rating'].includes(currentFilter.toLowerCase());
        if (categories && categories.length > 0 && modCat && !isGlobalFeed) {
          let activeParent = null;
          let activeChild = null;

          if (currentFilter.startsWith('aggregate:')) {
            const pName = currentFilter.split(':')[1];
            activeParent = categories.find(c => c.label.toLowerCase() === pName.toLowerCase());
          } else {
            for (const cat of categories) {
              if (cat.filter === currentFilter) {
                activeParent = cat;
                break;
              }
              if (cat.children) {
                for (const sub of cat.children) {
                  if (sub.filter === currentFilter) {
                    activeParent = cat;
                    activeChild = sub;
                    break;
                  }
                }
                if (activeParent) break;
              }
            }
          }

          if (activeParent) {
            const parentLabelLower = activeParent.label.toLowerCase();
            const topLevelNames = categories.map(c => c.label.toLowerCase());

            // 1. If modCat has " - " separator (e.g. "Placeable - Animal Pens", "Drivables - Small Tractors")
            if (modCat.includes(' - ')) {
              const [modParent] = modCat.split(' - ').map(s => s.trim().toLowerCase());
              if (topLevelNames.includes(modParent) && modParent !== parentLabelLower) {
                return false;
              }
            } else {
              // 2. Standalone mod category (e.g. "gameplay", "package", "prefab")
              if (topLevelNames.includes(modCat) && modCat !== parentLabelLower) {
                return false;
              }
            }

            // 3. Specific Objects guards: exclude barn/pen placeables and gameplay scripts that leaked into Objects
            if (parentLabelLower === 'objects') {
              if (modCat.includes('placeable') || modCat.includes('package') || modCat.includes('gameplay')) {
                return false;
              }
              const titleLower = (mod.title || '').toLowerCase();
              if (titleLower.includes('pig barn') || titleLower.includes('cow barn') || titleLower.includes('sheep barn') || titleLower.includes('horse barn') || titleLower.includes('animal pen') || titleLower.includes('traffic lights')) {
                return false;
              }
            }
          }
        }
      }

      // Brand filter (multi-select)
      if (activeFilters.brands.length > 0) {
        if (!matchesBrand(mod, activeFilters.brands)) return false;
      }

      // Author filter (from Favourites Library)
      if (authorFilter) {
        const authorName = mod.author || '';
        if (authorName.toLowerCase() !== authorFilter.name.toLowerCase()) return false;
      }

      // SMART MATCH SAME-TYPE BYPASS
      const isSmartMatching = isSmartMatchEnabled && powerReference && mod.techData;
      const sameType = isSmartMatching && (!!mod.techData.hpIsRequirement === !!powerReference.techData?.hpIsRequirement);

      // Technical data filters
      const hasTechData = !!mod.techData;
      
      // Price Range Check
      if (activeFilters.priceRange[0] > 0 || activeFilters.priceRange[1] < globalMax.price) {
        const pMin = mod.techData?.priceMin || mod.techData?.price || 0;
        const pMax = mod.techData?.priceMax || mod.techData?.price || 0;
        if (pMin > activeFilters.priceRange[1] || pMax < activeFilters.priceRange[0]) return false;
      }
      
      // HP Range Check
      if (!sameType && (activeFilters.hpRange[0] > 0 || activeFilters.hpRange[1] < globalMax.hp)) {
        const hMin = mod.techData?.hpMin || mod.techData?.hp || 0;
        const hMax = mod.techData?.hpMax || mod.techData?.hp || 0;
        if (hMin > activeFilters.hpRange[1] || hMax < activeFilters.hpRange[0]) return false;
      }
      
      // Capacity Range Check
      if (activeFilters.capRange[0] > 0 || activeFilters.capRange[1] < globalMax.cap) {
        const cMin = mod.techData?.capacityMin || mod.techData?.capacity || 0;
        const cMax = mod.techData?.capacityMax || mod.techData?.capacity || 0;
        // Exclude mods with no capacity data when filter is active
        if (cMax === 0) return false;
        // Exclude if mod's max exceeds filter max (too big) or mod's max is below filter min (too small)
        if (cMax > activeFilters.capRange[1] || cMax < activeFilters.capRange[0]) return false;
      }

      // Unit Capacity Range Check (cows, bales, logs, etc.)
      if (activeFilters.unitRange[0] > 0 || activeFilters.unitRange[1] < globalMax.unit) {
        const isBogus = ['pack', 'packs', 'paket', 'pakete', 'piece', 'pieces', 'unit', 'units', 'item', 'items', 'tonnes'].includes((mod.techData?.unitCapacityType || '').toLowerCase());
        const uVal = (!isBogus && !mod.techData?.isDrivable) ? (mod.techData?.unitCapacity || 0) : 0;
        // Exclude mods with no unit capacity data when filter is active
        if (uVal === 0) return false;
        if (uVal < activeFilters.unitRange[0] || uVal > activeFilters.unitRange[1]) return false;
      }

      // Smart Power Matching (Bi-directional Cross-Type only)
      if (isSmartMatching && !sameType && (mod.techData.hpMin > 0 || mod.techData.hpMax > 0)) {
        const modIsReq = !!mod.techData.hpIsRequirement;
        const refIsReq = !!powerReference.techData?.hpIsRequirement;
        const modIsDrivable = !!mod.techData.isDrivable;
        const refIsDrivable = !!powerReference.techData?.isDrivable;

        const isTargetingDrivable = refIsReq && modIsDrivable;
        const isTargetingTool = refIsDrivable && modIsReq;
        
        if (isTargetingDrivable || isTargetingTool) {
          const modHPMin = mod.techData.hpMin || mod.techData.hp || 0;
          const modHPMax = mod.techData.hpMax || mod.techData.hp || 0;
          let refHPMin = powerReference.techData?.hpMin || powerReference.techData?.hp || 0;
          let refHPMax = powerReference.techData?.hpMax || powerReference.techData?.hp || 0;

          if (selectedHP > 0) {
            refHPMin = selectedHP;
            refHPMax = selectedHP;
          }

          if (!refIsReq) {
            if (modIsReq && modHPMin > refHPMax) return false;
          } else {
            if (!modIsReq && modHPMax < refHPMin) return false;
          }
        }
      }

      if (activeFilters.platforms?.includes('crossplay')) {
        const metadata = mod.metadata || {};
        const platformText = (metadata['Platform'] || metadata['platform'] || '').toLowerCase();
        const isCrossplay = platformText.includes('ps5') || platformText.includes('ps4') || platformText.includes('xbs') || platformText.includes('xb1');
        if (!isCrossplay) return false;
      }

      // Requirement Filter
      if (activeFilters.hideRequired && mod?.dependencies && mod.dependencies.length > 0) {
        return false;
      }

      // Installed Filter
      if (activeFilters.hideInstalled && mod && getInstalledVersion(mod)) {
        return false;
      }

      // Latest Timeframe Selector Filter
      if (currentFilter === 'latest' && latestTimeframe !== 'all') {
        const releasedStr = mod.releasedDate || mod.metadata?.['Release date'] || mod.metadata?.['Release Date'] || mod.metadata?.['Date'];
        let modTime = null;
        if (releasedStr && typeof releasedStr === 'string') {
          const parts = releasedStr.trim().split('.');
          if (parts.length === 3) {
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const y = parseInt(parts[2], 10);
            if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
              modTime = new Date(y, m - 1, d).getTime();
            }
          }
        }
        if (!modTime && mod.badgeFirstSeen) {
          modTime = mod.badgeFirstSeen;
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        if (latestTimeframe === 'today') {
          if (modTime) {
            if (modTime < startOfToday) return false;
          } else {
            if (!mod.isNew && !mod.isUpdate) return false;
          }
        } else if (latestTimeframe === '3days') {
          // Calendar window covering today + past 3 full days (3 days ago at 00:00:00)
          const threeDaysAgo = startOfToday - (3 * 24 * 60 * 60 * 1000);
          if (modTime) {
            if (modTime < threeDaysAgo) return false;
          } else {
            if (!mod.isNew && !mod.isUpdate) return false;
          }
        } else if (latestTimeframe === 'week') {
          // Calendar window covering today + past 7 full days (7 days ago at 00:00:00)
          const weekAgo = startOfToday - (7 * 24 * 60 * 60 * 1000);
          if (modTime) {
            if (modTime < weekAgo) return false;
          }
        } else if (latestTimeframe === 'month') {
          // Calendar window covering today + past 30 full days
          const monthAgo = startOfToday - (30 * 24 * 60 * 60 * 1000);
          if (modTime) {
            if (modTime < monthAgo) return false;
          }
        }
      }

      return true;
    }).filter(Boolean);
  }, [sourceMods, hiddenMods, activeFilters, authorFilter, isSmartMatchEnabled, powerReference, selectedHP, getInstalledVersion, globalMax, currentFilter, latestTimeframe]);

  const handleBrandToggle = (brand) => {
    const newBrands = activeFilters.brands.includes(brand)
      ? activeFilters.brands.filter(b => b !== brand)
      : [...activeFilters.brands, brand];
    setFilters({ brands: newBrands });
  };

  const filteredAndSortedMods = useMemo(() => {
    let result = [...filteredMods];
    
    if (sortOrder === 'downloads') {
      result.sort((a, b) => (b?.downloads || 0) - (a?.downloads || 0));
    } else if (sortOrder === 'rating') {
      result.sort((a, b) => (b?.rating || 0) - (a?.rating || 0));
    } else if (sortOrder === 'name') {
      result.sort((a, b) => (a?.title || '').localeCompare(b?.title || ''));
    } else if (sortOrder === 'price_low') {
      result.sort((a, b) => (a?.techData?.price || 0) - (b?.techData?.price || 0));
    } else if (sortOrder === 'price_high') {
      result.sort((a, b) => (b?.techData?.price || 0) - (a?.techData?.price || 0));
    } else if (sortOrder === 'hp_low') {
      result.sort((a, b) => (a?.techData?.hp || 0) - (b?.techData?.hp || 0));
    } else if (sortOrder === 'hp_high') {
      result.sort((a, b) => (b?.techData?.hp || 0) - (a?.techData?.hp || 0));
    } else if (sortOrder === 'cap_low') {
      result.sort((a, b) => (a?.techData?.capacity || 0) - (b?.techData?.capacity || 0));
    } else if (sortOrder === 'cap_high') {
      result.sort((a, b) => (b?.techData?.capacity || 0) - (a?.techData?.capacity || 0));
    }
    
    return result.filter(m => m && (m.modId || m.title));
  }, [filteredMods, sortOrder]);

  const isServerPaginated = currentFilter?.toLowerCase() === 'all';
  const totalFilteredCount = (isServerPaginated && categoryTotalMods > 0) ? categoryTotalMods : filteredAndSortedMods.length;
  const computedTotalPages = isServerPaginated 
    ? Math.max(1, totalPages || 1)
    : Math.max(1, Math.ceil(filteredAndSortedMods.length / pageSize));
  const safeCurrentPage = currentPage >= computedTotalPages ? 0 : currentPage;
  const pagedMods = useMemo(() => {
    if (isServerPaginated) {
      return filteredAndSortedMods;
    }
    const start = safeCurrentPage * pageSize;
    return filteredAndSortedMods.slice(start, start + pageSize);
  }, [filteredAndSortedMods, safeCurrentPage, pageSize, isServerPaginated]);

  const handleCategorySelect = (filter) => {
    setSearchInput('');
    setAuthorFilter(null, false);
    setFilter(filter);
  };

  const renderPagination = () => {
    if (computedTotalPages <= 1) return null;
    const pages = [];
    const maxVisible = 7;
    let start = Math.max(0, safeCurrentPage - Math.floor(maxVisible / 2));
    let end = Math.min(computedTotalPages, start + maxVisible);
    if (end - start < maxVisible) start = Math.max(0, end - maxVisible);

    for (let i = start; i < end; i++) {
      pages.push(
        <button
          key={i}
          className={`pagination__btn ${i === safeCurrentPage ? 'pagination__btn--active' : ''}`}
          onClick={() => setPage(i)}
        >
          {i + 1}
        </button>
      );
    }

    return (
      <div className="pagination">
        <button
          className="pagination__btn"
          onClick={() => setPage(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 0}
        >
          ‹
        </button>
        {pages}
        <button
          className="pagination__btn"
          onClick={() => setPage(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= computedTotalPages - 1}
        >
          ›
        </button>
      </div>
    );
  };

  return (
    <div className={`modhub-layout ${isCategoriesCollapsed ? 'modhub-layout--sidebar-collapsed' : ''}`} style={{ position: 'relative' }}>
      {isCategoriesCollapsed && (
        <button 
          className="btn btn--secondary btn--xs"
          onClick={toggleCategories}
          title="Show Categories"
          style={{ 
            position: 'absolute', 
            left: 16, 
            top: 20, 
            zIndex: 110, 
            width: 28, 
            height: 28, 
            padding: 4,
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}
        >
          <ChevronRight size={14} />
        </button>
      )}

      <div className="modhub-layout__sidebar" ref={sidebarRef}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 16px 0' }}>
          <button 
            className="btn btn--secondary btn--xs"
            onClick={toggleCategories}
            title={isCategoriesCollapsed ? "Show Categories" : "Hide Categories"}
            style={{ width: 28, height: 28, padding: 4 }}
          >
            <ChevronLeft size={14} />
          </button>
        </div>
        <CategoryTree
          categories={categories}
          activeFilter={currentFilter}
          onSelect={handleCategorySelect}
        />
      </div>

      <div className="modhub-layout__main" ref={mainRef}>
        {!isOnline && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              borderRadius: 'var(--radius-lg)', 
              padding: '12px 20px', 
              margin: '24px 24px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              color: '#ef4444',
              fontSize: 'var(--fs-sm)',
              fontWeight: 600
            }}>
              <Globe size={18} style={{ opacity: 0.8 }} />
              <div>
                <strong>Offline Mode:</strong> You are browsing cached content. New downloads and updates are unavailable until your connection is restored.
              </div>
            </div>
          )}
               <div className="sort-bar" style={{ 
          paddingLeft: isCategoriesCollapsed ? 100 : 24, 
          height: 'auto', 
          minHeight: 100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'center',
          gap: 12,
          paddingTop: 12,
          paddingBottom: 12,
          transition: 'padding-left 0.3s ease',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)'
        }}>
          {/* ROW 1: BREADCRUMBS & SEARCH */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {breadcrumb && (
                <div style={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  marginTop: -4
                }}>
                  <div style={{ 
                    fontSize: '18px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.02em', 
                    color: 'var(--accent)',
                    fontWeight: 900,
                    lineHeight: 1.1
                  }}>
                    {typeof breadcrumb === 'string' ? breadcrumb : breadcrumb.child}
                  </div>
                  
                  <div style={{ 
                    fontSize: '14px',
                    fontWeight: 800,
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    opacity: isLoading ? 0.4 : 0.8,
                    transition: 'opacity 0.3s ease',
                    marginTop: 2
                  }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: '18px', opacity: 1 }}>{totalFilteredCount.toLocaleString()}</span> MODS FOUND
                  </div>
                </div>
              )}
              {powerReference && isSmartMatchEnabled && (
                <div style={{ 
                  fontSize: '11px', 
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'rgba(var(--accent-rgb), 0.1)',
                  padding: '6px 16px',
                  borderRadius: 74,
                  width: 'fit-content',
                  marginBottom: 0,
                  border: '1px solid rgba(var(--accent-rgb), 0.2)',
                  marginTop: 4
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap size={12} fill="currentColor" />
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      {powerReference.techData?.hpIsRequirement 
                        ? `Matching Tractors to: ${powerReference.title}`
                        : `Matching Tools to: ${powerReference.title}`}
                    </span>
                  </div>
                  <X 
                    size={14} 
                    style={{ cursor: 'pointer', opacity: 0.6 }} 
                    onClick={(e) => { e.stopPropagation(); setPowerReference(null); }} 
                  />
                </div>
              )}
              {authorFilter && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 4 }}>
                  <span className="sort-bar__author-label" style={{ margin: 0 }}>
                    by {authorFilter.name}
                  </span>
                  {authorFilterSource === 'favourites' ? (
                    <button 
                      className="btn btn--secondary btn--sm" 
                      style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', minHeight: 0 }}
                      onClick={() => {
                        setAuthorFilter(null);
                        navigate('/favourites');
                      }}
                    >
                      <ArrowLeft size={12} style={{ marginRight: 4 }} /> Back to Favourites
                    </button>
                  ) : (
                    <button 
                      className="btn btn--secondary btn--sm" 
                      style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', minHeight: 0 }}
                      onClick={() => {
                        setAuthorFilter(null);
                      }}
                    >
                      <ArrowLeft size={12} style={{ marginRight: 4 }} /> Back to Category
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="sort-bar__search" style={{ marginLeft: 'auto', width: '30%', maxWidth: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="search-wrap" style={{ flex: 1 }}>
                <Search className="search-wrap__icon" />
                <input
                  className="search-input"
                  type="text"
                  placeholder="Search mods..."
                  value={searchInput}
                  onChange={(e) => handleSearch(e.target.value)}
                  id="modhub-search"
                  style={{ paddingRight: 32, width: '100%' }}
                />
                {searchInput && (
                  <X 
                    size={14} 
                    style={{ position: 'absolute', right: 10, cursor: 'pointer', opacity: 0.5, top: '50%', transform: 'translateY(-50%)' }} 
                    onClick={() => {
                      if (searchTimeout) {
                        clearTimeout(searchTimeout);
                        setSearchTimeout(null);
                      }
                      setSearchInput('');
                      searchMods('');
                    }} 
                  />
                )}
              </div>
              <button
                className="btn btn--secondary btn--sm"
                onClick={() => fetchMods(currentFilter, 0, false, true)}
                title="Refresh ModHub feed"
                style={{ height: 38, width: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* ROW 2: CONTROLS */}
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`btn ${showFilters ? 'btn--primary' : 'btn--secondary'} btn--sm`}
              onClick={() => setShowFilters(!showFilters)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <SlidersHorizontal size={14} /> Filters
              {(activeFilters.brands.length > 0 || activeFilters.priceRange[0] > 0 || activeFilters.hpRange[0] > 0 || activeFilters.capRange[0] > 0 || activeFilters.unitRange[0] > 0 || activeFilters.unitRange[1] < globalMax.unit) && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
              )}
            </button>

            {/* Compare Button (Swapped with Smart Match) */}
            {!(currentFilter && ['latest', 'gameplay', 'prefab', 'package', 'pallet', 'bigbag', 'ibc', 'object', 'handtool', 'misc', 'decoration', 'fences', 'trees', 'silos', 'sheds', 'farmhouses', 'animalpens', 'storages', 'containers', 'tanks', 'winter', 'bales', 'weigh', 'chainsaw', 'flashlight', 'production', 'selling', 'flood', 'beehive', 'garden', 'fillable'].some(x => currentFilter.toLowerCase().includes(x))) && (
              <div className="btn-group">
                <button
                  className={`btn ${selectedCompareIds.length > 0 ? 'btn--primary' : 'btn--secondary'} btn--sm`}
                  onClick={() => setIsCompareOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  disabled={selectedCompareIds.length === 0}
                >
                  <Layers size={14} /> Compare
                  {selectedCompareIds.length > 0 && (
                    <span className="badge badge--accent">{selectedCompareIds.length}</span>
                  )}
                </button>
                {selectedCompareIds.length > 0 && (
                  <button 
                    className="btn btn--secondary btn--sm" 
                    onClick={(e) => { e.stopPropagation(); clearCompare(); }}
                    title="Clear Comparison List"
                    style={{ padding: '0 8px' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {/* Smart Match Button */}
            {!(currentFilter && ['latest', 'map', 'prefab', 'gameplay', 'decoration'].some(x => currentFilter.toLowerCase().includes(x))) && (
              <div className="btn-group">
                <button
                  className={`btn ${isSmartMatchEnabled ? 'btn--primary' : 'btn--secondary'} btn--sm`}
                  onClick={toggleSmartMatch}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  title={isSmartMatchEnabled ? "Disable Smart Match" : "Enable Smart Match (Equipment filter based on Tractor HP)"}
                >
                  <Zap size={14} fill={isSmartMatchEnabled ? "currentColor" : "none"} />
                  Smart Match
                </button>
              </div>
            )}

                        {/* Crossplay Toggle Button */}
            <div className="btn-group">
              <button
                className={`btn ${activeFilters.platforms?.includes('crossplay') ? 'btn--primary' : 'btn--secondary'} btn--sm`}
                onClick={() => setFilters({ platforms: activeFilters.platforms?.includes('crossplay') ? [] : ['crossplay'] })}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                title={activeFilters.platforms?.includes('crossplay') ? "Show All Mods" : "Show Crossplay Only"}
              >
                <Milestone size={14} />
                Crossplay
              </button>
            </div>
            {/* Hide Installed Button */}
            <div className="btn-group">
              <button
                className={`btn ${activeFilters.hideInstalled ? 'btn--primary' : 'btn--secondary'} btn--sm`}
                onClick={() => setFilters({ hideInstalled: !activeFilters.hideInstalled })}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                title={activeFilters.hideInstalled ? "Show Installed Mods" : "Hide Installed Mods"}
              >
                <Download size={14} />
                Hide Installed
              </button>
            </div>

            {currentFilter === 'latest' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Timeframe:</span>
                <CustomSelect
                  value={latestTimeframe}
                  onChange={(val) => {
                    setLatestTimeframe(val);
                    localStorage.setItem('modhub_latest_timeframe', val);
                  }}
                  options={[
                    { value: 'today', label: 'Today' },
                    { value: '3days', label: 'Past 3 Days' },
                    { value: 'week', label: 'Past Week' },
                    { value: 'month', label: 'Past Month' }
                  ]}
                />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginLeft: currentFilter === 'latest' ? 0 : 'auto' }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Show:</span>
              <CustomSelect
                value={pageSize}
                onChange={(val) => setPageSize(parseInt(val, 10))}
                options={[
                  { value: 24, label: '24' },
                  { value: 48, label: '48' },
                  { value: 72, label: '72' },
                  { value: 96, label: '96' }
                ]}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Sort:</span>
              <CustomSelect
                value={sortOrder}
                onChange={(val) => setSortOrder(val)}
                options={[
                  { value: 'latest', label: 'Latest' },
                  { value: 'downloads', label: 'Most Downloaded' },
                  { value: 'rating', label: 'Top Rated' },
                  { value: 'name', label: 'A-Z' },
                  { value: 'price_low', label: 'Price: Lowest' },
                  { value: 'price_high', label: 'Price: Highest' },
                  { value: 'hp_low', label: 'Power: Lowest' },
                  { value: 'hp_high', label: 'Power: Highest' },
                  { value: 'cap_low', label: 'Capacity: Lowest' },
                  { value: 'cap_high', label: 'Capacity: Highest' }
                ]}
              />
            </div>

            <button 
                className={`btn btn--sm ${modHubIconOnly ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setModHubIconOnly(!modHubIconOnly)}
                style={{ 
                    height: 32, 
                    padding: '0 12px', 
                    borderRadius: 6, 
                    gap: 8,
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 600,
                    fontSize: 11,
                    background: modHubIconOnly ? 'var(--accent)' : 'var(--bg-card)',
                    color: modHubIconOnly ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border)'
                }}
            >
                <LayoutGrid size={14} />
                {modHubIconOnly ? "DETAILS" : "ICONS"}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.05)' }}>
              <LayoutGrid size={12} style={{ opacity: 0.4 }} />
              <div style={{ 
                position: 'relative', 
                width: 70, 
                height: 4, 
                background: 'rgba(255,255,255,0.1)', 
                borderRadius: 7, 
                display: 'flex', 
                alignItems: 'center',
                margin: '0 4px'
              }}>
                <CustomSlider 
                   
                  min="140" 
                  max="350" 
                  step="5"
                  value={modHubZoom}
                  onChange={(e) => setModHubZoom(parseInt(e.target.value, 10))}
                  
                  style={{ 
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 'calc(100% + 16px)', 
                    margin: 0,
                    cursor: 'pointer',
                    background: 'transparent'
                  }}
                  title="Card Size"
                />
              </div>
              <LayoutGrid size={16} style={{ opacity: 0.7 }} />
            </div>

            {isDeepScanning && (
              <div className="animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', color: 'var(--accent)', fontSize: 'var(--fs-xs)' }}>
                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                Scanning...
              </div>
            )}
          </div>
        </div>

        {missingDeps && (
          <DependencyDownloadModal 
            missingMods={missingDeps}
            parentId={pendingMapTask?.modId}
            subFolder={pendingMapTask?.subFolder}
            mainTask={pendingMapTask}
            onComplete={() => {
              setMissingDeps(null);
              setPendingMapTask(null);
            }}
            onCancel={() => {
              setMissingDeps(null);
              setPendingMapTask(null);
            }}
          />
        )}


        {(activeFilters.brands.length > 0 || authorFilter || activeFilters.priceRange[0] > 0 || activeFilters.priceRange[1] < globalMax.price || 
          activeFilters.hpRange[0] > 0 || activeFilters.hpRange[1] < globalMax.hp || 
          activeFilters.capRange[0] > 0 || activeFilters.capRange[1] < globalMax.cap || 
          activeFilters.unitRange[0] > 0 || activeFilters.unitRange[1] < globalMax.unit ||
          activeFilters.platforms.length > 0 || activeFilters.hideRequired || activeFilters.hideInstalled) && (
          <div className="filter-chips">
            {authorFilter && (
              <div className="filter-chip filter-chip--author">
                <Heart size={12} fill="currentColor" />
                <span className="filter-chip__label">Author:</span> {authorFilter.name}
                <div className="filter-chip__close" onClick={() => setAuthorFilter(null)}>
                  <X size={10} />
                </div>
              </div>
            )}
            {activeFilters.brands.map(brand => (
              <div className="filter-chip" key={brand}>
                <Tag size={12} />
                <span className="filter-chip__label">Brand:</span> {brand}
                <div className="filter-chip__close" onClick={() => handleBrandToggle(brand)}>
                  <X size={10} />
                </div>
              </div>
            ))}
            {(activeFilters.priceRange[0] > 0 || activeFilters.priceRange[1] < globalMax.price) && (
              <div className="filter-chip">
                <DollarSign size={12} />
                <span className="filter-chip__label">Price:</span> 
                {activeFilters.priceRange[0] > 0 ? `$${(activeFilters.priceRange[0]/1000).toFixed(0)}k+` : ''}
                {activeFilters.priceRange[1] < globalMax.price ? ` <$${(activeFilters.priceRange[1]/1000).toFixed(0)}k` : ''}
                <div className="filter-chip__close" onClick={() => setFilters({ priceRange: [0, Infinity] })}>
                  <X size={10} />
                </div>
              </div>
            )}
            {(activeFilters.hpRange[0] > 0 || activeFilters.hpRange[1] < globalMax.hp) && (
              <div className="filter-chip">
                <Zap size={12} />
                <span className="filter-chip__label">Power:</span> 
                {activeFilters.hpRange[0] > 0 ? `${activeFilters.hpRange[0]}hp+` : ''}
                {activeFilters.hpRange[1] < globalMax.hp ? ` <${activeFilters.hpRange[1]}hp` : ''}
                <div className="filter-chip__close" onClick={() => setFilters({ hpRange: [0, Infinity] })}>
                  <X size={10} />
                </div>
              </div>
            )}
            {(activeFilters.capRange[0] > 0 || activeFilters.capRange[1] < globalMax.cap) && (
              <div className="filter-chip">
                <Layers size={12} />
                <span className="filter-chip__label">Capacity:</span> 
                {activeFilters.capRange[0] > 0 ? `${(activeFilters.capRange[0]/1000).toFixed(0)}kL+` : ''}
                {activeFilters.capRange[1] < globalMax.cap ? ` <${(activeFilters.capRange[1]/1000).toFixed(0)}kL` : ''}
                <div className="filter-chip__close" onClick={() => setFilters({ capRange: [0, Infinity] })}>
                  <X size={10} />
                </div>
              </div>
            )}
            {(activeFilters.unitRange[0] > 0 || activeFilters.unitRange[1] < globalMax.unit) && (
              <div className="filter-chip">
                <Package size={12} />
                <span className="filter-chip__label">Units:</span>
                {activeFilters.unitRange[0] > 0 ? `${activeFilters.unitRange[0]}+` : ''}
                {activeFilters.unitRange[1] < globalMax.unit ? ` <${activeFilters.unitRange[1]}` : ''}
                <div className="filter-chip__close" onClick={() => setFilters({ unitRange: [0, Infinity] })}>
                  <X size={10} />
                </div>
              </div>
            )}
            {activeFilters.platforms?.map(p => (
              <div className="filter-chip" key={p}>
                <Milestone size={12} />
                <span className="filter-chip__label">Platform:</span> Crossplay
                <div className="filter-chip__close" onClick={() => setFilters({ platforms: activeFilters.platforms.filter(x => x !== p) })}>
                  <X size={10} />
                </div>
              </div>
            ))}
            {activeFilters.hideRequired && (
              <div className="filter-chip">
                <Package size={12} />
                <span className="filter-chip__label">No Requirements</span>
                <div className="filter-chip__close" onClick={() => setFilters({ hideRequired: false })}>
                  <X size={10} />
                </div>
              </div>
            )}
            
            {activeFilters.hideInstalled && (
              <div className="filter-chip">
                <Download size={12} />
                <span className="filter-chip__label">Hide Installed</span>
                <div className="filter-chip__close" onClick={() => setFilters({ hideInstalled: false })}>
                  <X size={10} />
                </div>
              </div>
            )}

            <button 
              className="btn btn--ghost btn--xs" 
              onClick={resetFilters}
              style={{ fontSize: 10, color: 'var(--danger)', opacity: 0.8 }}
            >
              Clear All
            </button>
          </div>
        )}

        {showFilters && (
          <div className="filter-panel animate-slide-down">
            <div className="filter-panel__main">
              <div className="filter-panel__section">
                <div className="filter-panel__section-header">
                  <Tag size={16} />
                  <span>Brands</span>
                  {activeFilters.brands.length > 0 && (
                    <span className="badge badge--primary">{activeFilters.brands.length}</span>
                  )}
                </div>
                <div className="brand-grid">
                  {brands.length === 0 && (
                    <div className="brand-grid__empty">Scan required to detect brands</div>
                  )}
                  {brands.map(brand => (
                    <label key={brand} className={`brand-grid__item ${activeFilters.brands.includes(brand) ? 'active' : ''}`}>
                      <input 
                        type="checkbox" 
                        checked={activeFilters.brands.includes(brand)}
                        onChange={() => handleBrandToggle(brand)}
                      />
                      <span>{brand}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="filter-panel__section">
                <div className="filter-panel__section-header">
                  <Zap size={16} />
                  <span>Technical Specifications</span>
                </div>
                
                <div className="tech-specs-grid">
                  <div className="form-group range-group">
                    <label className="range-label">
                      <span>Price Range ($)</span>
                      <div className="range-values">
                        <input type="number" value={activeFilters.priceRange[0]} onChange={(e) => setFilters({ priceRange: [parseInt(e.target.value) || 0, activeFilters.priceRange[1]] })} />
                        <span>-</span>
                        <input type="number" value={activeFilters.priceRange[1] >= globalMax.price ? globalMax.price : activeFilters.priceRange[1]} onChange={(e) => {
                          const val = parseInt(e.target.value) || globalMax.price;
                          setFilters({ priceRange: [activeFilters.priceRange[0], val >= globalMax.price ? Infinity : val] });
                        }} />
                      </div>
                    </label>
                    <div style={{ position: 'relative', width: 'calc(100% - 14px)', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 7, display: 'flex', alignItems: 'center', margin: '12px 7px 8px 7px' }}>
                      <CustomSlider 
                        min="0" max={globalMax.price} useLog={true}
                        value={activeFilters.priceRange[0]} 
                        onChange={(e) => {
                          const val = Math.round(parseFloat(e.target.value) || 0);
                          setFilters({ priceRange: [val, Math.max(val, activeFilters.priceRange[1])] });
                        }}
                        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% + 14px)', margin: 0, cursor: 'pointer', background: 'transparent' }}
                      />
                      <CustomSlider 
                        min="0" max={globalMax.price} useLog={true}
                        value={Math.min(activeFilters.priceRange[1], globalMax.price)} 
                        onChange={(e) => {
                          const val = Math.round(parseFloat(e.target.value) || 0);
                          setFilters({ priceRange: [Math.min(val, activeFilters.priceRange[0]), val >= globalMax.price ? Infinity : val] });
                        }}
                        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% + 14px)', margin: 0, cursor: 'pointer', background: 'transparent' }}
                      />
                    </div>
                  </div>

                  <div className="form-group range-group">
                    <label className="range-label">
                      <span>Power Range (HP)</span>
                      <div className="range-values">
                        <input type="number" value={activeFilters.hpRange[0]} onChange={(e) => setFilters({ hpRange: [parseInt(e.target.value) || 0, activeFilters.hpRange[1]] })} />
                        <span>-</span>
                        <input type="number" value={activeFilters.hpRange[1] >= globalMax.hp ? globalMax.hp : activeFilters.hpRange[1]} onChange={(e) => {
                          const val = parseInt(e.target.value) || globalMax.hp;
                          setFilters({ hpRange: [activeFilters.hpRange[0], val >= globalMax.hp ? Infinity : val] });
                        }} />
                      </div>
                    </label>
                    <div style={{ position: 'relative', width: 'calc(100% - 14px)', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 7, display: 'flex', alignItems: 'center', margin: '12px 7px 8px 7px' }}>
                      <CustomSlider 
                        min="0" max={globalMax.hp} useLog={true}
                        value={activeFilters.hpRange[0]} 
                        onChange={(e) => {
                          const val = Math.round(parseFloat(e.target.value) || 0);
                          setFilters({ hpRange: [val, Math.max(val, activeFilters.hpRange[1])] });
                        }}
                        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% + 14px)', margin: 0, cursor: 'pointer', background: 'transparent' }}
                      />
                      <CustomSlider 
                        min="0" max={globalMax.hp} useLog={true}
                        value={Math.min(activeFilters.hpRange[1], globalMax.hp)} 
                        onChange={(e) => {
                          const val = Math.round(parseFloat(e.target.value) || 0);
                          setFilters({ hpRange: [Math.min(val, activeFilters.hpRange[0]), val >= globalMax.hp ? Infinity : val] });
                        }}
                        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% + 14px)', margin: 0, cursor: 'pointer', background: 'transparent' }}
                      />
                    </div>
                  </div>

                  <div className="form-group range-group">
                    <label className="range-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{showUnits ? 'Unit Capacity (items)' : 'Capacity Range (L)'}</span>
                      <button
                        className={`btn btn--sm ${showUnits ? 'btn--primary' : 'btn--secondary'}`}
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12 }}
                        onClick={() => {
                          setShowUnits(v => !v);
                          setFilters({ capRange: [0, Infinity], unitRange: [0, Infinity] });
                        }}
                        title="Toggle between litre and unit capacity filter"
                      >
                        {showUnits ? '📦 Units' : '💧 Litres'}
                      </button>
                    </label>
                    {!showUnits ? (
                      <>
                        <div className="range-values" style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                          <input type="number" value={activeFilters.capRange[0]} onChange={(e) => setFilters({ capRange: [parseInt(e.target.value) || 0, activeFilters.capRange[1]] })} />
                          <span>-</span>
                          <input type="number" value={activeFilters.capRange[1] >= globalMax.cap ? globalMax.cap : activeFilters.capRange[1]} onChange={(e) => {
                            const val = parseInt(e.target.value) || globalMax.cap;
                            setFilters({ capRange: [activeFilters.capRange[0], val >= globalMax.cap ? Infinity : val] });
                          }} />
                        </div>
                        <div style={{ position: 'relative', width: 'calc(100% - 14px)', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 7, display: 'flex', alignItems: 'center', margin: '12px 7px 8px 7px' }}>
                          <CustomSlider
                            min="0" max={globalMax.cap} useLog={true}
                            value={activeFilters.capRange[0]}
                            onChange={(e) => {
                              const val = Math.round(parseFloat(e.target.value) || 0);
                              setFilters({ capRange: [val, Math.max(val, activeFilters.capRange[1])] });
                            }}
                            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% + 14px)', margin: 0, cursor: 'pointer', background: 'transparent' }}
                          />
                          <CustomSlider
                            min="0" max={globalMax.cap} useLog={true}
                            value={Math.min(activeFilters.capRange[1], globalMax.cap)}
                            onChange={(e) => {
                              const val = Math.round(parseFloat(e.target.value) || 0);
                              setFilters({ capRange: [Math.min(val, activeFilters.capRange[0]), val >= globalMax.cap ? Infinity : val] });
                            }}
                            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% + 14px)', margin: 0, cursor: 'pointer', background: 'transparent' }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="range-values" style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                          <input type="number" value={activeFilters.unitRange[0]} onChange={(e) => setFilters({ unitRange: [parseInt(e.target.value) || 0, activeFilters.unitRange[1]] })} />
                          <span>-</span>
                          <input type="number" value={activeFilters.unitRange[1] >= globalMax.unit ? globalMax.unit : activeFilters.unitRange[1]} onChange={(e) => {
                            const val = parseInt(e.target.value) || globalMax.unit;
                            setFilters({ unitRange: [activeFilters.unitRange[0], val >= globalMax.unit ? Infinity : val] });
                          }} />
                        </div>
                        <div style={{ position: 'relative', width: 'calc(100% - 14px)', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 7, display: 'flex', alignItems: 'center', margin: '12px 7px 8px 7px' }}>
                          <CustomSlider
                            min="0" max={globalMax.unit}
                            value={activeFilters.unitRange[0]}
                            onChange={(e) => {
                              const val = Math.round(parseFloat(e.target.value) || 0);
                              setFilters({ unitRange: [val, Math.max(val, activeFilters.unitRange[1])] });
                            }}
                            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% + 14px)', margin: 0, cursor: 'pointer', background: 'transparent' }}
                          />
                          <CustomSlider
                            min="0" max={globalMax.unit}
                            value={Math.min(activeFilters.unitRange[1], globalMax.unit)}
                            onChange={(e) => {
                              const val = Math.round(parseFloat(e.target.value) || 0);
                              setFilters({ unitRange: [Math.min(val, activeFilters.unitRange[0]), val >= globalMax.unit ? Infinity : val] });
                            }}
                            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100% + 14px)', margin: 0, cursor: 'pointer', background: 'transparent' }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="filter-panel__section" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
                    <div className="filter-panel__section-header">
                      <Package size={16} />
                      <span>Requirements</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 8 }}>
                      <input 
                        type="checkbox" 
                        checked={activeFilters.hideRequired}
                        onChange={(e) => setFilters({ hideRequired: e.target.checked })}
                        style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Only show standalone mods (No Required Mods)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 12 }}>
                      <input 
                        type="checkbox" 
                        checked={activeFilters.hideInstalled}
                        onChange={(e) => setFilters({ hideInstalled: e.target.checked })}
                        style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Hide already installed mods</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="filter-panel__sidebar">
              <div className="filter-panel__section-header">
                <SlidersHorizontal size={14} />
                <span>Active Summary</span>
              </div>
              
              <div className="filter-summary">
                {!authorFilter && (activeFilters.brands?.length || 0) === 0 && activeFilters.priceRange[0] === 0 && activeFilters.priceRange[1] >= globalMax.price && activeFilters.hpRange[0] === 0 && activeFilters.hpRange[1] >= globalMax.hp && activeFilters.capRange[0] === 0 && activeFilters.capRange[1] >= globalMax.cap && activeFilters.unitRange[0] === 0 && activeFilters.unitRange[1] >= globalMax.unit && (activeFilters.platforms?.length || 0) === 0 && !activeFilters.hideRequired && !activeFilters.hideInstalled ? (
                  <div className="filter-summary__empty">No filters active</div>
                ) : (
                  <div className="filter-summary__list">
                    {authorFilter && (
                      <div className="chip chip--author" onClick={() => setAuthorFilter(null)}>
                        Author: {authorFilter.name} <X size={10} />
                      </div>
                    )}
                    {activeFilters.brands.map(brand => (
                      <div key={brand} className="chip" onClick={() => handleBrandToggle(brand)}>
                        {brand} <X size={10} />
                      </div>
                    ))}
                    {(activeFilters.priceRange[0] > 0 || activeFilters.priceRange[1] < globalMax.price) && (
                      <div className="chip" onClick={() => setFilters({ priceRange: [0, Infinity] })}>
                        Price Range <X size={10} />
                      </div>
                    )}
                    {activeFilters.hideRequired && (
                      <div className="chip" onClick={() => setFilters({ hideRequired: false })}>
                        No Requirements <X size={10} />
                      </div>
                    )}
                    {activeFilters.hideInstalled && (
                      <div className="chip" onClick={() => setFilters({ hideInstalled: false })}>
                        Hide Installed <X size={10} />
                      </div>
                    )}
                    {(activeFilters.hpRange[0] > 0 || activeFilters.hpRange[1] < globalMax.hp) && (
                      <div className="chip" onClick={() => setFilters({ hpRange: [0, Infinity] })}>
                        {activeFilters.hpRange[0] > 0 ? `${activeFilters.hpRange[0]}hp+` : `Power Range`} <X size={10} />
                      </div>
                    )}
                    {(activeFilters.capRange[0] > 0 || activeFilters.capRange[1] < globalMax.cap) && (
                      <div className="chip" onClick={() => setFilters({ capRange: [0, Infinity] })}>
                        {activeFilters.capRange[0] > 0 ? `${activeFilters.capRange[0].toLocaleString()}L+` : `Capacity Range`} <X size={10} />
                      </div>
                    )}
                    {(activeFilters.unitRange[0] > 0 || activeFilters.unitRange[1] < globalMax.unit) && (
                      <div className="chip" onClick={() => setFilters({ unitRange: [0, Infinity] })}>
                        {activeFilters.unitRange[0] > 0 ? `${activeFilters.unitRange[0]}+` : `Units Range`} <X size={10} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="filter-panel__actions">
                <button className="btn btn--secondary btn--sm btn--full" onClick={resetFilters}>
                  <X size={14} /> Reset All
                </button>
              </div>
            </div>
          </div>
        )}



        {/* Error State */}
        {error && (
          <div style={{ padding: 'var(--sp-4)', color: 'var(--danger)', textAlign: 'center' }}>
            <p>Failed to load mods: {error}</p>
            <button className="btn btn--secondary btn--sm" onClick={() => fetchMods()} style={{ marginTop: 'var(--sp-2)' }}>
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && sourceMods.length === 0 && (
          <div className="mod-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="mod-card">
                <div className="skeleton skeleton--image" />
                <div style={{ padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                  <div className="skeleton skeleton--title" />
                  <div className="skeleton skeleton--text" />
                  <div className="skeleton skeleton--text" style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mod Grid */}
        {!isLoading && sourceMods.length === 0 && !error && (
          <div className="empty-state">
            <SlidersHorizontal className="empty-state__icon" size={64} />
            <div className="empty-state__title">No mods found</div>
            <div className="empty-state__desc">
              Try selecting a different category or adjusting your search query.
            </div>
          </div>
        )}

        {/* No mods found after filtering (but category has mods) */}
        {!isLoading && sourceMods.length > 0 && filteredAndSortedMods.length === 0 && !error && (
          <div className="empty-state">
            <Package className="empty-state__icon" size={64} opacity={0.2} />
            <div className="empty-state__title">Category Filtered</div>
            <div className="empty-state__desc">
              All {sourceMods.length} mods in this category are hidden by your current filters.
              {activeFilters.hideInstalled && " (Mostly likely already installed)"}
            </div>
          </div>
        )}

        {pagedMods.length > 0 && (
          <>
            <div 
              className="mod-grid"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${modHubZoom}px, 1fr))`
              }}
            >
              {pagedMods.map((mod, idx) => {
                const f = currentFilter?.toLowerCase() || '';
                const noCompareFilters = ['latest', 'gameplay', 'prefab', 'package', 'pallet', 'bigbag', 'ibc', 'object', 'handtool', 'misc', 'decoration', 'fences', 'trees', 'silos', 'sheds', 'farmhouses', 'animalpens', 'storages', 'containers', 'tanks', 'winter', 'bales', 'weigh', 'chainsaw', 'flashlight', 'production', 'selling', 'flood', 'beehive', 'garden', 'fillable', 'map', 'scenery'];
                const noMatchFilters = ['latest', 'gameplay', 'prefab', 'package', 'pallet', 'bigbag', 'ibc', 'object', 'handtool', 'misc', 'decoration', 'fences', 'trees', 'silos', 'sheds', 'farmhouses', 'animalpens', 'storages', 'containers', 'tanks', 'weights', 'belts', 'winter', 'forestryplanters', 'sapling', 'bales', 'weigh', 'chainsaw', 'flashlight', 'production', 'selling', 'flood', 'beehive', 'garden', 'fillable', 'map', 'scenery'];

                return (
                  <ModCard 
                    key={mod.modId ? `mod-${mod.modId}` : `title-${mod.title}`} 
                    mod={{
                      ...mod,
                      onShowDependencies: (task, missing) => {
                        setPendingMapTask(task);
                        setMissingDeps(missing);
                      }
                    }}
                    isIconOnly={modHubIconOnly}
                    zoom={modHubZoom}
                    hidePower={!isSmartMatchEnabled && activeFilters.hpRange[0] === 0 && activeFilters.hpRange[1] === 10000}
                    hideCompare={noCompareFilters.some(x => f.includes(x))}
                    hideMatch={noMatchFilters.some(x => f.includes(x))}
                    getInstalledVersion={getInstalledVersion}
                  />
                );
              })}
            </div>
          </>
        )}

        {!isLoading && !error && renderPagination()}
      </div>

      <CompareOverlay 
        isOpen={isCompareOpen} 
        onClose={() => setIsCompareOpen(false)} 
      />
    </div>
  );
}