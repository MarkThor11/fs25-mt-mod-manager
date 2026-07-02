import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useDownloadStore } from '../store/useDownloadStore';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useToastStore } from '../store/useToastStore';
import { 
  ArrowLeft, Download, ExternalLink, Package,
  Calendar, User, HardDrive, Tag, Gauge, Zap, Coins, Weight, Clock, Check, AlertCircle, Info, Milestone, Star, Pin, Heart,
  RotateCcw, RefreshCw, AlertTriangle, ShieldAlert, Search
} from 'lucide-react';
import { useModHubStore } from '../store/useModHubStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { compareVersions, resolveRecursiveDependencies } from '../utils/modUtils';
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
  const parentFolder = location.state?.parentFolder;
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
  const [restoring, setRestoring] = useState(false);
  const [hasBak, setHasBak] = useState(false);

  // ── Dependency Management ──
  const uniqueDependencies = useMemo(() => {
    if (!mod || !mod.dependencies) return [];
    
    // Sort to prioritize dependencies with ModHub URLs
    const sorted = [...mod.dependencies].sort((a, b) => {
      const aUrl = typeof a === 'object' && a.url;
      const bUrl = typeof b === 'object' && b.url;
      return (bUrl ? 1 : 0) - (aUrl ? 1 : 0);
    });

    const deduped = [];
    const seenTitles = new Set();

    for (const dep of sorted) {
      const title = typeof dep === 'string' ? dep : dep.title;
      if (!title) continue;
      
      const lowerTitle = title.toLowerCase();
      if (!seenTitles.has(lowerTitle)) {
        deduped.push(dep);
        seenTitles.add(lowerTitle);
      }
    }
    return deduped;
  }, [mod?.dependencies]);

  const requirementsMet = useMemo(() => {
    if (uniqueDependencies.length === 0) return true;
    if (!localMods) return false;

    try {
        const { missing } = resolveRecursiveDependencies(mod.modName || mod.fileName, localMods);
        return missing.size === 0;
    } catch (e) {
        console.error("Failed to check dependencies", e);
        return false;
    }
  }, [uniqueDependencies, localMods, mod]);

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

      // If it's a map and has raw string dependencies, dynamically resolve exact ModHub dependencies
      if (modData && modData.isMap && modData.dependencies && modData.dependencies.some(d => typeof d === 'string' || !d.url)) {
          try {
              const searchRes = await window.api.modhub.search({ query: modData.title || modData.modName, page: 0 });
              const remoteMap = searchRes?.mods?.[0];
              if (remoteMap && remoteMap.modId) {
                  const detail = await window.api.modhub.fetchModDetail({ modId: remoteMap.modId });
                  if (detail && detail.dependencies && detail.dependencies.length > 0) {
                      modData.dependencies = detail.dependencies;
                  }
              }
          } catch (e) {
              console.error('Failed to dynamically fetch map dependencies from ModHub', e);
          }
      }

      // 2. If we have a modId (from URL or local data), try to fetch full remote details
      if (effectiveModId) {
        try {
          const remote = await window.api.modhub.fetchModDetail({ modId: effectiveModId });
          if (remote && !remote.error) {
              // Merge remote data over local (prefer remote descriptions/images)
              // If ModHub provides dependencies, use ONLY ModHub dependencies.
              // This ensures the list exactly matches the ModHub page and avoids duplicates
              // or conflicting internal zip names from modDesc.xml.
              const remoteDeps = remote.dependencies || [];
              
              modData = { 
                  ...modData, 
                  ...remote, 
                  dependencies: remoteDeps.length > 0 ? remoteDeps : (modData.dependencies || []) 
              };
          }
        } catch (err) {
          console.warn('Remote fetch failed, falling back to local metadata');
        }
      }

      if (modData) {
        setMod(modData);
      } else if (modId) {
          // Fallback if no local data and only modId
          const result = await window.api.modhub.fetchModDetail({ modId });
          setMod(result);
      }
    } catch (err) {
      console.error('Failed to load mod detail:', err);
    } finally {
      setLoading(false);
    }
  };

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

                  // Extract the file name or ID exactly like resolveRecursiveDependencies does
                  let depId = null;
                  let fallbackFileName = null;
                  if (typeof dep === 'object' && dep.url) {
                      const idMatch = dep.url.match(/mod_id=(\d+)/) || dep.url.match(/storage\/(\d+)\//);
                      if (idMatch) depId = idMatch[1];
                      const fileMatch = dep.url.match(/\/([^\/]+\.zip)$/i);
                      if (fileMatch) fallbackFileName = fileMatch[1].replace(/\.zip$/i, '');
                  }
                  const depString = fallbackFileName || (typeof dep === 'string' ? dep : (dep.modName || dep.technicalName || dep.title || dep.fileName || ''));
                  const cleanModName = (name) => name ? name.replace(/\s*\([^)]*\)/, '').replace(/\*+$/, '').trim() : '';
                  const cleanedName = cleanModName(depString);

                  let isInstalled = false;
                  try {
                      const { missing } = resolveRecursiveDependencies(mod.modName || mod.fileName, localMods);
                      // If it's missing, it will be in the missing set
                      isInstalled = !missing.has(cleanedName);
                  } catch (e) {
                      console.error("Failed to check dependency status:", e);
                  }
                  
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
                        <span 
                          style={{ 
                            fontWeight: 600, 
                            cursor: 'pointer',
                            textDecoration: 'none'
                          }}
                          className="hover-underline"
                          onClick={() => {
                            if (depId) {
                              navigate(`/modhub/mod/${depId}`, { state: { parentFolder: (mod.isMap || mod.category?.toUpperCase().includes('MAP')) ? mod.title.replace(/\([^)]+\)/g, '').trim() : parentFolder } });
                            } else {
                              navigate(`/modhub?search=${depTitle}`, { state: { parentFolder: (mod.isMap || mod.category?.toUpperCase().includes('MAP')) ? mod.title.replace(/\([^)]+\)/g, '').trim() : parentFolder } });
                            }
                          }}
                        >
                          {depTitle}
                        </span>
                      </div>
                      <button 
                        className="btn btn--secondary btn--xs"
                        onClick={() => {
                          if (depId) {
                            navigate(`/modhub/mod/${depId}`, { state: { parentFolder: (mod.isMap || mod.category?.toUpperCase().includes('MAP')) ? mod.title.replace(/\([^)]+\)/g, '').trim() : parentFolder } });
                          } else {
                            navigate(`/modhub?search=${depTitle}`, { state: { parentFolder: (mod.isMap || mod.category?.toUpperCase().includes('MAP')) ? mod.title.replace(/\([^)]+\)/g, '').trim() : parentFolder } });
                          }
                        }}
                      >
                        {isInstalled ? 'View Mod' : 'Find on ModHub'}
                      </button>
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
              <div className={`alert alert--${requirementsMet ? 'success' : 'warning'}`} style={{ 
                marginBottom: 'var(--sp-4)', 
                padding: '12px', 
                fontSize: 'var(--fs-xs)', 
                border: requirementsMet ? '1px solid var(--success)' : '1px solid #fbbf24',
                background: requirementsMet ? 'rgba(var(--success-rgb), 0.1)' : 'rgba(251, 191, 36, 0.1)',
                color: requirementsMet ? 'var(--success)' : '#fbbf24',
                borderRadius: 'var(--radius-md)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
                  {requirementsMet ? <Check size={16} /> : <Package size={16} />}
                  <span style={{ textTransform: 'uppercase' }}>
                    {requirementsMet ? 'All Requirements Satisfied' : 'Required Mods Detected'}
                  </span>
                </div>
                <p style={{ margin: 0, opacity: 0.9 }}>
                  {requirementsMet 
                    ? `All ${uniqueDependencies.length} required mods are currently installed and active.`
                    : `This mod requires ${uniqueDependencies.length} additional mod${uniqueDependencies.length !== 1 ? 's' : ''} to function correctly. Checking requirements below before install is recommended.`
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
            ) : (
                <button
                  className="btn btn--primary btn--lg btn--full"
                  onClick={handleInstall}
                  disabled={isCurrentlyInstalling || batchProgress[modId] || !isOnline}
                  id="install-mod-btn"
                  title={!isOnline ? "Internet connection required" : ""}
                >
                {(isCurrentlyInstalling || batchProgress[modId]) ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', position: 'relative' }}>
                      {(downloadProgress > 0 || batchProgress[modId]) && (
                        <div style={{ 
                          position: 'absolute', 
                          bottom: -12, 
                          left: -16, 
                          right: -16, 
                          height: 4, 
                          width: batchProgress[modId] ? `${Math.round((batchProgress[modId].completed / batchProgress[modId].total) * 100)}%` : `${downloadProgress}%`, 
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
                          marginLeft: 'auto'
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
                ) : (
                  <>
                    <Download size={18} style={{ marginRight: 8 }} /> {!isOnline ? 'Internet Required' : 'Download & Install'}
                  </>
                )}
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
