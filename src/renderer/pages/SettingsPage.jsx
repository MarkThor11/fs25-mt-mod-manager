import React, { useEffect, useState } from 'react';
import {
  Trash2, RefreshCw, Info, Sliders, Eye, HelpCircle, Plus, Folder, ShieldAlert,
  ChevronDown, ChevronRight, Zap, Settings, FolderOpen, Palette, Monitor, Gamepad2
} from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import { useToastStore } from '../store/useToastStore';
import { useNavigate } from 'react-router-dom';
import { useLocalModsStore } from '../store/useLocalModsStore';

const THEMES = [
  { value: 'dark', label: 'Dark', desc: 'Default dark theme inspired by ModHub', color: '#4ade80' },
  { value: 'light', label: 'Light', desc: 'Clean light theme', color: '#16a34a' },
  { value: 'blackblue', label: 'Black & Blue', desc: 'Deep black with blue accents', color: '#3b82f6' },
  { value: 'highcontrast', label: 'High Contrast', desc: 'Maximum readability', color: '#00ff6a' },
  { value: 'minimal', label: 'Minimal', desc: 'Simple and clean monochrome', color: '#18181b' },
];

const CollapsibleSection = ({ title, icon: Icon, children, color, defaultOpen = true, className = "" }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={`settings-section ${className}`} style={color ? { border: `1px solid ${color}44`, background: `${color}05` } : {}}>
      <div 
        className="settings-section__title" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          color: color || 'inherit',
          userSelect: 'none',
          padding: '4px 0',
          borderBottom: isOpen ? '1px solid var(--border)' : 'none',
          marginBottom: isOpen ? 16 : 0,
          paddingBottom: isOpen ? 12 : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Icon size={18} style={{ marginRight: 8 }} />
          {title}
        </div>
        <div style={{ opacity: 0.5 }}>
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </div>
      {isOpen && <div className="animate-fade-in" style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    theme, modsPath, modsPaths, gamePath, autoCheckUpdates, launchPreference,
    savegameSlot, enableCheats, skipModDialog, skipIntro, hiddenFolders,
    autoStart, conflictSensitivity, cloudBackupPath,
    homeShowHero, homeShowStats, homeShowLatest, homeShowDownloaded, homeShowUpdates,
    appFullscreen, rememberModHubPage, modUpdateMode, skipDeleteConfirm, backupRetention,
    badgeDuration, selectiveLoading,
    setTheme, setModsPath, addModsPath, removeModsPath, setGamePath, setAutoCheckUpdates, setLaunchPreference,
    setSavegameSlot, setEnableCheats, setSkipModDialog, setSkipIntro, toggleHiddenFolder,
    setHasSeenGuide, setAutoStart, setConflictSensitivity, setCloudBackupPath, setBackupRetention,
    setHomeShowHero, setHomeShowStats, setHomeShowLatest, setHomeShowDownloaded, setHomeShowUpdates,
    setAppFullscreen, setRememberModHubPage, setModUpdateMode, setSkipDeleteConfirm,
    setBadgeDuration, setSelectiveLoading,
  } = useSettingsStore();

  const [detectedGamePath, setDetectedGamePath] = useState('');
  const [gameSource, setGameSource] = useState('');
  const [detectedModsPaths, setDetectedModsPaths] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [systemSpecs, setSystemSpecs] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const { mods } = useLocalModsStore();

  const folderStats = React.useMemo(() => {
    const stats = {};
    modsPaths.forEach(p => {
      const pPath = p.replace(/\\/g, '/').toLowerCase();
      const pPathWithSlash = pPath.endsWith('/') ? pPath : pPath + '/';
      
      const folderMods = mods.filter(m => {
          const mPath = (m.filePath || '').replace(/\\/g, '/').toLowerCase();
          return mPath.startsWith(pPathWithSlash);
      });
      stats[p] = {
        count: folderMods.length,
        size: folderMods.reduce((acc, m) => acc + (m.size || 0), 0)
      };
    });
    return stats;
  }, [mods, modsPaths]);

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  useEffect(() => {
    handleAutoDetect(true);
    fetchSpecs();
  }, []);

  const fetchSpecs = async () => {
    try {
      if (window.api?.system?.getSpecs) {
        const specs = await window.api.system.getSpecs();
        setSystemSpecs(specs);
      }
    } catch (err) {
      console.error('Failed to fetch specs:', err);
    }
  };

  const handleOptimizeGraphics = async () => {
    setIsOptimizing(true);
    try {
      if (!window.api?.system?.optimizeGraphics) {
        throw new Error('Optimization bridge not available.');
      }
      const result = await window.api.system.optimizeGraphics();
      if (result.success) {
        let msg = `Graphics optimized (${result.applied.toUpperCase()})!`;
        if (result.tweaks.viewDistance === '300%') msg += ' + Enhanced View Distance applied.';
        useToastStore.getState().success(msg);
      }
    } catch (err) {
      console.error('Optimization failed:', err);
      useToastStore.getState().error(err.message || 'Graphics optimization failed.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleEnableHighPerformance = async () => {
    try {
      if (!window.api?.system?.setHighPerformancePlan) {
        throw new Error('System bridge not available.');
      }
      const result = await window.api.system.setHighPerformancePlan();
      if (result.success) {
        useToastStore.getState().success('System set to High Performance Power Plan!');
        fetchSpecs(); // Refresh display
      }
    } catch (err) {
      useToastStore.getState().error(`Failed to set power plan: ${err.message}`);
    }
  };

  const handleRevertGraphics = async () => {
    if (!window.api?.system) return;
    setIsOptimizing(true);
    try {
      const result = await window.api.system.optimizeRevert();
      if (result.success) {
        useToastStore.getState().success('Graphics settings reverted to original defaults.');
      }
    } catch (err) {
      useToastStore.getState().error('Failed to revert: ' + err.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleAutoDetect = async (silent = false) => {
    setIsDetecting(true);
    await Promise.all([detectGame(silent), detectMods(silent)]);
    setIsDetecting(false);
  };

  const detectGame = async (silent = false) => {
    setIsDetecting(true);
    try {
      if (!window.api?.game) {
        useToastStore.getState().info('Game detection bridge is not available.');
        return;
      }
      const result = await window.api.game.detectPath();
      if (result.path) {
        setDetectedGamePath(result.path);
        setGameSource(result.source);
        if (!silent) useToastStore.getState().success(`Game detected via ${result.source}!`);
        if (!gamePath) {
          setGamePath(result.path);
        }
      } else {
        if (!silent) useToastStore.getState().info('Could not auto-detect game. Please browse manually.');
      }
    } catch (err) {
      console.error('Game detection failed:', err);
      useToastStore.getState().error('Game detection failed.');
    } finally {
      setIsDetecting(false);
    }
  };

  const detectMods = async (silent = false) => {
    setIsDetecting(true);
    try {
      if (!window.api?.mods?.detectAllPaths) {
        throw new Error('Mods detection bridge is not available. Please restart the app.');
      }
      const result = await window.api.mods.detectAllPaths();
      if (result.paths && result.paths.length > 0) {
        setDetectedModsPaths(result.paths);
        if (!silent) useToastStore.getState().success(`Found ${result.paths.length} potential mods folders!`);
        
        // Suggest the first one if none is set
        if (!modsPath && result.paths.length === 1) {
          setModsPath(result.paths[0]);
        }
      } else {
        if (!silent) useToastStore.getState().info('Could not auto-detect mods folder.');
        setDetectedModsPaths([]);
      }
    } catch (err) {
      console.error('Mods detection failed:', err);
      useToastStore.getState().error(err.message || 'Mods folder detection failed.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSelectModsFolder = async () => {
    if (!window.api?.dialog) return;
    const folder = await window.api.dialog.selectFolder();
    if (folder) {
      setModsPath(folder);
      useToastStore.getState().success('Mods folder updated');
    }
  };

  const handleSelectGamePath = async () => {
    if (!window.api?.dialog) return;
    const file = await window.api.dialog.selectFile({
      filters: [
        { name: 'Farming Simulator 25 Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (file) {
      setGamePath(file);
      useToastStore.getState().success('Game executable updated');
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Clear all cached ModHub data? This won\'t affect your mods.')) return;
    if (window.api?.cache) await window.api.cache.clear();
    useToastStore.getState().success('Cache cleared');
  };

  return (
    <div className="page animate-fade-in-up">
      <div className="page__header">
        <h1 className="page__title">
          <Settings size={28} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
          Settings
        </h1>
        <p className="page__subtitle">Configure your MT Mod Manager preferences</p>
      </div>

      {/* Paths */}
      <CollapsibleSection title="File Paths" icon={FolderOpen}>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="settings-row__label">Mod Folders</div>
              <div className="settings-row__desc" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {modsPaths.length} currently active
              </div>
            </div>
            <div className="settings-row__control" style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--secondary btn--sm" onClick={detectMods} disabled={isDetecting}>
                <RefreshCw size={14} className={isDetecting ? 'animate-spin' : ''} /> Detect
              </button>
              <button 
                className="btn btn--primary btn--sm" 
                onClick={async () => {
                   if (!window.api?.dialog) return;
                   const folder = await window.api.dialog.selectFolder();
                   if (folder) {
                     addModsPath(folder);
                     useToastStore.getState().success('Secondary mods folder added');
                   }
                }}
              >
                <Plus size={14} /> Add Folder
              </button>
            </div>
          </div>

          <div style={{ 
            width: '100%', 
            padding: '12px 16px', 
            background: 'rgba(74, 222, 128, 0.05)', 
            borderRadius: 'var(--radius-md)', 
            borderLeft: '3px solid var(--accent)',
            margin: '4px 0 8px 0'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Info size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Active vs. Primary Folders
                </span>
              </div>
              All folders in this list are <strong style={{color: 'var(--text-primary)'}}>Active</strong>—their mods are scanned and merged into your <strong style={{color: 'var(--text-primary)'}}>Installed Mods</strong> library simultaneously. The folder marked as <strong style={{color: 'var(--text-primary)'}}>Primary</strong> is the designated directory for all new ModHub downloads and installations.
            </div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {modsPaths.map((path, idx) => (
              <div key={path} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: '12px 16px', 
                background: idx === 0 ? 'var(--accent-dim)' : 'var(--bg-tertiary)', 
                borderRadius: 'var(--radius-md)',
                border: idx === 0 ? '1px solid var(--accent)' : '1px solid var(--border)' 
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Folder size={16} style={{ color: idx === 0 ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {path}
                    </span>
                    {idx === 0 && (
                      <span style={{ fontSize: '9px', background: 'var(--accent)', color: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 10, fontWeight: 900, textTransform: 'uppercase' }}>
                        Primary / Downloads
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 10 }}>
                     <span><strong>{folderStats[path]?.count || 0}</strong> MODS</span>
                     <span><strong>{formatSize(folderStats[path]?.size || 0)}</strong> USED</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {idx === 0 ? (
                    <button 
                      className="btn btn--secondary btn--xs" 
                      onClick={async () => {
                        if (!window.api?.dialog) return;
                        const folder = await window.api.dialog.selectFolder();
                        if (folder) {
                          setModsPath(folder);
                          useToastStore.getState().success('Primary mods folder changed');
                        }
                      }}
                      title="Change Primary Folder"
                    >
                      <FolderOpen size={12} />
                    </button>
                  ) : (
                    <button 
                      className="btn btn--secondary btn--xs" 
                      onClick={() => setModsPath(path)}
                      title="Make Primary"
                    >
                      Set Primary
                    </button>
                  )}
                  <button 
                    className="btn btn--danger btn--xs" 
                    onClick={() => {
                      if (confirm('Stop using this folder? Mods inside won\'t be deleted, just removed from the manager.')) {
                        removeModsPath(path);
                      }
                    }}
                    style={{ padding: '4px 8px' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {(() => {
            const visibleAlternatives = detectedModsPaths.filter(item => 
              !modsPaths.some(p => p.replace(/\\/g, '/').toLowerCase() === item.path.replace(/\\/g, '/').toLowerCase())
            );
            if (visibleAlternatives.length === 0) return null;

            return (
              <div className="animate-fade-in" style={{ width: '100%', marginTop: 8, padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase' }}>
                  Detected Alternatives
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleAlternatives.map(item => (
                    <div key={item.path} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{item.path}</div>
                        <div style={{ fontSize: '9px', color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700, marginTop: 2 }}>{item.type}</div>
                      </div>
                      <button 
                        className="btn btn--secondary btn--xs"
                        onClick={() => {
                          addModsPath(item.path);
                          useToastStore.getState().success('Mods folder added');
                        }}
                      >
                        Add Folder
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Game Install Path</div>
            <div className="settings-row__desc" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {gamePath || detectedGamePath || 'Not detected'}
              {detectedGamePath && !gamePath && (
                <span style={{ color: 'var(--accent)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, background: 'rgba(var(--accent-rgb), 0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  Found via {gameSource || 'auto'}
                </span>
              )}
            </div>
          </div>
          <div className="settings-row__control" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--secondary btn--sm" onClick={detectGame} disabled={isDetecting}>
              <RefreshCw size={14} className={isDetecting ? 'animate-spin' : ''} /> Detect
            </button>
            <button className="btn btn--secondary btn--sm" onClick={handleSelectGamePath}>
              <FolderOpen size={14} /> Browse
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Theme */}
      <CollapsibleSection title="Appearance" icon={Palette}>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Theme</div>
            <div className="settings-row__desc">Choose your visual style</div>
          </div>
        </div>

        {/* Theme selector cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 'var(--sp-2)',
          marginTop: 'var(--sp-2)',
        }}>
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 6,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                border: theme === t.value
                  ? `2px solid ${t.color}`
                  : '2px solid var(--border)',
                background: theme === t.value ? 'var(--accent-dim)' : 'var(--bg-card)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: t.color,
                  boxShadow: theme === t.value ? `0 0 8px ${t.color}` : 'none',
                }} />
                <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{t.label}</span>
              </div>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>{t.desc}</span>
            </button>
          ))}
        </div>

      </CollapsibleSection>

      {/* Help & Support */}
      <CollapsibleSection title="Help & Guidance" icon={HelpCircle} defaultOpen={false}>
        
        <div className="settings-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <div className="settings-row__label">Guided Integration Tour</div>
            <div className="settings-row__desc">Re-run the interactive point-and-click tour of the application and sidebar.</div>
          </div>
          <div className="settings-row__control">
            <button className="btn btn--secondary btn--sm" onClick={() => setHasSeenGuide(false)}>
              Re-Launch Tour
            </button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Technical Manual" icon={Info} defaultOpen={false}>
        <div className="settings-manual-view" style={{ 
          background: 'var(--bg-tertiary)', 
          padding: '24px', 
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)' 
        }}>
          <h3 style={{ fontSize: 'var(--fs-md)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={16} className="text-accent" /> Complete Technical Manual
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            <div>
              <h4 style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', marginBottom: 8 }}>Automated ModHub</h4>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                The ModHub Browser features an intelligent <strong>engine-first matching system</strong> designed to synchronize equipment with tractors and vice versa. By activating 'Smart Match' on a piece of machinery, the manager will automatically filter the entire browser to only display compatible mods, filtering out any that don't meet your power specifications.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', marginBottom: 8 }}>Savegame Reliability</h4>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Our <strong>Atomic Swap</strong> system ensures your career slots are never corrupted. Before any modification, we create a temporary snapshot. If you launch a modded map that hasn't been initialized yet, it will appear as a 'Ghost Slot'. Simply start the game and save once to finalize it.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', marginBottom: 8 }}>Map Profiles</h4>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Profiles allow you to create <strong>isolated mod environments</strong>. This is critical for large maps (like Zielonka or Riverbend) where mod conflicts can cause 55% load hangs. We recommend one Profile per unique career map.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', marginBottom: 8 }}>Technical Support</h4>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                If you encounter persistent errors, check that your Game Path is set correctly to the FarmingSimulator2025.exe. For live technical assistance, bug reports, and feedback, please visit <strong>My Discord <span onClick={() => navigate('/support')} style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>HERE</span></strong>.
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Mod Diagnostics & Security */}
      <CollapsibleSection title="Mod Diagnostics & Security" icon={ShieldAlert} defaultOpen={false}>
        <p className="settings-row__desc" style={{ marginBottom: 16 }}>
          Configure how the manager handles mod conflicts and deep metadata scanning.
        </p>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Conflict Detection Sensitivity</div>
            <div className="settings-row__desc">
              Choose how the manager should handle script and specialization overlaps between mods.
            </div>
          </div>
          <div className="settings-row__control">
            <select
              value={conflictSensitivity}
              onChange={(e) => setConflictSensitivity(e.target.value)}
              className="sort-bar__select"
              style={{ minWidth: 160, padding: '6px 12px' }}
            >
              <option value="off">Off (Fastest)</option>
              <option value="warn">Warn (Default)</option>
              <option value="auto-disable">Auto-Disable Conflicting</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Backup Retention (After Updates)</div>
            <div className="settings-row__desc">
              How long to keep old mod versions (.bak files) before they are automatically deleted.
            </div>
          </div>
          <div className="settings-row__control">
            <select
              value={backupRetention}
              onChange={(e) => setBackupRetention(e.target.value)}
              className="sort-bar__select"
              style={{ minWidth: 160, padding: '6px 12px' }}
            >
              <option value="never">Never (Auto-Delete)</option>
              <option value="1w">1 Week</option>
              <option value="2w">2 Weeks</option>
              <option value="1m">1 Month</option>
              <option value="forever">Forever</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Cloud Backup Path</div>
            <div className="settings-row__desc">Select a folder to manually sync your savegames (e.g. OneDrive, Dropbox)</div>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', wordBreak: 'break-all', marginTop: 4 }}>
              {cloudBackupPath || 'Path not set'}
            </div>
          </div>
          <div className="settings-row__control">
            <button 
              className="btn btn--secondary btn--sm" 
              onClick={async () => {
                const path = await window.api.dialog.selectFolder();
                if (path) setCloudBackupPath(path);
              }}
            >
              <FolderOpen size={14} /> Browse
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Badge Highlights Duration</div>
            <div className="settings-row__desc">
              How long "NEW!" and "UPDATE!" badges remain visible after being first seen in the browser.
            </div>
          </div>
          <div className="settings-row__control">
            <select
              value={badgeDuration}
              onChange={(e) => setBadgeDuration(e.target.value)}
              className="sort-bar__select"
              style={{ minWidth: 160, padding: '6px 12px' }}
            >
              <option value="24h">24 Hours</option>
              <option value="48h">48 Hours (Default)</option>
              <option value="72h">72 Hours</option>
              <option value="1w">1 Week</option>
              <option value="always">Always Show</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Skip Delete Confirmations</div>
            <div className="settings-row__desc" style={{ color: 'var(--danger)', fontWeight: 600 }}>
              Instantly delete mods and savegames without a confirmation prompt. (Increased risk of accidental loss)
            </div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={skipDeleteConfirm}
                onChange={(e) => setSkipDeleteConfirm(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>
      </CollapsibleSection>

      {/* Home Page Customization */}
      <CollapsibleSection title="Dashboard Preferences" icon={Monitor} defaultOpen={false}>
        <p className="settings-row__desc" style={{ marginBottom: 16 }}>
          Toggle which widgets and sections are visible on your primary dashboard.
        </p>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Show Welcome Hero</div>
            <div className="settings-row__desc">The large welcome banner at the top of the home page</div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={homeShowHero}
                onChange={(e) => setHomeShowHero(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Show Library Statistics</div>
            <div className="settings-row__desc">The row of mod counts and update status cards</div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={homeShowStats}
                onChange={(e) => setHomeShowStats(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Show Latest Mods</div>
            <div className="settings-row__desc">Display a grid of the most recently uploaded mods from ModHub</div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={homeShowLatest}
                onChange={(e) => setHomeShowLatest(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Show Most Downloaded</div>
            <div className="settings-row__desc">Display a grid of the all-time popular mods</div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={homeShowDownloaded}
                onChange={(e) => setHomeShowDownloaded(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Show Update Alerts</div>
            <div className="settings-row__desc">Banner notification when installed mods have updates available</div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={homeShowUpdates}
                onChange={(e) => setHomeShowUpdates(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>
      </CollapsibleSection>


      {/* Window & Interface */}
      <CollapsibleSection title="Window & Interface" icon={Monitor} defaultOpen={false}>
        <div className="settings-row">
          <div>
            <div className="settings-row__label">Start in Full Screen</div>
            <div className="settings-row__desc">Automatically maximize the application window on startup</div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={appFullscreen}
                onChange={(e) => setAppFullscreen(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Remember last ModHub page</div>
            <div className="settings-row__desc">Automatically return to the last visited category and page when opening ModHub</div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={rememberModHubPage}
                onChange={(e) => setRememberModHubPage(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>
      </CollapsibleSection>


      {/* System Optimization */}
      <CollapsibleSection title="System Performance & Optimization" icon={Sliders} defaultOpen={false}>
        
        <div className="settings-row">
          <div style={{ flex: 1 }}>
            <div className="settings-row__label">Graphics One-Click Optimizer</div>
            <div className="settings-row__desc">
              Automatically analyze your hardware and set the best <code style={{ color: 'var(--accent)' }}>game.xml</code> presets for your system.
            </div>
            {systemSpecs && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ 
                  display: 'flex', 
                  gap: 16, 
                  fontSize: 13, 
                  opacity: 0.9, 
                  background: 'var(--bg-tertiary)', 
                  padding: '8px 12px', 
                  borderRadius: 4, 
                  border: '1px solid var(--border)',
                  width: 'fit-content',
                  marginRight: 24
                }}>
                  <div title={systemSpecs.cpu.model}><strong>CPU:</strong> {systemSpecs.cpu.model.split('@')[0].trim()}</div>
                  <div><strong>GPU:</strong> {systemSpecs.gpu.name} ({systemSpecs.gpu.vramGB}GB)</div>
                  <div><strong>RAM:</strong> {systemSpecs.ram.totalGB}GB</div>
                  <div><strong>Plan:</strong> {systemSpecs.power?.planName || 'Unknown'}</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 4px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>• High Performance Power Profile</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    • View Distance {systemSpecs.ram.totalGB >= 32 && systemSpecs.gpu.vramGB >= 10 ? '400%' : '300%'} (Engine Max)
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    • Smart Upscaling: {systemSpecs.gpu.name.toLowerCase().includes('rtx') ? 'NVIDIA DLSS' : 'AMD FSR 3.0'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>• Shadow Map Resolution Scaling</span>
                </div>
              </div>
            )}
          </div>
          <div className="settings-row__control" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', minWidth: 160 }}>
            <button 
              className="btn btn--primary" 
              onClick={handleOptimizeGraphics}
              disabled={isOptimizing}
              style={{ fontWeight: 700 }}
            >
              {isOptimizing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />} Optimize Now
            </button>
            <button 
              className="btn btn--secondary" 
              onClick={handleRevertGraphics}
              disabled={isOptimizing}
              style={{ width: '100%', opacity: 0.8 }}
              title="Revert to original game.xml settings"
            >
              Return to Default
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div style={{ flex: 1 }}>
            <div className="settings-row__label">Enable High Performance Profile</div>
            <div className="settings-row__desc">
              Forces Windows into the 'High Performance' power plan to prevent CPU throttling during gameplay. 
              {systemSpecs?.power?.isHighPerformance && <span style={{ color: 'var(--accent)', marginLeft: 8, fontWeight: 700 }}> (ACTIVE)</span>}
            </div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={systemSpecs?.power?.isHighPerformance || false}
                onChange={handleEnableHighPerformance}
                disabled={systemSpecs?.power?.isHighPerformance}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>
      </CollapsibleSection>

      {/* Launch Preferences */}
      <CollapsibleSection title="Launch Configuration" icon={Gamepad2} defaultOpen={false}>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Default launch behavior</div>
            <div className="settings-row__desc">What happens when you click Launch</div>
          </div>
          <div className="settings-row__control">
            <select
              value={launchPreference}
              onChange={(e) => setLaunchPreference(e.target.value)}
              className="sort-bar__select"
              style={{ minWidth: 160, padding: '6px 12px' }}
            >
              <option value="default">Launch normally</option>
              <option value="lastSave">Launch last savegame</option>
              <option value="askSave">Ask which savegame</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Savegame Slot</div>
            <div className="settings-row__desc">
              Auto-start into this save slot (1-20).
              Uses: <code style={{ color: 'var(--accent)', fontSize: 'var(--fs-xs)' }}>-autoStartSavegameId {savegameSlot || '?'}</code>
            </div>
          </div>
          <div className="settings-row__control">
            <input
              type="number"
              min="1"
              max="20"
              value={savegameSlot || ''}
              placeholder="—"
              onChange={(e) => setSavegameSlot(e.target.value ? parseInt(e.target.value) : null)}
              style={{
                width: 72,
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 'var(--fs-sm)',
                textAlign: 'center',
              }}
              id="savegame-slot-input"
            />
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Selective Mod Loading (Recommended)</div>
            <div className="settings-row__desc">
              When launching a specific savegame, only required mods are activated. 
              <strong style={{ color: 'var(--accent)', marginLeft: 8 }}>Reduces startup time by up to 80%.</strong>
            </div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={selectiveLoading}
                onChange={(e) => setSelectiveLoading(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Skip Mod Update Dialog</div>
            <div className="settings-row__desc">
              Skip the in-game mod update dialog on launch.
              Uses: <code style={{ color: 'var(--accent)', fontSize: 'var(--fs-xs)' }}>-skipModUpdateDialog</code>
            </div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={skipModDialog !== false}
                onChange={(e) => setSkipModDialog(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Enable Cheats</div>
            <div className="settings-row__desc">
              Enable the cheat console in-game.
              Uses: <code style={{ color: 'var(--accent)', fontSize: 'var(--fs-xs)' }}>-cheats</code>
            </div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={enableCheats || false}
                onChange={(e) => setEnableCheats(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Auto-Start</div>
            <div className="settings-row__desc">
              Automatically start the game into the menu or a savegame.
              Uses: <code style={{ color: 'var(--accent)', fontSize: 'var(--fs-xs)' }}>-autostart</code>
            </div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoStart || false}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Skip Start Videos</div>
            <div className="settings-row__desc">
              Skip the intro videos (Giants, Focus, etc.).
              Uses: <code style={{ color: 'var(--accent)', fontSize: 'var(--fs-xs)' }}>-skipStartVideos</code>
            </div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={skipIntro !== false}
                onChange={(e) => setSkipIntro(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        {/* Launch argument preview */}
        <div style={{
          marginTop: 'var(--sp-3)',
          padding: 'var(--sp-3)',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600 }}>
            Launch Command Preview
          </div>
          <code style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', wordBreak: 'break-all' }}>
            FarmingSimulator2025.exe
            {savegameSlot ? ` -autoStartSavegameId ${savegameSlot}` : ''}
            {autoStart || savegameSlot ? ' -autostart' : ''}
            {enableCheats ? ' -cheats' : ''}
            {skipModDialog !== false ? ' -skipModUpdateDialog' : ''}
            {skipIntro !== false ? ' -skipStartVideos' : ''}
          </code>
        </div>
      </CollapsibleSection>

      {/* Updates */}
      <CollapsibleSection title="Updates" icon={RefreshCw} defaultOpen={false}>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Auto-check for mod updates</div>
            <div className="settings-row__desc">Check for updates on startup and periodically in the background</div>
          </div>
          <div className="settings-row__control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoCheckUpdates}
                onChange={(e) => setAutoCheckUpdates(e.target.checked)}
              />
              <div className="toggle__track" />
              <div className="toggle__thumb" />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Mod Update Mode</div>
            <div className="settings-row__desc">Choose if updates should be manual or automatic</div>
          </div>
          <div className="settings-row__control" style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
            <button 
              className={`btn ${modUpdateMode === 'manual' ? 'btn--primary' : 'btn--ghost'}`} 
              onClick={() => setModUpdateMode('manual')}
              style={{ fontSize: '11px', padding: '4px 12px', minWidth: 80 }}
            >
              Manual
            </button>
            <button 
              className={`btn ${modUpdateMode === 'auto' ? 'btn--primary' : 'btn--ghost'}`} 
              onClick={() => setModUpdateMode('auto')}
              style={{ fontSize: '11px', padding: '4px 12px', minWidth: 80 }}
            >
              Auto
            </button>
          </div>
        </div>

        {modUpdateMode === 'auto' && (
          <div className="animate-fade-in" style={{ 
            marginTop: '8px', 
            padding: '12px', 
            background: 'rgba(74, 222, 128, 0.05)', 
            borderRadius: 'var(--radius-md)', 
            borderLeft: '3px solid var(--accent)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-secondary)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <ShieldAlert size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>AUTO-UPDATE ACTIVE</span>
            </div>
            Updates will be checked every hour and installed automatically if the game is not running.
          </div>
        )}
      </CollapsibleSection>

      {/* Hidden Folders */}
      <CollapsibleSection title="Hidden Folders" icon={Eye} defaultOpen={false}>
        <div className="settings-row">
          <div>
            <div className="settings-row__label">Concealed Directories</div>
            <div className="settings-row__desc">Folders listed here will be ignored in the Installed Mods tab.</div>
          </div>
        </div>

        {hiddenFolders.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
            marginTop: 12,
          }}>
            {hiddenFolders.map((f) => (
              <div key={f} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>{f}</span>
                <button 
                  className="btn btn--secondary btn--sm" 
                  onClick={() => {
                    toggleHiddenFolder(f);
                    useToastStore.getState().success(`Folder "${f}" is now visible.`);
                  }}
                  style={{ padding: '4px 8px', minWidth: 'auto' }}
                  title="Make Visible"
                >
                  <Eye size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', marginTop: 12 }}>
            No folders are currently hidden.
          </div>
        )}
      </CollapsibleSection>

      {/* Data */}
      <CollapsibleSection title="Data & Cache" icon={Info} defaultOpen={false}>

        <div className="settings-row">
          <div>
            <div className="settings-row__label">Clear ModHub cache</div>
            <div className="settings-row__desc">Remove cached mod data (will re-download on next browse)</div>
          </div>
          <div className="settings-row__control">
            <button className="btn btn--danger btn--sm" onClick={handleClearCache}>
              <Trash2 size={14} /> Clear Cache
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* App Troubleshooting */}
      <CollapsibleSection title="App Troubleshooting" icon={ShieldAlert} defaultOpen={false}>
        <div className="settings-row">
          <div>
            <div className="settings-row__label">Settings Backup</div>
            <div className="settings-row__desc">Copy your entire settings configuration to clipboard for support.</div>
          </div>
          <div className="settings-row__control">
            <button 
              className="btn btn--secondary btn--sm" 
              onClick={async () => {
                const settings = useSettingsStore.getState();
                const exportData = Object.keys(settings)
                  .filter(key => typeof settings[key] !== 'function')
                  .reduce((obj, key) => {
                    obj[key] = settings[key];
                    return obj;
                  }, {});
                
                const settingsJson = JSON.stringify(exportData, null, 2);
                if (window.api && window.api.clipboard) {
                  await window.api.clipboard.writeText(settingsJson);
                } else {
                  await navigator.clipboard.writeText(settingsJson);
                }
                useToastStore.getState().success('Settings copied to clipboard!');
              }}
            >
              Copy Settings JSON
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* About */}
      <div style={{
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 'var(--fs-sm)',
        padding: 'var(--sp-6) 0'
      }}>
        <div style={{ marginBottom: 4 }}>App: FS25 MT Mod Manager v1.0.10</div>
        <p style={{ marginTop: 'var(--sp-1)' }}>Not affiliated with GIANTS Software</p>
      </div>
    </div>
  );
}
