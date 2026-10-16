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
import { compareVersions, resolveRecursiveDependencies, matchModWithDependency, isMapCategory, isModMatch } from '../utils/modUtils';
import DependencyDownloadModal from '../components/common/DependencyDownloadModal';



const getResolvedMetadataObj = (dep, resolvedMetadata = {}) => {
  if (!dep || !resolvedMetadata) return null;
  
  if (typeof dep === 'object') {
    if (dep.url && resolvedMetadata[dep.url]) return resolvedMetadata[dep.url];
    if (dep.url) {
      const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
      if (idMatch) {
        const idKey = `id_${parseInt(idMatch[1], 10)}`;
        if (resolvedMetadata[idKey]) return resolvedMetadata[idKey];
      }
      const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
      if (fileMatch) {
        const fileKey = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
        if (resolvedMetadata[fileKey]) return resolvedMetadata[fileKey];
      }
    }
    if (dep.modId && resolvedMetadata[`id_${dep.modId}`]) return resolvedMetadata[`id_${dep.modId}`];
    if (dep.fileName && resolvedMetadata[dep.fileName.replace(/\.zip$/i, '').toLowerCase()]) {
      return resolvedMetadata[dep.fileName.replace(/\.zip$/i, '').toLowerCase()];
    }
    if (dep.modName && resolvedMetadata[dep.modName.toLowerCase()]) {
      return resolvedMetadata[dep.modName.toLowerCase()];
    }
  }
  
  if (typeof dep === 'string') {
    const clean = dep.replace(/\.zip$/i, '').toLowerCase();
    if (resolvedMetadata[clean]) return resolvedMetadata[clean];
  }
  
  const depTitle = typeof dep === 'string' ? dep : dep.title;
  if (depTitle) {
    if (resolvedMetadata[depTitle]) return resolvedMetadata[depTitle];
    if (resolvedMetadata[`title_${depTitle.toLowerCase()}`]) {
      return resolvedMetadata[`title_${depTitle.toLowerCase()}`];
    }
  }
  
  return null;
};

const getDependencyUniqueKey = (dep, resolvedMetadata = {}) => {
  let depId = null;
  let fallbackFileName = null;
  
  if (typeof dep === 'object' && dep.url) {
      const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
      if (idMatch) depId = parseInt(idMatch[1], 10).toString();
      const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
      if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
  } else if (typeof dep === 'object' && dep.modId) {
      depId = String(dep.modId);
  }
  
  const resolvedObj = getResolvedMetadataObj(dep, resolvedMetadata);
  if (resolvedObj && resolvedObj.modId) {
      depId = String(resolvedObj.modId);
  }
  
  const depString = fallbackFileName || (typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.fileName || dep.title || ''));
  const cleanModName = (name) => name ? name.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim() : '';
  const cleanedName = cleanModName(depString).toLowerCase();
  
  return depId ? `id_${depId}` : `name_${cleanedName}`;
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
  const { activeDownloads, batchProgress, addDownload, removeDownload, cancelDownload, sessionInstalled } = useDownloadStore();
  const { mods: localMods } = useLocalModsStore();
  const { favoriteMods, toggleFavoriteMod, toggleMustHaveMod, modCache, loadCache } = useModHubStore();
  
  const localMod = useMemo(() => {
    if (!mod || !localMods || localMods.length === 0) return null;
    const cleanModId = (modId || mod.modId) ? String(modId || mod.modId).replace(/^0+/, '') : null;

    // 1. Try exact ModHub ID match (with leading zero normalization)
    if (cleanModId) {
      const idMatch = localMods.find(lm => lm.modId && String(lm.modId).replace(/^0+/, '') === cleanModId);
      if (idMatch) return idMatch;
    }

    // Helper functions for names
    const cleanStr = (s) => s ? String(s).trim().toLowerCase() : '';
    const getBaseName = (str) => {
      if (!str) return '';
      const match = str.match(/([^/\\]+)\.zip$/i) || [null, str];
      return match[1].replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    };

    const remoteFileStr = mod.fileName || (mod.downloadUrl ? mod.downloadUrl.split('?')[0].split('/').pop() : null);
    const remoteExactFile = remoteFileStr ? cleanStr(remoteFileStr.split(/[/\\]/).pop()) : null;
    const remoteBase = remoteFileStr ? getBaseName(remoteFileStr) : null;

    // 2. Physical filename check (exact zip name or base name)
    if (remoteFileStr) {
      const fileMatch = localMods.find(lm => {
        if (!lm.fileName) return false;
        const cleanLmId = lm.modId ? String(lm.modId).replace(/^0+/, '') : null;
        if (cleanModId && cleanLmId && cleanModId !== cleanLmId) return false;

        const lmExactFile = cleanStr(lm.fileName.split(/[/\\]/).pop());
        if (remoteExactFile && lmExactFile === remoteExactFile) return true;
        const lmBase = getBaseName(lm.fileName);
        return remoteBase && lmBase === remoteBase;
      });
      if (fileMatch) return fileMatch;
    }

    // 3. Technical mod name check
    if (mod.modName) {
      const remoteName = cleanStr(mod.modName);
      const nameMatch = localMods.find(lm => {
        const cleanLmId = lm.modId ? String(lm.modId).replace(/^0+/, '') : null;
        if (cleanModId && cleanLmId && cleanModId !== cleanLmId) return false;

        const lmName = cleanStr(lm.modName);
        if (lmName && lmName === remoteName) return true;
        const lmBase = getBaseName(lm.modName);
        return remoteBase && lmBase === remoteBase;
      });
      if (nameMatch) return nameMatch;
    }

    // 4. Try clean alphanumeric title match (safeguarded against ID collision)
    const cleanModTitle = cleanStr((mod.title || '').replace(/\([^)]+\)/g, '').replace(/[^a-z0-9]/gi, ''));
    if (cleanModTitle) {
      const titleMatch = localMods.find(lm => {
        const cleanLmId = lm.modId ? String(lm.modId).replace(/^0+/, '') : null;
        if (cleanModId && cleanLmId && cleanModId !== cleanLmId) return false;

        const cleanLmTitle = cleanStr((lm.title || '').replace(/\([^)]+\)/g, '').replace(/[^a-z0-9]/gi, ''));
        return cleanLmTitle && cleanLmTitle === cleanModTitle;
      });
      if (titleMatch) return titleMatch;
    }

    return null;
  }, [mod, modId, localMods]);

  const hasUpdate = useMemo(() => {
    if (!mod || !localMod) return false;
    if (!mod.version || !localMod.version) return false;
    // remote (mod.version) > installed (localMod.version)
    return compareVersions(mod.version, localMod.version) > 0;
  }, [mod, localMod]);

  const rawTargetId = modId || mod?.modId;
  const cleanTargetId = rawTargetId ? String(rawTargetId).replace(/^0+/, '') : null;
  const currentDownload = activeDownloads[rawTargetId] || (cleanTargetId ? activeDownloads[cleanTargetId] : null);
  const isCurrentlyInstalling = !!currentDownload && currentDownload.status !== 'success';
  const isSessionInstalled = (cleanTargetId && sessionInstalled?.[cleanTargetId]) || (mod?.title && sessionInstalled && Object.values(sessionInstalled).some(v => v && v.toLowerCase() === mod.title.toLowerCase()));
  const showAsInstalled = !!localMod || currentDownload?.status === 'success' || !!isSessionInstalled;
  const downloadProgress = currentDownload?.progress || 0;

  const isModFav = useMemo(() => {
    if (!mod && !modId) return false;
    const targetObj = mod || { modId };
    return favoriteMods.some(f => f.isFavorite !== false && isModMatch(f, targetObj));
  }, [mod, modId, favoriteMods]);

  const isMustHave = useMemo(() => {
    if (!mod && !modId) return false;
    const targetObj = mod || { modId };
    return favoriteMods.some(f => f.isMustHave && isModMatch(f, targetObj));
  }, [mod, modId, favoriteMods]);
  const isOnline = useSettingsStore(s => s.isOnline);
  const { conflicts, missingDependencies, setModTags, restoreModVersion, scanMods } = useLocalModsStore();
  const [newTag, setNewTag] = useState('');
  const [resolvedMetadata, setResolvedMetadata] = useState({});
  const [restoring, setRestoring] = useState(false);
  const [hasBak, setHasBak] = useState(false);
  const [showDepModal, setShowDepModal] = useState(false);

  // ── Dependency Management ──

  const uniqueDependencies = useMemo(() => {
    if (!mod || !mod.dependencies) return [];
    
    const depsList = [];
    const seenKeys = new Set();
    
    const resolveDeps = (depList) => {
        if (!depList) return;
        depList.forEach(dep => {
            const key = getDependencyUniqueKey(dep, resolvedMetadata);
            
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                depsList.push(dep);
                
                // Recursively check if this dependency is installed and has its own dependencies
                const match = localMods ? localMods.find(m => matchModWithDependency(m, dep, resolvedMetadata)) : null;
                
                if (match && match.dependencies && match.dependencies.length > 0) {
                    resolveDeps(match.dependencies);
                }
            }
        });
    };
    
    resolveDeps(mod.dependencies);
    
    // Sort to prioritize dependencies with ModHub URLs
    const sortedDirect = depsList.sort((a, b) => {
      const aUrl = typeof a === 'object' && a.url;
      const bUrl = typeof b === 'object' && b.url;
      return (bUrl ? 1 : 0) - (aUrl ? 1 : 0);
    });

    // 2. Fetch the true recursive missing list to catch any that were missed by simple traversal
    const mapKey = mod.modName || mod.fileName;
    if (mod) {
        const { missing } = resolveRecursiveDependencies(mod, localMods, [], resolvedMetadata);
        const recursiveMissing = Array.from(missing);
        
        recursiveMissing.forEach(mName => {
            // Check if this missing dependency is already in sortedDirect
            const exists = sortedDirect.some(d => {
                const dName = (typeof d === 'string' ? d : (d.fileName || d.title || d.modName || '')).toLowerCase();
                return dName === mName || dName.includes(mName) || mName.includes(dName);
            });
            if (!exists) {
                sortedDirect.push(mName); // Append missing recursive dep so it shows up in UI
            }
        });
    }
    
    return sortedDirect;
  }, [mod?.dependencies, localMods, resolvedMetadata, mod?.modName, mod?.fileName]);

  const dependencyStatus = useMemo(() => {
    if (uniqueDependencies.length === 0) return { allMet: true, missingCount: 0, statuses: {}, missingList: [] };
    if (!localMods) return { allMet: false, missingCount: uniqueDependencies.length, statuses: {}, missingList: uniqueDependencies };

    let directMissingCount = 0;
    const statuses = {};
    const directMissingList = [];

    uniqueDependencies.forEach(dep => {
        let isInstalled = false;
        
        const resolvedObj = getResolvedMetadataObj(dep, resolvedMetadata);
        const depTitle = typeof dep === 'string' ? dep : (dep.title || dep.modName || dep.technicalName || '');
        
        let depId = (typeof dep === 'object' && dep.modId) ? String(dep.modId).replace(/^0+/, '') : (resolvedObj && resolvedObj.modId ? String(resolvedObj.modId).replace(/^0+/, '') : null);
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
            const depClean = (fallbackFileName || depTitle || '').toLowerCase();
            if (depClean && Object.values(sessionInstalled).some(val => val && val.toLowerCase() === depClean)) {
                isInstalled = true;
            }
        }
        
        if (!isInstalled) {
            isInstalled = localMods.some(m => matchModWithDependency(m, dep, resolvedMetadata));
        }

        const key = getDependencyUniqueKey(dep, resolvedMetadata);
        statuses[key] = isInstalled;
        if (!isInstalled) {
            directMissingCount++;
            directMissingList.push(dep);
        }
    });

    // Determine recursive missing using exactly the same logic as InstalledModsPage
    let missingList = directMissingList;
    let missingCount = directMissingCount;
    
    if (mod) {
        const { missing } = resolveRecursiveDependencies(mod, localMods, sessionInstalled, resolvedMetadata);
        const recursiveMissing = Array.from(missing);
        
        if (recursiveMissing.length > 0) {
            // Reconcile recursive string lists into original dependency objects where possible
            missingList = recursiveMissing.map(mName => {
                const existingDirect = directMissingList.find(d => {
                    const dName = (typeof d === 'string' ? d : (d.fileName || d.title || d.modName || '')).toLowerCase();
                    return dName === mName || dName.includes(mName) || mName.includes(dName);
                });
                return existingDirect || mName; // Return original object with URL/metadata if it was a direct dep
            });
            missingCount = missingList.length;
        }
    }

    return {
        allMet: missingCount === 0,
        missingCount,
        statuses,
        missingList
    };
  }, [uniqueDependencies, localMods, sessionInstalled, resolvedMetadata, mod?.modName, mod?.fileName]);

  const images = useMemo(() => {
    if (!mod) return [];
    let rawImages = (mod.images && mod.images.length > 0) ? mod.images : (mod.image ? [mod.image] : []);
    if ((!rawImages || rawImages.length === 0) && mod.iconData) {
      rawImages = [mod.iconData];
    }
    const unique = [];
    const seen = new Set();
    rawImages.forEach(img => {
      if (!img) return;
      let normalized = img;
      if (normalized.startsWith('//')) {
        normalized = `https:${normalized}`;
      }
      const isDataOrDlc = mod.isDLC || normalized.startsWith('data:') || normalized.startsWith('file:');
      const key = isDataOrDlc ? normalized : (normalized.split('/').pop().split('?')[0]);
      if (key && !seen.has(key)) {
        unique.push(normalized);
        seen.add(key);
      }
    });
    return unique;
  }, [mod?.images, mod?.image, mod?.iconData, mod?.isDLC]);

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
    if (!url) return;
    let targetUrl = url;
    if (targetUrl.startsWith('//')) {
      targetUrl = `https:${targetUrl}`;
    }
    if (proxiedImages[targetUrl] || proxiedImages[url]) return;
    if (targetUrl.startsWith('data:') || targetUrl.startsWith('file:')) {
      setProxiedImages(prev => ({ ...prev, [url]: targetUrl, [targetUrl]: targetUrl }));
      return;
    }
    if (!window.api?.images?.proxy) return;
    try {
      const proxied = await window.api.images.proxy(targetUrl);
      if (proxied) {
        setProxiedImages(prev => ({ ...prev, [url]: proxied, [targetUrl]: proxied }));
        setImageFailures(prev => {
          if (!prev[url] && !prev[targetUrl]) return prev;
          const next = { ...prev };
          delete next[url];
          delete next[targetUrl];
          return next;
        });
      } else {
        setImageFailures(prev => ({ ...prev, [url]: true, [targetUrl]: true }));
      }
    } catch (err) {
      console.error('Proxy failed:', err);
      setImageFailures(prev => ({ ...prev, [url]: true, [targetUrl]: true }));
    }
  };

  useEffect(() => {
    if (images && images.length > 0) {
      images.forEach(img => resolveProxy(img));
    }
  }, [images]);

  const getImageSrc = (imgUrl) => {
    if (!imgUrl) return null;
    if (imgUrl.startsWith('data:') || imgUrl.startsWith('file:')) return imgUrl;
    return proxiedImages[imgUrl] || null;
  };

  const formattedDescription = useMemo(() => {
    if (!mod?.description) return '';
    const desc = String(mod.description).trim();
    if (!desc.includes('<br') && !desc.includes('<p') && !desc.includes('<div') && desc.includes('\n')) {
      return desc.replace(/\n/g, '<br />');
    }
    return desc;
  }, [mod?.description]);

  const loadModDetail = async () => {
    setLoading(true);
    try {
      if (fileName && fileName.toLowerCase().endsWith('.dlc')) {
          useToastStore.getState().info("Official DLC content is system-managed.");
          navigate('/installed', { replace: true });
          return;
      }
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
                  fileSize: local.size ? (local.size >= 1024 * 1024 * 1024 ? `${(local.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : `${(local.size / (1024 * 1024)).toFixed(2)} MB`) : null
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
                  fileSize: local.size ? (local.size >= 1024 * 1024 * 1024 ? `${(local.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : `${(local.size / (1024 * 1024)).toFixed(2)} MB`) : null
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
                      const cleanId = String(parseInt(detail.modId, 10));
                      resolvedMetaUpdate[`id_${cleanId}`] = detail;
                      if (detail.url) resolvedMetaUpdate[detail.url] = detail;
                      if (detail.fileName) {
                          const techName = detail.fileName.replace(/\.zip$/i, '').toLowerCase();
                          resolvedMetaUpdate[techName] = detail;
                      }
                      if (detail.title) {
                          resolvedMetaUpdate[`title_${detail.title.toLowerCase()}`] = detail;
                      }
                  }
              });
              return resolvedMetaUpdate;
          } catch (err) {
              console.error('Failed to prefetch dependency details:', err);
              return {};
          }
      };

      // Check store's modCache or load it if empty
      let currentCache = modCache || {};
      if (Object.keys(currentCache).length === 0 && loadCache) {
          try {
              await loadCache();
              currentCache = useModHubStore.getState().modCache || {};
          } catch (_) {}
      }

      // Match in cache by effectiveModId or fileName
      let cachedEntry = null;
      if (effectiveModId) {
          cachedEntry = currentCache[String(effectiveModId)] || currentCache[String(effectiveModId).replace(/^0+/, '')];
      }
      if (!cachedEntry && fileName) {
          const decodedFile = decodeURIComponent(fileName);
          const rawTargetName = decodedFile.replace(/\.zip$/i, '').toLowerCase().trim();
          const cleanTargetName = rawTargetName.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/gi, '');
          cachedEntry = Object.values(currentCache).find(m => {
              if (!m) return false;
              if (m.modId && effectiveModId && String(m.modId) === String(effectiveModId)) return true;
              if (m.fileName) {
                  const mFile = m.fileName.replace(/\.zip$/i, '').toLowerCase().trim();
                  if (mFile === rawTargetName) return true;
                  const mBase = mFile.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/gi, '');
                  if (mBase && cleanTargetName && mBase === cleanTargetName) return true;
              }
              if (m.modName) {
                  const mName = m.modName.toLowerCase().trim();
                  if (mName === rawTargetName) return true;
                  const mBase = mName.replace(/^(?:fs25|fs22|pdlc)_/i, '').replace(/[^a-z0-9]/gi, '');
                  if (mBase && cleanTargetName && mBase === cleanTargetName) return true;
              }
              return false;
          });
      }

      if (cachedEntry) {
          if (!effectiveModId && cachedEntry.modId) {
              effectiveModId = cachedEntry.modId;
          }
          modData = {
              ...cachedEntry,
              ...(modData || {}),
              title: modData?.title || cachedEntry.title,
              author: cachedEntry.author || modData?.author,
              // Cached/remote description takes precedence over empty or unformatted local XML
              description: (cachedEntry.description && cachedEntry.description.trim().length > 0)
                  ? cachedEntry.description
                  : (modData?.description || ''),
              // Screenshots take precedence over single icon
              images: (cachedEntry.images && cachedEntry.images.length > 0)
                  ? cachedEntry.images
                  : (modData?.images && modData.images.length > 0 ? modData.images : (cachedEntry.image ? [cachedEntry.image] : [])),
              techData: { ...(cachedEntry.techData || {}), ...(modData?.techData || {}) },
              metadata: { ...(cachedEntry.metadata || {}), ...(modData?.metadata || {}) }
          };
      } else if (!modData && effectiveModId && currentCache[String(effectiveModId)]) {
          modData = { ...currentCache[String(effectiveModId)] };
      }

      // If local or cached mod data exists, render it immediately to prevent skeleton loading screens
      if (modData) {
          setMod(modData);
          setLoading(false);
      }

      // If we don't have an effectiveModId but are online and have a title/fileName, try to find the mod on ModHub
      if (!effectiveModId && isOnline && modData) {
          try {
              const query = (modData.title || modData.modName || fileName || '').replace(/\.zip$/i, '').trim();
              const cleanQuery = query.replace(/^(?:fs25|fs22|pdlc)[_\\s]/i, '').replace(/[_\\-]/g, ' ').trim();
              if (cleanQuery && window.api?.modhub?.search) {
                  const searchRes = await window.api.modhub.search({ query: cleanQuery, page: 0 });
                  if (searchRes && searchRes.mods && searchRes.mods.length > 0) {
                      const cleanTarget = cleanQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
                      const match = searchRes.mods.find(m => {
                          const mTitle = (m.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          const mFile = (m.fileName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          return (cleanTarget && mTitle === cleanTarget) || (cleanTarget && mFile === cleanTarget);
                      });
                      if (match && match.modId) {
                          effectiveModId = match.modId;
                      }
                  }
              }
          } catch (e) {
              console.warn('Search for remote ModHub details failed:', e);
          }
      }

      // Resolve remote map/mod data asynchronously if online
      if (effectiveModId) {
          try {
              const remote = await window.api.modhub.fetchModDetail({ modId: effectiveModId });
              if (remote && !remote.error) {
                  const remoteDeps = remote.dependencies || [];
                  const updatedModData = {
                      ...(modData || {}),
                      ...remote,
                      // Remote description takes precedence over empty local description
                      description: (remote.description && remote.description.trim().length > 0)
                          ? remote.description
                          : (modData?.description || ''),
                      // Remote screenshots take precedence over local single icon
                      images: (remote.images && remote.images.length > 0)
                          ? remote.images
                          : (modData?.images && modData.images.length > 0 ? modData.images : (remote.image ? [remote.image] : [])),
                      metadata: { ...(modData?.metadata || {}), ...(remote.metadata || {}) },
                      techData: { ...(modData?.techData || {}), ...(remote.techData || {}) }
                  };
                  if (remoteDeps.length > 0) updatedModData.dependencies = remoteDeps;
                  
                  setMod(updatedModData);

                  // Background prefetch for dependency metadata
                  prefetchDependencies(remoteDeps).then(resolvedMetaUpdate => {
                      if (Object.keys(resolvedMetaUpdate).length > 0) {
                          setResolvedMetadata(prev => ({ ...prev, ...resolvedMetaUpdate }));
                      }
                  }).catch(() => {});
              } else if (!modData && remote) {
                  setMod(remote);
              }
          } catch (err) {
              console.warn('Remote fetch failed, falling back to local/cached metadata');
          }
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
        const key = getDependencyUniqueKey(dep, resolvedMetadata);
        const isInstalled = dependencyStatus.statuses[key] || false;
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
    
    // Register in global store and fire starting toast
    useToastStore.getState().info(`Downloading ${mod.title}...`, { id: `dl-toast-${mod.modId}` });
    addDownload(mod.modId, mod.title, mod.images?.[0]);

    try {
      const isMap = mod.isMap || isMapCategory(mod.category) || (localMod && localMod.isMap);
      const cleanTitle = mod.title.replace(/\([^)]+\)/g, '').trim();
      const subFolder = parentFolder || null;


      // 2. Normal install flow
      const result = await window.api.mods.install({
        modId: mod.modId,
        modTitle: mod.title,
        downloadUrl: mod.downloadUrl || '',
        category: mod.category || '',
        subFolder
      });
      if (!result.success) {
        useToastStore.getState().error(`Failed: ${result.error}`, { id: `dl-toast-${mod.modId}` });
        removeDownload(mod.modId);
      }
    } catch (err) {
      useToastStore.getState().error(`Install failed: ${err.message}`, { id: `dl-toast-${mod?.modId || modId}` });
      removeDownload(mod.modId);
    }
  };

  const handleOpenWebsite = () => {
    const targetId = modId || mod?.modId;
    if (targetId) {
      window.api.modhub.openInBrowser(targetId);
    } else if (mod?.url) {
      window.api.shell.openExternal(mod.url);
    } else if (mod?.title) {
      window.api.shell.openExternal(`https://www.farming-simulator.com/mods.php?title=${encodeURIComponent(mod.title)}`);
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
            {images.length > 0 ? (() => {
              const currentImg = images[activeImage] || images[0];
              const currentSrc = getImageSrc(currentImg);
              const hasFailed = imageFailures[currentImg];

              if (hasFailed) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    <Package size={64} />
                  </div>
                );
              }

              if (!currentSrc) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    <RefreshCw size={36} className="spin" style={{ opacity: 0.6 }} />
                  </div>
                );
              }

              return (
                <img 
                  src={currentSrc} 
                  alt={mod.title} 
                  onError={() => { 
                    setImageFailures(prev => ({ ...prev, [currentImg]: true }));
                  }}
                />
              );
            })() : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <Package size={64} />
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="mod-detail__gallery-thumbs">
              {images.map((img, idx) => {
                const thumbSrc = getImageSrc(img);
                const hasFailed = imageFailures[img];
                return (
                  <div
                    key={idx}
                    className={`mod-detail__gallery-thumb ${idx === activeImage ? 'mod-detail__gallery-thumb--active' : ''}`}
                    onClick={() => setActiveImage(idx)}
                  >
                    {thumbSrc ? (
                      <img 
                        src={thumbSrc} 
                        alt={`Screenshot ${idx + 1}`} 
                        onError={() => {
                          setImageFailures(prev => ({ ...prev, [img]: true }));
                        }}
                        style={{ opacity: hasFailed ? 0.3 : 1, filter: hasFailed ? 'grayscale(1)' : 'none' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'rgba(255,255,255,0.03)' }}>
                        <Package size={20} style={{ opacity: 0.4 }} />
                      </div>
                    )}
                  </div>
                );
              })}
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

          {formattedDescription && (
            <div style={{ marginTop: 'var(--sp-6)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 'var(--sp-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={14} /> Description
              </div>
              <div
                className="mod-detail__desc"
                dangerouslySetInnerHTML={{ __html: formattedDescription }}
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
                    <Package size={16} /> Required Mods & Dependencies ({uniqueDependencies.length})
                  </div>
                  {dependencyStatus.missingCount > 0 && isOnline && (
                    <button
                      className="btn btn--primary btn--sm animate-pulse-subtle"
                      onClick={() => setShowDepModal(true)}
                      style={{
                        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                        color: '#000',
                        fontWeight: 800,
                        fontSize: 11,
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)',
                        cursor: 'pointer'
                      }}
                    >
                      <Download size={14} /> Download {dependencyStatus.missingCount} Missing Required Mods
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {uniqueDependencies.map((dep) => {
                  const depKey = getDependencyUniqueKey(dep, resolvedMetadata);
                  const depTitle = typeof dep === 'string' ? dep : dep.title;

                  const resolvedObj = getResolvedMetadataObj(dep, resolvedMetadata);

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
                  const isInstalled = dependencyStatus.statuses[depKey] || false;
                  
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
                    <div key={depKey} style={{ 
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
                             onClick={() => navigate(`/modhub/mod/${depId}`, { state: { parentFolder: (mod.isMap || isMapCategory(mod.category)) ? (mod.title || '').replace(/[\\/:*?"<>|]/g, '_').trim() : parentFolder } })}
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
                          onClick={() => navigate(`/modhub/mod/${depId}`, { state: { parentFolder: (mod.isMap || isMapCategory(mod.category)) ? (mod.title || '').replace(/[\\/:*?"<>|]/g, '_').trim() : parentFolder } })}
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
            {(isCurrentlyInstalling || batchProgress[modId]) ? (
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
                      borderRadius: '0 0 var(--radius-md) var(--radius-md)'
                    }} />
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {batchProgress[modId] ? 'Requirements...' : 
                     (activeDownloads[modId]?.status === 'waiting' || activeDownloads[modId]?.status === 'queued') ? 'Queued...' : 
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
            ) : showAsInstalled ? (
              <>
                {dependencyStatus.missingCount > 0 && (
                  <button
                    className="btn btn--primary btn--lg btn--full"
                    onClick={() => setShowDepModal(true)}
                    disabled={!isOnline}
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      color: '#000',
                      fontWeight: 800,
                      marginBottom: 8,
                      boxShadow: '0 4px 16px rgba(251, 191, 36, 0.3)'
                    }}
                  >
                    <Download size={18} style={{ marginRight: 8 }} /> Download {dependencyStatus.missingCount} Missing Required Mods
                  </button>
                )}
                {hasUpdate ? (
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
                )}
              </>
            ) : (
              <>
                {uniqueDependencies.length > 0 && (
                  <button
                    className="btn btn--primary btn--lg btn--full animate-pulse-subtle"
                    onClick={() => setShowDepModal(true)}
                    disabled={!isOnline}
                    style={{
                      background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                      color: '#000',
                      fontWeight: 800,
                      marginBottom: 8,
                      boxShadow: '0 4px 20px rgba(251, 191, 36, 0.4)'
                    }}
                  >
                    <Download size={18} style={{ marginRight: 8 }} /> Download All ({uniqueDependencies.length + 1} Mods)
                  </button>
                )}
                <button
                  className={`btn ${uniqueDependencies.length > 0 ? 'btn--secondary' : 'btn--primary'} btn--lg btn--full`}
                  onClick={handleInstall}
                  disabled={!isOnline}
                  id="install-mod-btn"
                  title={!isOnline ? "Internet connection required" : ""}
                >
                  <Download size={18} style={{ marginRight: 8 }} /> {!isOnline ? 'Internet Required' : (uniqueDependencies.length > 0 ? 'Download Map Only' : 'Download & Install')}
                </button>
              </>
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

            {!(mod?.isMap || isMapCategory(mod?.category) || (localMod && localMod.isMap)) && (
              <button 
                className={`btn btn--full ${isModFav ? 'btn--accent' : 'btn--secondary'}`}
                onClick={() => toggleFavoriteMod(mod)}
                style={isModFav ? { background: 'rgba(251, 191, 36, 0.1)', borderColor: '#fbbf24', color: '#fbbf24', fontWeight: 800 } : { fontWeight: 800 }}
              >
                <Star size={16} fill={isModFav ? "currentColor" : "none"} />
                {isModFav ? 'Favourited' : 'Add to Favourites'}
              </button>
            )}

            <button 
              className={`btn btn--full ${useModHubStore.getState().favoriteAuthors.some(f => f.name.toLowerCase() === (mod.author || '').toLowerCase()) ? 'btn--accent' : 'btn--secondary'}`}
              onClick={() => useModHubStore.getState().toggleFavoriteAuthor({ name: mod.author })}
              style={useModHubStore.getState().favoriteAuthors.some(f => f.name.toLowerCase() === (mod.author || '').toLowerCase()) ? { background: 'rgba(var(--danger-rgb), 0.1)', borderColor: 'var(--danger)', color: 'var(--danger)', fontWeight: 800 } : { fontWeight: 800 }}
            >
              <Heart size={16} fill={useModHubStore.getState().favoriteAuthors.some(f => f.name.toLowerCase() === (mod.author || '').toLowerCase()) ? "currentColor" : "none"} />
              {useModHubStore.getState().favoriteAuthors.some(f => f.name.toLowerCase() === (mod.author || '').toLowerCase()) ? 'Favourite Author' : 'Follow Author'}
            </button>

            {!(mod?.isMap || isMapCategory(mod?.category) || (localMod && localMod.isMap)) && (
              <button 
                className={`btn btn--full ${isMustHave ? 'btn--accent' : 'btn--secondary'}`}
                onClick={() => toggleMustHaveMod(mod)}
                style={isMustHave ? { background: 'rgba(var(--accent-rgb), 0.1)', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 800 } : { fontWeight: 800 }}
              >
                <Pin size={16} fill={isMustHave ? "currentColor" : "none"} />
                {isMustHave ? 'Must-Have Mod' : 'Designate as Must-Have'}
              </button>
            )}

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
            <div className="mod-detail__meta-row">
              <span className="mod-detail__meta-label">Rating</span>
              <span className="mod-detail__meta-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Star size={14} fill="var(--warning)" color="var(--warning)" />
                {mod.rating || '—'}
              </span>
            </div>
            {/* Category */}
            {(mod.category || mod.metadata?.Category) && (
              <div className="mod-detail__meta-row">
                <span className="mod-detail__meta-label">Category</span>
                <span className="mod-detail__meta-value">{mod.category || mod.metadata?.Category}</span>
              </div>
            )}
            {/* Additional metadata from scraper */}
            {mod.metadata && Object.entries(mod.metadata).map(([key, value]) => {
              if (['author', 'version', 'file size', 'category'].includes(key.toLowerCase())) return null;
              return (
                <div className="mod-detail__meta-row" key={key}>
                  <span className="mod-detail__meta-label" style={{ textTransform: 'capitalize' }}>{key}</span>
                  <span className="mod-detail__meta-value" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{value}</span>
                </div>
              );
            })}
            {/* Technical Specifications (Price, HP, Capacity, Speed, Weight) */}
            {(() => {
              const tech = mod.techData;
              if (!tech) return null;
              const isMap = Boolean(mod.isMap || isMapCategory(mod.category) || isMapCategory(mod.metadata?.Category));
              const price = tech.price || (tech.priceMin && tech.priceMax ? tech.priceMin : 0);
              const priceDisplay = (tech.priceMin && tech.priceMax && tech.priceMin !== tech.priceMax) 
                ? `$${tech.priceMin.toLocaleString()} - $${tech.priceMax.toLocaleString()}`
                : (price > 0 ? `$${price.toLocaleString()}` : null);
              const hpDisplay = (tech.hpMin && tech.hpMax && tech.hpMin !== tech.hpMax)
                ? `${tech.hpMin} - ${tech.hpMax} HP`
                : (tech.hp > 0 ? `${tech.hp} HP` : null);
              const capDisplay = (tech.capacityMin && tech.capacityMax && tech.capacityMin !== tech.capacityMax)
                ? `${tech.capacityMin.toLocaleString()} - ${tech.capacityMax.toLocaleString()} L`
                : (tech.capacity > 0 ? `${tech.capacity.toLocaleString()} L` : null);
              const unitCapDisplay = (tech.unitCapacity > 0 && tech.unitCapacityType)
                ? `${tech.unitCapacity.toLocaleString()} ${tech.unitCapacityType}`
                : null;
              const speedDisplay = tech.speed > 0 ? `${tech.speed} km/h` : null;
              const weightDisplay = tech.weight > 0 ? `${tech.weight} t` : null;

              return (
                <>
                  {!isMap && priceDisplay && (
                    <div className="mod-detail__meta-row">
                      <span className="mod-detail__meta-label">Price</span>
                      <span className="mod-detail__meta-value">{priceDisplay}</span>
                    </div>
                  )}
                  {!isMap && hpDisplay && (
                    <div className="mod-detail__meta-row">
                      <span className="mod-detail__meta-label">{tech.hpIsRequirement ? 'Power Required' : 'Power'}</span>
                      <span className="mod-detail__meta-value">{hpDisplay}</span>
                    </div>
                  )}
                  {!isMap && capDisplay && (
                    <div className="mod-detail__meta-row">
                      <span className="mod-detail__meta-label">Capacity</span>
                      <span className="mod-detail__meta-value">{capDisplay}</span>
                    </div>
                  )}
                  {!isMap && unitCapDisplay && (
                    <div className="mod-detail__meta-row">
                      <span className="mod-detail__meta-label">Unit Capacity</span>
                      <span className="mod-detail__meta-value">{unitCapDisplay}</span>
                    </div>
                  )}
                  {!isMap && speedDisplay && (
                    <div className="mod-detail__meta-row">
                      <span className="mod-detail__meta-label">Max Speed</span>
                      <span className="mod-detail__meta-value">{speedDisplay}</span>
                    </div>
                  )}
                  {!isMap && weightDisplay && (
                    <div className="mod-detail__meta-row">
                      <span className="mod-detail__meta-label">Weight</span>
                      <span className="mod-detail__meta-value">{weightDisplay}</span>
                    </div>
                  )}
                </>
              );
            })()}
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
      {showDepModal && (dependencyStatus.missingList?.length > 0) && (() => {
        const isCP = /crossplay|\(cp\)|\[cp\]/i.test(mod?.title || '') || /crossplay|\(cp\)|\[cp\]/i.test(mod?.fileName || '');
        let cleanTitle = (mod?.title || '').replace(/[\\/:*?"<>|]/g, '_').trim();
        if (isCP) {
          cleanTitle = cleanTitle.replace(/\s*[\(\[]\s*(?:crossplay|cp)\s*[\)\]]\s*$/i, '')
                                 .replace(/\s+crossplay\s*$/i, '')
                                 .replace(/\s+cp\s*$/i, '')
                                 .trim();
        }
        const targetMapFolder = (mod?.isMap || isMapCategory(mod?.category)) ? (cleanTitle + (isCP ? ' (CP)' : '')) : null;
        const assignedSubFolder = parentFolder || targetMapFolder;

        return (
          <DependencyDownloadModal
            missingMods={dependencyStatus.missingList}
            subFolder={assignedSubFolder}
            parentId={mod?.modId}
            mainTask={!showAsInstalled ? {
              modId: mod.modId,
              modTitle: mod.title,
              downloadUrl: mod.downloadUrl || '',
              category: mod.category || '',
              subFolder: assignedSubFolder
            } : null}
            onComplete={() => {
              setShowDepModal(false);
              scanMods(null, true);
            }}
            onCancel={() => setShowDepModal(false)}
          />
        );
      })()}
      </div>
    );
  }
