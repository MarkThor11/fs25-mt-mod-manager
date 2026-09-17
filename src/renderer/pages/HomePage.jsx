import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Package, Download, RefreshCw, ArrowRight, Globe, Star, Users, Share2, Clipboard, DownloadCloud, Activity, Pencil, Palette, Camera, Move
} from 'lucide-react';
import ModCard from '../components/modhub/ModCard';
import HeroCustomizerModal from '../components/common/HeroCustomizerModal';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSavegameStore } from '../store/useSavegameStore';
import { useToastStore } from '../store/useToastStore';
import { useModHubStore } from '../store/useModHubStore';
import { useInstalledLookup } from '../hooks/useInstalledLookup';
import mapUs from '../assets/maps/map_us.png';
import mapEu from '../assets/maps/map_eu.png';
import mapAs from '../assets/maps/map_as.png';
import mapKinlaig from '../assets/maps/map_kinlaig.jpg';

export default function HomePage() {
  const navigate = useNavigate();
  const { mods: localMods, modCount, scanMods, checkUpdates, updates, isCheckingUpdates, setShowOnlyUpdates } = useLocalModsStore();
  const { savegames, fetchSavegames } = useSavegameStore();
  const { 
    totalMods, latestCount, newCount, updateCount, fetchStats,
    homeFeatured, setHomeFeatured, homeTopDownloaded, setHomeTopDownloaded 
  } = useModHubStore();

  const { 
    homeShowHero, 
    homeShowStats, 
    homeShowLatest, 
    homeShowDownloaded, 
    homeShowUpdates,
    nickname,
    setNickname,
    heroBgType,
    heroCustomBg,
    heroDimmer,
    heroAlignment,
    heroTextPosX,
    heroTextPosY,
    heroFont,
    heroTextSize,
    heroTextColor,
    heroTextShadow,
    heroShowText,
    heroShowSubtitle,
    updateHeroBannerSettings
  } = useSettingsStore();

  const getInstalledVersion = useInstalledLookup();
  const { exportCollection, importCollection, batchProgress } = useLocalModsStore();
  const [importKey, setImportKey] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [loadingFeatured, setLoadingFeatured] = useState(homeFeatured.length === 0);
  const [loadingTopDownloaded, setLoadingTopDownloaded] = useState(homeTopDownloaded.length === 0);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [isDraggingText, setIsDraggingText] = useState(false);
  const bannerRef = useRef(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, heroRect: null, origX: 10, origY: 50, hasMoved: false });

  const handleTextMouseDown = (e) => {
    if (isEditingName || e.target.closest('.home-hero__editable-name') || e.target.closest('.home-hero__name-input')) {
      return;
    }
    if (e.button !== 0) return;

    const heroRect = bannerRef.current?.getBoundingClientRect();
    if (!heroRect) return;

    e.preventDefault();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      heroRect,
      origX: heroTextPosX ?? (heroAlignment === 'center' ? 50 : heroAlignment === 'right' ? 88 : 10),
      origY: heroTextPosY ?? 50,
      hasMoved: false
    };

    setIsDraggingText(true);
  };

  useEffect(() => {
    if (!isDraggingText) return;

    const handleMouseMove = (e) => {
      const { startX, startY, heroRect, origX, origY } = dragStartRef.current;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        dragStartRef.current.hasMoved = true;
      }

      const deltaXPct = (deltaX / heroRect.width) * 100;
      const deltaYPct = (deltaY / heroRect.height) * 100;

      const newX = Math.min(Math.max(5, Math.round(origX + deltaXPct)), 95);
      const newY = Math.min(Math.max(10, Math.round(origY + deltaYPct)), 90);

      updateHeroBannerSettings({ heroTextPosX: newX, heroTextPosY: newY });
    };

    const handleMouseUp = () => {
      setIsDraggingText(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingText]);

  useEffect(() => {
    fetchSavegames();
    fetchStats();
    // Only fetch live network items if local cache is empty
    if (homeShowLatest && homeFeatured.length === 0) loadFeaturedMods();
    if (homeShowDownloaded && homeTopDownloaded.length === 0) loadTopDownloadedMods();
  }, []);

  const loadFeaturedMods = async () => {
    if (!window.api?.modhub) return;
    try {
      const result = await window.api.modhub.fetchMods({ filter: 'latest', page: 0 });
      // Only show mods that are truly NEW (filtering out updates)
      const newMods = (result.mods || []).filter(m => m.isNew).slice(0, 18);
      setHomeFeatured(newMods);
    } catch (err) {
      console.error('Failed to load featured mods:', err);
    } finally {
      setLoadingFeatured(false);
    }
  };

  const loadTopDownloadedMods = async () => {
    if (!window.api?.modhub) return;
    try {
      const result = await window.api.modhub.fetchMods({ filter: 'downloads', page: 0 });
      // Explicitly sort by download count as a safety measure for the UI
      const sorted = (result.mods || []).sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      const topMods = sorted.slice(0, 18);
      setHomeTopDownloaded(topMods);
    } catch (err) {
      console.error('Failed to load top downloaded mods:', err);
    } finally {
      setLoadingTopDownloaded(false);
    }
  };
  const latestSave = [...savegames]
    .filter(s => !s.isGhost && s.playerName)
    .sort((a, b) => new Date(b.lastSaved) - new Date(a.lastSaved))[0];
    
  const rawName = nickname || latestSave?.playerName || (savegames.find(s => !s.isGhost && s.playerName)?.playerName) || 'Farmer';
  
  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (trimmed && trimmed !== rawName) {
      setNickname(trimmed);
      useToastStore.getState().success(`Welcome, ${trimmed}!`);
    }
    setIsEditingName(false);
  };

  const getBannerBackground = () => {
    switch (heroBgType) {
      case 'riverbend': return `url(${mapUs})`;
      case 'zielonka': return `url(${mapEu})`;
      case 'hutan': return `url(${mapAs})`;
      case 'kinlaig': return `url(${mapKinlaig})`;
      case 'custom': return heroCustomBg ? `url(${heroCustomBg})` : null;
      default: return null;
    }
  };

  const bannerBgUrl = getBannerBackground();
  const hasCustomBackground = !!bannerBgUrl;

  return (
    <div className="page animate-fade-in-up">
      {/* Hero */}
      {homeShowHero && (
        <div 
          ref={bannerRef}
          className={`home-hero home-hero--align-${heroAlignment || 'left'} home-hero--font-${heroFont || 'modern'} home-hero--size-${heroTextSize || 'standard'} ${!heroShowText ? 'home-hero--photo-mode' : ''}`}
          style={{
            ...(hasCustomBackground ? {
              backgroundImage: bannerBgUrl,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            } : {}),
            zIndex: showCustomizer ? 1120 : undefined
          }}
        >
          {/* Dimmer overlay for text contrast */}
          {hasCustomBackground && (
            <div 
              className="home-hero__dimmer" 
              style={{ opacity: (heroDimmer !== undefined ? heroDimmer : 50) / 100 }}
            />
          )}

          {/* Customize Button (glassmorphic on top right) */}
          <button 
            className="home-hero__customize-btn"
            onClick={() => setShowCustomizer(true)}
            title="Customize Banner Wallpaper & Typography"
          >
            <Palette size={14} />
            <span>Customize</span>
          </button>

          {heroShowText ? (
            <div 
              className={`home-hero__content ${isDraggingText ? 'home-hero__content--dragging' : ''}`}
              onMouseDown={handleTextMouseDown}
              style={{
                left: `${heroTextPosX ?? (heroAlignment === 'center' ? 50 : heroAlignment === 'right' ? 88 : 10)}%`,
                top: `${heroTextPosY ?? 50}%`,
                transform: `translate(-${heroTextPosX ?? (heroAlignment === 'center' ? 50 : heroAlignment === 'right' ? 88 : 10)}%, -${heroTextPosY ?? 50}%)`,
                textAlign: heroAlignment || ((heroTextPosX ?? 10) < 35 ? 'left' : (heroTextPosX ?? 10) > 65 ? 'right' : 'center'),
                maxWidth: '680px',
                width: 'max-content',
                cursor: isDraggingText ? 'grabbing' : 'grab',
                userSelect: isDraggingText ? 'none' : 'auto'
              }}
            >
              {/* Drag Position Handle */}
              <div 
                className="home-hero__drag-handle"
                title="Click and drag anywhere to move text position on the banner"
              >
                <Move size={11} />
                <span>Drag to move</span>
              </div>

              <h1 
                className="home-hero__title"
                style={{
                  color: heroTextColor || '#ffffff',
                  textShadow: heroTextShadow ? '0 2px 14px rgba(0,0,0,0.9), 0 1px 4px rgba(0,0,0,0.95)' : 'none'
                }}
              >
                Welcome {isEditingName ? (
                  <input 
                    autoFocus
                    className="home-hero__name-input"
                    value={tempName}
                    onChange={e => setTempName(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{ color: heroTextColor || '#ffffff' }}
                  />
                ) : (
                  <span 
                    className="home-hero__editable-name" 
                    onClick={(e) => { 
                      e.stopPropagation();
                      setTempName(rawName); 
                      setIsEditingName(true); 
                    }}
                    title="Click to change your nickname"
                    style={{ color: heroTextColor || '#ffffff' }}
                  >
                    '{rawName}'
                    <Pencil size={20} className="home-hero__edit-icon" />
                  </span>
                )}
              </h1>
              {heroShowSubtitle && (
                <p 
                  className="home-hero__subtitle"
                  style={{
                    color: heroTextColor || 'var(--text-secondary)',
                    opacity: 0.9,
                    textShadow: heroTextShadow ? '0 1px 8px rgba(0,0,0,0.85)' : 'none'
                  }}
                >
                  Browse, install, and manage your Farming Simulator 25 mods — all from one place. 
                  Use the sidebar to navigate between sections.
                </p>
              )}
            </div>
          ) : (
            <div className="home-hero__photo-badge">
              <Camera size={14} />
              <span>Photo Mode</span>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {homeShowStats && (
        <div className="home-stats-container" style={{ position: 'relative', marginBottom: 'var(--sp-8)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
             <h2 style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>Dashboard Overview</h2>
          </div>
          <div className="home-stats">
          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--green">
              <Package size={22} />
            </div>
            <div>
              <div className="stat-card__value">{modCount}</div>
              <div className="stat-card__label">Installed Mods</div>
            </div>
          </div>
          <div 
            className="stat-card stat-card--clickable" 
            onClick={() => {
              setShowOnlyUpdates(true);
              navigate('/installed');
            }}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            title="Click to view installed mods with updates available"
          >
            <div className="stat-card__icon stat-card__icon--yellow">
              <Download size={22} />
            </div>
            <div>
              <div className="stat-card__value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{updates.length}</span>
                {isCheckingUpdates && (
                  <RefreshCw size={14} className="animate-spin" style={{ opacity: 0.6 }} title="Checking for updates in background..." />
                )}
              </div>
              <div className="stat-card__label">Your Updates</div>
            </div>
          </div>
           <div className="stat-card" title="Total downloadable community mods available on ModHub">
            <div className="stat-card__icon stat-card__icon--blue">
              <Globe size={22} />
            </div>
            <div>
              <div className="stat-card__value">{totalMods > 0 ? totalMods.toLocaleString() : '—'}</div>
              <div className="stat-card__label">ModHub Total</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--teal">
              <TrendingUp size={22} />
            </div>
            <div>
              <div className="stat-card__value">{newCount > 0 ? newCount : '0'}</div>
              <div className="stat-card__label">New Today</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--pink">
              <RefreshCw size={22} />
            </div>
            <div>
              <div className="stat-card__value">{updateCount > 0 ? updateCount : '0'}</div>
              <div className="stat-card__label">Updates Today</div>
            </div>
          </div>
        </div>
      </div>
    )}

      {/* New Mods */}
      {homeShowLatest && (
        <div className="home-section">
          <div className="home-section__header">
            <h2 className="home-section__title">New Mods</h2>
          </div>
          {loadingFeatured ? (
            <div className="mod-grid">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="mod-card">
                  <div className="skeleton skeleton--image" />
                  <div style={{ padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <div className="skeleton skeleton--title" />
                    <div className="skeleton skeleton--text" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mod-grid">
              {homeFeatured.map((mod) => (
                <ModCard key={mod.modId} mod={mod} hideCompare={true} hideMatch={true} hidePower={true} hidePrice={true} getInstalledVersion={getInstalledVersion} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Most Downloaded */}
      {homeShowDownloaded && (
        <div className="home-section">
          <div className="home-section__header">
            <h2 className="home-section__title">Most Downloaded</h2>
          </div>
          {loadingTopDownloaded ? (
            <div className="mod-grid">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="mod-card">
                  <div className="skeleton skeleton--image" />
                  <div style={{ padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <div className="skeleton skeleton--title" />
                    <div className="skeleton skeleton--text" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mod-grid">
              {homeTopDownloaded.map((mod) => (
                <ModCard key={mod.modId} mod={mod} hideCompare={true} hideMatch={true} hidePower={true} getInstalledVersion={getInstalledVersion} />
              ))}
            </div>
          )}
        </div>
      )}


      {/* Multiplayer Sync Section */}
      <div className="home-section" style={{ marginTop: 'var(--sp-8)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 'var(--sp-6)' }}>
          <div style={{ background: 'var(--bg-card)', padding: 'var(--sp-6)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--sp-4)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 800 }}>Multiplayer Sync</h2>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Synchronize mod clusters with your server or friends.</div>
              </div>
            </div>

            <p style={{ fontSize: 'var(--fs-sm)', opacity: 0.8, marginBottom: 'var(--sp-5)', lineHeight: 1.5 }}>
              Generate a unique <strong>Mod Key</strong> for your current installed library, or import a key to batch-install every mod required for a server in one go.
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="btn btn--primary btn--lg" 
                style={{ flex: 1, background: '#3b82f6', color: 'white' }}
                onClick={() => {
                  const key = exportCollection();
                  if (key) {
                    if (window.api && window.api.clipboard) {
                      window.api.clipboard.writeText(key);
                    } else {
                      navigator.clipboard.writeText(key);
                    }
                    useToastStore.getState().success('Mod Key copied to clipboard! Share it with your friends.');
                  }
                }}
              >
                <Share2 size={18} /> Export My Cluster
              </button>
              <button 
                className="btn btn--secondary btn--lg" 
                style={{ flex: 1 }}
                onClick={() => setShowImportModal(true)}
              >
                <DownloadCloud size={18} /> Import from Key
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-tertiary)', padding: 'var(--sp-6)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            {batchProgress ? (
              <>
                <div className="spinner" style={{ width: 48, height: 48, border: '4px solid var(--accent-dim)', borderTopColor: 'var(--accent)', marginBottom: 20 }} />
                <div style={{ fontWeight: 800, fontSize: 'var(--fs-md)', marginBottom: 4 }}>Syncing Mod Cluster...</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>Installing {batchProgress.currentIndex} of {batchProgress.total}</div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
                    <div style={{ width: `${(batchProgress.currentIndex / batchProgress.total) * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                </div>
              </>
            ) : (
              <>
                 <Activity size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                 <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Diagnostics Active</div>
                 <p style={{ fontSize: 11, opacity: 0.7, marginTop: 8, color: 'var(--text-tertiary)' }}>All mod metadata and savegame edits are verified in real-time.</p>
              </>
            )}
          </div>
        </div>
      </div>

      {showImportModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowImportModal(false)}>
          <div className="modal-content animate-zoom-in" style={{ width: 450 }} onClick={e => e.stopPropagation()}>
             <h2 style={{ marginBottom: 'var(--sp-2)' }}>Import Mod Cluster</h2>
             <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--sp-5)' }}>Paste a Mod Key below to batch-install all associated mods.</p>
             
             <textarea 
               value={importKey}
               onChange={e => setImportKey(e.target.value)}
               placeholder="Paste key here..."
               style={{ width: '100%', height: 120, padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 11, resize: 'none', marginBottom: 20 }}
             />

             <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
               <button className="btn btn--ghost" onClick={() => setShowImportModal(false)}>Cancel</button>
               <button 
                 className="btn btn--primary" 
                 disabled={!importKey.trim()}
                 onClick={async () => {
                   const res = await importCollection(importKey.trim());
                   if (res.success) {
                      useToastStore.getState().success('Sync complete! All mods installed.');
                      setShowImportModal(false);
                      setImportKey('');
                   } else {
                      useToastStore.getState().error('Import failed: ' + res.error);
                   }
                 }}
               >
                 Start Synchronization
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Hero Banner Studio Customizer Modal */}
      <HeroCustomizerModal 
        isOpen={showCustomizer} 
        onClose={() => setShowCustomizer(false)} 
      />
    </div>
  );
}
