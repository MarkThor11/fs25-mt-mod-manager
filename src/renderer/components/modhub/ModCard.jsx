import React, { useState, useEffect, useMemo } from 'react';
import { Star, Download, ExternalLink, Package, Heart, Zap, Layers, EyeOff, Eye, Check, RefreshCw, X, Pin, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDownloadStore } from '../../store/useDownloadStore';
import { useToastStore } from '../../store/useToastStore';
import { useModHubStore } from '../../store/useModHubStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLocalModsStore } from '../../store/useLocalModsStore';
import { compareVersions } from '../../utils/modUtils';

const CategoryPlaceholder = ({ category, size = 100, hideZap = false }) => {
  const Icon = useMemo(() => {
    const type = category?.split(':')[1];
    if (hideZap && type === 'vehicle') return Package;
    
    switch (type) {
      case 'map': return Layers;
      case 'vehicle': return Zap;
      case 'tool': return Package;
      case 'pack': return Layers;
      default: return Package;
    }
  }, [category, hideZap]);

  return (
    <div className="category-placeholder" style={{
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-card))',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      border: '1px solid var(--border)',
      color: 'var(--accent)'
    }}>
      <Icon size={size / 2} strokeWidth={1.5} style={{ opacity: 0.8, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }} />
      <span style={{ 
        fontSize: 12, 
        fontWeight: 800, 
        textTransform: 'uppercase', 
        letterSpacing: '0.1em',
        color: 'var(--text-muted)'
      }}>
        {category?.split(':')[1] || 'MOD'}
      </span>
    </div>
  );
};

export default React.memo(function ModCard({ mod, status, updateInfo, showActions = true, hidePower = false, hidePrice = false, hideCompare = false, hideMatch = false, isIconOnly = false, zoom = 200, getInstalledVersion }) {
  const navigate = useNavigate();
  const { 
    toggleFavoriteAuthor, 
    favoriteAuthors,
    toggleFavoriteMod,
    favoriteMods,
    toggleMustHaveMod,
    setAuthorFilter,
    toggleHiddenMod,
    hiddenMods,
    selectedCompareIds,
    toggleCompare,
    powerReference,
    setPowerReference,
    isSmartMatchEnabled,
    selectedHP,
    setSelectedHP,
    setHpMatchMode,
    currentFilter,
    activeFilters
  } = useModHubStore();
  const { 
    hiddenFolders, toggleHiddenFolder, installedModsViewMode, setInstalledModsViewMode,
    folderOrder, setFolderOrder, folderZooms, setFolderZoom, isInternalDragging, setIsInternalDragging,
    iconOnlyFolders, toggleIconOnlyFolder, isOnline
  } = useSettingsStore();
  const localMods = useLocalModsStore((s) => s.mods);

  
  const isFavorite = favoriteAuthors.some(a => a.id === mod.authorId || a.id === mod.author);
  const isModFav = favoriteMods.some(m => (m.modId && mod.modId && String(m.modId) === String(mod.modId)) || (m.fileName && mod.fileName && m.fileName === mod.fileName));
  const isMustHave = useMemo(() => {
    const fm = favoriteMods.find(m => 
      (m.modId && mod.modId && String(m.modId) === String(mod.modId)) || (m.fileName && mod.fileName && m.fileName === mod.fileName)
    );
    return fm?.isMustHave || false;
  }, [favoriteMods, mod.modId, mod.fileName]);
  const { activeDownloads, batchProgress, addDownload, removeDownload, cancelDownload } = useDownloadStore();
  const isDownloading = useMemo(() => activeDownloads[mod.modId], [activeDownloads, mod.modId]);
  const isHidden = hiddenMods.some(m => m.modId && mod.modId && String(m.modId) === String(mod.modId));
  const [imgSrc, setImgSrc] = useState(mod.image);
  const [imgError, setImgError] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [isScanningRef, setIsScanningRef] = useState(false);
  const [showPackSelector, setShowPackSelector] = useState(false);
  const [packHPs, setPackHPs] = useState([]);
  const isPowerReference = powerReference?.modId === mod.modId;
  const isModMap = useMemo(() => {
    if (mod.isMap) return true;
    const cat = (mod.category || '').toLowerCase();
    const title = (mod.title || '').toLowerCase();
    const isMapCat = cat.includes('map') || cat.includes('terrain') || cat.includes('landscape');
    const isMapTitle = title.includes('map') || title.includes('terrain') || title.includes('land') || title.includes('valley') || title.includes('farm');
    
    // Size check is also a good indicator for maps in FS25
    const isLarge = mod.size > 80 * 1024 * 1024;
    
    return isMapCat || (isMapTitle && isLarge);
  }, [mod]);

  const modIdStr = mod.modId ? String(mod.modId).replace(/^0+/, '') : null;
  const isSessionInstalled = useDownloadStore(s => modIdStr ? !!s.sessionInstalled[modIdStr] : false);

  const installedVersion = useMemo(() => {
    if (!mod) return null;
    if (isSessionInstalled) return 'Installed';

    // Use the pre-computed lookup if available (O(1)), fall back to store scan
    if (getInstalledVersion) return getInstalledVersion(mod);
    // Fallback for callers that don't provide the lookup
    if (!localMods) return null;
    const match = localMods.find(lm => {
      if (mod.modId && lm.modId && String(lm.modId).replace(/^0+/, '') === String(mod.modId).replace(/^0+/, '')) return true;
      if (!lm.title || !mod.title) return false;
      const remoteTitle = mod.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const localTitle = lm.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const localName = (lm.modName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Fuzzy match: allow one to contain the other if they are long enough
      if (remoteTitle === localTitle || remoteTitle === localName) return true;
      if (remoteTitle.length > 5 && localTitle.length > 5) {
          return remoteTitle.includes(localTitle) || localTitle.includes(remoteTitle);
      }
      return false;
    });
    return match?.version || null;
  }, [mod, getInstalledVersion, localMods, isSessionInstalled]);

  const isInstalled = !!installedVersion;

  const isUpdateNeeded = useMemo(() => {
    if (!mod.isUpdate) return false;
    if (!isInstalled) return true;
    if (!mod.version || !installedVersion) return true;
    // remote (mod.version) > installed (installedVersion)
    return compareVersions(mod.version, installedVersion) > 0;
  }, [mod.isUpdate, isInstalled, mod.version, installedVersion]);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const progress = activeDownloads[mod.modId];
  const batch = batchProgress[mod.modId];
  const images = mod.candidates || [mod.image];

  const [isVisible, setIsVisible] = useState(false);
  const cardRef = React.useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    
    // Priority: 1. Remote Image (if online), 2. Local Icon, 3. Placeholder fallback
    let remoteUrl = images[candidateIdx] || mod.image;
    
    // Fix protocol-relative URLs (e.g. //cube.png -> https://cube.png)
    if (remoteUrl && remoteUrl.startsWith('//')) {
        remoteUrl = `https:${remoteUrl}`;
    }

    if (isOnline && remoteUrl) {
      // If we already hit an error for the current candidate, we move to next or local icon
      if (imgError) {
          if (candidateIdx < images.length - 1) {
              setCandidateIdx(v => v + 1);
              setImgError(false);
          } else if (mod.iconData) {
              setImgSrc(mod.iconData);
              setImgError(false);
          } else if (mod.filePath && window.api?.mods?.getIcon) {
              // Try fetching local icon if remote and mod.iconData both failed/missing
              window.api.mods.getIcon({ filePath: mod.filePath, iconFile: mod.iconFile }).then(base64 => {
                  if (base64) {
                      setImgSrc(base64);
                      setImgError(false);
                  }
              });
          } else {
              setImgSrc(null);
          }
      } else {
          resolveProxyImage(remoteUrl);
      }
    } else if (mod.iconData) {
      setImgSrc(mod.iconData);
      setImgError(false);
    } else if (mod.filePath && window.api?.mods?.getIcon) {
      // Try fetching local icon if offline and mod.iconData is missing
      window.api.mods.getIcon({ filePath: mod.filePath, iconFile: mod.iconFile }).then(base64 => {
          if (base64) {
              setImgSrc(base64);
              setImgError(false);
          }
      });
    } else {
      setImgSrc(null);
      setImgError(false);
    }
  }, [candidateIdx, mod.image, mod.iconData, isOnline, imgError, isVisible]);

  const resolveProxyImage = async (url) => {
    if (!url || !window.api?.images) return;
    try {
      const proxied = await window.api.images.proxy(url);
      if (proxied) {
          setImgSrc(proxied);
          setImgError(false);
      } else {
          setImgError(true);
      }
    } catch (err) {
      console.error('Proxy failed:', err);
      setImgError(true);
    }
  };

  const handleImageError = () => {
    setImgError(true);
  };

  const handleClick = () => {
    if (mod.modId) {
      navigate(`/modhub/mod/${mod.modId}`);
    }
  };

  const handleInstall = async (e) => {
    e.stopPropagation();
    if (activeDownloads[mod.modId]) return;
    
    // Register in global store
    addDownload(mod.modId, mod.title, imgSrc);

    try {
      let downloadUrl = mod.downloadUrl;
      let detail = null;
      
      // If we don't have a download URL (common in listings), fetch it from details
      if (!downloadUrl && window.api?.modhub) {
        useToastStore.getState().info(`Fetching download link for ${mod.title}...`);
        detail = await window.api.modhub.fetchModDetail({ modId: mod.modId });
        downloadUrl = detail.downloadUrl;
      }

      if (!downloadUrl) {
        throw new Error('Could not find a valid download link for this mod.');
      }

      if (!window.api?.mods) throw new Error('System bridge not available');
      const result = await window.api.mods.install({
        modId: mod.modId,
        modTitle: mod.title,
        downloadUrl: downloadUrl,
        category: mod.category || detail?.category || currentFilter || '',
        subFolder: mod.folder || (isModMap || detail?.isMap ? mod.title.replace(/\([^)]+\)/g, '').trim() : null)
      });


      if (result.success) {
        useToastStore.getState().success(`${mod.title} install started!`);
        await useLocalModsStore.getState().scanMods();
      } else {
        useToastStore.getState().error(`Failed: ${result.error}`);
        removeDownload(mod.modId);
      }
    } catch (err) {
      useToastStore.getState().error(`Install failed: ${err.message}`);
      removeDownload(mod.modId);
    }
  };

  const handleDownloadWithDependencies = async (e) => {
    e.stopPropagation();
    await handleInstall(e);
  };

  const handleOpenWebsite = (e) => {
    e.stopPropagation();
    const url = mod.url || `https://www.farming-simulator.com/mod.php?mod_id=${mod.modId}&title=fs2025`;
    if (window.api?.shell) window.api.shell.openExternal(url);
  };

  const isModPack = useMemo(() => {
    if (!mod.title) return false;
    const title = mod.title.toLowerCase();
    return title.includes('pack') || title.includes('mega') || mod.category?.toLowerCase().includes('package');
  }, [mod.title, mod.category]);

  const isSelfPropelled = useMemo(() => {
    const cat = (mod.category || '').toLowerCase();
    const title = (mod.title || '').toLowerCase();
    // Common self-propelled categories
    const spCats = ['sprayers', 'harvester', 'beetharv', 'potato', 'grape', 'olive', 'forestry', 'mower', 'loaderwagon', 'slurry'];
    return spCats.some(c => cat.includes(c)) || title.includes('self-propelled') || title.includes('propelled');
  }, [mod.category, mod.title]);

  const isTractorOrTruck = useMemo(() => {
    if (mod.techData?.isDrivable) return true;
    const cat = (mod.category || '').toLowerCase();
    return cat.includes('tractor') || cat.includes('truck') || cat.includes('car');
  }, [mod.category, mod.techData]);

  const hideHP = useMemo(() => {
    if (isModPack || mod.isMap || mod.category?.toLowerCase().includes('map')) return true;
    // Show HP if it's a tractor/truck or explicitly marked as a drivable
    if (isTractorOrTruck || mod.techData?.isDrivable) return false;
    // Hide HP for self-propelled tools (like sprayers) if it's the engine specs and not a requirement
    if (isSelfPropelled && !mod.techData?.hpIsRequirement) return true;
    return false;
  }, [isModPack, mod.isMap, mod.category, isSelfPropelled, isTractorOrTruck, mod.techData]);

  const hideCapacity = useMemo(() => {
    if (isModPack || mod.isMap || mod.category?.toLowerCase().includes('map')) return true;
    return false;
  }, [isModPack, mod.isMap, mod.category]);

  const isMatchable = useMemo(() => {
    const titleLow = (mod.title || '').toLowerCase();
    const cat = (mod.category || '').toLowerCase();
    if (mod.isMap || cat.includes('map')) return false;

    // 1. Explicit Exclusions by Category (Static/Non-Machinery)
    const excludeCats = [
      'map', 'prefab', 'gameplay', 'object', 'placeable', 'fence', 'tree', 'deco', 
      'handtool', 'building', 'tank', 'bag', 'pallet', 'construction', 'shed', 
      'silo', 'production', 'factory', 'generator', 'animal', 'stable', 
      'pasture', 'house', 'station', 'point', 'selling', 'decor', 'misc', 'consumable',
      'bales', 'weigh', 'chainsaw', 'shovel', 'flashlight', 'spray', 'ibc', 'bigbag', 'fillable'
    ];

    const isStatic = (f) => {
      if (!f) return false;
      const low = f.toLowerCase();
      // Hide on LATEST, Most Downloaded, and specific machinery tool categories
      if (['latest', 'mostdownloaded', 'rating'].some(x => low === x)) return true;

      return (
        ['map', 'placeable', 'object', 'prefab', 'pallet', 'handtool', 'misc', 'gameplay', 'decoration', 'fences', 'trees', 'silos', 'sheds', 'farmhouses', 'animalpens', 'storages', 'containers', 'tanks', 'weights', 'belts', 'winter', 'forestryplanters', 'sapling', 'bales', 'weigh', 'chainsaw', 'flashlight', 'bigbag', 'production', 'selling', 'flood', 'beehive', 'garden', 'ibc', 'fillable', 'forklift', 'skidsteer', 'loader', 'telehandler', 'frontloader'].some(x => low.includes(x))
      );
    };
    if (isStatic(currentFilter)) return false;
    
    // 1.5. Expand static keywords
    if (excludeCats.some(ex => cat.includes(ex)) || cat.includes('sapling') || cat.includes('weight') || cat.includes('belt') || cat.includes('loader') || cat.includes('handler') || cat.includes('forklift')) return false;

    // 2. Explicit Exclusions by Title Keywords (Scripts/Add-ons)
    const excludeTitles = [
      'add-on', 'addon', 'script', 'fix', 'update', 'expansion', 
      'global', 'capacity pack', 'extension', 'helper', 'sound', 'texture'
    ];
    if (excludeTitles.some(ex => titleLow.includes(ex))) return false;

    // 3. Technical Data Check (If available)
    if (mod.techData) {
        // Must either provide power (drivable) or require power
        return mod.techData.hpIsRequirement || mod.techData.isDrivable;
    }

    // 4. Fallback for listed items: Everything else (tractors, tools, trailers, etc.) is matchable
    return true;
  }, [mod.category, mod.techData, mod.title, currentFilter]);

  const requirementsMet = useMemo(() => {
    if (!mod.dependencies || mod.dependencies.length === 0) return true;
    if (!localMods) return false;

    // Convert active downloads to a comparable list of titles/IDs
    const queuedModNames = Object.values(activeDownloads).map(d => (d.title || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    const queuedModIds = Object.values(activeDownloads).map(d => String(d.modId));

    return mod.dependencies.every(dep => {
      const depTitle = typeof dep === 'string' ? dep : dep.title;
      const normalizedDep = depTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      const depId = typeof dep === 'object' && dep.url ? dep.url.match(/mod_id=(\d+)/)?.[1] : null;

      // Check Local Mods
      const isDepInstalled = getInstalledVersion 
        ? !!getInstalledVersion({ title: depTitle, modId: depId })
        : localMods.some(lm => {
            if (depId && lm.modId && String(lm.modId) === String(depId)) return true;
            const localTitle = (lm.title || lm.modName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return localTitle === normalizedDep || localTitle.includes(normalizedDep) || normalizedDep.includes(localTitle);
          });

      if (isDepInstalled) return true;

      // Check Active/Queued Downloads
      if (depId && queuedModIds.includes(String(depId))) return true;
      if (queuedModNames.some(qn => qn === normalizedDep || qn.includes(normalizedDep) || normalizedDep.includes(qn))) return true;

      return false;
    });
  }, [mod.dependencies, localMods, activeDownloads, getInstalledVersion]);


  const handleSetReference = async (e) => {
    e.stopPropagation();
    
    if (isPowerReference) {
      setPowerReference(null);
      return;
    }

    const hpValues = mod.techData?.hpValues || [];
    if (hpValues.length === 0 && (mod.techData?.hpMin > 0 || mod.techData?.hpMax > 0)) {
        // If we only have min/max, treat it as a pack with two potential points for the UI
        hpValues.push(mod.techData.hpMin, mod.techData.hpMax);
    }

    if (hpValues.length > 0) {
        setPackHPs([...new Set(hpValues)].sort((a,b) => a-b));
        setShowPackSelector(true);
        return;
    }
    
    setPowerReference(mod);
    useToastStore.getState().success(`Reference set: ${mod.title}`);

    // If we don't have HP data yet, fetch/parse it
    setIsScanningRef(true);
    try {
      if (!window.api?.modhub) throw new Error('System bridge not available');
      const detail = await window.api.modhub.fetchModDetail({ modId: mod.modId });
      
      const titleLow = (mod.title || '').toLowerCase();
      const isUtility = titleLow.includes('add-on') || titleLow.includes('addon') || 
                      titleLow.includes('script') || titleLow.includes('fix') || 
                      titleLow.includes('expansion') || titleLow.includes('global') ||
                      titleLow.includes('capacity pack') || titleLow.includes('extension') ||
                      titleLow.includes('helper');

      let hpValues = mod.techData?.hpValues || [];
      const filter = (mod.category || '').split(':')[1] || '';
      const isWeight = filter.toLowerCase().includes('weight');
      const isVehicleCategory = [
        'tractorsS', 'tractorsM', 'tractorsL', 'trucks', 'cars', 'miscDrivables',
        'frontLoaderVehicles', 'teleLoaderVehicles', 'wheelLoaderVehicles', 'skidSteerVehicles', 'forklifts',
        'harvesters', 'forageHarvesters', 'beetHarvesters', 'potatoHarvesting', 'vegetableHarvesters',
        'riceHarvesters', 'sugarcaneHarvesters', 'cottonHarvesters', 'grapeHarvesters', 'oliveHarvesters',
        'forestryHarvesters', 'forestryForwarders', 'forestryExcavators'
      ].includes(filter);
      let hpIsReq = !isUtility && !isVehicleCategory;
      let recommendedHp = 0;
      let hpIsRecommendation = false;
      
      if (hpValues.length === 0) {
        Object.entries(detail.metadata || {}).forEach(([k, v]) => {
            const key = k.toLowerCase();
            const val = (v || '').toString().toLowerCase();
            const combined = (key + ' ' + val);
            
            const isPowerKey = combined.includes('power') || combined.includes('engine') || combined.includes('perf') || combined.includes('hp') || combined.includes('cv') || combined.includes('ps') || combined.includes('output') || combined.includes('leist') || combined.includes('puiss') || combined.includes('requirement');
            if (isPowerKey) {
                // Pattern 1: Number(s) + Unit (e.g. 110, 130, 145 and 160 hp)
                const unitMatches = val.match(/(\d+(?:(?:\s*,\s*|\s*and\s*|\s*&\s*|\s*\/\s*|\s*-\s*|\s*–\s*|\s*to\s*)\d+)*)\s*(hp|cv|ps|pk|ch|kw|bhp)/gi);
                if (unitMatches) {
                    unitMatches.forEach(m => {
                        const v = m.toLowerCase();
                        const nums = v.match(/\d+/g);
                        if (nums) {
                            nums.forEach(n => {
                                let p = parseInt(n, 10);
                                if (v.includes('kw')) p = Math.round(p * 1.36);
                                if (p > 0 && !hpValues.includes(p)) hpValues.push(p);
                            });
                        }
                    });
                } else {
                    // Pattern 2: Leading Title + Number(s) (e.g. Power: 110, 130, 145 and 160)
                    const leadMatch = val.match(/(?:horsepower|power|performance|requirement|required|leistung|puissance|output)[:\-\s]*(\d+(?:(?:\s*,\s*|\s*and\s*|\s*&\s*|\s*\/\s*|\s*-\s*|\s*–\s*|\s*to\s*)\d+)*)/i);
                    if (leadMatch) {
                        const nums = leadMatch[1].match(/\d+/g);
                        if (nums) {
                            nums.forEach(n => {
                                const parsed = parseInt(n, 10);
                                if (parsed > 0 && !hpValues.includes(parsed)) hpValues.push(parsed);
                            });
                        }
                    } else {
                        // Fallback: Number only
                        const numOnly = val.match(/^\s*\d+\s*$/);
                        if (numOnly) {
                            const parsed = parseInt(numOnly[0], 10);
                            if (parsed > 0 && !hpValues.includes(parsed)) hpValues.push(parsed);
                        }
                    }
                }
                if (key.includes('required') || key.includes('requirement')) hpIsReq = true;
            }
        });
      }
      
      // Fallback: Description Deep Scan (Primary Fallback)
      if (hpValues.length === 0 && detail.description) {
        const descClean = detail.description.replace(/<[^>]*>/g, ' ').toLowerCase(); 
        const matches = descClean.match(/(\d+(?:(?:\s*,\s*|\s*and\s*|\s*&\s*|\s*\/\s*|\s*-\s*|\s*–\s*|\s*to\s*)\d+)*)\s*(hp|cv|ps|pk|ch|kw|bhp)/gi);
        if (matches) {
            matches.forEach(m => {
                const v = m.toLowerCase();
                const nums = v.match(/\d+/g);
                if (nums) {
                    nums.forEach(n => {
                        let p = parseInt(n, 10);
                        if (v.includes('kw')) p = Math.round(p * 1.36);
                        if (p > 0 && !hpValues.includes(p)) hpValues.push(p);
                    });
                }
            });
        }
        const leadPatterns = [
            /(?:horsepower|power|performance|requirement|required|leistung|puissance|output)[:\-\s]*(\d+(?:(?:\s*,\s*|\s*and\s*|\s*&\s*|\s*\/\s*|\s*-\s*|\s*–\s*|\s*to\s*)\d+)*)/gi,
            /(\d+(?:(?:\s*,\s*|\s*and\s*|\s*&\s*|\s*\/\s*|\s*-\s*|\s*–\s*|\s*to\s*)\d+)*)\s*(?:hp|cv|ps|pk|ch|kw|bhp)/gi
        ];
        leadPatterns.forEach(pattern => {
            const found = descClean.matchAll(pattern);
            for (const match of found) {
                const nums = match[1].match(/\d+/g);
                if (nums) {
                    nums.forEach(n => {
                        const hp = parseInt(n, 10);
                        if (hp > 0 && !hpValues.includes(hp)) hpValues.push(hp);
                    });
                }
            }
        });
      }

      const uniqueHpValues = [...new Set(hpValues)].sort((a,b) => a-b);
      let hpMin = uniqueHpValues.length > 0 ? uniqueHpValues[0] : 0;
      let hpMax = uniqueHpValues.length > 0 ? uniqueHpValues[uniqueHpValues.length-1] : 0;

      let finalIsRequester = hpIsReq;

      const priceValue = parseInt((detail.metadata['Price'] || '0').replace(/\D/g,'')) || 0;

      if (hpMax === 0) {
          // Estimate based on width
          let width = 0;
          Object.entries(detail.metadata).forEach(([k, v]) => {
              if (k.toLowerCase().includes('width')) {
                  const m = (v || '').toString().match(/(\d+(?:\.\d+)?)/);
                  if (m) width = parseFloat(m[1]);
              }
          });

          const f = (filter || '').toLowerCase();
          if (hpIsReq) {
              // --- TOOL FALLBACK ---
              if (width > 0) {
                  if (f.includes('plow') || f.includes('harrow') || f.includes('subsoiler')) {
                      recommendedHp = Math.round(width * 55); 
                  } else if (f.includes('cultivator') || f.includes('disc')) {
                      recommendedHp = Math.round(width * 45);
                  } else if (f.includes('seeder') || f.includes('planter')) {
                      recommendedHp = Math.round(width * 40);
                  } else if (f.includes('mower') || f.includes('tedder') || f.includes('windrow')) {
                      recommendedHp = Math.round(width * 20);
                  } else {
                      recommendedHp = Math.round(width * 30);
                  }
                  hpIsRecommendation = true;
              } else if (priceValue > 0) {
                  // All tools without width: Price/600 (Min 10 HP)
                  recommendedHp = Math.max(10, Math.round(priceValue / 600));
                  hpIsRecommendation = true;
              }
          } else if (isVehicleCategory) {
              // --- VEHICLE FALLBACK ---
              if (priceValue > 0) {
                  // Price/700 is a safe bet for vehicles (Min 15 HP for Gators/UTVs)
                  recommendedHp = Math.max(15, Math.round(priceValue / 700));
                  hpIsRecommendation = true;
              } else {
                  // Fixed defaults by category size
                  if (f === 'tractorss') recommendedHp = 100;
                  else if (f === 'tractorsm') recommendedHp = 250;
                  else if (f === 'tractorsl') recommendedHp = 450;
                  else if (f === 'trucks') recommendedHp = 500;
                  
                  if (recommendedHp > 0) hpIsRecommendation = true;
              }
          } else if (isWeight) {
              recommendedHp = 1;
              hpIsRecommendation = true;
          }
      }
      
      const newRef = {
        ...mod,
        ...detail,
        techData: {
          hp: hpIsRecommendation ? recommendedHp : hpMax,
          hpMin: hpIsRecommendation ? recommendedHp : hpMin,
          hpMax: hpIsRecommendation ? recommendedHp : hpMax,
          hpValues: uniqueHpValues,
          hpIsRequirement: finalIsRequester,
          hpIsRecommendation,
          isDrivable: isVehicleCategory,
          price: parseInt((detail.metadata['Price'] || '0').replace(/\D/g,'')) || 0
        }
      };
      
      if (hpMax > 0 || hpIsRecommendation) {
          // Always show overlay for Tools/Requesters for consistent UX
          setPackHPs(uniqueHpValues.length > 0 ? uniqueHpValues : [recommendedHp]);
          setPowerReference(newRef); // Pre-set it, but overlay will allow specific selection
          setShowPackSelector(true);
      } else {
          useToastStore.getState().info(`No power data found for ${mod.title}.`);
      }
    } catch (err) {
      useToastStore.getState().error(`Failed to fetch power data: ${err.message}`);
    } finally {
      setIsScanningRef(false);
    }
  };

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star
          key={i}
          size={14}
          className={i < fullStars ? 'mod-card__star' : 'mod-card__star mod-card__star--empty'}
          fill={i < fullStars ? 'currentColor' : 'none'}
        />
      );
    }
    return stars;
  };

  const isMini = zoom < 185;
  
  const shouldHideBadge = () => {
    const cached = useModHubStore.getState().modCache[mod.modId];
    if (!cached || !cached.releasedDate) {
        // If we don't have a date, we only show the badge if the scraper explicitly found it
        return !mod.isNew && !mod.isUpdate;
    }
    
    try {
        const parts = cached.releasedDate.split('.');
        if (parts.length === 3) {
            const release = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            const now = new Date();
            const diffHours = (now - release) / (1000 * 60 * 60);
            return diffHours > 168; // Hide after 7 days
        }
    } catch (e) {
        return true;
    }
    return true;
  };

  const hideFreshBadges = shouldHideBadge();
  
  return (
    <div 
      className={`mod-card ${selectedCompareIds.includes(mod.modId) ? 'mod-card--selected' : ''} ${isPowerReference ? 'mod-card--reference' : ''} ${isMini ? 'mod-card--mini' : ''}`} 
      onClick={handleClick} 
      id={`mod-card-${mod.modId}`}
      ref={cardRef}
    >
        <div style={{ position: 'relative', height: zoom * 0.9, minHeight: 140, overflow: 'hidden' }}>
          {imgSrc?.startsWith('CATEGORY:') ? (
            <CategoryPlaceholder category={imgSrc} size={zoom * 0.9} hideZap={hidePower} />
          ) : (
            !imgError && imgSrc ? (
              <img 
                src={imgSrc} 
                alt={mod.title}
                className="mod-card__image"
                onLoad={() => setImgError(false)}
                onError={handleImageError}
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              />
            ) : (
              <div className="mod-card__image-placeholder" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                <Package size={48} opacity={0.2} />
              </div>
            )
          )}
        
        {/* Icon View Metadata (Star - Heart - Pin) - Rearranged & Anchored */}
        {isIconOnly && (
            <div 
                style={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    display: 'flex', 
                    gap: 8, 
                    padding: '8px 12px', 
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                    zIndex: 30 
                }} 
                onClick={e => e.stopPropagation()}
            >
                <button 
                    onClick={() => toggleFavoriteMod(mod)}
                    style={{ color: isModFav ? '#fbbf24' : 'rgba(255,255,255,0.8)', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                    title="Favorite Mod"
                >
                    <Star size={16} fill={isModFav ? 'currentColor' : 'none'} />
                </button>
                {mod.author && (
                    <button 
                        onClick={() => toggleFavoriteAuthor({ id: mod.authorId || mod.author, name: mod.author })}
                        style={{ color: isFavorite ? 'var(--danger)' : 'rgba(255,255,255,0.8)', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                        title={isFavorite ? "Remove from Favorite Authors" : "Add to Favorite Authors"}
                    >
                        <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                    </button>
                )}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleMustHaveMod(mod);
                    }}
                    style={{ 
                        color: isMustHave ? 'var(--accent)' : 'rgba(255,255,255,0.8)', 
                        opacity: 1,
                        cursor: 'pointer',
                        filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', 
                        background: 'transparent', border: 'none', padding: 0
                    }}
                    title={isMustHave ? "Remove from Must-Haves" : "Mark as Must-Have"}
                >
                    <Pin size={16} fill={isMustHave ? "currentColor" : "none"} strokeWidth={isMustHave ? 2.5 : 2} />
                </button>
            </div>
        )}
        
        {isMustHave && (
          <div style={{ 
            position: 'absolute', 
            top: 12, 
            left: 12, 
            background: 'var(--accent)', 
            color: 'var(--bg-primary)', 
            padding: '4px 8px', 
            borderRadius: 6, 
            fontSize: 10, 
            fontWeight: 800, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 4, 
            zIndex: 15, 
            boxShadow: 'var(--shadow-glow)',
            pointerEvents: 'none',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            <Pin size={12} fill="currentColor" /> MUST-HAVE
          </div>
        )}
        {(progress || batch) && (
          <div className="mod-card__progress-overlay animate-fade-in" style={{
            position: 'absolute',
            inset: 0,
            background: progress?.status === 'error' ? 'rgba(127, 29, 29, 0.8)' : 'rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            backdropFilter: 'blur(4px)',
            transition: 'background 0.3s'
          }}>
            {progress?.status === 'error' ? (
                <ShieldAlert size={32} style={{ color: 'white', marginBottom: 12 }} />
            ) : (progress?.status === 'waiting' || (!progress && batch)) ? (
              <Package size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 12, opacity: 0.5 }} />
            ) : (
              <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--accent)', marginBottom: 12 }} />
            )}
            <div style={{ color: 'white', fontWeight: 800, fontSize: 14, textShadow: '0 2px 4px rgba(0,0,0,0.5)', textAlign: 'center' }}>
              {progress?.status === 'error' ? (
                  <div style={{ color: 'white' }}>FAILED</div>
              ) : batch ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>INSTALLING REQUIREMENTS</div>
                  <div>{batch.completed} / {batch.total}</div>
                </div>
              ) : progress ? (
                progress.status === 'waiting' ? 'QUEUED' : 
                progress.status === 'success' ? 'DONE' :
                (typeof progress.progress === 'number' && progress.progress > 0) ? 
                (progress.progress === 100 ? 'SAVING...' : `${Math.round(progress.progress)}%`) 
                  : 'Starting...'
              ) : 'Starting...'}
            </div>
            <div className="progress-bar-small" style={{ width: '80%', height: 4, marginTop: 8, background: 'rgba(255,255,255,0.2)' }}>
              <div 
                className="progress-bar-fill" 
                style={{ 
                  width: batch ? `${Math.round((batch.completed / batch.total) * 100)}%` : `${progress?.progress || 0}%`, 
                  background: progress?.status === 'error' ? 'white' : 'var(--accent)' 
                }} 
              />
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (progress?.status === 'error') {
                   // Retry: Remove and redo
                   removeDownload(mod.modId);
                   (mod.onShowDependencies ? handleDownloadWithDependencies(e) : handleInstall(e));
                } else {
                   cancelDownload(mod.modId);
                }
              }}
              style={{
                marginTop: 16,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--danger)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            >
              {progress?.status === 'error' ? 'RETRY' : 'CANCEL'}
            </button>
          </div>
        )}
        {showPackSelector && packHPs.length > 0 && (
            <div className="mod-card__pack-overlay">
                <div className="mod-card__pack-selector" onClick={(e) => e.stopPropagation()}>
                    <div className="mod-card__pack-title">
                        {packHPs.length >= 2 ? "Select Power Option" : "Confirm Power Match"}
                    </div>

                    {packHPs.length >= 2 && packHPs[0] !== packHPs[packHPs.length - 1] && (
                        <button 
                            className="mod-card__pack-range-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                const hpMin = packHPs[0];
                                const hpMax = packHPs[packHPs.length - 1];
                                setSelectedHP(0);
                                setPowerReference({ 
                                    ...mod, 
                                    hp: hpMax, hpMin, hpMax,
                                    techData: { ...mod.techData, hp: hpMax, hpMin, hpMax, hpValues: packHPs } 
                                });
                                setHpMatchMode('range');
                                setShowPackSelector(false);
                                useToastStore.getState().success(`Reference set: Range ${hpMin}-${hpMax} HP`);
                            }}
                        >
                            <Zap size={10} style={{ marginRight: 4 }} />
                            MATCH ENTIRE RANGE ({packHPs[0]}-{packHPs[packHPs.length-1]} HP)
                        </button>
                    )}

                    <div className="mod-card__pack-grid">
                        {packHPs.map((hp) => (
                            <button 
                                key={hp}
                                className="mod-card__pack-chip"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedHP(hp);
                                    setPowerReference({ 
                                        ...mod, 
                                        techData: { ...mod.techData, hp, hpMin: hp, hpMax: hp, hpValues: [hp] } 
                                    });
                                    setHpMatchMode('high');
                                    setShowPackSelector(false);
                                    useToastStore.getState().success(`Matching to: ${hp} HP`);
                                }}
                            >
                                {hp} <small>HP</small>
                            </button>
                        ))}
                    </div>

                    <button className="mod-card__pack-cancel" onClick={(e) => { e.stopPropagation(); setShowPackSelector(false); }}>
                        Cancel
                    </button>
                </div>
            </div>
        )}

        {isMatchable && !showPackSelector && !hideMatch && (
          <div 
            className={`mod-card__reference-toggle ${isPowerReference ? 'active' : ''}`} 
            onClick={handleSetReference}
          >
            <Zap size={14} fill={isPowerReference ? "var(--bg-primary)" : "none"} />
            <span>{isPowerReference ? "ACTIVE" : "Match"}</span>
          </div>
        )}
        {!isModMap && !hideCompare && (
          <div className={`mod-card__compare-toggle ${selectedCompareIds.includes(mod.modId) ? 'selected' : ''}`} onClick={(e) => { e.stopPropagation(); toggleCompare(mod.modId); }}>
            <Layers size={14} fill={selectedCompareIds.includes(mod.modId) ? "var(--accent)" : "none"} />
            <span>{selectedCompareIds.includes(mod.modId) ? "Selected" : "Compare"}</span>
          </div>
        )}
        {status === 'update' && (
          <span className="mod-card__status-badge mod-card__status-badge--update">
            Update
          </span>
        )}
        {isUpdateNeeded && !hideFreshBadges && (
          <span className="mod-card__status-badge" style={{ background: '#f59e0b', color: 'black', fontWeight: 900, textTransform: 'uppercase', top: 24, left: isMustHave ? 100 : 12, right: 'auto', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            Update!
          </span>
        )}
        {(() => {
          // If scraper found the 'NEW' ribbon, always show it
          if (mod.isNew) return (
            <span className="mod-card__status-badge" style={{ background: 'var(--success)', color: 'black', fontWeight: 900, textTransform: 'uppercase', top: 24, left: isMustHave ? 100 : 12, right: 'auto', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
              New!
            </span>
          );

          // Fallback to date-based logic only if it's NOT an update
          if (!mod.isUpdate && !hideFreshBadges) {
            return (
              <span className="mod-card__status-badge" style={{ background: 'var(--success)', color: 'black', fontWeight: 900, textTransform: 'uppercase', top: 24, left: isMustHave ? 100 : 12, right: 'auto', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                New!
              </span>
            );
          }
          return null;
        })()}
        {status === 'removed' && (
          <span className="mod-card__status-badge mod-card__status-badge--removed" style={{ background: 'var(--danger)', color: 'white' }}>
            Removed
          </span>
        )}
        {mod.dependencies && mod.dependencies.length > 0 && (
          <div className={`mod-card__status-badge animate-fade-in`} style={{ 
            position: 'absolute',
            top: 0, 
            left: '50%',
            transform: 'translateX(-50%)',
            right: 'auto',
            background: requirementsMet ? 'var(--success)' : '#fbbf24', 
            color: requirementsMet ? 'white' : 'black',
            fontWeight: 800,
            fontSize: '10px',
            textTransform: 'uppercase',
            border: 'none',
            borderBottomLeftRadius: '6px',
            borderBottomRightRadius: '6px',
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 10px 4px 10px',
            whiteSpace: 'nowrap'
          }}>
            {requirementsMet ? <Check size={10} /> : <Package size={10} />}
            {requirementsMet ? 'Requirements Met' : 'Requirements'}
          </div>
        )}
      </div>
      
      {!isIconOnly && (
      <div className="mod-card__body">
        <div className="mod-card__title">{mod.title}</div>
        <div className="mod-card-author-row">
          <span 
            className="mod-card-author" 
            onClick={(e) => {
              e.stopPropagation();
              setAuthorFilter({ id: mod.authorId || mod.author, name: mod.author });
              navigate('/modhub');
            }}
            style={{ color: isFavorite ? 'var(--danger)' : undefined, fontWeight: isFavorite ? 800 : undefined }}
            title={`View more by ${mod.author}`}
          >
            {mod.author}
          </span>
        </div>

        {/* Flexible spacer to push metadata to the bottom */}
        <div style={{ flex: 1, minHeight: 8 }} />

        <div className="mod-card-controls-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button 
            className={`fav-author-btn ${isModFav ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteMod(mod);
            }}
            title={isModFav ? "Remove from favorite mods" : "Add to favorite mods"}
            style={{ color: isModFav ? '#fbbf24' : 'var(--text-tertiary)', display: 'flex' }}
          >
            <Star size={14} fill={isModFav ? "currentColor" : "none"} />
          </button>
          
          {mod.author && (
            <button 
              className={`fav-author-btn ${isFavorite ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavoriteAuthor({ id: mod.authorId || mod.author, name: mod.author });
              }}
              title={isFavorite ? "Remove from Favorite Authors" : "Add to Favorite Authors"}
              style={{ display: 'flex' }}
            >
              <Heart size={14} fill={isFavorite ? "currentColor" : "none"} />
            </button>
          )}

          <button 
            className={`fav-author-btn ${isMustHave ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleMustHaveMod(mod);
            }}
            title={isMustHave ? "Remove from Must-Haves" : "Mark as Must-Have"}
            style={{ 
              color: isMustHave ? 'var(--accent)' : 'var(--text-tertiary)',
              opacity: 1,
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <Pin size={16} fill={isMustHave ? "currentColor" : "none"} strokeWidth={isMustHave ? 2.5 : 2} />
          </button>

          <div style={{ flex: 1 }} />

          <button 
            className={`fav-author-btn ${isHidden ? 'active-hide' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleHiddenMod(mod);
            }}
            title={isHidden ? "Unhide this mod" : "Hide this mod"}
            style={{ display: 'flex' }}
          >
            <EyeOff size={14} />
          </button>
        </div>
        
        {(() => {
          const showPrice = mod.techData?.price > 0 && !hidePrice;
          const isTechFilterActive = activeFilters.hpRange[0] > 0 || activeFilters.hpRange[1] < 2000 || activeFilters.priceRange[0] > 0 || activeFilters.priceRange[1] < 1000000 || activeFilters.capRange[0] > 0 || activeFilters.capRange[1] < 1000000;
          const showEstimated = isSmartMatchEnabled || isTechFilterActive;
          const hasHP = mod.techData?.hp > 0 && !hideHP && !hidePower && (!mod.techData.hpIsRecommendation || showEstimated);
          const showCap = mod.techData?.capacity > 0 && !hideCapacity && !hidePower; // Capacity usually goes with power/tech

          if (!showPrice && !hasHP && !showCap) return null;

          return (
            <div className="mod-card__tech-info" style={{ marginBottom: 12 }}>
              {showPrice && (
                <div className="mod-card__tech-item" title="Price">
                  <span style={{ fontSize: 12 }}>$</span>
                  {mod.techData.price.toLocaleString()}
                </div>
              )}
              {hasHP && (
                <div 
                  className={`mod-card__tech-item ${mod.techData.hpIsRecommendation ? 'mod-card__tech-item--recommendation' : ''}`} 
                  title={
                    mod.techData.hpIsRequirement 
                      ? (mod.techData.hpIsRecommendation ? "Estimated required power" : "Required power")
                      : "Engine power output"
                  }
                >
                  <Zap size={14} />
                  {mod.techData.hp} HP
                  {mod.techData.hpIsRecommendation && <span className="mod-card__rec-badge">REC</span>}
                </div>
              )}
              {showCap && (
                <div className="mod-card__tech-item" title="Capacity">
                  <Layers size={14} />
                  {mod.techData.capacity.toLocaleString()} L
                </div>
              )}
            </div>
          );
        })()}

        <div className="mod-card__footer">
          <div className="mod-card__rating">
            {renderStars(mod.rating || 0)}
          </div>
          {mod.downloads > 0 && (
            <span className="mod-card__downloads">
              <Download size={12} />
              {mod.downloads.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      )}

      {showActions && !isIconOnly && (
        <div className="mod-card__actions">
          <button
            className={`btn ${isInstalled ? 'btn--ghost' : 'btn--primary'} btn--sm btn--full`}
            onClick={mod.onShowDependencies ? handleDownloadWithDependencies : handleInstall}
            disabled={installing || isInstalled}
            style={isInstalled ? { 
                opacity: 0.8, 
                borderColor: 'var(--accent)', 
                color: 'var(--accent)', 
                cursor: 'default',
                background: 'rgba(var(--accent-rgb), 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                fontSize: '12px',
                padding: '0 8px'
            } : {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                fontSize: '12px',
                padding: '0 8px'
            }}
          >
            { (isInstalled || (progress && progress.status === 'success')) ? (
                <>
                  <Check size={14} /> Installed
                </>
            ) : (installing || batch || (progress && progress.status !== 'success')) ? (
                batch ? 'Requirements...' :
                progress ? (
                  progress.status === 'waiting' ? 'Queued...' :
                  progress.status === 'success' ? 'Installed' :
                  (progress.status === 'downloading' && progress.progress === 0) ? 'Starting...' :
                  (progress.progress === 100 ? 'Finishing...' : `${Math.round(progress.progress)}%`)
                ) : 'Queued...'
            ) : (
                <>
                  <Download size={14} /> Install
                </>
            )}
          </button>
          <button 
            className="btn btn--secondary btn--sm btn--full"
            onClick={() => window.api.modhub.openInBrowser(mod.modId)}
            style={{ fontSize: '12px' }}
          >
            Modhub
          </button>
        </div>
      )}
    </div>
  );
});
