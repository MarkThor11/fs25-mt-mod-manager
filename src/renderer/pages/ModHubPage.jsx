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

export default function ModHubPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isCategoriesCollapsed, setIsCategoriesCollapsed] = useState(() => localStorage.getItem('modhub_sidebar_collapsed') === 'true');
  
  const sidebarRef = useScrollPersistence('modhub-sidebar');
  const mainRef = useScrollPersistence('modhub-main');
  const {
    mods, currentFilter, currentPage, totalPages,
    isLoading, error, categories, isDeepScanning,
    activeFilters, favoriteAuthors, authorFilter, hardcodedBrands, hiddenMods,
    setFilter, setPage, fetchMods, fetchCategories, searchMods,
    fetchDetailsForCurrentPage, setFilters, resetFilters, setAuthorFilter,
    selectedCompareIds, clearCompare, pageSize, setPageSize,
    isSmartMatchEnabled, toggleSmartMatch, powerReference, setPowerReference,
    selectedHP, setSelectedHP, hpMatchMode, setHpMatchMode
  } = useModHubStore();
  
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
  const [showFilters, setShowFilters] = useState(false);

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
  }, [categories, currentFilter, searchInput]);

  useEffect(() => {
    // Trigger deep scan to discover technical data and dependencies for all visible mods
    fetchDetailsForCurrentPage();
  }, [sortOrder, mods.length, activeFilters, isSmartMatchEnabled]);

  const handleSearch = useCallback((value) => {
    setSearchInput(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      if (value.trim()) {
        searchMods(value);
      } else {
        fetchMods();
      }
    }, 500);
    setSearchTimeout(timeout);
  }, [searchTimeout, searchMods, fetchMods]);

  // Filter mods based on active filters
  const filteredMods = useMemo(() => {
    return mods.filter(mod => {
      // Hidden mod filter — always exclude hidden mods from browsing
      const hiddenModIds = hiddenMods.map(m => m.modId);
      if (hiddenModIds.includes(mod.modId)) return false;

      // Brand filter (multi-select)
      if (activeFilters.brands.length > 0) {
        if (!mod.brand || !activeFilters.brands.includes(mod.brand)) return false;
      }

      // Author filter (from Favourites Library)
      if (authorFilter) {
        const authorName = mod.author || '';
        if (authorName.toLowerCase() !== authorFilter.name.toLowerCase()) return false;
      }

      // SMART MATCH SAME-TYPE BYPASS
      // If Smart Match is on and this mod is the same type as the reference (Tractor-Tractor or Tool-Tool),
      // we bypass the technical power filters but keep the basic ones.
      const isSmartMatching = isSmartMatchEnabled && powerReference && mod.techData;
      const sameType = isSmartMatching && (!!mod.techData.hpIsRequirement === !!powerReference.techData?.hpIsRequirement);

      // Technical data filters
      if (mod.techData) {
        if (mod.techData.price < activeFilters.priceRange[0] || mod.techData.price > activeFilters.priceRange[1]) return false;
        
        // Manual HP filter only if NOT same-type smart matching
        if (!sameType && (mod.techData.hp < activeFilters.hpRange[0] || mod.techData.hp > activeFilters.hpRange[1])) return false;
        
        if (mod.techData.capacity < activeFilters.capRange[0] || mod.techData.capacity > activeFilters.capRange[1]) return false;
      } else if (!isSmartMatching && (activeFilters.priceRange[0] > 0 || activeFilters.hpRange[0] > 0 || activeFilters.capRange[0] > 0)) {
        return false;
      }

        // Smart Power Matching (Bi-directional Cross-Type only)
        if (isSmartMatching && !sameType && (mod.techData.hpMin > 0 || mod.techData.hpMax > 0)) {
          const modIsReq = !!mod.techData.hpIsRequirement;
          const refIsReq = !!powerReference.techData?.hpIsRequirement;
          const modIsDrivable = !!mod.techData.isDrivable;
          const refIsDrivable = !!powerReference.techData?.isDrivable;

          // EXCLUSIVE PAIRING LOGIC:
          // 1. If we selected a Tool/Implement, we ONLY highlight Drivables (Tractors/Trucks).
          // 2. If we selected a Drivable, we ONLY highlight Tools/Implements.
          const isTargetingDrivable = refIsReq && modIsDrivable;
          const isTargetingTool = refIsDrivable && modIsReq;
          
          if (!isTargetingDrivable && !isTargetingTool) return true;

          const modHPMin = mod.techData.hpMin || mod.techData.hp || 0;
          const modHPMax = mod.techData.hpMax || mod.techData.hp || 0;
          let refHPMin = powerReference.techData?.hpMin || powerReference.techData?.hp || 0;
          let refHPMax = powerReference.techData?.hpMax || powerReference.techData?.hp || 0;

          // If a specific HP is selected (e.g. from a pack), use it for both min and max matching
          if (selectedHP > 0) {
            refHPMin = selectedHP;
            refHPMax = selectedHP;
          }

          if (!refIsReq) {
            // --- REFERENCE IS A PROVIDER (e.g. Tractor with 130-2500 range) ---
            if (modIsReq) {
              // Tool must be pullable by at least the maximum configuration of this provider
              return modHPMin <= refHPMax;
            }
          } else {
            // --- REFERENCE IS A REQUESTER (e.g. Implement needing 130-200) ---
            if (!modIsReq) {
              return modHPMax >= refHPMin;
            }
          }
        }

        if ((activeFilters.platforms?.length || 0) > 0) {
          const metadata = mod.metadata || {};
          const platformText = (metadata['Platform'] || metadata['platform'] || '').toLowerCase();
          
          const isCrossplay = platformText.includes('ps5') || platformText.includes('ps4') || platformText.includes('xbs') || platformText.includes('xb1');
          const isPCOnly = platformText.includes('pc') && !isCrossplay;

          if (activeFilters.platforms.includes('pc') && !isPCOnly) return false;
          if (activeFilters.platforms.includes('crossplay') && !isCrossplay) return false;
        }

        // Requirement Filter
        if (activeFilters.hideRequired && mod?.dependencies && mod.dependencies.length > 0) {
          return false;
        }

        // Installed Filter
        if (activeFilters.hideInstalled && mod && getInstalledVersion(mod)) {
          return false;
        }

      return true;
    }).filter(Boolean); // Double safety against nulls
  }, [mods, hiddenMods, activeFilters, authorFilter, isSmartMatchEnabled, powerReference, selectedHP, getInstalledVersion]);

  const brands = React.useMemo(() => {
    const scannedBrands = mods.map(m => m.brand).filter(Boolean);
    return Array.from(new Set([...hardcodedBrands, ...scannedBrands])).sort();
  }, [mods, hardcodedBrands]);

  const handleBrandToggle = (brand) => {
    const newBrands = activeFilters.brands.includes(brand)
      ? activeFilters.brands.filter(b => b !== brand)
      : [...activeFilters.brands, brand];
    setFilters({ brands: newBrands });
  };

  const filteredAndSortedMods = React.useMemo(() => {
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
    
    return result.filter(m => m && (m.modId || m.title)); // Ensure we only render valid mod objects
  }, [filteredMods, sortOrder]);


  const handleCategorySelect = (filter) => {
    setSearchInput('');
    setAuthorFilter(null, false);
    setFilter(filter);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages = [];
    const maxVisible = 7;
    let start = Math.max(0, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible);
    if (end - start < maxVisible) start = Math.max(0, end - maxVisible);

    for (let i = start; i < end; i++) {
      pages.push(
        <button
          key={i}
          className={`pagination__btn ${i === currentPage ? 'pagination__btn--active' : ''}`}
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
          onClick={() => setPage(currentPage - 1)}
          disabled={currentPage === 0}
        >
          ‹
        </button>
        {pages}
        <button
          className="pagination__btn"
          onClick={() => setPage(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
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
                    <span style={{ color: 'var(--text-primary)', fontSize: '18px', opacity: 1 }}>{mods.length}</span> MODS FOUND
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
                  borderRadius: 24,
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
                </div>
              )}
            </div>

            <div className="sort-bar__search" style={{ marginLeft: 'auto', width: '30%', maxWidth: 400 }}>
              <div className="search-wrap">
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
                    onClick={() => handleSearch('')} 
                  />
                )}
              </div>
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
              {(activeFilters.brands.length > 0 || activeFilters.priceRange[0] > 0 || activeFilters.hpRange[0] > 0 || activeFilters.capRange[0] > 0) && (
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginLeft: 'auto' }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Show:</span>
              <select 
                className="btn btn--secondary btn--sm" 
                style={{ height: '32px', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              >
                <option value="24">24</option>
                <option value="48">48</option>
                <option value="72">72</option>
                <option value="96">96</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Sort:</span>
              <select 
                className="btn btn--secondary btn--sm" 
                style={{ height: '32px', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <option value="latest">Latest</option>
                <option value="downloads">Most Downloaded</option>
                <option value="rating">Top Rated</option>
                <option value="name">A-Z</option>
                <option value="price_low">Price: Lowest</option>
                <option value="price_high">Price: Highest</option>
                <option value="hp_low">Power: Lowest</option>
                <option value="hp_high">Power: Highest</option>
                <option value="cap_low">Capacity: Lowest</option>
                <option value="cap_high">Capacity: Highest</option>
              </select>
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
                borderRadius: 2, 
                display: 'flex', 
                alignItems: 'center',
                margin: '0 4px'
              }}>
                <input 
                  type="range" 
                  min="140" 
                  max="350" 
                  step="5"
                  value={modHubZoom}
                  onChange={(e) => setModHubZoom(parseInt(e.target.value, 10))}
                  className="range-slider"
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


        {(activeFilters.brands.length > 0 || authorFilter || activeFilters.priceRange[0] > 0 || activeFilters.priceRange[1] < 1000000 || 
          activeFilters.hpRange[0] > 0 || activeFilters.hpRange[1] < 2000 || 
          activeFilters.capRange[0] > 0 || activeFilters.capRange[1] < 1000000 || activeFilters.platforms.length > 0) && (
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
            {(activeFilters.priceRange[0] > 0 || activeFilters.priceRange[1] < 1000000) && (
              <div className="filter-chip">
                <DollarSign size={12} />
                <span className="filter-chip__label">Price:</span> 
                {activeFilters.priceRange[0] > 0 ? `$${(activeFilters.priceRange[0]/1000).toFixed(0)}k+` : ''}
                {activeFilters.priceRange[1] < 1000000 ? ` <$${(activeFilters.priceRange[1]/1000).toFixed(0)}k` : ''}
                <div className="filter-chip__close" onClick={() => setFilters({ priceRange: [0, 1000000] })}>
                  <X size={10} />
                </div>
              </div>
            )}
            {(activeFilters.hpRange[0] > 0 || activeFilters.hpRange[1] < 2000) && (
              <div className="filter-chip">
                <Zap size={12} />
                <span className="filter-chip__label">Power:</span> 
                {activeFilters.hpRange[0] > 0 ? `${activeFilters.hpRange[0]}hp+` : ''}
                {activeFilters.hpRange[1] < 2000 ? ` <${activeFilters.hpRange[1]}hp` : ''}
                <div className="filter-chip__close" onClick={() => setFilters({ hpRange: [0, 2000] })}>
                  <X size={10} />
                </div>
              </div>
            )}
            {(activeFilters.capRange[0] > 0 || activeFilters.capRange[1] < 1000000) && (
              <div className="filter-chip">
                <Layers size={12} />
                <span className="filter-chip__label">Capacity:</span> 
                {activeFilters.capRange[0] > 0 ? `${(activeFilters.capRange[0]/1000).toFixed(0)}kL+` : ''}
                {activeFilters.capRange[1] < 1000000 ? ` <${(activeFilters.capRange[1]/1000).toFixed(0)}kL` : ''}
                <div className="filter-chip__close" onClick={() => setFilters({ capRange: [0, 1000000] })}>
                  <X size={10} />
                </div>
              </div>
            )}
            {activeFilters.platforms?.map(p => (
              <div className="filter-chip" key={p}>
                <Milestone size={12} />
                <span className="filter-chip__label">Platform:</span> {p === 'pc' ? 'PC Only' : 'Crossplay'}
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
                        <input type="number" value={activeFilters.priceRange[1]} onChange={(e) => setFilters({ priceRange: [activeFilters.priceRange[0], parseInt(e.target.value) || 1000000] })} />
                      </div>
                    </label>
                    <div className="range-slider-wrap">
                      <input type="range" className="range-slider" min="0" max="1000000" step="1000" value={activeFilters.priceRange[0]} onChange={(e) => setFilters({ priceRange: [parseInt(e.target.value), Math.max(parseInt(e.target.value), activeFilters.priceRange[1])] })} />
                      <input type="range" className="range-slider" min="0" max="1000000" step="1000" value={activeFilters.priceRange[1]} onChange={(e) => setFilters({ priceRange: [Math.min(parseInt(e.target.value), activeFilters.priceRange[0]), parseInt(e.target.value)] })} />
                    </div>
                  </div>

                  <div className="form-group range-group">
                    <label className="range-label">
                      <span>Power Range (HP)</span>
                      <div className="range-values">
                        <input type="number" value={activeFilters.hpRange[0]} onChange={(e) => setFilters({ hpRange: [parseInt(e.target.value) || 0, activeFilters.hpRange[1]] })} />
                        <span>-</span>
                        <input type="number" value={activeFilters.hpRange[1]} onChange={(e) => setFilters({ hpRange: [activeFilters.hpRange[0], parseInt(e.target.value) || 2000] })} />
                      </div>
                    </label>
                    <div className="range-slider-wrap">
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="0" max="2000" step="10" 
                        value={activeFilters.hpRange[0]} 
                        onChange={(e) => setFilters({ hpRange: [parseInt(e.target.value), Math.max(parseInt(e.target.value), activeFilters.hpRange[1])] })} 
                      />
                      <input 
                        type="range" 
                        className="range-slider" 
                        min="0" max="2000" step="10" 
                        value={activeFilters.hpRange[1]} 
                        onChange={(e) => setFilters({ hpRange: [Math.min(parseInt(e.target.value), activeFilters.hpRange[0]), parseInt(e.target.value)] })} 
                      />
                    </div>
                  </div>

                  <div className="form-group range-group">
                    <label className="range-label">
                      <span>Capacity Range (L)</span>
                      <div className="range-values">
                        <input type="number" value={activeFilters.capRange[0]} onChange={(e) => setFilters({ capRange: [parseInt(e.target.value) || 0, activeFilters.capRange[1]] })} />
                        <span>-</span>
                        <input type="number" value={activeFilters.capRange[1]} onChange={(e) => setFilters({ capRange: [activeFilters.capRange[0], parseInt(e.target.value) || 1000000] })} />
                      </div>
                    </label>
                    <div className="range-slider-wrap">
                      <input type="range" className="range-slider" min="0" max="1000000" step="1000" value={activeFilters.capRange[0]} onChange={(e) => setFilters({ capRange: [parseInt(e.target.value), Math.max(parseInt(e.target.value), activeFilters.capRange[1])] })} />
                      <input type="range" className="range-slider" min="0" max="1000000" step="1000" value={activeFilters.capRange[1]} onChange={(e) => setFilters({ capRange: [Math.min(parseInt(e.target.value), activeFilters.capRange[0]), parseInt(e.target.value)] })} />
                    </div>
                  </div>

                  <div className="filter-panel__section" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
                    <div className="filter-panel__section-header">
                      <Milestone size={16} />
                      <span>Platform Support</span>
                    </div>
                    <div className="platform-filters" style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
                      <button 
                        className={`btn btn--sm ${activeFilters.platforms.includes('pc') ? 'btn--primary' : 'btn--secondary'}`}
                        onClick={() => {
                          const platforms = activeFilters.platforms.includes('pc') 
                            ? activeFilters.platforms.filter(p => p !== 'pc')
                            : [...activeFilters.platforms, 'pc'];
                          setFilters({ platforms });
                        }}
                      >
                        PC Only / Mac
                      </button>
                      <button 
                        className={`btn btn--sm ${activeFilters.platforms.includes('crossplay') ? 'btn--primary' : 'btn--secondary'}`}
                        onClick={() => {
                          const platforms = activeFilters.platforms.includes('crossplay')
                            ? activeFilters.platforms.filter(p => p !== 'crossplay')
                            : [...activeFilters.platforms, 'crossplay'];
                          setFilters({ platforms });
                        }}
                      >
                        Crossplay
                      </button>
                    </div>
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
                {!authorFilter && (activeFilters.brands?.length || 0) === 0 && activeFilters.priceRange[0] === 0 && activeFilters.priceRange[1] === 1000000 && activeFilters.hpRange[0] === 0 && activeFilters.capRange[0] === 0 && (activeFilters.platforms?.length || 0) === 0 ? (
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
                    {(activeFilters.priceRange[0] > 0 || activeFilters.priceRange[1] < 1000000) && (
                      <div className="chip" onClick={() => setFilters({ priceRange: [0, 1000000] })}>
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
                    {activeFilters.hpRange[0] > 0 && (
                      <div className="chip" onClick={() => setFilters({ hpRange: [0, 2000] })}>
                        {activeFilters.hpRange[0]}hp+ <X size={10} />
                      </div>
                    )}
                    {activeFilters.capRange[0] > 0 && (
                      <div className="chip" onClick={() => setFilters({ capRange: [0, 1000000] })}>
                        {activeFilters.capRange[0].toLocaleString()}L+ <X size={10} />
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
        {isLoading && mods.length === 0 && (
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
        {!isLoading && mods.length === 0 && !error && (
          <div className="empty-state">
            <SlidersHorizontal className="empty-state__icon" size={64} />
            <div className="empty-state__title">No mods found</div>
            <div className="empty-state__desc">
              Try selecting a different category or adjusting your search query.
            </div>
          </div>
        )}

        {/* No mods found after filtering (but page had mods) */}
        {!isLoading && mods.length > 0 && filteredAndSortedMods.length === 0 && !error && (
          <div className="empty-state">
            <Package className="empty-state__icon" size={64} opacity={0.2} />
            <div className="empty-state__title">Page Filtered</div>
            <div className="empty-state__desc">
              All {mods.length} mods on this page are hidden by your current filters.
              {activeFilters.hideInstalled && " (Mostly likely already installed)"}
            </div>
          </div>
        )}

        {filteredAndSortedMods.length > 0 && (
          <>
            <div 
              className="mod-grid"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${modHubZoom}px, 1fr))`
              }}
            >
              {filteredAndSortedMods.map((mod, idx) => {
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
                    hidePower={!isSmartMatchEnabled && activeFilters.hpRange[0] === 0 && activeFilters.hpRange[1] === 2000}
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
