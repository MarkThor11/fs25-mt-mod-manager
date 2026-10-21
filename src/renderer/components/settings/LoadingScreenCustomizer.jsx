import React, { useEffect, useState, useRef } from 'react';
import {
  Image, Upload, RotateCcw, Check, FolderOpen, RefreshCw, AlertCircle,
  Sparkles, Trash2, Layers, Map, Monitor, Globe, Info
} from 'lucide-react';
import { useLoadingScreenStore } from '../../store/useLoadingScreenStore';
import { useToastStore } from '../../store/useToastStore';

export default function LoadingScreenCustomizer() {
  const {
    activeTab,
    selectedMapId,
    status,
    mapScreens = [],
    isLoading,
    isApplying,
    error,
    setActiveTab,
    setSelectedMapId,
    fetchStatus,
    applyMapLoadingScreen,
    restoreMapLoadingScreen,
    openMapFolder,
    applyPreset,
    applyCustomImage,
    restoreDefault,
    deleteCustom,
    openSharedFolder,
    openCustomFolder,
  } = useLoadingScreenStore();

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleBrowseCustom = async () => {
    if (!window.api?.dialog?.selectFile) {
      useToastStore.getState().error('File dialog not available.');
      return;
    }
    try {
      const selectedPath = await window.api.dialog.selectFile({
        filters: [
          { name: 'Supported Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'dds'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (selectedPath) {
        if (activeTab === 'map') {
          await applyMapLoadingScreen(selectedPath);
        } else {
          await applyCustomImage(selectedPath);
        }
      }
    } catch (err) {
      useToastStore.getState().error(`File select error: ${err.message}`);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      const filePath = file.path;
      if (filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'dds'].includes(ext)) {
          if (activeTab === 'map') {
            await applyMapLoadingScreen(filePath);
          } else {
            await applyCustomImage(filePath);
          }
        } else {
          useToastStore.getState().warning('Please drop an image file (PNG, JPG, WebP, BMP, or DDS).');
        }
      }
    }
  };

  if (isLoading && !status) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
        <span>Loading game loading screen assets...</span>
      </div>
    );
  }

  if (!status?.available) {
    return (
      <div
        style={{
          padding: '16px 20px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <AlertCircle size={22} style={{ color: '#ef4444', flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: '#ef4444' }}>
            Game Assets Folder Not Detected
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {status?.error || error || 'Farming Simulator 25 installation folder could not be found.'}
            {' '}Please ensure your Game Path is configured in the File Paths section above.
          </div>
        </div>
      </div>
    );
  }

  const { active, presets = [], custom = [] } = status;
  const isDefaultActive = active?.isDefault;

  // Selected map calculation
  const currentMap = selectedMapId === 'all'
    ? mapScreens[0]
    : mapScreens.find(m => m.id === selectedMapId) || mapScreens[0];

  const isCurrentMapOriginal = selectedMapId === 'all'
    ? mapScreens.every(m => m.isOriginal)
    : currentMap?.isOriginal;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Mode Selection Tabs ── */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '4px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          width: 'fit-content',
        }}
      >
        <button
          onClick={() => setActiveTab('map')}
          className="btn btn--sm"
          style={{
            background: activeTab === 'map' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'map' ? '#fff' : 'var(--text-secondary)',
            fontWeight: activeTab === 'map' ? 600 : 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            padding: '6px 14px',
            transition: 'all 0.15s ease',
          }}
        >
          <Map size={16} />
          <span>Map Loading Screens (In-Game)</span>
        </button>

        <button
          onClick={() => setActiveTab('menu')}
          className="btn btn--sm"
          style={{
            background: activeTab === 'menu' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'menu' ? '#fff' : 'var(--text-secondary)',
            fontWeight: activeTab === 'menu' ? 600 : 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            padding: '6px 14px',
            transition: 'all 0.15s ease',
          }}
        >
          <Monitor size={16} />
          <span>Main Menu Background (Startup)</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB 1: MAP LOADING SCREEN (IN-GAME)
          ══════════════════════════════════════════════════════════ */}
      {activeTab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Map Selector Pills */}
          <div>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px' }}>
              CHOOSE MAP TO CUSTOMIZE
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                className={`btn btn--sm ${selectedMapId === 'all' ? 'btn--accent' : 'btn--secondary'}`}
                onClick={() => setSelectedMapId('all')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Globe size={14} />
                <span>All Maps (Universal Override)</span>
              </button>

              {mapScreens.map((m) => (
                <button
                  key={m.id}
                  className={`btn btn--sm ${selectedMapId === m.id ? 'btn--accent' : 'btn--secondary'}`}
                  onClick={() => setSelectedMapId(m.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>{m.title}</span>
                  {!m.isOriginal && (
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#4ade80',
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Active Map Showcase Preview Box */}
          <div
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Map size={18} style={{ color: 'var(--accent)' }} />
                  {selectedMapId === 'all' ? 'Universal Map Loading Screen' : `${currentMap?.title} Loading Screen`}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  {selectedMapId === 'all'
                    ? 'Customizing this sets the loading screen across all basegame maps.'
                    : `Active loading screen for ${currentMap?.region || currentMap?.title}.`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={restoreMapLoadingScreen}
                  disabled={isCurrentMapOriginal || isApplying}
                  title={isCurrentMapOriginal ? 'Original map screen is currently active' : 'Restore original game map loading screen'}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RotateCcw size={14} className={isApplying ? 'animate-spin' : ''} />
                  Restore Original
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => openMapFolder(selectedMapId === 'all' ? 'mapUS' : selectedMapId)}
                  title="Open map textures directory in File Explorer"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <FolderOpen size={14} />
                  Open Map Folder
                </button>
              </div>
            </div>

            {/* 16:9 Showcase Preview Box */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '680px',
                aspectRatio: '16 / 9',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: '#090a0f',
                border: '1px solid var(--border)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                margin: '0 auto',
              }}
            >
              {currentMap?.preview ? (
                <img
                  src={currentMap.preview}
                  alt="Map Loading Screen Preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <span>No map preview available</span>
                </div>
              )}

              {/* Status Badge */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(0, 0, 0, 0.75)',
                  backdropFilter: 'blur(8px)',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: isCurrentMapOriginal ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(74, 222, 128, 0.4)',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isCurrentMapOriginal ? 'var(--text-muted)' : '#4ade80',
                    display: 'inline-block',
                    boxShadow: isCurrentMapOriginal ? 'none' : '0 0 8px #4ade80',
                  }}
                />
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: '#fff' }}>
                  {isCurrentMapOriginal ? 'Original Map Screen' : 'Custom Loading Screen Active'}
                </span>
              </div>

              {/* Bottom Title Bar Overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
                  padding: '24px 16px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                }}
              >
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
                    {selectedMapId === 'all' ? 'All Basegame Maps' : currentMap?.title}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', marginTop: '2px' }}>
                    preview.dds • 2048 × 2048 DXT1 (with mipmaps) • Shown during savegame loading
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Set Custom Map Loading Screen
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>
                Target: <b>{selectedMapId === 'all' ? 'All Basegame Maps' : currentMap?.title}</b>
              </div>
            </div>

            <div
              onClick={handleBrowseCustom}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              style={{
                border: isDragging ? '2px dashed var(--accent)' : '2px dashed var(--border)',
                background: isDragging ? 'rgba(74, 222, 128, 0.08)' : 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                padding: '28px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px',
                  color: 'var(--accent)',
                }}
              >
                <Upload size={20} />
              </div>

              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Click to Browse or Drag & Drop Any Image Here
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                Supports <b>PNG, JPG, WebP, BMP, or DDS</b>. Automatically converted to 2048×2048 DXT1 with mipmaps.
              </div>
            </div>
          </div>

          {/* Custom Saved Gallery */}
          {custom.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
                Saved Custom Screens ({custom.length})
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                {custom.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#090a0f' }}>
                      {item.preview ? (
                        <img
                          src={item.preview}
                          alt={item.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                          <Image size={24} style={{ opacity: 0.3 }} />
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                      <div
                        style={{
                          fontSize: 'var(--fs-xs)',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title}
                      </div>

                      <div style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn--secondary btn--sm"
                          disabled={isApplying}
                          onClick={() => applyMapLoadingScreen(item.filePath, item.title)}
                          style={{ fontSize: '11px', padding: '4px 8px', flexGrow: 1 }}
                        >
                          Apply to {selectedMapId === 'all' ? 'All' : 'Map'}
                        </button>

                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => deleteCustom(item.id, item.title)}
                          title="Delete from custom gallery"
                          style={{ padding: '4px 6px', color: 'var(--text-muted)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 2: MAIN MENU BACKGROUND (STARTUP SPLASH)
          ══════════════════════════════════════════════════════════ */}
      {activeTab === 'menu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Active Splash Showcase */}
          <div
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={18} style={{ color: 'var(--accent)' }} />
                  Main Menu Background & Startup Splash
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  This image is displayed when Farming Simulator 25 launches and on the main title menu background.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={restoreDefault}
                  disabled={isDefaultActive || isApplying}
                  title={isDefaultActive ? 'Default loading screen is already active' : 'Restore original FS25 key art'}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RotateCcw size={14} className={isApplying ? 'animate-spin' : ''} />
                  Restore Default
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={openSharedFolder}
                  title="Open the game's shared assets directory in File Explorer"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <FolderOpen size={14} />
                  Open Game Folder
                </button>
              </div>
            </div>

            {/* 16:9 Showcase Preview Box */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '680px',
                aspectRatio: '16 / 9',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: '#090a0f',
                border: '1px solid var(--border)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                margin: '0 auto',
              }}
            >
              {active?.preview ? (
                <img
                  src={active.preview}
                  alt="Active Loading Screen Preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <span>No preview available</span>
                </div>
              )}

              {/* Active Status Badge */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(0, 0, 0, 0.75)',
                  backdropFilter: 'blur(8px)',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: '1px solid rgba(74, 222, 128, 0.4)',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#4ade80',
                    display: 'inline-block',
                    boxShadow: '0 0 8px #4ade80',
                  }}
                />
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: '#f0fdf4' }}>
                  Active in Game
                </span>
              </div>

              {/* Bottom Title Bar Overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
                  padding: '24px 16px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                }}
              >
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
                    {active?.name || 'Active Title Screen'}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', marginTop: '2px' }}>
                    shared/splash.dds • 4096 × 4096 DXT1 (with auto-synchronized splashBlur.dds)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Official Presets */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Sparkles size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Official Game Presets
              </span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>
                ({presets.length} available)
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              {presets.map((preset) => {
                const isPresetActive = preset.isActive;
                return (
                  <div
                    key={preset.id}
                    onClick={() => !isPresetActive && !isApplying && applyPreset(preset.id, preset.title)}
                    style={{
                      background: isPresetActive ? 'rgba(74, 222, 128, 0.08)' : 'var(--bg-tertiary)',
                      border: isPresetActive ? '1px solid #4ade80' : '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      cursor: isPresetActive ? 'default' : 'pointer',
                      transition: 'transform 0.15s ease, border-color 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#090a0f' }}>
                      {preset.preview ? (
                        <img
                          src={preset.preview}
                          alt={preset.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                          <Image size={24} style={{ opacity: 0.3 }} />
                        </div>
                      )}

                      {isPresetActive && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: '#4ade80',
                            color: '#052e16',
                            borderRadius: '999px',
                            padding: '2px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Check size={12} strokeWidth={3} />
                          Active
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {preset.title}
                        </div>
                        {preset.description && (
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-tertiary)',
                              marginTop: '4px',
                              lineHeight: '1.3',
                            }}
                          >
                            {preset.description}
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '10px' }}>
                        <button
                          className={`btn btn--sm btn--full ${isPresetActive ? 'btn--accent' : 'btn--secondary'}`}
                          disabled={isPresetActive || isApplying}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isPresetActive) applyPreset(preset.id, preset.title);
                          }}
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                        >
                          {isPresetActive ? 'Currently Active' : 'Apply Preset'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload Dropzone */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Custom Menu Background
              </div>
            </div>

            <div
              onClick={handleBrowseCustom}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              style={{
                border: isDragging ? '2px dashed var(--accent)' : '2px dashed var(--border)',
                background: isDragging ? 'rgba(74, 222, 128, 0.08)' : 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                padding: '28px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px',
                  color: 'var(--accent)',
                }}
              >
                <Upload size={20} />
              </div>

              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Click to Browse or Drag & Drop Image Here
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                Supports <b>PNG, JPG, WebP, BMP, or DDS</b>. Automatically converted to 4096×4096 DXT1 & blurred for FS25.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
