import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useDownloadStore } from '../store/useDownloadStore';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useToastStore } from '../store/useToastStore';
import { 
  ArrowLeft, Download, ExternalLink, Package, Lock,
  Calendar, User, HardDrive, Tag, Gauge, Zap, Coins, Weight, Clock, Check, AlertCircle, Info, Milestone, Star, Pin, Heart,
  RotateCcw, RefreshCw, AlertTriangle, ShieldAlert, Search
} from 'lucide-react';
import { useModHubStore } from '../store/useModHubStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { compareVersions, resolveRecursiveDependencies, matchModWithDependency } from '../utils/modUtils';
import DependencyDownloadModal from '../components/common/DependencyDownloadModal';

// Shared Ultra Normalization (matches InstalledModsPage)
const ultraNormalize = (str) => {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\[[^\]]*\]/g, '') // Strip [Tags]
        .replace(/\([^)]*\)/g, '') // Strip (By Author) or (v1.0)
        .replace(/^(?:fs\d{2}|dlc|pdlc|mod|fendt|jcb|caseih|newholland|massey|farming\s*simulator(?:\s*\d{2})?)(?:[\s_\.]+)/gi, '') // Common prefixes
        .replace(/[\s_\.]+(?:by\s+.*|author:.*|pack|package|dlc|mod|map|expansion|set|kit|collection|building|shed|v\d+.*)\s*$/gi, '') // Trailing noise
        .replace(/[^a-z0-9]/g, ''); // Squash everything else
};

export default function ModDetailPage() {
  const { modId, fileName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const parentFolder = location.state?.parentFolder || '';

  const [mod, setMod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [imageFailures, setImageFailures] = useState({});
  const [proxiedImages, setProxiedImages] = useState({});
  
  // DRIVER: useDownloadStore handles the global "background" state
  const { activeDownloads, batchProgress, addDownload, removeDownload, cancelDownload } = useDownloadStore();
  const { mods: localMods } = useLocalModsStore();
  const { favoriteMods, toggleFavoriteMod, toggleMustHaveMod } = useModHubStore();
  
  const localMod = useMemo(() => {
    if (!mod) return null;
    // 1. Try exact ID match first
    const idMatch = localMods.find(lm => lm.modId && String(lm.modId) === String(mod.modId));
    if (idMatch) return idMatch;

    // 2. Try strict fileName match first (stripping FS25 prefix)
    if (mod.fileName || mod.downloadUrl) {
      const getBaseName = (str) => {
        if (!str) return '';
        const match = str.match(/([^/\\]+)\.zip$/i) || [null, str];
        return match[1].replace(/^(?:fs25|fs22|pdlc)_/i, '').toLowerCase();
      };
      
      const remoteFileName = getBaseName(mod.fileName || mod.downloadUrl);
      if (remoteFileName) {
        const fileMatch = localMods.find(lm => {
           if (!lm.fileName) return false;
           return getBaseName(lm.fileName) === remoteFileName;
        });
        if (fileMatch) return fileMatch;
      }
    }

    return null;
  }, [mod, localMods]);

  const hasUpdate = useMemo(() => {
    if (!mod || !localMod) return false;
    // remote (mod.version) > installed (localMod.version)
    return compareVersions(mod.version, localMod.version) > 0;
  }, [mod, localMod]);

  const currentDownload = activeDownloads[modId];
  const isCurrentlyInstalling = !!currentDownload && currentDownload.status !== 'success';
  const showAsInstalled = !!localMod || currentDownload?.status === 'success';
  const downloadProgress = currentDownload?.progress || 0;

  const isModFav = favoriteMods.some(m => m.modId === modId);
  const isOnline = useSettingsStore(s => s.isOnline);
  const { conflicts, missingDependencies, setModTags, restoreModVersion } = useLocalModsStore();
  const [newTag, setNewTag] = useState('');
  const [resolvedMetadata, setResolvedMetadata] = useState({});
  const [restoring, setRestoring] = useState(false);
  const [hasBak, setHasBak] = useState(false);
  const [showDepModal, setShowDepModal] = useState(false);

  // ── Dependency Management ──
  const sessionInstalled = useDownloadStore(s => s.sessionInstalled);

  const uniqueDependencies = useMemo(() => {
    if (!mod || !mod.dependencies) return [];
    
    const depsList = [];
    const seenKeys = new Set();
    
    const resolveDeps = (depList) => {
        if (!depList) return;
        depList.forEach(dep => {
            let depId = null;
            let fallbackFileName = null;
            const depTitle = typeof dep === 'string' ? dep : dep.title;
            
            if (typeof dep === 'object' && dep.url) {
                const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
                if (idMatch) depId = parseInt(idMatch[1], 10).toString();
                const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
                if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
            } else if (typeof dep === 'object' && dep.modId) {
                depId = String(dep.modId);
            }
            
            const resolvedObj = resolvedMetadata[depTitle];
            if (resolvedObj && resolvedObj.modId) {
                depId = String(resolvedObj.modId);
            }
            
            const depString = fallbackFileName || (typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || ''));
            const cleanModName = (name) => name ? name.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim() : '';
            const cleanedName = cleanModName(depString).toLowerCase();
            
            const key = depId ? `id_${depId}` : `name_${cleanedName}`;
            
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                depsList.push(dep);
                
                // Recursively check if this dependency is installed and has its own dependencies
                const match = localMods ? localMods.find(m => {
                    if (depId && m.modId) {
                        const safeModId = String(m.modId).replace(/^0+/, '');
                        if (safeModId === depId) return true;
                    }
                    if (m.modName && m.modName.toLowerCase() === cleanedName) return true;
                    const cleanFile = m.fileName ? m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase() : '';
                    if (cleanFile && cleanFile === cleanedName) return true;
                    return false;
                }) : null;
                
                if (match && match.dependencies && match.dependencies.length > 0) {
                    resolveDeps(match.dependencies);
                }
            }
        });
    };
    
    resolveDeps(mod.dependencies);
    
    // Sort to prioritize dependencies with ModHub URLs
    return depsList.sort((a, b) => {
      const aUrl = typeof a === 'object' && a.url;
      const bUrl = typeof b === 'object' && b.url;
      return (bUrl ? 1 : 0) - (aUrl ? 1 : 0);
    });
  }, [mod?.dependencies, localMods, resolvedMetadata]);

  const dependencyStatus = useMemo(() => {
    if (uniqueDependencies.length === 0) return { allMet: true, missingCount: 0, statuses: {}, missingList: [] };
    if (!localMods) return { allMet: false, missingCount: uniqueDependencies.length, statuses: {}, missingList: uniqueDependencies };

    let missingCount = 0;
    const statuses = {};
    const missingList = [];

    uniqueDependencies.forEach(dep => {
        let isInstalled = false;
        
        const depTitle = typeof dep === 'string' ? dep : dep.title;
        // Search resolvedMetadata either by original string or by current title
        const resolvedObj = resolvedMetadata[depTitle] || (typeof dep === 'object' ? (resolvedMetadata[dep.title] || resolvedMetadata[dep.modName] || resolvedMetadata[dep.fileName]) : null);
        
        let depId = (typeof dep === 'object' && dep.modId) ? String(dep.modId) : (resolvedObj ? String(resolvedObj.modId) : null);
        let fallbackFileName = null;
        
        if (typeof dep === 'object' && dep.url) {
            const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
            if (idMatch) {
                depId = parseInt(idMatch[1], 10).toString();
            }
            
            const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
            if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
        }
        
        // Optimistic UI check: did we just install this in the current session?
        if (depId && sessionInstalled[depId]) {
            isInstalled = true;
        } else {
            const depClean = (fallbackFileName || depTitle).toLowerCase();
            if (Object.values(sessionInstalled).some(val => val && val.toLowerCase() === depClean)) {
                isInstalled = true;
            }
        }
        
        if (!isInstalled) {
            isInstalled = localMods.some(m => matchModWithDependency(m, dep, resolvedMetadata));
        }

        statuses[depTitle] = isInstalled;
        if (!isInstalled) {
            missingCount++;
            missingList.push(dep);
        }
    });

    return {
        allMet: missingCount === 0,
        missingCount,
        statuses,
        missingList
    };
  }, [uniqueDependencies, localMods, sessionInstalled, resolvedMetadata]);

  const images = useMemo(() => {
    if (!mod) return [];
    const rawImages = mod.images && mod.images.length > 0 ? mod.images : [];
    const unique = [];
    const seen = new Set();
    rawImages.forEach(img => {
      // Use full URL as key for DLCs to ensure all screenshots show even if they have weird paths
      const key = mod.isDLC ? img : (img.split('/').pop().split('?')[0]);
      if (key && !seen.has(key)) {
        unique.push(img);
        seen.add(key);
      }
    });
    return unique;
  }, [mod?.images, mod?.isDLC]);

  useEffect(() => {
    loadModDetail();
  }, [modId, fileName]);

  // Check if a .bak file exists for the restore button
  useEffect(() => {
    if (localMod?.filePath && window.api?.mods?.checkBakExists) {
      window.api.mods.checkBakExists(localMod.filePath).then(exists => setHasBak(!!exists)).catch(() => setHasBak(false));
    } else {
      setHasBak(false);
    }
  }, [localMod?.filePath]);

  const resolveProxy = async (url) => {
    if (!url || proxiedImages[url]) return;
    if (url.startsWith('data:') || url.startsWith('file:')) {
        setProxiedImages(prev => ({ ...prev, [url]: url }));
        return;
    }
    try {
      const proxied = await window.api.images.proxy(url);
      setProxiedImages(prev => ({ ...prev, [url]: proxied }));
    } catch (err) {
      console.error('Proxy failed:', err);
    }
  };

  useEffect(() => {
    if (mod?.images) {
      mod.images.forEach(img => resolveProxy(img));
    }
  }, [mod]);

  const loadModDetail = async () => {
    setLoading(true);
    try {
      let modData = null;
      let effectiveModId = modId;
      
      // 1. Try to find in local store first if we have a fileName
      if (fileName) {
          const local = localMods.find(m => m.fileName === fileName);
          if (local) {
              modData = {
                  ...local,
                  images: [
                      ...(local.iconData ? [local.iconData] : []),
                      ...(local.extraImages || [])
                  ],
                  fileSize: local.size ? `${(local.size / (1024 * 1024)).toFixed(2)} MB` : null
              };
              
              if (local.modId) effectiveModId = local.modId;
          }
      } else if (modId) {
          const local = localMods.find(m => String(m.modId) === String(modId));
          if (local) {
              modData = {
                  ...local,
                  images: [
                      ...(local.iconData ? [local.iconData] : []),
                      ...(local.extraImages || [])
                  ],
                  fileSize: local.size ? `${(local.size / (1024 * 1024)).toFixed(2)} MB` : null
              };
          }
      }

      // Helper to normalize strings for comparison
      const normalizeForMatching = (str) => {
          if (!str) return '';
          return str.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase().trim();
      };

      const mergeDeps = (localList, remoteList, resolvedMeta = {}) => {
          const getTechnicalKey = (dep) => {
              if (typeof dep === 'string') return normalizeForMatching(dep);
              
              const resolvedObj = resolvedMeta[dep.title] || (dep.url ? resolvedMeta[dep.url] : null);
              const fileName = dep.fileName || resolvedObj?.fileName;
              if (fileName) return normalizeForMatching(fileName);
              
              const url = dep.url || '';
              if (url) {
                  const fileMatch = url.match(/\/([^\/]+\.zip)$/i);
                  if (fileMatch) return normalizeForMatching(fileMatch[1]);
              }
              return normalizeForMatching(dep.modName || dep.technicalName || dep.title || dep.fileName || '');
          };

          const merged = [...(localList || [])];
          for (const rDep of (remoteList || [])) {
              const rKey = getTechnicalKey(rDep);
              const localIdx = merged.findIndex(lDep => getTechnicalKey(lDep) === rKey);
              if (localIdx !== -1) {
                  // Merge the remote details (e.g. url, modId, title) into the local entry
                  const localEntry = merged[localIdx];
                  if (typeof localEntry === 'string') {
                      merged[localIdx] = rDep;
                  } else {
                      merged[localIdx] = { ...localEntry, ...rDep };
                  }
              } else {
                  merged.push(rDep);
              }
          }
          return merged;
      };

      const prefetchDependencies = async (depsList) => {
          if (!depsList || depsList.length === 0) return {};
          
          const depIdsToFetch = depsList
              .map(d => {
                  if (typeof d === 'object' && d.url) {
                      const idMatch = d.url.match(/mod_id=(\d+)/) || d.url.match(/storage\/(\d+)\//);
                      return idMatch ? idMatch[1] : null;
                  }
                  return null;
              })
              .filter(Boolean);

          if (depIdsToFetch.length === 0) return {};

          try {
              const detailsList = await Promise.all(
                  depIdsToFetch.map(async (id) => {
                      try {
                          return await window.api.modhub.fetchModDetail({ modId: id });
                      } catch (e) {
                          return null;
                      }
                  })
              );

              const resolvedMetaUpdate = {};
              detailsList.forEach(detail => {
                  if (detail && detail.modId) {
                      resolvedMetaUpdate[detail.title] = detail;
                      if (detail.url) resolvedMetaUpdate[detail.url] = detail;
                      if (detail.fileName) {
                          const techName = detail.fileName.replace(/\.zip$/i, '');
                          resolvedMetaUpdate[techName] = detail;
                      }
                  }
              });
              return resolvedMetaUpdate;
          } catch (err) {
              console.error('Failed to prefetch dependency details:', err);
              return {};
          }
      };

      // 1. Resolve remote map data if online
      let remoteDeps = [];
      let resolvedMetaUpdate = {};

      if (effectiveModId) {
          try {
              const remote = await window.api.modhub.fetchModDetail({ modId: effectiveModId });
              if (remote && !remote.error) {
                  remoteDeps = remote.dependencies || [];
                  // Prefetch filenames for all remote dependencies listed on the map page
                  resolvedMetaUpdate = await prefetchDependencies(remoteDeps);
                  
                  modData = { 
                      ...modData, 
                      ...remote
                  };
              }
          } catch (err) {
              console.warn('Remote fetch failed, falling back to local metadata');
          }
      } else if (modData && modData.isMap && modData.dependencies && modData.dependencies.some(d => typeof d === 'string' || !d.url)) {
          // If we only have local map metadata, search by map title to locate its ModHub ID and page
          try {
              const searchRes = await window.api.modhub.search({ query: modData.title || modData.modName, page: 0 });
              const remoteMap = searchRes?.mods?.[0];
              if (remoteMap && remoteMap.modId) {
                  const detail = await window.api.modhub.fetchModDetail({ modId: remoteMap.modId });
                  if (detail && detail.dependencies) {
                      remoteDeps = detail.dependencies;
                      resolvedMetaUpdate = await prefetchDependencies(remoteDeps);
                      modData = {
                          ...modData,
                          ...detail
                      };
                  }
              }
          } catch (e) {
              console.error('Failed to dynamically fetch map details from ModHub', e);
          }
      }

      // 2. Use remote dependencies if available (prefetched metadata resolves the filenames)
      if (modData) {
          if (remoteDeps && remoteDeps.length > 0) {
              modData.dependencies = remoteDeps;
          }
          
          if (Object.keys(resolvedMetaUpdate).length > 0) {
              setResolvedMetadata(prev => ({ ...prev, ...resolvedMetaUpdate }));
          }
          setMod(modData);
      } else if (modId) {
          const result = await window.api.modhub.fetchModDetail({ modId });
          setMod(result);
      }
    } catch (err) {
      console.error('Failed to load mod detail:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOnline || uniqueDependencies.length === 0) return;
    
    // Find all dependencies that are raw strings and are missing
    const unresolved = uniqueDependencies.filter(dep => {
        if (typeof dep !== 'string') return false;
        const isInstalled = dependencyStatus.statuses[dep] || false;
        return !isInstalled;
    });
    
    if (unresolved.length === 0) return;
    
    unresolved.forEach(async (rawName) => {
        try {
            // Split camelCase, PascalCase, numbers, and clean up for searching
            const cleanName = rawName
                .replace(/^fs25_/i, '')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                .replace(/([0-9]+)/g, ' $1')
                .replace(/[_\\-]/g, ' ')
                .trim();
                
            let res = await window.api.modhub.search({ query: cleanName, page: 0 });
            
            // Fallback: search by first word if search was empty
            if (!res || !res.mods || res.mods.length === 0) {
                const simplified = cleanName.split(' ')[0];
                if (simplified && simplified.length > 2) {
                    res = await window.api.modhub.search({ query: simplified, page: 0 });
                }
            }
            
            if (res && res.mods && res.mods.length > 0) {
                // Fetch full details for the top 5 candidates in parallel to get their true fileNames!
                const candidates = res.mods.slice(0, 5);
                const detailedCandidates = await Promise.all(
                    candidates.map(async (c) => {
                        try {
                            const detail = await window.api.modhub.fetchModDetail({ modId: c.modId });
                            return { ...c, ...detail };
                        } catch (err) {
                            return c;
                        }
                    })
                );

                const targetLower = rawName.replace(/^fs25_/i, '').toLowerCase();
                
                const scored = detailedCandidates.map(m => {
                    const titleClean = m.title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    const fileClean = m.fileName ? m.fileName.replace(/\.zip$/i, '').replace(/^(?:fs25|fs22|pdlc)_/i, '').toLowerCase() : '';
                    
                    let score = 0;
                    if (fileClean === targetLower) {
                        score = 150; // Extra high priority for exact filename match!
                    } else if (titleClean === targetLower) {
                        score = 100;
                    } else if (titleClean.includes(targetLower) || targetLower.includes(titleClean)) {
                        score = 50;
                    } else if (fileClean && (fileClean.includes(targetLower) || targetLower.includes(fileClean))) {
                        score = 40;
                    }
                    return { mod: m, score };
                }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
                
                const bestMatch = scored.length > 0 ? scored[0].mod : res.mods[0];
                
                if (bestMatch && bestMatch.modId) {
                    setResolvedMetadata(prev => ({
                        ...prev,
                        [rawName]: {
                            modId: bestMatch.modId,
                            title: bestMatch.title,
                            url: `https://www.farming-simulator.com/mod.php?mod_id=${bestMatch.modId}`,
                            fileName: bestMatch.fileName
                        }
                    }));
                }
            }
        } catch (e) {
            console.error('Failed to resolve metadata for', rawName, e);
        }
    });
  }, [uniqueDependencies, dependencyStatus.statuses, isOnline]);

  const handleInstall = async () => {
    if (isCurrentlyInstalling || !mod || !isOnline) return;
    
    // Register in global store
    addDownload(mod.modId, mod.title, mod.images?.[0]);

    try {
      const isMap = mod.isMap || mod.category?.toUpperCase().includes('MAP') || (localMod && localMod.isMap);
      const cleanTitle = mod.title.replace(/\([^)]+\)/g, '').trim();
      const subFolder = parentFolder || (localMod && typeof localMod.folder === 'string' ? localMod.folder : (isMap ? cleanTitle : null));


      // 2. Normal install flow
      const result = await window.api.mods.install({
        modId: mod.modId,
        modTitle: mod.title,
        downloadUrl: mod.downloadUrl || '',
        category: mod.category || '',
        subFolder
      });
      if (result.success) {
        useToastStore.getState().success(`${mod.title} install started!`);
      } else {
        useToastStore.getState().error(`Failed: ${result.error}`);
        removeDownload(mod.modId);
      }
    } catch (err) {
      useToastStore.getState().error(`Install failed: ${err.message}`);
      removeDownload(mod.modId);
    }
  };

  const handleOpenWebsite = () => {
    if (modId) {
      window.api.modhub.openInBrowser(modId);
    } else if (mod?.url) {
      window.api.shell.openExternal(mod.url);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <button className="btn btn--ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="mod-detail" style={{ marginTop: 'var(--sp-4)' }}>
          <div>
            <div className="skeleton skeleton--image" style={{ borderRadius: 'var(--radius-lg)' }} />
            <div style={{ marginTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <div className="skeleton skeleton--title" style={{ width: '60%' }} />
              <div className="skeleton skeleton--text" />
              <div className="skeleton skeleton--text" />
              <div className="skeleton skeleton--text" style={{ width: '80%' }} />
            </div>
          </div>
          <div>
            <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-md)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!mod || mod.error) {
    return (
      <div className="page">
        <button className="btn btn--ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="empty-state">
          <Package className="empty-state__icon" size={64} />
          <div className="empty-state__title">Mod not found</div>
          <div className="empty-state__desc">{mod?.error || 'Could not load mod details.'}</div>
        </div>
      </div>
    );
  }



  return (
    <div className="page animate-fade-in-up">
      <button 
        className="btn btn--secondary mod-detail__back" 
        onClick={() => navigate(-1)}
        style={{ 
            marginBottom: 'var(--sp-6)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            background: 'var(--bg-tertiary)',
            color: 'var(--accent)',
            border: '1px solid var(--border-accent)',
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 800,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            boxShadow: 'var(--shadow-glow)',
            transition: 'all 0.2s ease'
        }}
      >
        <ArrowLeft size={18} /> BACK
      </button>

      <div className="mod-detail">
        {/* Left: Gallery + Description */}
        <div>
          {/* Gallery */}
          <div className="mod-detail__gallery">
            {images.length > 0 ? (
              <img 
                src={proxiedImages[images[activeImage]] || images[activeImage]} 
                alt={mod.title} 
                onError={(e) => { 
                  setImageFailures(prev => ({ ...prev, [images[activeImage]]: true }));
                  if (activeImage < images.length - 1) setActiveImage(prev => prev + 1);
                }}
                style={{ display: imageFailures[images[activeImage]] ? 'none' : 'block' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <Package size={64} />
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="mod-detail__gallery-thumbs">
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className={`mod-detail__gallery-thumb ${idx === activeImage ? 'mod-detail__gallery-thumb--active' : ''}`}
                  onClick={() => setActiveImage(idx)}
                >
                  <img 
                    src={proxiedImages[img] || img} 
                    alt={`Screenshot ${idx + 1}`} 
                    onError={(e) => {
                      setImageFailures(prev => ({ ...prev, [img]: true }));
                    }}
                    style={{ opacity: imageFailures[img] ? 0.3 : 1, filter: imageFailures[img] ? 'grayscale(1)' : 'none' }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Title + Description */}
          <h1 className="mod-detail__title" style={{ marginTop: 'var(--sp-5)' }}>{mod.title}</h1>
          {!mod.isDLC && (
            <div className="mod-detail__author">
              <User size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              by {mod.author}
            </div>
          )}

          {mod.description && (
            <div style={{ marginTop: 'var(--sp-6)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 'var(--sp-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={14} /> Description
              </div>
              <div
                className="mod-detail__desc"
                dangerouslySetInnerHTML={{ __html: mod.description }}
              />
            </div>
          )}


          {/* Changelog Section */}
          {mod.changelog && mod.changelog.length > 0 && (
            <div style={{ marginTop: 'var(--sp-8)', padding: 'var(--sp-4)', background: 'rgba(var(--accent-rgb), 0.05)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--accent-dim)' }}>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', marginBottom: 'var(--sp-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} /> Version History
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {mod.changelog.map((line, i) => (
                        <div key={i} style={{ 
                            fontSize: line.toLowerCase().includes('version') ? 'var(--fs-sm)' : 'var(--fs-xs)', 
                            fontWeight: line.toLowerCase().includes('version') ? 700 : 400,
                            color: line.toLowerCase().includes('version') ? 'var(--text-primary)' : 'var(--text-secondary)',
                            paddingLeft: line.toLowerCase().includes('version') ? 0 : 12,
                            borderLeft: line.toLowerCase().includes('version') ? 'none' : '2px solid var(--accent-dim)'
                        }}>
                            {line}
                        </div>
                    ))}
                </div>
            </div>
          )}

          {/* New: Dedicated Required Mods Section (Main column) */}
          {uniqueDependencies.length > 0 && (
            <div style={{ 
                marginTop: 'var(--sp-10)', 
                padding: 'var(--sp-6)', 
                background: 'rgba(251, 191, 36, 0.03)', 
                borderRadius: 'var(--radius-xl)', 
                border: '1px solid rgba(251, 191, 36, 0.15)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-5)' }}>
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Package size={16} /> Required Mods & Dependencies
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {uniqueDependencies.map((dep) => {
                  const depTitle = typeof dep === 'string' ? dep : dep.title;

                  const resolvedObj = resolvedMetadata[depTitle];

                  // Extract the file name or ID exactly like resolveRecursiveDependencies does
                  let depId = resolvedObj ? resolvedObj.modId : null;
                  let fallbackFileName = null;
                  let externalUrl = resolvedObj ? resolvedObj.url : null;
                  if (typeof dep === 'object' && dep.url) {
                      const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
                      if (idMatch) {
                          depId = idMatch[1];
                      } else {
                          externalUrl = dep.url;
                      }
                      const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
                      if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
                  }
                   const depString = fallbackFileName || (typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || ''));
                  const cleanModName = (name) => name ? name.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim() : '';
                  const cleanedName = cleanModName(depString).toLowerCase();
                  const isInstalled = dependencyStatus.statuses[depTitle] || false;
                  
                  // If we retrieved a ModHub ID from local metadata, apply it
                  if (!depId && isInstalled) {
                      const localMatch = localMods.find(m => {
                          if (m.modName && m.modName.toLowerCase() === cleanedName) return true;
                          const cleanFile = m.fileName ? m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase() : '';
                          if (cleanFile && cleanFile === cleanedName) return true;
                          return false;
                      });
                      if (localMatch && localMatch.modId) {
                          depId = String(localMatch.modId);
                      }
                  }

                  const displayLabel = resolvedObj ? resolvedObj.title : depTitle.replace(/^fs25_/i, '');
                  
                  const matchedLocal = isInstalled ? localMods.find(m => {
                      if (depId && m.modId) {
                          const safeModId = String(m.modId).replace(/^0+/, '');
                          if (safeModId === depId) return true;
                      }
                      if (m.modName && m.modName.toLowerCase() === cleanedName) return true;
                      const cleanFile = m.fileName ? m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase() : '';
                      if (cleanFile && cleanFile === cleanedName) return true;
                      return false;
                  }) : null;

                  const handleLocalNavigate = () => {
                      if (!matchedLocal) return;
                      navigate(`/mod-detail`, { 
                          state: { 
                              mod: { 
                                  ...matchedLocal, 
                                  images: [ 
                                      ...(matchedLocal.iconData ? [matchedLocal.iconData] : []), 
                                      ...(matchedLocal.extraImages || []) 
                                  ], 
                                  fileSize: matchedLocal.size ? `${(matchedLocal.size / (1024 * 1024)).toFixed(2)} MB` : null 
                              }, 
                              parentFolder 
                          } 
                      });
                  };
                  
                  return (
                    <div key={depTitle} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        background: 'rgba(255,255,255,0.02)', 
                        padding: '16px 20px', 
                        borderRadius: 'var(--radius-lg)', 
                        border: '1px solid rgba(255,255,255,0.05)',
                        transition: 'transform 0.2s ease, border-color 0.2s ease'
                    }} className="hover-lift">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ color: isInstalled ? 'var(--success)' : 'var(--text-secondary)' }}>
                          {isInstalled ? <Check size={16} /> : <AlertCircle size={16} />}
                        </div>
                        {depId ? (
                           <span 
                             style={{ 
                               fontWeight: 600, 
                               cursor: 'pointer',
                               textDecoration: 'none'
                             }}
                             className="hover-underline"
                             onClick={() => navigate(`/modhub/mod/${depId}`, { state: { parentFolder: (mod.isMap || mod.category?.toUpperCase().includes('MAP')) ? mod.title.replace(/\([^)]+\)/g, '').trim() : parentFolder } })}
                           >
                             {displayLabel}
                           </span>
                        ) : matchedLocal ? (
                           <span 
                             style={{ 
                               fontWeight: 600, 
                               cursor: 'pointer',
                               textDecoration: 'none'
                             }}
                             className="hover-underline"
                             onClick={handleLocalNavigate}
                           >
                             {displayLabel}
                           </span>
                        ) : externalUrl ? (
                           <span 
                             style={{ 
                               fontWeight: 600, 
                               cursor: 'pointer',
                               textDecoration: 'none',
                               color: 'var(--accent)'
                             }}
                             className="hover-underline"
                             onClick={() => window.api?.shell?.openExternal(externalUrl)}
                             title={externalUrl}
                           >
                             {displayLabel}
                           </span>
                        ) : (
                           <span style={{ fontWeight: 600 }}>
                             {displayLabel}
                           </span>
                        )}
                      </div>
                      {depId ? (
                        <button 
                          className="btn btn--secondary btn--xs"
                          onClick={() => navigate(`/modhub/mod/${depId}`, { state: { parentFolder: (mod.isMap || mod.category?.toUpperCase().includes('MAP')) ? mod.title.replace(/\([^)]+\)/g, '').trim() : parentFolder } })}
                        >
                          {isInstalled ? 'View Mod' : 'View on ModHub'}
                        </button>
                      ) : matchedLocal ? (
                        <button 
                          className="btn btn--secondary btn--xs"
                          onClick={handleLocalNavigate}
                        >
                          View Mod
                        </button>
                      ) : externalUrl ? (
                        <button 
                          className="btn btn--secondary btn--xs"
                          onClick={() => window.api?.shell?.openExternal(externalUrl)}
                          title={externalUrl}
                        >
                          Get Third Party Mod
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Sidebar with Metadata + Actions */}
        <div className="mod-detail__sidebar">
          {/* Conflict Warnings */}
          {localMod && conflicts && conflicts.filter(c => c.mods.includes(localMod.title)).map((conflict) => (
            <div key={conflict.name || conflict.mods.join(',')} className={`alert alert--${conflict.severity === 'critical' ? 'danger' : 'warning'}`} style={{ marginBottom: 'var(--sp-4)', padding: '12px', fontSize: 'var(--fs-xs)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
                <ShieldAlert size={16} />
                <span>{conflict.type === 'script' ? 'Script Conflict' : 'Specialization Conflict'}</span>
              </div>
              <p style={{ margin: 0, opacity: 0.9 }}>
                "{conflict.name}" is shared with: <strong>{conflict.mods.filter(m => m !== localMod.title).join(', ')}</strong>. This might cause game instability.
              </p>
            </div>
          ))}

          {/* Action Buttons */}
          <div className="mod-detail__actions">
            {uniqueDependencies.length > 0 && (
                <div className={`alert alert--${dependencyStatus.allMet ? 'success' : 'warning'}`} style={{ 
                  marginBottom: 'var(--sp-4)', 
                  padding: '12px', 
                  fontSize: 'var(--fs-xs)', 
                  border: dependencyStatus.allMet ? '1px solid var(--success)' : '1px solid #fbbf24',
                  background: dependencyStatus.allMet ? 'rgba(var(--success-rgb), 0.1)' : 'rgba(251, 191, 36, 0.1)',
                  color: dependencyStatus.allMet ? 'var(--success)' : '#fbbf24',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
                    {dependencyStatus.allMet ? <Check size={16} /> : <Package size={16} />}
                    <span style={{ textTransform: 'uppercase' }}>
                      {dependencyStatus.allMet ? 'All Requirements Satisfied' : 'Required Mods Detected'}
                    </span>
                  </div>
                  <p style={{ margin: 0, opacity: 0.9 }}>
                    {dependencyStatus.allMet 
                      ? `All ${uniqueDependencies.length} required mods are currently installed and active.`
                      : `You are missing ${dependencyStatus.missingCount} of the ${uniqueDependencies.length} required mods needed for this mod to function correctly.`
                    }
                  </p>
                </div>
              )}
            {showAsInstalled ? (
              hasUpdate ? (
                <button
                  className="btn btn--primary btn--lg btn--full"
                  style={{ background: 'var(--warning)', color: 'black' }}
                  onClick={async () => {
                      handleInstall();
                  }}
                  disabled={isCurrentlyInstalling || !isOnline}
                  title={!isOnline ? "Internet connection required" : ""}
                >
                  {isCurrentlyInstalling ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
                  {!isOnline ? 'Update Unavailable' : `Update to v${mod.version}`}
                </button>
              ) : (
                <button 
                  className="btn btn--ghost btn--lg btn--full" 
                  disabled 
                  style={{ 
                    opacity: 0.8, 
                    color: 'var(--accent)', 
                    border: '1px solid var(--accent)',
                    background: 'rgba(var(--accent-rgb), 0.1)',
                    cursor: 'default'
                  }}
                >
                  <Check size={18} style={{ marginRight: 8 }} /> Installed (Latest)
                </button>
              )
            ) : (isCurrentlyInstalling || batchProgress[modId]) ? (
                  <div className="btn btn--primary btn--lg btn--full" style={{ cursor: 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', position: 'relative' }}>
                      {(downloadProgress > 0 || batchProgress[modId]) && (
                        <div style={{
                          position: 'absolute',
                          bottom: -12,
                          left: -16,
                          right: -16,
                          height: 4,
                          width: (batchProgress[modId] ? `${Math.round((batchProgress[modId].completed / batchProgress[modId].total) * 100)}%` : `${downloadProgress}%`),
                          background: 'var(--accent)',
                          transition: 'width 0.3s ease-out',
                          opacity: 0.5
                        }} />
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {(activeDownloads[modId]?.status === 'waiting' || (!activeDownloads[modId] && batchProgress[modId])) ? (
                          <Package size={16} style={{ opacity: 0.6 }} />
                        ) : (
                          <RefreshCw size={16} className="animate-spin" />
                        )}
                        {batchProgress[modId] ? 'Requirements...' : 
                         activeDownloads[modId]?.status === 'waiting' ? 'Queued...' : 
                         (activeDownloads[modId]?.status === 'downloading' && downloadProgress === 0) ? 'Starting...' :
                         downloadProgress > 0 ? `${Math.round(downloadProgress)}%` : 'Connecting...'}
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelDownload(mod.modId);
                        }}
                        style={{ 
                          background: 'rgba(255,255,255,0.1)', 
                          border: 'none', 
                          color: 'white', 
                          borderRadius: '4px', 
                          padding: '4px 8px', 
                          fontSize: '11px', 
                          fontWeight: 700, 
                          cursor: 'pointer',
                          marginLeft: 'auto',
                          pointerEvents: 'auto'
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn--primary btn--lg btn--full"
                    onClick={handleInstall}
                    disabled={!isOnline}
                    id="install-mod-btn"
                    title={!isOnline ? "Internet connection required" : ""}
                  >
                    <Download size={18} style={{ marginRight: 8 }} /> {!isOnline ? 'Internet Required' : 'Download & Install'}
                  </button>
                )}

            {/* Rollback Support */}
            {localMod && hasBak && (
                <button 
                  className="btn btn--secondary btn--full"
                  onClick={async () => {
                      if (window.confirm('Restore previously installed version?')) {
                          setRestoring(true);
                          const res = await restoreModVersion(localMod.filePath);
                          setRestoring(false);
                          if (res.success) useToastStore.getState().success('Rolled back successfully!');
                          else useToastStore.getState().error('No previous version found.');
                      }
                  }}
                  disabled={restoring}
                  style={{ borderStyle: 'dashed' }}
                >
                  {restoring ? <RefreshCw size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  Restore Previous Version (.bak)
                </button>
            )}
            <button className="btn btn--secondary btn--full" onClick={handleOpenWebsite}>
              <ExternalLink size={16} /> View on Website
            </button>
            <button 
              className={`btn btn--full ${isModFav ? 'btn--accent' : 'btn--secondary'}`}
              onClick={() => toggleFavoriteMod(mod)}
              style={isModFav ? { background: 'rgba(251, 191, 36, 0.1)', borderColor: '#fbbf24', color: '#fbbf24', fontWeight: 800 } : { fontWeight: 800 }}
            >
              <Star size={16} fill={isModFav ? "currentColor" : "none"} />
              {isModFav ? 'Favourited' : 'Add to Favourites'}
            </button>

            <button 
              className={`btn btn--full ${useModHubStore.getState().favoriteAuthors.some(f => f.name.toLowerCase() === (mod.author || '').toLowerCase()) ? 'btn--accent' : 'btn--secondary'}`}
              onClick={() => useModHubStore.getState().toggleFavoriteAuthor({ name: mod.author })}
              style={useModHubStore.getState().favoriteAuthors.some(f => f.name.toLowerCase() === (mod.author || '').toLowerCase()) ? { background: 'rgba(var(--danger-rgb), 0.1)', borderColor: 'var(--danger)', color: 'var(--danger)', fontWeight: 800 } : { fontWeight: 800 }}
            >
              <Heart size={16} fill={useModHubStore.getState().favoriteAuthors.some(f => f.name.toLowerCase() === (mod.author || '').toLowerCase()) ? "currentColor" : "none"} />
              {useModHubStore.getState().favoriteAuthors.some(f => f.name.toLowerCase() === (mod.author || '').toLowerCase()) ? 'Favourite Author' : 'Follow Author'}
            </button>

            <button 
              className={`btn btn--full ${favoriteMods.find(m => (m.modId && modId && String(m.modId) === String(modId)) || (m.fileName && mod.fileName && m.fileName === mod.fileName))?.isMustHave ? 'btn--accent' : 'btn--secondary'}`}
              onClick={() => toggleMustHaveMod(mod)}
              style={favoriteMods.find(m => (m.modId && modId && String(m.modId) === String(modId)) || (m.fileName && mod.fileName && m.fileName === mod.fileName))?.isMustHave ? { background: 'rgba(var(--accent-rgb), 0.1)', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 800 } : { fontWeight: 800 }}
            >
              <Pin size={16} fill={favoriteMods.find(m => (m.modId && modId && String(m.modId) === String(modId)) || (m.fileName && mod.fileName && m.fileName === mod.fileName))?.isMustHave ? "currentColor" : "none"} />
              {favoriteMods.find(m => (m.modId && modId && String(m.modId) === String(modId)) || (m.fileName && mod.fileName && m.fileName === mod.fileName))?.isMustHave ? 'Must-Have Mod' : 'Designate as Must-Have'}
            </button>

            {localMod && (
              <button 
                className={`btn btn--full ${(localMod.tags || []).includes('lock-updates') ? 'btn--accent' : 'btn--secondary'}`}
                onClick={() => {
                  const isLocked = (localMod.tags || []).includes('lock-updates');
                  const tags = isLocked 
                    ? localMod.tags.filter(t => t !== 'lock-updates') 
                    : [...(localMod.tags || []), 'lock-updates'];
                  setModTags(localMod.fileName || localMod.modId, [...new Set(tags)]);
                  useToastStore.getState().success(isLocked ? 'Auto-updates unlocked' : 'Auto-updates locked for this mod');
                }}
                style={(localMod.tags || []).includes('lock-updates') ? { background: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--danger)', color: 'var(--danger)', fontWeight: 800 } : { fontWeight: 800 }}
              >
                <Lock size={16} fill={(localMod.tags || []).includes('lock-updates') ? "currentColor" : "none"} />
                {(localMod.tags || []).includes('lock-updates') ? 'Auto-Updates Locked' : 'Lock Version (Disable Auto-Update)'}
              </button>
            )}
          </div>

          {/* Metadata Card */}
          <div className="mod-detail__meta-card">
            {!mod.isDLC && (
              <>
                <div className="mod-detail__meta-row">
                  <span className="mod-detail__meta-label">Version</span>
                  <span className="mod-detail__meta-value">{mod.version || '—'}</span>
                </div>
                <div className="mod-detail__meta-row">
                  <span className="mod-detail__meta-label">Author</span>
                  <span className="mod-detail__meta-value">{mod.author || '—'}</span>
                </div>
                {mod.fileSize && (
                  <div className="mod-detail__meta-row">
                    <span className="mod-detail__meta-label">File Size</span>
                    <span className="mod-detail__meta-value">{mod.fileSize}</span>
                  </div>
                )}
              </>
            )}
            <div className="mod-detail__meta-row">
              <span className="mod-detail__meta-label">Rating</span>
              <span className="mod-detail__meta-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Star size={14} fill="var(--warning)" color="var(--warning)" />
                {mod.rating || '—'}
              </span>
            </div>
            {/* Additional metadata from scraper */}
            {mod.metadata && Object.entries(mod.metadata).map(([key, value]) => {
              if (['author', 'version', 'file size'].includes(key.toLowerCase())) return null;
              return (
                <div className="mod-detail__meta-row" key={key}>
                  <span className="mod-detail__meta-label" style={{ textTransform: 'capitalize' }}>{key}</span>
                  <span className="mod-detail__meta-value" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{value}</span>
                </div>
              );
            })}
          </div>

          {/* Custom Tagging Section */}
          {localMod && (
            <div style={{ marginTop: 'var(--sp-6)', padding: 'var(--sp-4)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 'var(--sp-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={14} /> Custom Tags
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {(localMod.tags || []).length > 0 ? localMod.tags.map((tag, i) => (
                  <span 
                    key={i} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 4, 
                      padding: '2px 8px', 
                      background: 'var(--accent-dim)', 
                      color: 'var(--accent)', 
                      borderRadius: 100, 
                      fontSize: 10, 
                      fontWeight: 700 
                    }}
                  >
                    {tag}
                    <span 
                      style={{ cursor: 'pointer', opacity: 0.6, fontSize: '14px' }} 
                      onClick={() => {
                        const newTags = localMod.tags.filter(t => t !== tag);
                        setModTags(localMod.fileName || localMod.modId, newTags);
                      }}
                    >
                      ×
                    </span>
                  </span>
                )) : (
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>No tags added yet.</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 4 }}>
                <input 
                  type="text" 
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      const tags = [...(localMod.tags || []), newTag.trim()];
                      setModTags(localMod.fileName || localMod.modId, [...new Set(tags)]);
                      setNewTag('');
                    }
                  }}
                  placeholder="Add tag..."
                  style={{ 
                    flex: 1, 
                    background: 'var(--bg-card)', 
                    border: '1px solid var(--border)', 
                    borderRadius: 'var(--radius-sm)', 
                    color: 'var(--text-primary)', 
                    fontSize: '11px', 
                    padding: '4px 8px' 
                  }}
                />
                <button 
                  className="btn btn--secondary btn--xs"
                  onClick={() => {
                    if (newTag.trim()) {
                      const tags = [...(localMod.tags || []), newTag.trim()];
                      setModTags(localMod.fileName || localMod.modId, [...new Set(tags)]);
                      setNewTag('');
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      </div>
    );
  }
