import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Download, Trash2, FolderOpen, Package,
  CheckCircle, Check, AlertTriangle, HardDrive, Search, List, LayoutGrid, ChevronDown, ChevronRight,
  Tag, Plus, X, Settings2, Folder, FolderPlus, Eye, EyeOff, MoreVertical, Zap, Layers, RefreshCcw,
  Heart, Star, Share2, Pencil, GripVertical, User, Pin
} from 'lucide-react';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useDownloadStore } from '../store/useDownloadStore';
import { useToastStore } from '../store/useToastStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useModHubStore } from '../store/useModHubStore';
import DependencyDownloadModal from '../components/common/DependencyDownloadModal';

// -- UTILITIES (Extracted for Performance) --
const ultraNormalize = (str) => {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/\[[^\]]*\]/g, '') // Strip [Tags]
        .replace(/\([^)]*\)/g, '') // Strip (By Author) or (v1.0)
        .replace(/^(?:fs\d{2}|dlc|pdlc|mod|fendt|jcb|caseih|newholland|massey|farming\s*simulator(?:\s*\d{2})?)(?:[\s_\.]+)/gi, '') // Common prefixes (tech or game)
        .replace(/[\s_\.]+(?:by\s+.*|author:.*|pack|package|dlc|mod|map|expansion|set|kit|collection|building|shed|v\d+.*)\s*$/gi, '') // Trailing noise & authors
        .replace(/[^a-z0-9]/g, ''); // Squash everything else
};

const LocalModIcon = ({ mod }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [iconData, setIconData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = React.useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '100px' });
    
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let active = true;

    const loadIcon = async () => {
      if (mod.iconData) {
        if (mod.iconData.startsWith('http')) {
          try {
            const url = await window.api.images.proxy(mod.iconData);
            if (active) setIconData(url);
          } catch (err) {
            if (active) setIconData(mod.iconData);
          }
        } else {
          if (active) setIconData(mod.iconData);
        }
        return;
      }

      // If missing iconData, try to fetch from main process (it checks DB cache first)
      if (mod.filePath && window.api?.mods?.getIcon) {
        setLoading(true);
        try {
          const base64 = await window.api.mods.getIcon({ 
            filePath: mod.filePath, 
            iconFile: mod.iconFile 
          });
          if (active && base64) setIconData(base64);
          else if (active) setError(true);
        } catch (err) {
          if (active) setError(true);
        } finally {
          if (active) setLoading(false);
        }
      } else {
        setError(true);
      }
    };

    loadIcon();
    return () => { active = false; };
  }, [mod.iconData, mod.filePath, mod.iconFile, isVisible]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      {!iconData ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', opacity: 0.5 }}>
            <Package size={22} />
        </div>
      ) : iconData.startsWith('CATEGORY:') ? (() => {
          const CatIcon = (() => {
              switch (iconData.split(':')[1]) {
                  case 'map': return Layers;
                  case 'vehicle': return Zap;
                  case 'tool': return Package;
                  case 'pack': return Layers;
                  default: return Package;
              }
          })();
          return (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--accent)' }}>
                  <CatIcon size={64} strokeWidth={1} style={{ opacity: 0.7 }} />
              </div>
          );
      })() : (
        <img src={iconData} style={{ width: '100%', height: '100%', objectFit: 'cover', border: '1px solid var(--border)' }} alt="" />
      )}
    </div>
  );
};

const ModCard = React.memo(({ mod, isSelected, onToggleSelect, onNavigate, onUpdate, onUninstall, status, updateInfo, isUpdating, formatSize, isIconOnly }) => {
  const { toggleFavoriteMod, favoriteMods, toggleFavoriteAuthor, favoriteAuthors, toggleMustHaveMod } = useModHubStore();
  const isFavMod = favoriteMods.some(f => (f.modId && mod.modId && String(f.modId) === String(mod.modId)) || (f.fileName && mod.fileName && f.fileName === mod.fileName));
  const isMustHave = favoriteMods.some(m => ((m.modId && mod.modId && String(m.modId) === String(mod.modId)) || (m.fileName && mod.fileName && m.fileName === mod.fileName)) && m.isMustHave);
  const authorName = mod.author || 'Unknown';
  const isFavAuthor = favoriteAuthors.some(f => f.name.toLowerCase() === authorName.toLowerCase());

  const handleDragStart = (e) => {
    e.stopPropagation();
    // If this mod is selected, we're dragging the whole selection
    if (isSelected) {
        e.dataTransfer.setData('sourceModFiles', 'SELECTED_GROUP');
    } else {
        e.dataTransfer.setData('sourceModFile', mod.fileName);
    }
    e.dataTransfer.effectAllowed = 'move';
    useSettingsStore.getState().setIsInternalDragging(true);
  };

  const handleDragEnd = () => {
    useSettingsStore.getState().setIsInternalDragging(false);
  };

  return (
    <div 
        className={`mod-card-library ${isSelected ? 'mod-card-library--selected' : ''}`}
        onClick={() => onNavigate(mod.fileName)}
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{ 
            background: isSelected ? 'var(--accent-dim)' : 'var(--bg-card)',
            border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.2s ease',
            cursor: 'grab',
            position: 'relative',
            opacity: isUpdating ? 0.7 : 1,
            contain: 'content'
        }}
    >
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', background: 'var(--bg-tertiary)' }}>
            <LocalModIcon mod={mod} />
            
            {/* Overlay Controls (Star - Heart - Pin) */}
            {!mod.isDLC && isIconOnly && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', gap: 8, padding: '8px 12px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', zIndex: 30 }} onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => toggleFavoriteMod(mod)}
                        style={{ color: isFavMod ? '#fbbf24' : 'rgba(255,255,255,0.8)', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                        title="Favorite Mod"
                    >
                        <Star size={16} fill={isFavMod ? 'currentColor' : 'none'} />
                    </button>
                    <button 
                        onClick={() => toggleFavoriteAuthor({ name: authorName })}
                        style={{ color: isFavAuthor ? 'var(--danger)' : 'rgba(255,255,255,0.8)', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                        title={isFavAuthor ? "Remove from Favorite Authors" : "Add to Favorite Authors"}
                    >
                        <Heart size={16} fill={isFavAuthor ? 'currentColor' : 'none'} />
                    </button>
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

            <div 
                style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 6, zIndex: 20 }}
                onClick={e => e.stopPropagation()}
            >
                <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={(e) => { 
                        e.stopPropagation(); 
                        onToggleSelect(mod.fileName, e.nativeEvent); 
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}
                />
            </div>

            {status === 'update' && (
                <div style={{ 
                    position: 'absolute', 
                    top: 8, 
                    right: 8, 
                    background: '#f59e0b', 
                    color: 'black', 
                    padding: '2px 8px', 
                    borderRadius: 4, 
                    fontSize: 10, 
                    fontWeight: 900, 
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    zIndex: 30,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                }}>
                    UPDATE!
                </div>
            )}
            
            {mod.isDLC && (
                <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4, zIndex: 10 }}>
                    <div style={{ background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 900, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        DLC
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteMod(mod); }}
                        style={{ color: isFavMod ? '#fbbf24' : 'white', filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))', padding: 0, height: 18, display: 'flex', alignItems: 'center', background: 'transparent', border: 'none' }}
                        title="Favorite Mod"
                    >
                        <Star size={18} fill={isFavMod ? 'currentColor' : 'none'} />
                    </button>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleMustHaveMod(mod);
                        }}
                        style={{ 
                            color: isMustHave ? 'var(--accent)' : 'white', 
                            opacity: 1,
                            cursor: 'pointer',
                            filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))', 
                            padding: 0, 
                            height: 18, 
                            display: 'flex', 
                            alignItems: 'center',
                            background: 'transparent', border: 'none'
                        }}
                        title={isMustHave ? "Remove from Must-Haves" : "Mark as Must-Have"}
                    >
                        <Pin size={18} fill={isMustHave ? "currentColor" : "none"} strokeWidth={isMustHave ? 2.5 : 2} />
                    </button>
                </div>
            )}

            {/* Trash Bin Overlay for Icon/Grid View - Move to Top-Left */}
            {isIconOnly && !mod.isDLC && !mod.isVirtual && (
                <div 
                    style={{ position: 'absolute', top: 8, left: 8, zIndex: 40 }}
                    onClick={e => e.stopPropagation()}
                >
                    <button 
                        className="btn btn--danger btn--xs" 
                        onClick={(e) => { e.stopPropagation(); onUninstall(mod); }}
                        style={{ background: 'var(--danger)', color: 'white', padding: 0, height: 26, width: 26, boxShadow: '0 2px 8px rgba(0,0,0,0.4)', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)' }}
                        title="Uninstall Mod"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            )}
        </div>
        
        {mod.isVirtual && (
            <div 
                style={{ 
                    position: 'absolute', 
                    bottom: 8, 
                    left: 8, 
                    background: 'var(--accent)', 
                    color: 'white', 
                    width: 28, 
                    height: 28, 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    zIndex: 5
                }}
                title="Shared Dependency (Virtual Copy)"
            >
                <Layers size={14} />
            </div>
        )}
        
        {!isIconOnly && (
            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 110 }}>
                <div style={{ 
                    fontWeight: 800, 
                    fontSize: 'var(--fs-base)', 
                    color: 'var(--text-primary)', 
                    marginBottom: 4, 
                    display: '-webkit-box', 
                    WebkitLineClamp: 2, 
                    WebkitBoxOrient: 'vertical', 
                    overflow: 'hidden', 
                    lineHeight: '1.2em',
                    height: '2.4em' // Force 2 lines of height
                }}>
                    {mod.title}
                </div>
                
                {!mod.isDLC && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, height: 38 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isFavAuthor ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{authorName}</span>
                        </div>
                        
                        {/* Inline Controls (Star - Heart - Pin) - Beneathe Author */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={e => e.stopPropagation()}>
                            <button 
                                onClick={() => toggleFavoriteMod(mod)}
                                style={{ color: isFavMod ? '#fbbf24' : 'var(--text-muted)', background: 'transparent', border: 'none', padding: 0, display: 'flex', cursor: 'pointer' }}
                                title="Favorite Mod"
                            >
                                <Star size={14} fill={isFavMod ? 'currentColor' : 'none'} />
                            </button>
                            <button 
                                onClick={() => toggleFavoriteAuthor({ name: authorName })}
                                style={{ color: isFavAuthor ? 'var(--danger)' : 'var(--text-muted)', background: 'transparent', border: 'none', padding: 0, display: 'flex', cursor: 'pointer' }}
                                title={isFavAuthor ? "Favorite Author" : "Add Author to Favorites"}
                            >
                                <Heart size={14} fill={isFavAuthor ? 'currentColor' : 'none'} />
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isFavMod) {
                                        useToastStore.getState().info("Please favorite the mod first to mark it as 'Must Have'");
                                        return;
                                    }
                                    toggleMustHaveMod(mod);
                                }}
                                style={{ 
                                    color: isMustHave ? 'var(--accent)' : 'var(--text-muted)', 
                                    opacity: isFavMod ? 1 : 0.4,
                                    cursor: isFavMod ? 'pointer' : 'not-allowed',
                                    background: 'transparent', border: 'none', padding: 0, display: 'flex'
                                }}
                                title={isMustHave ? "Remove from Must-Haves" : "Mark as Must-Have"}
                            >
                                <Pin size={14} fill={isMustHave ? "currentColor" : "none"} strokeWidth={isMustHave ? 2.5 : 2} />
                            </button>
                        </div>
                    </div>
                )}
                
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {!mod.isDLC && (
                            <>
                                <span style={{ fontSize: 11, fontWeight: 800, color: status === 'update' ? 'var(--warning)' : 'var(--text-primary)' }}>
                                    {status === 'update' ? `v${mod.version} ➔ v${updateInfo.remoteVersion}` : `v${mod.version}`}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                    {formatSize(mod.size)}
                                </span>
                            </>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                        {mod.isVirtual ? (
                             <div 
                                style={{ 
                                    fontSize: 9, 
                                    fontWeight: 900, 
                                    background: 'rgba(59, 130, 246, 0.15)', 
                                    color: '#60a5fa', 
                                    padding: '3px 8px', 
                                    borderRadius: 6, 
                                    textTransform: 'uppercase',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                }}
                                title="This mod is physically in another folder but required here as a dependency."
                            >
                                <Share2 size={10} />
                                SHARED
                            </div>
                        ) : (
                            <>
                                {status === 'update' && (
                                    <button className="btn btn--primary btn--xs" onClick={(e) => { e.stopPropagation(); onUpdate(mod.fileName, updateInfo.modId); }} value={isUpdating} disabled={isUpdating} style={{ height: 26, width: 26, padding: 0 }}>
                                        {isUpdating ? <RefreshCw size={12} className="animate-spin" /> : <Download size={14} />}
                                    </button>
                                )}
                                {!mod.isDLC && (
                                    <button 
                                    className="btn btn--danger btn--xs" 
                                    onClick={(e) => { e.stopPropagation(); onUninstall(mod); }}
                                    style={{ background: 'var(--danger)', color: 'white', padding: 0, height: 26, width: 26 }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
});



export default function InstalledModsPage() {
  const {
    mods, allFolders, isLoading, isCheckingUpdates, updates, error,
    isResolving, resolvingStatus, showOnlyUpdates, setShowOnlyUpdates,
    scanMods, checkUpdates, uninstallMod, updateMod, initListeners, toggleAutoResolve,
    createFolder, renameFolder, deleteFolder, moveModsToFolder, exportCollection
  } = useLocalModsStore();

  const { 
    hiddenFolders, toggleHiddenFolder, installedModsViewMode, setInstalledModsViewMode,
    folderOrder, setFolderOrder, folderZooms, setFolderZoom, isInternalDragging, setIsInternalDragging,
    iconOnlyFolders, toggleIconOnlyFolder, isOnline, isLoaded
  } = useSettingsStore();
  const { toggleFavoriteMod, toggleFavoriteAuthor, favoriteMods, favoriteAuthors } = useModHubStore();
  const { activeDownloads } = useDownloadStore();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [updatingMod, setUpdatingMod] = useState(null);
  const [autoResolveMode, setAutoResolveMode] = useState(false);

  useEffect(() => {
    if (isLoaded) scanMods();
  }, [isLoaded]);

  useEffect(() => {
    const unsub = initListeners();
    
    // Check initial setting
    window.api.settings.get('autoResolveDependencies').then(val => {
        setAutoResolveMode(val === 'true');
    });

    const unsubMove = window.api.on.moveProgress((data) => {
        useToastStore.getState().info(`Moving mods: ${data.percent}% (${data.current}/${data.total})`, { id: 'move-progress' });
    });

    return () => {
      unsub?.();
      unsubMove();
    };
  }, []);
  
  // Compute all unique tags across all mods
  const allUniqueTags = useMemo(() => {
    const tagCounts = {};
    mods.forEach(mod => {
      if (mod.tags) {
        mod.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });
    return Object.entries(tagCounts)
      .sort((a,b) => b[1] - a[1]) // Most frequent first
      .map(([name, count]) => ({ name, count }));
  }, [mods]);

  const [selectedMods, setSelectedMods] = useState([]);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const { expandedFolders, setExpandedFolder, skipDeleteConfirm } = useSettingsStore();
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggedFolder, setDraggedFolder] = useState(null);
  const [canDragFolder, setCanDragFolder] = useState(false);
  const [dropIndicator, setDropIndicator] = useState(null); // { folderName, position: 'top' | 'bottom' }
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  
  // -- Dependency Fix State --
  const [depFixState, setDepFixState] = useState({ active: false, mapMod: null, missing: [], subFolder: '' });



  
  // DRAG & DROP AUTO-SCROLL
  useEffect(() => {
    if (!isInternalDragging) return;

    let scrollInterval = null;
    const scrollContainer = document.querySelector('.main-content');
    if (!scrollContainer) return;

    // We can't use onDragOver here because it's only for drop targets.
    // We attach to window to catch movement anywhere while dragging.
    const handleDragOver = (e) => {
      const threshold = 150; // Larger threshold for easier trigger
      const rect = scrollContainer.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      
      if (relativeY < threshold && relativeY > 0) {
        // Near top - scroll up
        const intensity = (threshold - relativeY) / threshold;
        const speed = -25 * intensity;
        startScrolling(speed);
      } else if (relativeY > rect.height - threshold && relativeY < rect.height) {
        // Near bottom - scroll down
        const intensity = (relativeY - (rect.height - threshold)) / threshold;
        const speed = 25 * intensity;
        startScrolling(speed);
      } else {
        stopScrolling();
      }
    };

    const startScrolling = (speed) => {
        if (scrollInterval) {
            clearInterval(scrollInterval);
        }
        scrollInterval = setInterval(() => {
            scrollContainer.scrollBy(0, speed);
        }, 16);
    };

    const stopScrolling = () => {
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
        }
    };

    window.addEventListener('dragover', handleDragOver);
    // Safety cleanup for all possible ends of a drag
    window.addEventListener('dragend', stopScrolling);
    window.addEventListener('drop', stopScrolling);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragend', stopScrolling);
      window.removeEventListener('drop', stopScrolling);
      stopScrolling();
    };
  }, [isInternalDragging]);

  const filteredMods = mods.filter((m) => {
    const matchesSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         m.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (m.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;
    
    if (showOnlyFavorites) {
        const isModFav = favoriteMods.some(fv => (fv.modId && m.modId && String(fv.modId) === String(m.modId)) || (fv.fileName === m.fileName));
        const isAuthorFav = favoriteAuthors.some(fa => fa.name === m.author);
        if (!isModFav && !isAuthorFav) return false;
    }

    if (selectedTags.length > 0) {
        const hasMatch = selectedTags.some(tag => (m.tags || []).includes(tag));
        if (!hasMatch) return false;
    }

    if (showOnlyUpdates) {
        const hasUpdate = updates.some(u => u.fileName === m.fileName);
        if (!hasUpdate) return false;
    }

    return true;
  });

  const folders = useMemo(() => {
    // 0. Pre-index all mods for O(1) lookup during dependency injection
    const modNameMap = new Map();
    const normalizedTitleMap = new Map();

    mods.forEach(m => {
        const modName = (m.modName || '').toLowerCase();
        const normTitle = ultraNormalize(m.title || '');
        const normLocalName = ultraNormalize(m.modName || '');
        
        if (modName) {
          if (!modNameMap.get(modName)) modNameMap.set(modName, m);
        }
        if (normTitle && normTitle.length > 2) {
          if (!normalizedTitleMap.get(normTitle)) normalizedTitleMap.set(normTitle, m);
        }
        if (normLocalName && normLocalName.length > 2) {
          if (!normalizedTitleMap.get(normLocalName)) normalizedTitleMap.set(normLocalName, m);
        }
    });

    const findFastMatch = (depName) => {
        const targetName = depName.toLowerCase();
        const targetUltra = ultraNormalize(depName);
        
        // 1. Exact Name
        let match = modNameMap.get(targetName);
        if (match) return match;

        // 2. Ultra Normalization match
        if (targetUltra.length > 2) {
          match = normalizedTitleMap.get(targetUltra);
          if (match) return match;
        }

        return null;
    };

    // 1. Group physical mods into their folders
    const groups = filteredMods.reduce((acc, mod) => {
      const folder = mod.folder || '';
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push(mod);
      return acc;
    }, { '': [] });
    
    // 2. Identify all Map Folders
    const mapFolders = Object.keys(groups).filter(name => groups[name].some(m => m.isMap));
    
    // 3. Virtual Injection: If a mod is a dependency of a map in a folder, show it there virtually
    mapFolders.forEach(folderName => {
        const modsInThisFolder = groups[folderName];
        const mapsInFolder = modsInThisFolder.filter(m => m.isMap);
        
        mapsInFolder.forEach(mapMod => {
            if (mapMod.dependencies && mapMod.dependencies.length > 0) {
                mapMod.dependencies.forEach(depName => {
                    // Check if it's already visible in this folder (physical or already virtualized)
                    const titleSafe = depName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const isVisible = modsInThisFolder.some(m => {
                        const localName = (m.modName || '').toLowerCase();
                        const localUltra = ultraNormalize(m.title || '') || ultraNormalize(m.modName || '');
                        const targetUltra = ultraNormalize(depName);
                        return localName === depName.toLowerCase() || (targetUltra.length > 2 && localUltra === targetUltra);
                    });
                    
                    if (!isVisible) {
                        const physicalDep = findFastMatch(depName);
                        if (physicalDep) {
                            modsInThisFolder.push({
                                ...physicalDep,
                                isVirtual: true
                            });
                        }
                    }
                });
            }
        });
    });


    // 4. Include empty folders from allFolders
    allFolders.forEach(f => {
        if (!groups[f]) groups[f] = [];
    });

    // 5. Strict Map Filtering: If "Maps" tag is active, hide folders that don't contain a map
    const showingOnlyMaps = selectedTags.includes('Maps');
    let finalKeys = Object.keys(groups);
    if (showingOnlyMaps) {
        finalKeys = finalKeys.filter(name => groups[name].some(m => m.isMap));
    }

    // 6. Root folder first, then others alphabetically
    const sortedKeys = finalKeys.sort((a,b) => {
        if (a === 'DLC') return -1;
        if (b === 'DLC') return 1;
        const indexA = folderOrder.indexOf(a);
        const indexB = folderOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        if (a === '') return -1;
        if (b === '') return 1;
        return a.localeCompare(b);
    });

    // 7. Lock maps to the first position within each folder
    return sortedKeys.reduce((acc, name) => {
        const modsInFolder = groups[name] || [];
        
        // Internal sort: Maps first, then by title
        modsInFolder.sort((a, b) => {
            if (a.isMap && !b.isMap) return -1;
            if (!a.isMap && b.isMap) return 1;
            return a.title.localeCompare(b.title);
        });

        // Final uniqueness guard for folder mods
        const seenFolderModFiles = new Set();
        const uniqueModsInFolder = modsInFolder.filter(m => {
            if (seenFolderModFiles.has(m.fileName)) return false;
            seenFolderModFiles.add(m.fileName);
            return true;
        });

        // -- Requirement Check (Pre-computed for Performance) --
        const maps = uniqueModsInFolder.filter(m => m.isMap);
        let requirementStatus = { status: 'none', missing: [] };
        
        if (maps.length > 0) {
            const missingMods = [];
            for (const map of maps) {
                if (!map.dependencies || map.dependencies.length === 0) continue;
                for (const dep of map.dependencies) {
                    const depTitle = typeof dep === 'string' ? dep : dep.title;
                    const normalizedDep = ultraNormalize(depTitle);
                    const depId = typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\d+)/)?.[1] || dep.url.match(/storage\/(\d+)\//)?.[1]) : null;

                    const found = (depId && modNameMap.has(String(depId))) || 
                                  normalizedTitleMap.has(normalizedDep) ||
                                  modNameMap.has(depTitle.toLowerCase());
                    
                    if (!found && !missingMods.includes(depTitle)) {
                        missingMods.push(depTitle);
                    }
                }
            }
            requirementStatus = { 
                status: missingMods.length === 0 ? 'satisfied' : 'missing', 
                missing: missingMods 
            };
        }

        acc[name] = {
            mods: uniqueModsInFolder,
            isHidden: hiddenFolders.includes(name),
            requirements: requirementStatus
        };
        return acc;
    }, {});
  }, [mods, filteredMods, allFolders, searchQuery, hiddenFolders, folderOrder, selectedTags, showOnlyFavorites]);

  const flatViewList = useMemo(() => {
    return Object.values(folders).flatMap(f => f.mods);
  }, [folders]);

  const favModIds = useMemo(() => new Set(favoriteMods.map(f => f.modId ? String(f.modId) : f.fileName)), [favoriteMods]);
  const mustHaveIds = useMemo(() => new Set(favoriteMods.filter(f => f.isMustHave).map(f => f.modId ? String(f.modId) : f.fileName)), [favoriteMods]);
  const favAuthorNames = useMemo(() => new Set(favoriteAuthors.map(f => f.name.toLowerCase())), [favoriteAuthors]);



  const toggleSelect = React.useCallback((fileName, e) => {
    if (e?.shiftKey && lastSelectedIndex !== null) {
      const currentIndex = flatViewList.findIndex(m => m.fileName === fileName);
      if (currentIndex !== -1) {
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        const range = flatViewList.slice(start, end + 1).map(m => m.fileName);
        
        setSelectedMods(prev => {
          const isRemoving = prev.includes(fileName);
          if (isRemoving) {
            return prev.filter(f => !range.includes(f));
          } else {
            return [...new Set([...prev, ...range])];
          }
        });
        setLastSelectedIndex(currentIndex);
        return;
      }
    }

    setSelectedMods(prev => 
      prev.includes(fileName) 
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );

    const newIndex = flatViewList.findIndex(m => m.fileName === fileName);
    setLastSelectedIndex(newIndex);
  }, [flatViewList, lastSelectedIndex]);

  const checkFolderRequirements = (folderMods) => {

    // Check for maps
    const maps = folderMods.filter(m => {
        if (m.isMap) return true;
        const name = ((m.title || '') + ' ' + (m.fileName || '') + ' ' + (m.folder || '')).toLowerCase();
        return name.match(/map|terrain/i) && m.size > 80 * 1024 * 1024;
    });

    if (maps.length === 0) return { status: 'none', missing: [] };

    const missingMods = [];
    for (const map of maps) {
      if (!map.dependencies || map.dependencies.length === 0) continue;
      
      for (const dep of map.dependencies) {
        const depTitle = typeof dep === 'string' ? dep : dep.title;
        const normalizedDep = ultraNormalize(depTitle);
        const depId = typeof dep === 'object' && dep.url ? (dep.url.match(/mod_id=(\d+)/)?.[1] || dep.url.match(/storage\/(\d+)\//)?.[1]) : null;

        const found = mods.some(lm => {
          // 1. ID Match
          if (depId && lm.modId && String(lm.modId) === String(depId)) return true;
          
          // 2. Ultra Normalization match for Title, Name, and FileName
          const localUltraTitle = ultraNormalize(lm.title || '');
          const localUltraName = ultraNormalize(lm.modName || '');
          const localUltraFile = ultraNormalize(lm.fileName || '');
          
          if (localUltraTitle === normalizedDep || localUltraName === normalizedDep || localUltraFile === normalizedDep) return true;
          
          // 3. Containment (Safe fuzzy check)
          if (normalizedDep.length > 3 && (localUltraTitle.includes(normalizedDep) || normalizedDep.includes(localUltraTitle))) return true;
          if (normalizedDep.length > 3 && (localUltraName.includes(normalizedDep) || normalizedDep.includes(localUltraName))) return true;

          return false;
        });

        if (!found) {
           if (!missingMods.includes(depTitle)) missingMods.push(depTitle);
        }
      }
    }
    
    return { 
        status: missingMods.length === 0 ? 'satisfied' : 'missing', 
        missing: missingMods 
    };
  };

  const toggleAllInFolder = (folderName, modsInFolder) => {
    const fileNames = modsInFolder.map(m => m.fileName);
    const allSelected = fileNames.length > 0 && fileNames.every(f => selectedMods.includes(f));
    
    if (allSelected) {
        setSelectedMods(prev => prev.filter(f => !fileNames.includes(f)));
    } else {
        setSelectedMods(prev => [...new Set([...prev, ...fileNames])]);
    }
  };

  const handleAutoSortMaps = async () => {
    const mainFolderMods = folders['']?.mods || [];
    if (activeTab === 'MAPS') {
        // When on MAPS tab, show all maps regardless of current folder
        return mods.filter(m => m.isMap || m.category === 'CATEGORY:map');
    }
    const maps = mainFolderMods.filter(m => m.isMap);
    if (maps.length === 0) {
        useToastStore.getState().info("No maps found in MAIN folder.");
        return;
    }
    
    let count = 0;
    for (const map of maps) {
        const titleSafe = (map.title || map.fileName.replace('.zip', '')).replace(/[<>:"\/\\|?*]+/g, '').trim();
        const destFolder = `Map - ${titleSafe}`;
        
        if (!allFolders.includes(destFolder)) {
            await createFolder(destFolder);
        }
        await moveModsToFolder([map.fileName], destFolder);
        count++;
    }
    useToastStore.getState().success(`Auto-sorted ${count} maps from MAIN into categorized folders.`);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setShowFolderInput(false);
    useToastStore.getState().success(`Folder "${newFolderName}" created.`);
  };

  const handleMoveTo = async (dest) => {
    if (selectedMods.length === 0) return;
    
    const movableMods = selectedMods.filter(fileName => {
        const mod = mods.find(m => m.fileName === fileName);
        return mod && !mod.isDLC;
    });
    
    if (movableMods.length === 0) {
        useToastStore.getState().warning("DLCs cannot be moved.");
        setSelectedMods([]);
        return;
    }

    const result = await moveModsToFolder(movableMods, dest);
    setSelectedMods([]);
    
    if (result.success) {
      const msg = result.errors && result.errors.length > 0 
        ? `Moved ${result.completed}/${result.total} mods (some errors).`
        : `Successfully moved ${result.completed} mods to ${dest || 'MAIN'}.`;
      
      useToastStore.getState().success(msg, { id: 'move-progress', duration: 2000 });
    } else {
      const errorMsg = result.errors?.[0]?.error || result.error || 'Unknown error';
      useToastStore.getState().error(`Failed: ${errorMsg}`, { id: 'move-progress' });
    }
  };

  const handleRenameFolder = (folderName) => {
    setRenamingFolder(folderName);
    setRenameValue(folderName);
  };

  const submitRename = async () => {
    if (!renameValue || renameValue.trim() === '' || renameValue === renamingFolder) {
        setRenamingFolder(null);
        return;
    }
    const result = await renameFolder(renamingFolder, renameValue.trim());
    if (result.success) {
      useToastStore.getState().success(`Folder renamed to "${renameValue.trim()}"`);
    } else {
      useToastStore.getState().error(`Failed to rename folder: ${result.error}`);
    }
    setRenamingFolder(null);
  };

  const handleDragStart = (e, folderName) => {
    setDraggedFolder(folderName);
    e.dataTransfer.setData('folderDragName', folderName);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
    setIsInternalDragging(true);
  };

  const handleDragEnd = (e) => {
    setDraggedFolder(null);
    e.currentTarget.style.opacity = '1';
    setIsInternalDragging(false);
    setDropIndicator(null);
  };

  const handleModDropOnFolder = async (e, destinationFolder) => {
    e.preventDefault();
    const modFile = e.dataTransfer.getData('sourceModFile');
    const isGroup = e.dataTransfer.getData('sourceModFiles') === 'SELECTED_GROUP';

    const fileNamesToMove = isGroup ? [...selectedMods] : (modFile ? [modFile] : []);
    
    if (fileNamesToMove.length === 0) {
        console.warn('[DROP] No files to move identified.');
        return;
    }

    // Filter out DLCs and Virtual mods to prevent invalid operations
    const movableFiles = fileNamesToMove.filter(f => {
        const m = mods.find(mod => mod.fileName === f);
        return m && !m.isDLC && !m.isVirtual;
    });

    if (movableFiles.length === 0) return;

    const result = await moveModsToFolder(movableFiles, destinationFolder);
    setSelectedMods([]);
    
    if (result.success) {
        const msg = result.errors && result.errors.length > 0 
          ? `Moved ${result.completed}/${result.total} mods (some errors).`
          : `Successfully moved ${result.completed} mods to ${destinationFolder || 'MAIN'}.`;
        useToastStore.getState().success(msg, { id: 'move-progress', duration: 2000 });
    } else {
        const errorMsg = result.errors?.[0]?.error || result.error || 'Unknown error';
        useToastStore.getState().error(`Move failed: ${errorMsg}`, { id: 'move-progress' });
    }
  };

  const handleDragOver = (e, targetFolderName) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // If we're dragging a mod, we always want to drop INTO the folder (Highlight whole card)
    const isModDrag = e.dataTransfer.types.includes('sourceModFile') || e.dataTransfer.types.includes('sourceModFiles');
    
    if (isModDrag) {
        if (dragOverFolder !== targetFolderName) setDragOverFolder(targetFolderName);
        setDropIndicator(null);
        return;
    }

    // FOLDER REORDERING LOGIC
    if (!draggedFolder) return;

    if (draggedFolder === targetFolderName) {
        setDropIndicator(null);
        setDragOverFolder(null);
        return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const threshold = rect.height * 0.35; // Increased to 35% for easier snapping

    if (relativeY < threshold) {
        setDropIndicator({ folderName: targetFolderName, position: 'top' });
        setDragOverFolder(null);
    } else if (relativeY > rect.height - threshold) {
        setDropIndicator({ folderName: targetFolderName, position: 'bottom' });
        setDragOverFolder(null);
    } else {
        // Middle 50% - Merging state
        setDropIndicator(null);
        if (dragOverFolder !== targetFolderName) setDragOverFolder(targetFolderName);
    }
  };

  const handleDrop = async (e, targetFolderName) => {
    e.preventDefault();
    e.stopPropagation();
    const isModDrag = e.dataTransfer.getData('sourceModFile');
    if (isModDrag || e.dataTransfer.getData('sourceModFiles') === 'SELECTED_GROUP') {
        setDropIndicator(null);
        await handleModDropOnFolder(e, targetFolderName);
        return;
    }

    // Check for folder-to-folder MERGE (Drop in middle, no indicator)
    const sourceFolderName = e.dataTransfer.getData('folderDragName');
    if (sourceFolderName && sourceFolderName !== targetFolderName && !dropIndicator) {
        // Only merge if we aren't explicitly reordering (indicator is null)
        const modsInSourceFolder = mods.filter(m => (m.folder || '') === sourceFolderName);
        if (modsInSourceFolder.length > 0) {
            const fileNames = modsInSourceFolder.map(m => m.fileName);
            await moveModsToFolder(fileNames, targetFolderName);
            useToastStore.getState().success(`Merged "${sourceFolderName || 'Root'}" into "${targetFolderName || 'Root'}"`);
            setDropIndicator(null);
            setDragOverFolder(null);
            return;
        }
    }

    if (!draggedFolder || draggedFolder === targetFolderName) {
        setDropIndicator(null);
        setDragOverFolder(null);
        return;
    }

    const position = dropIndicator?.position || 'top';
    setDropIndicator(null);
    setDragOverFolder(null);

    // Get all current folders as they appear in the UI
    const currentFolders = Object.keys(folders);
    const newOrder = [...currentFolders];
    
    const fromIndex = newOrder.indexOf(draggedFolder);
    let toIndex = newOrder.indexOf(targetFolderName);
    
    // Adjust toIndex based on position
    if (position === 'bottom') {
        toIndex += 1;
    }

    // Perform move
    newOrder.splice(fromIndex, 1);
    const adjustedToIndex = (fromIndex < toIndex) ? toIndex - 1 : toIndex;
    newOrder.splice(adjustedToIndex, 0, draggedFolder);
    
    setFolderOrder(newOrder);
    useToastStore.getState().success('Folder order updated');
  };


  const handleDeleteFolder = async (folderName, count) => {
    const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
    if (!skipConfirm && !confirm(`CAUTION: Delete folder "${folderName}" and ALL ${count} mods inside permanently from disk?`)) return;
    const result = await deleteFolder(folderName);
    if (result.success) {
      useToastStore.getState().success(`Folder "${folderName}" deleted`);
    } else {
      useToastStore.getState().error(`Failed to delete folder: ${result.error}`);
    }
  };

  const handleUninstall = async (mod) => {
    const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
    if (!skipConfirm && !confirm(`Uninstall "${mod.title}"? This will delete the file.`)) return;
    const result = await uninstallMod(mod.fileName, mod.folder);
    if (result.success) {
      useToastStore.getState().success(`Uninstalled: ${mod.title}`);
    } else {
      useToastStore.getState().error(`Failed: ${result.error}`);
    }
  };

  const handleOpenFolder = async () => {
    try {
      if (mods && mods.length > 0) {
        await window.api.shell.showItemInFolder(mods[0].filePath);
      } else {
        const pathResult = await window.api.mods.detectPath();
        const p = pathResult?.path || pathResult;
        if (p && window.api.shell.openPath) {
          await window.api.shell.openPath(p);
        } else if (p) {
          await window.api.shell.showItemInFolder(p);
        }
      }
    } catch (err) {
      useToastStore.getState().error('Failed to open mods folder: ' + err.message);
    }
  };

  const handleUpdate = async (modFileName, modId) => {
    setUpdatingMod(modFileName);
    try {
      const result = await updateMod(modFileName, modId);
      if (!result.success) {
        useToastStore.getState().error(`Update failed: ${result.error}`);
        setUpdatingMod(null);
      }
      // If success, we stay in the "updating" state until activeDownloads[modId] is gone
      // We clear the local updatingMod state if the download didn't start or when it finishes
    } catch (err) {
      useToastStore.getState().error(`Update error: ${err.message}`);
      setUpdatingMod(null);
    }
  };

  const handleNavigate = React.useCallback((file, isDLC) => {
    if (isDLC) {
        useToastStore.getState().info("Official DLC content is system-managed.");
        return;
    }
    navigate(`/installed/mod/${encodeURIComponent(file)}`);
  }, [navigate]);

  const handleUpdateCallback = React.useCallback((modFileName, modId) => {
    handleUpdate(modFileName, modId);
  }, [handleUpdate]);

  const handleUninstallCallback = React.useCallback((mod) => {
    handleUninstall(mod);
  }, [handleUninstall]);

  const getModStatus = (mod) => {
    const update = updates.find((u) => u.fileName === mod.fileName);
    if (update?.isRemoved) return 'removed';
    return update?.hasUpdate ? 'update' : 'ok';
  };

  const getUpdateInfo = (mod) => {
    return updates.find((u) => u.fileName === mod.fileName);
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div 
        className="page animate-fade-in-up" 
        onDragOver={(e) => {
            if (isInternalDragging) {
                e.preventDefault();
                // e.stopPropagation(); <-- Removed to allow window-level auto-scroll listener to work
            }
        }}
        onDrop={(e) => {
            if (isInternalDragging) {
                e.preventDefault();
                e.stopPropagation();
            }
        }}
        style={{ 
            willChange: 'transform',
            transform: 'translate3d(0,0,0)',
            scrollBehavior: 'smooth',
            overscrollBehavior: 'contain'
        }}
    >
      <div className="page__header" style={{ marginBottom: 'var(--sp-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="page__title">
            <HardDrive size={32} style={{ color: 'var(--accent)', verticalAlign: 'middle', marginRight: 10 }} />
            Installed Mods
          </h1>
          <p className="page__subtitle" style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{mods.filter(m => !hiddenFolders.includes(m.folder || '')).length}</span> mods • <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{Object.keys(folders).length}</span> folders visible
            </span>
            {hiddenFolders.length > 0 && (
                <button 
                  className="btn btn--secondary btn--xs" 
                  onClick={() => navigate('/settings')}
                  style={{ padding: '2px 8px', fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  <EyeOff size={10} style={{ marginRight: 4 }} /> {hiddenFolders.length} HIDDEN • MANAGE
                </button>
            )}

            {isOnline && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 20, background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', fontSize: 10, fontWeight: 800 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#4ade80' }} />
                CONNECTED
              </div>
            )}

            {isResolving && (
              <div 
                  className="animate-fade-in"
                  style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 8, 
                      padding: '2px 12px', 
                      borderRadius: 20, 
                      background: 'rgba(59, 130, 246, 0.1)', 
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      color: '#60a5fa', 
                      fontSize: 10, 
                      fontWeight: 800
                  }}
              >
                <RefreshCw size={10} className="animate-spin" />
                <span>RESOLVING {resolvingStatus?.modName?.toUpperCase() || 'DEPENDENCIES'}...</span>
                {resolvingStatus?.progress > 0 && <span style={{ opacity: 0.7 }}>{resolvingStatus.progress}%</span>}
              </div>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
            <button 
              className="btn btn--secondary btn--sm" 
              onClick={async () => {
                if (confirm("Reset the mod metadata cache? This will force a deep re-scan of all mod icons and details.")) {
                   await window.api.mods.clearCache();
                   scanMods();
                }
              }} 
              disabled={isLoading} 
              title="Deep Re-Scan"
              style={{ color: 'var(--warning)' }}
            >
              <RefreshCcw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button className="btn btn--secondary btn--sm" onClick={scanMods} disabled={isLoading} title="Refresh Library">
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button 
              className="btn btn--secondary btn--sm" 
              onClick={checkUpdates} 
              disabled={isLoading || !isOnline}
              title={!isOnline ? "Internet connection required" : "Check for Updates"}
            >
              <Download size={16} style={{ opacity: isOnline ? 1 : 0.4 }} />
            </button>
            <button className="btn btn--secondary btn--sm" onClick={handleOpenFolder} title="Open in Explorer">
              <FolderOpen size={16} />
            </button>
        </div>
      </div>

      {/* Toolbar & Search */}
      <div className="sort-bar" style={{ borderRadius: 'var(--radius-lg)', padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 'var(--sp-6)', gap: 12 }}>
        <button 
          className="btn btn--primary btn--sm" 
          onClick={() => setShowFolderInput(!showFolderInput)}
          style={{ minWidth: 'auto', padding: '0 16px', height: 36 }}
        >
          <Plus size={16} style={{ marginRight: 6 }} /> New Folder
        </button>

        <div className="sort-bar__view-toggle" style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          <button 
            className={`btn btn--xs ${installedModsViewMode === 'list' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setInstalledModsViewMode('list')}
            style={{ 
              padding: '6px 14px', 
              borderRadius: 6,
              background: installedModsViewMode === 'list' ? 'var(--accent)' : 'var(--bg-surface)',
              color: installedModsViewMode === 'list' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              border: installedModsViewMode === 'list' ? 'none' : '1px solid var(--border)',
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: '0.05em'
            }}
          >
            LIST
          </button>
          <button 
            className={`btn btn--xs ${installedModsViewMode === 'icons' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setInstalledModsViewMode('icons')}
            style={{ 
              padding: '6px 14px', 
              borderRadius: 6,
              background: installedModsViewMode === 'icons' ? 'var(--accent)' : 'var(--bg-surface)',
              color: installedModsViewMode === 'icons' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              border: installedModsViewMode === 'icons' ? 'none' : '1px solid var(--border)',
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: '0.05em'
            }}
          >
            ICONS
          </button>
        </div>

        <div style={{ borderLeft: '1px solid var(--border)', height: 24 }} />

        <div className="sort-bar__search" style={{ flex: 1 }}>
          <div className="search-wrap" style={{ height: 36, background: 'var(--bg-tertiary)', position: 'relative' }}>
            <Search className="search-wrap__icon" size={16} />
            <input
              className="search-input"
              type="text"
              placeholder="Quick search title or author..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: 'var(--fs-sm)', paddingRight: 32 }}
            />
            {searchQuery && (
              <X 
                size={14} 
                style={{ position: 'absolute', right: 10, cursor: 'pointer', opacity: 0.5 }} 
                onClick={() => setSearchQuery('')} 
                className="hover-opacity-1"
              />
            )}
          </div>
        </div>

        <button 
          className={`btn ${showOnlyFavorites ? 'btn--primary' : 'btn--secondary'} btn--sm`}
          onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
          style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Heart size={14} fill={showOnlyFavorites ? 'currentColor' : 'none'} /> Favorites
        </button>

        <button 
          className={`btn ${showOnlyUpdates ? 'btn--primary' : 'btn--secondary'} btn--sm`}
          onClick={() => setShowOnlyUpdates(!showOnlyUpdates)}
          style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
          title={updates.length === 0 ? "No updates detected. Run 'Check for Updates' first." : "Filter by mods needing updates"}
        >
          <RefreshCw size={14} className={showOnlyUpdates ? 'animate-pulse' : ''} /> Updates
          {updates.length > 0 && (
            <span style={{ 
                background: showOnlyUpdates ? 'white' : 'var(--accent)', 
                color: showOnlyUpdates ? 'var(--accent)' : 'white', 
                borderRadius: 10, 
                padding: '1px 6px', 
                fontSize: 10,
                fontWeight: 900,
                minWidth: 18,
                textAlign: 'center'
            }}>
                {updates.length}
            </span>
          )}
        </button>



        {selectedMods.length > 0 && (
          <div className="animate-fade-in-down" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            background: 'var(--accent)', 
            color: 'white',
            padding: '4px 8px 4px 12px', 
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em' }}>{selectedMods.length} SELECTED</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.6)', marginRight: 4 }}>MOVE TO:</span>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <select 
                    className="select-custom"
                    value=""
                    onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                            setShowFolderInput(true);
                        } else {
                            handleMoveTo(e.target.value);
                        }
                    }}
                    style={{ 
                        background: 'rgba(0,0,0,0.25)', 
                        border: '1px solid rgba(255,255,255,0.2)', 
                        color: 'white',
                        padding: '0 24px 0 10px',
                        height: 28,
                        fontSize: 10,
                        fontWeight: 800,
                        borderRadius: 6,
                        appearance: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        minWidth: 140
                    }}
                  >
                    <option value="" disabled hidden>SELECT DESTINATION...</option>
                    <option value="" style={{ background: '#0f172a', color: 'white' }}>MAIN LIBRARY</option>
                    {allFolders.filter(f => f !== '' && f !== 'DLC' && !hiddenFolders.includes(f)).map(f => (
                        <option key={f} value={f} style={{ background: '#0f172a', color: 'white' }}>{f.toUpperCase()}</option>
                    ))}
                    <option value="__NEW__" style={{ background: '#0f172a', color: 'var(--accent)', fontWeight: 900 }}>+ NEW FOLDER...</option>
                  </select>
                  <ChevronDown size={12} style={{ position: 'absolute', right: 8, pointerEvents: 'none', opacity: 0.7 }} />
              </div>
            </div>
            <button 
              className="btn btn--secondary btn--sm"
              onClick={() => {
                const selectedModIds = mods
                  .filter(m => selectedMods.includes(m.fileName))
                  .map(m => m.modId)
                  .filter(id => id);
                
                const key = exportCollection(selectedModIds);
                if (key) {
                  if (window.api && window.api.clipboard) {
                    window.api.clipboard.writeText(key);
                  } else {
                    navigator.clipboard.writeText(key);
                  }
                  useToastStore.getState().success('Selection exported as Mod Key!');
                }
              }}
              style={{ height: 28, fontSize: 11, fontWeight: 700 }}
            >
              <Share2 size={12} /> EXPORT CLUSTER
            </button>
            <button 
              className="btn btn--sm" 
              onClick={() => setSelectedMods([])} 
              style={{ padding: 0, width: 24, height: 24, background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white' }}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {allUniqueTags.length > 0 && (
        <div className="tag-ribbon" style={{ 
          display: 'flex', 
          gap: 8, 
          overflowX: 'auto', 
          padding: '0 0 16px 0', 
          marginBottom: 8,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}>
          {allUniqueTags.map(tag => {
            const isSelected = selectedTags.includes(tag.name);
            return (
              <button
                key={tag.name}
                className={`btn btn--xs ${isSelected ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => {
                  setSelectedTags(prev => 
                    isSelected ? prev.filter(t => t !== tag.name) : [...prev, tag.name]
                  );
                }}
                style={{ 
                  borderRadius: 100, 
                  padding: '4px 12px', 
                  fontSize: 10, 
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: isSelected ? '0 2px 8px var(--accent-dim)' : 'none'
                }}
              >
                <Tag size={10} />
                {tag.name}
                <span style={{ opacity: 0.5 }}>{tag.count}</span>
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button 
              className="btn btn--ghost btn--xs" 
              onClick={() => setSelectedTags([])}
              style={{ fontSize: 10, color: 'var(--text-muted)' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {showFolderInput && (
          <div className="animate-fade-in-down" style={{ 
            display: 'flex', 
            gap: 8, 
            marginBottom: 24, 
            background: 'var(--bg-secondary)', 
            padding: 16, 
            borderRadius: 'var(--radius-lg)', 
            border: '2px dashed var(--border)',
            alignItems: 'center'
          }}>
              <FolderPlus size={20} style={{ color: 'var(--accent)' }} />
              <input 
                type="text" 
                className="search-input" 
                placeholder="Folder name (e.g. Tractors, Maps, Testing)" 
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') setShowFolderInput(false);
                }}
                autoFocus
                style={{ flex: 1, height: 40, border: '1px solid var(--border)' }}
              />
              <button className="btn btn--primary" onClick={handleCreateFolder} style={{ height: 40 }}>Create</button>
              <button className="btn btn--ghost" onClick={() => setShowFolderInput(false)} style={{ height: 40 }}>Cancel</button>
          </div>
      )}

      {/* Grouped Folders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }} className="stagger-children">
        {Object.entries(folders).map(([folderName, folderData]) => {
          const { mods: folderMods, isHidden } = folderData;
          const isRenaming = renamingFolder === folderName;
          const isExpanded = expandedFolders[folderName] !== false && !isHidden;

          return (
            <div 
              key={folderName} 
              className={`folder-group ${isHidden ? 'folder-group--hidden' : ''} ${draggedFolder === folderName ? 'folder-group--dragging' : ''}`}
              draggable={canDragFolder}
              onDragStart={(e) => handleDragStart(e, folderName)}
              onDragOver={(e) => handleDragOver(e, folderName)}
              onDragLeave={() => {
                  setDropIndicator(null);
                  setDragOverFolder(null);
              }}
              onDrop={(e) => handleDrop(e, folderName)}
              onDragEnd={handleDragEnd}
              style={{ 
                background: isHidden ? 'var(--bg-secondary)' : 'var(--bg-card)', 
                borderRadius: 'var(--radius-lg)', 
                border: (dragOverFolder === folderName) 
                    ? '2px solid var(--accent)' 
                    : (isHidden ? '1px dashed var(--border)' : '1px solid var(--border)'),
                overflow: 'visible', // Allow indicators to pop out
                boxShadow: (dragOverFolder === folderName)
                    ? '0 0 20px var(--accent-dim), inset 0 0 10px var(--accent-dim)'
                    : (isHidden ? 'none' : '0 2px 8px rgba(0,0,0,0.05)'),
                opacity: isHidden ? 0.7 : 1,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                transform: (dragOverFolder === folderName && !draggedFolder) ? 'scale(1.01)' : 'scale(1)',
                marginTop: (dropIndicator?.folderName === folderName && dropIndicator.position === 'top') ? 40 : 0,
                marginBottom: (dropIndicator?.folderName === folderName && dropIndicator.position === 'bottom') ? 40 : 0
              }}
            >
              {/* Drop Indicators */}
              {dropIndicator?.folderName === folderName && (
                  <div style={{
                      position: 'absolute',
                      left: 20, // Aligned with the Grab Handle start
                      right: 20,
                      height: 4, // Slightly thinner for more precision
                      background: 'var(--accent)',
                      zIndex: 1000,
                      boxShadow: '0 0 20px var(--accent), 0 0 10px var(--accent)',
                      [dropIndicator.position]: -26, // Fine-tuned to align with the vertical center of the handle's future position
                      borderRadius: 10,
                      pointerEvents: 'none'
                  }}>
                    {/* Visual End Caps - Smaller to match handle dots */}
                    <div style={{ position: 'absolute', left: -4, top: -4, bottom: -4, width: 12, background: 'var(--accent)', borderRadius: '50%', boxShadow: '0 0 10px var(--accent)' }} />
                  </div>
              )}
              <div 
                  style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12, 
                      padding: isHidden ? '8px 20px' : '12px 20px',
                      background: (isHidden ? 'transparent' : 'var(--bg-tertiary)'),
                      cursor: 'pointer',
                      userSelect: 'none'
                  }}
                  onClick={() => !isHidden && setExpandedFolder(folderName, !expandedFolders[folderName])}
              >
                {!isHidden && (
                  <div 
                    className="drag-handle"
                    style={{ cursor: 'grab', color: 'var(--text-muted)', marginRight: -4, padding: '4px' }}
                    onMouseEnter={() => setCanDragFolder(true)}
                    onMouseLeave={() => setCanDragFolder(false)}
                    onClick={e => e.stopPropagation()}
                  >
                    <GripVertical size={16} />
                  </div>
                )}
                
                {!isHidden && (
                  <div style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'all 0.2s' }}>
                    <ChevronRight size={18} />
                  </div>
                )}
                
                <div 
                    onClick={(e) => {
                      if (isHidden) {
                        e.stopPropagation();
                        toggleHiddenFolder(folderName);
                      }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}
                  >
                    <Folder size={isHidden ? 14 : 18} style={{ color: 'var(--text-tertiary)' }} />
                    
                    {isRenaming ? (
                       <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          <input 
                            autoFocus
                            className="editable-label__input"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') submitRename();
                              if (e.key === 'Escape') setRenamingFolder(null);
                            }}
                            onBlur={submitRename}
                            style={{ height: 28, fontSize: 12, padding: '0 8px', borderRadius: 4, width: 200 }}
                          />
                       </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span 
                           className="editable-label"
                           style={{ fontWeight: 800, fontSize: isHidden ? 11 : 'var(--fs-sm)', letterSpacing: '0.05em' }}
                           onClick={(e) => {
                             if (folderName === '' || folderName === 'DLC') return;
                             e.stopPropagation();
                             handleRenameFolder(folderName);
                           }}
                           title={folderName === '' || folderName === 'DLC' ? "" : "Click to rename folder"}
                         >
                           {folderName === '' ? 'MAIN' : folderName.toUpperCase()}
                           {folderName !== '' && folderName !== 'DLC' && (
                             <Pencil size={12} className="editable-label__icon" style={{ marginLeft: 8 }} />
                           )}
                         </span>
                        {!isHidden && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
                              ({folderMods.length} mods)
                            </span>
                            
                            {/* Requirements Badge for Maps */}
                            {(() => {
                               const result = folderData.requirements;
                               if (result.status === 'none') return null;
                               return (
                                 <>
                                   <div 
                                     className="dependency-badge"
                                     style={{ 
                                         display: 'flex', 
                                         alignItems: 'center', 
                                         gap: 6, 
                                         padding: '3px 12px', 
                                         borderRadius: 100, 
                                         fontSize: 10, 
                                         fontWeight: 900,
                                         background: result.status === 'satisfied' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                                         color: result.status === 'satisfied' ? '#22c55e' : '#fbbf24',
                                         border: `1px solid ${result.status === 'satisfied' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(251, 191, 36, 0.3)'}`,
                                         textTransform: 'uppercase',
                                         letterSpacing: '0.06em',
                                         cursor: 'default',
                                         position: 'relative',
                                         transition: 'all 0.2s ease'
                                     }}
                                   >
                                     {result.status === 'satisfied' ? <Check size={11} /> : <AlertTriangle size={11} />}
                                     <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                         {result.status === 'satisfied' 
                                            ? 'Requirements Met' 
                                            : isResolving && resolvingStatus?.targetFolder === folderName
                                              ? 'Resolving...'
                                              : 'Requirements'}
                                     </div>
                                   </div>
                                     
                                   {result.status === 'missing' && result.missing.length > 0 && (
                                       <div className="badge-tooltip" style={{
                                           position: 'absolute',
                                           bottom: '100%',
                                           left: '50%',
                                           transform: 'translateX(-50%)',
                                           marginBottom: 8,
                                           padding: '8px 12px',
                                           background: 'rgba(20, 25, 40, 0.95)',
                                           backdropFilter: 'blur(10px)',
                                           border: '1px solid var(--border)',
                                           borderRadius: 8,
                                           width: 'max-content',
                                           maxWidth: 250,
                                           zIndex: 1000,
                                           boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                           pointerEvents: 'none',
                                           opacity: 0,
                                           transition: 'opacity 0.2s',
                                           color: 'var(--text-primary)',
                                           textAlign: 'left'
                                       }}>
                                           <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: 10, marginBottom: 4, textTransform: 'uppercase' }}>Missing Mods:</div>
                                           {result.missing.map((m, idx) => (
                                               <div key={idx} style={{ fontSize: 11, opacity: 0.9, lineHeight: 1.4, marginBottom: 2 }}>• {m}</div>
                                           ))}
                                       </div>
                                   )}
                                   <style>{`.dependency-badge:hover + .badge-tooltip, .dependency-badge:hover .badge-tooltip { opacity: 1 !important; }`}</style>
                                 </>
                               );
                            })()}
                          </div>
                        )}
                        {isHidden && (
                           <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase' }}>• Hidden</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
                    {!isHidden && folderMods.length > 1 && (
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 4, background: 'rgba(0,0,0,0.05)' }}
                        onClick={() => toggleAllInFolder(folderName, folderMods)}
                        onMouseDown={e => e.stopPropagation()}
                        onDragStart={e => e.stopPropagation()}
                      >
                          <input 
                            type="checkbox" 
                            readOnly 
                            checked={folderMods.length > 0 && folderMods.every(m => selectedMods.includes(m.fileName))}
                            style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
                          />
                          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>Select All</span>
                        </div>
                      )}

                    {!isHidden && folderName !== 'DLC' && folderMods.length > 0 && (
                        <button 
                            className="btn btn--danger btn--sm"
                            disabled={!folderMods.some(m => selectedMods.includes(m.fileName))}
                            onClick={async () => {
                                const folderSelected = folderMods.filter(m => selectedMods.includes(m.fileName));
                                if (folderSelected.length === 0) return;
                                const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
                                if (skipConfirm || confirm(`Delete ${folderSelected.length} selected mods in ${folderName || 'MAIN'}?`)) {
                                    useLocalModsStore.getState().bulkUninstallMods(folderSelected);
                                    setSelectedMods(prev => prev.filter(f => !folderSelected.some(m => m.fileName === f)));
                                    useToastStore.getState().success(`Deleted ${folderSelected.length} mods.`);
                                }
                            }}
                            style={{ height: 32, width: 32, padding: 0 }}
                            title="Delete Selected Mods in Folder"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}

                    
                    {!isHidden && folderMods.length > 0 && (
                      <div 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 8, 
                          background: 'rgba(0,0,0,0.05)', 
                          padding: '4px 8px', 
                          borderRadius: 4,
                          marginRight: 4
                        }}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        onPointerDown={e => e.stopPropagation()}
                        onDragStart={e => e.stopPropagation()}
                      >
                          <LayoutGrid size={12} style={{ opacity: 0.4 }} />
                          <div style={{ 
                            position: 'relative', 
                            width: 60, 
                            height: 4, 
                            background: 'rgba(255,255,255,0.1)', 
                            borderRadius: 2, 
                            display: 'flex', 
                            alignItems: 'center',
                            margin: '0 4px'
                          }}>
                              <input 
                                type="range" 
                                min="120" 
                                max="350" 
                                step="5"
                                value={folderZooms[folderName] || 180}
                                onChange={(e) => setFolderZoom(folderName, parseInt(e.target.value))}
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
                                title={installedModsViewMode === 'grid' ? "Card Size" : "Icon Size"}
                              />
                          </div>
                          <LayoutGrid size={16} style={{ opacity: 0.7 }} />
                      </div>
                    )}

                    {!isHidden && !isRenaming && (
                        <button 
                            className={`btn btn--sm ${iconOnlyFolders.includes(folderName) ? 'btn--primary' : 'btn--secondary'}`}
                            onClick={() => toggleIconOnlyFolder(folderName)}
                            style={{ 
                                height: 32, 
                                padding: '0 12px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 6,
                                background: iconOnlyFolders.includes(folderName) ? 'var(--accent)' : 'var(--bg-card)',
                                color: iconOnlyFolders.includes(folderName) ? 'white' : 'var(--text-primary)',
                                border: '1px solid var(--border)',
                                boxShadow: 'var(--shadow-sm)'
                            }}
                            title="Toggle Icon View"
                        >
                            {iconOnlyFolders.includes(folderName) ? <LayoutGrid size={14} /> : <List size={14} />}
                            <span style={{ fontSize: 10, fontWeight: 800 }}>{iconOnlyFolders.includes(folderName) ? 'ICONS' : 'DETAILS'}</span>
                        </button>
                    )}

                    {folderName === '' && !isHidden && (
                        <button 
                            className="btn btn--sm btn--primary" 
                            style={{ background: 'var(--accent)', color: 'white', fontWeight: 800, height: 32, padding: '0 12px', border: 'none' }}
                            onClick={(e) => { e.stopPropagation(); handleAutoSortMaps(); }}
                            title="Automatically move maps from MAIN to their own folders"
                        >
                            Auto-Sort Maps
                        </button>
                    )}



                    {folderName !== '' && folderName !== 'DLC' && !isRenaming && (
                      <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                        <button 
                          className={`btn btn--sm ${isHidden ? 'btn--primary' : 'btn--ghost'}`} 
                          onClick={() => toggleHiddenFolder(folderName)}
                          style={{ padding: 0, width: isHidden ? 80 : 28, height: 28, fontSize: 10, gap: 4 }}
                          title={isHidden ? "Unhide" : "Hide"}
                        >
                          {isHidden ? <Eye size={12} /> : <EyeOff size={14} />}
                          {isHidden && "UNHIDE"}
                        </button>
                        {!isHidden && folderName !== 'DLC' && (
                          <button 
                            className="btn btn--sm btn--danger" 
                            onClick={() => handleDeleteFolder(folderName, folderMods.length)}
                            style={{ padding: 0, width: 28, height: 28, background: 'var(--danger)', color: 'white' }}
                            title="Delete Folder"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && (
                <div style={{ padding: installedModsViewMode === 'grid' ? '16px' : '4px 0' }}>
                  {folderMods.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Empty Folder — move mods here to organize them.
                    </div>
                  ) : (
                    installedModsViewMode === 'grid' ? (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: `repeat(auto-fill, minmax(${folderZooms[folderName] || 180}px, 1fr))`, 
                        gap: 16 
                      }}>
                         {folderMods.map((mod, modIdx) => (
                          <div 
                            key={`${mod.fileName}-${modIdx}`}
                            style={{ 
                                contentVisibility: 'auto', 
                                containIntrinsicSize: `auto 250px` 
                            }}
                          >
                            <ModCard 
                                mod={mod}
                                isSelected={selectedMods.includes(mod.fileName)}
                                onToggleSelect={toggleSelect}
                                onNavigate={handleNavigate}
                                onUpdate={handleUpdateCallback}
                                onUninstall={handleUninstallCallback}
                                status={getModStatus(mod)}
                                updateInfo={getUpdateInfo(mod)}
                                isUpdating={updatingMod === mod.fileName || !!activeDownloads[mod.modId]}
                                formatSize={formatSize}
                                isIconOnly={iconOnlyFolders.includes(folderName)}
                                zoom={folderZooms[folderName] || 180}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      folderMods.map((mod) => {
                        const status = getModStatus(mod);
                        const updateInfo = getUpdateInfo(mod);
                        const isUpdating = updatingMod === mod.fileName || !!activeDownloads[mod.modId];
                        const isSelected = selectedMods.includes(mod.fileName);
                        const modIdKey = mod.modId ? String(mod.modId) : mod.fileName;
                        const isFavMod = favModIds.has(modIdKey);
                        const authorName = mod.author || 'Unknown';
                        const isFavAuthor = favAuthorNames.has(authorName.toLowerCase());
                        const isMustHave = mustHaveIds.has(modIdKey);

                        return (
                          <div 
                              className={`mod-row-compact ${isSelected ? 'mod-row-compact--selected' : ''}`} 
                              key={mod.fileName} 
                              draggable={true}
                              onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData('sourceModFile', mod.fileName);
                                  e.dataTransfer.effectAllowed = 'move';
                                  setIsInternalDragging(true);
                              }}
                              onDragEnd={() => setIsInternalDragging(false)}
                              style={{ 
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '16px 20px',
                                  borderBottom: '1px solid var(--border-light)',
                                  transition: 'all 0.15s',
                                  background: isSelected ? 'var(--accent-dim)' : 'transparent',
                                  cursor: 'grab',
                                  contentVisibility: 'auto',
                                  containIntrinsicSize: 'auto 110px'
                              }}
                          >
                            <div 
                              style={{ width: 32, cursor: 'pointer' }}
                              onMouseDown={e => e.stopPropagation()}
                              onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelect(mod.fileName);
                              }}
                            >
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  readOnly
                                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                                />
                            </div>

                            <div 
                              onClick={() => navigate(`/installed/mod/${encodeURIComponent(mod.fileName)}`)}
                              style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, cursor: 'pointer' }}
                            >
                              {(() => {
                                const zoom = folderZooms[folderName] || 180;
                                // Map 120-350 zoom value to 120-300 icon size
                                const iconSize = Math.floor(120 + ((zoom - 120) / (350 - 120)) * (300 - 120));
                                return (
                                  <div style={{ 
                                    width: iconSize, 
                                    height: iconSize, 
                                    marginRight: 20, 
                                    borderRadius: 8, 
                                    overflow: 'hidden', 
                                    background: 'var(--bg-tertiary)', 
                                    flexShrink: 0, 
                                    border: '1px solid var(--border)',
                                    transition: 'all 0.1s ease',
                                    position: 'relative'
                                  }}>
                                      <LocalModIcon mod={mod} />
                                      <div 
                                          style={{ position: 'absolute', top: 4, right: 4, display: 'flex', flexDirection: 'column', gap: 4 }}
                                          onClick={e => e.stopPropagation()}
                                      >
                                          <button onClick={() => toggleFavoriteMod(mod)} style={{ color: isFavMod ? '#fbbf24' : 'white', filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }}>
                                              <Star size={14} fill={isFavMod ? 'currentColor' : 'none'} />
                                          </button>
                                          <button onClick={() => toggleFavoriteAuthor({ name: authorName, id: mod.modId || authorName })} style={{ color: isFavAuthor ? 'var(--danger)' : 'white', filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }}>
                                              <Heart size={14} fill={isFavAuthor ? 'currentColor' : 'none'} />
                                          </button>
                                      </div>
                                  </div>
                                );
                              })()}

                              <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 800, fontSize: 'var(--fs-md)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                      {!mod.isDLC && <Package size={16} style={{ color: 'var(--accent)', opacity: 0.8 }} title="ZIP Archive" />}
                                      <span>{mod.title}</span>
                                      {status === 'update' && (
                                          <span style={{ fontSize: 10, background: 'var(--warning)', color: 'black', padding: '2px 8px', borderRadius: 4, fontWeight: 900 }}>UPDATE</span>
                                      )}
                                      {status === 'removed' && (
                                          <span style={{ fontSize: 10, background: 'var(--danger)', color: 'white', padding: '2px 8px', borderRadius: 4, fontWeight: 900 }}>REMOVED</span>
                                      )}
                                  </div>
                                  <div style={{ fontSize: 13, color: isFavAuthor ? 'var(--danger)' : 'var(--text-secondary)', marginTop: 4, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {!mod.isDLC && (
                                        <span>by {authorName}</span>
                                    )}
                                    <span style={{ opacity: 0.5, fontWeight: 400 }}>{mod.fileName}</span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={(e) => { e.stopPropagation(); toggleFavoriteMod(mod); }} style={{ background: 'transparent', border: 'none', padding: 0, color: isFavMod ? '#fbbf24' : 'var(--text-muted)', cursor: 'pointer' }}>
                                            <Star size={14} fill={isFavMod ? 'currentColor' : 'none'} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); toggleFavoriteAuthor({ name: authorName }); }} style={{ background: 'transparent', border: 'none', padding: 0, color: isFavAuthor ? 'var(--danger)' : 'var(--text-muted)', cursor: 'pointer' }}>
                                            <Heart size={14} fill={isFavAuthor ? 'currentColor' : 'none'} />
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMustHaveMod(mod);
                                            }}
                                            style={{ 
                                                background: 'transparent', border: 'none', padding: 0,
                                                color: isMustHave ? 'var(--accent)' : 'var(--text-muted)',
                                                opacity: 1,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Pin size={14} fill={isMustHave ? "currentColor" : "none"} strokeWidth={isMustHave ? 2.5 : 2} />
                                        </button>
                                    </div>
                                </div>
                                    {mod.isDLC && <span style={{ marginLeft: 8, fontSize: 10, background: '#3b82f6', color: 'white', padding: '1px 6px', borderRadius: 4, fontWeight: 900 }}>DLC</span>}
                                  </div>
                            </div>

                            <div style={{ width: 120, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {!mod.isDLC && (
                                status === 'removed' ? (
                                    <span style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 800 }}>REMOVED FROM MODHUB</span>
                                ) : status === 'update' ? (
                                    <span style={{ color: 'var(--warning)', fontWeight: 800 }}>v{mod.version} → v{updateInfo.remoteVersion}</span>
                                ) : `v${mod.version}`
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: 120, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-start', padding: '0 16px' }}>
                                {mod.tags && mod.tags.slice(0, 3).map((tag, i) => (
                                    <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            <div style={{ width: 100, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {!mod.isDLC && formatSize(mod.size)}
                            </div>

                            <div style={{ width: 100, display: 'flex', justifyContent: 'flex-end', gap: 8, marginLeft: 20 }} onClick={e => e.stopPropagation()}>
                              {status === 'update' && (
                                  <button
                                      className="btn btn--primary btn--icon btn--sm"
                                      onClick={() => handleUpdate(mod.fileName, updateInfo.modId)}
                                      disabled={isUpdating}
                                      style={{ width: 32, height: 32 }}
                                  >
                                      {isUpdating ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                                  </button>
                              )}
                              {!mod.isDLC && (
                                <button
                                  className="btn btn--danger btn--icon btn--sm"
                                  onClick={() => handleUninstall(mod)}
                                  style={{ width: 32, height: 32, background: 'var(--danger)', color: 'white' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mods.length === 0 && !isLoading && (
        <div className="empty-state" style={{ padding: '80px 0' }}>
          <Package className="empty-state__icon" size={64} style={{ opacity: 0.3 }} />
          <div className="empty-state__title">Library empty</div>
          <div className="empty-state__desc">Install some mods from the ModHub to get started.</div>

        </div>
      )}

      {/* -- Dependency Auto-Downloader -- */}
      {depFixState.active && (
          <DependencyDownloadModal 
              missingMods={depFixState.missing}
              subFolder={depFixState.subFolder}
              onCancel={() => setDepFixState(prev => ({ ...prev, active: false }))}
              onComplete={() => {
                  setDepFixState(prev => ({ ...prev, active: false }));
                  scanMods();
              }}
          />
      )}
    </div>
  );
}
