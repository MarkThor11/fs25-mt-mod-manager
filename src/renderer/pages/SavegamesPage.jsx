import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save, Play, RefreshCw, Edit3, MapPin,
  Clock, DollarSign, Package, Check, X,
  Plus, ChevronDown, ChevronRight, Gamepad2, Trash2, TrendingUp, Shield,
  Archive, RotateCcw, Info, Zap, Folder, Sliders, Cloud, Wrench, ShieldAlert, Pin, Users, Globe, Map as MapIcon, Settings, AlertCircle, Ruler, Volume2, Video, Search, Coins, Thermometer, Calendar, CalendarDays, FastForward, TrainFront, UserCheck, Settings2, Sparkles, Droplets, Paintbrush, ArrowRightLeft
} from 'lucide-react';
import { useSavegameStore } from '../store/useSavegameStore';
import { useToastStore } from '../store/useToastStore';
import { useProfileStore } from '../store/useProfileStore';
import { useArchiveStore } from '../store/useArchiveStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useModHubStore } from '../store/useModHubStore';
import MapImage, { MAP_PREVIEWS } from '../components/common/MapImage';
import { resolveRecursiveDependencies } from '../utils/modUtils';
import DependencyDownloadModal from '../components/common/DependencyDownloadModal';

const getLocalizedString = (val, defaultVal = 'Unknown') => {
    if (!val) return defaultVal;
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val.en || val.de || val.fr || Object.values(val)[0] || defaultVal;
    return String(val);
};

/**
 * Mod Audit Modal - Checks versions and missing mods for a savegame
 */
function ModAuditModal({ save, allInstalledMods, onClose, onRefresh }) {
  const [resolving, setResolving] = useState(false);
  const [syncStatus, setSyncStatus] = useState({}); // modName -> status

  const auditResults = (save.mods || []).map(req => {
    const installed = allInstalledMods.find(m => m.modName.toLowerCase() === req.modName.toLowerCase());
    
    let status = 'MISSING';
    let localVersion = null;
    let needsUpdate = false;

    if (installed) {
      status = 'INSTALLED';
      localVersion = installed.version;
      
      if (req.version && installed.version) {
        // Simple version check (we can use semantic compare in backend later, 
        // but for UI red/green mismatch is the primary concern)
        if (installed.version !== req.version) {
          status = 'VERSION_MISMATCH';
          needsUpdate = true;
        }
      }
    }

    return { ...req, status, localVersion, needsUpdate };
  });

  const missingOrMismatch = auditResults.filter(r => r.status !== 'INSTALLED');

  const handleFixAll = async () => {
    if (missingOrMismatch.length === 0) return;
    setResolving(true);
    
    try {
      const modsToFix = missingOrMismatch.map(m => ({
        title: m.title || m.modName,
        version: m.version, // Pass the required version to the backend
        url: '' // Will trigger search by title/ID
      }));

      useToastStore.getState().info(`Triggering resync for ${modsToFix.length} mods...`);
      
      if (!window.api?.localMods) throw new Error('System bridge not available');
      const result = await window.api.localMods.autoInstallDependencies({ 
        mods: modsToFix,
        subFolder: null // Savegames usually use root mods folder
      });

      if (result.installed > 0) {
        useToastStore.getState().success(`Successfully synced ${result.installed} mods.`);
        onRefresh();
      } else if (result.failed.length > 0) {
        useToastStore.getState().error(`Failed to sync some mods. Check logs.`);
      }
    } catch (err) {
      useToastStore.getState().error(`Audit resolution failed: ${err.message}`);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal-content animate-zoom-in" style={{ width: 700, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                <ShieldAlert size={24} className="text-accent" />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 800 }}>Mod Integrity Audit</h2>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>Slot {save.index} • {save.farmName}</div>
              </div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Audit Summary Bar */}
        <div style={{ padding: '12px 24px', background: missingOrMismatch.length > 0 ? 'rgba(var(--error-rgb), 0.1)' : 'rgba(var(--success-rgb), 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {missingOrMismatch.length > 0 ? (
              <span className="text-error">{missingOrMismatch.length} Issues Detected</span>
            ) : (
              <span className="text-success">System Integrity OK</span>
            )}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>{save.modCount} Mods Required</div>
        </div>

        {/* Mod List */}
        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: '12px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'left' }}>
                <th style={{ padding: '8px 0', width: 30 }}></th>
                <th style={{ padding: '8px 0' }}>MOD NAME</th>
                <th style={{ padding: '8px 0' }}>REQUIRED</th>
                <th style={{ padding: '8px 0' }}>INSTALLED</th>
                <th style={{ padding: '8px 0', textAlign: 'right' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {auditResults.map((m) => (
                <tr key={m.modName} style={{ borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                  <td style={{ padding: '10px 0' }}>
                    {m.status === 'INSTALLED' ? <Check size={14} className="text-success" /> : <ShieldAlert size={14} className="text-error" />}
                  </td>
                  <td style={{ padding: '10px 0', fontWeight: 600 }}>{m.title || m.modName}</td>
                  <td style={{ padding: '10px 0', opacity: 0.7 }}>{m.version || 'Any'}</td>
                  <td style={{ padding: '10px 0', color: m.status === 'VERSION_MISMATCH' ? 'var(--error)' : 'inherit' }}>
                    {m.localVersion || '—'}
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, fontSize: 10 }}>
                    <span style={{ 
                      padding: '2px 6px', 
                      borderRadius: 4, 
                      background: m.status === 'INSTALLED' ? 'rgba(var(--success-rgb), 0.1)' : 'rgba(var(--error-rgb), 0.1)',
                      color: m.status === 'INSTALLED' ? 'var(--success)' : 'var(--error)'
                    }}>
                      {m.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button className="btn btn--secondary" onClick={onClose} disabled={resolving}>Close</button>

        </div>
      </div>
    </div>
  );
}

/**
 * Savegame Editor Modal Component
 */
function SavegameEditorModal({ save, onClose, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [modSearchQuery, setModSearchQuery] = useState('');
  const [selectedMods, setSelectedMods] = useState(new Set((save.mods || []).map(m => m.modName)));
  const { mods: installedMods } = useLocalModsStore();
  const [expandedFolders, setExpandedFolders] = useState(new Set(['MAIN']));
  const [fleetCleanPct, setFleetCleanPct] = useState(100);
  const [fleetRepairPct, setFleetRepairPct] = useState(100);
  const [fleetPaintPct, setFleetPaintPct] = useState(100);

  const handleUpdate = async (fileType, attribute, value) => {
    setLoading(true);
    if (!window.api?.savegames) return;
    
    // Convert boolean to "true"/"false" string for XML
    const finalValue = typeof value === 'boolean' ? String(value) : value;
    
    const result = await window.api.savegames.updateAttribute({
      savePath: save.path,
      fileType,
      attribute,
      value: finalValue
    });
    setLoading(false);
    if (result.success) {
      useToastStore.getState().success(`Updated ${attribute}!`);
    } else {
      useToastStore.getState().error(result.error);
    }
  };

  const toggleMod = async (modName) => {
    const nextSelected = new Set(selectedMods);
    if (nextSelected.has(modName)) nextSelected.delete(modName);
    else nextSelected.add(modName);
    
    setSelectedMods(nextSelected);
    
    // Auto-save the mod list change surgically
    if (!window.api?.savegames) return;
    const modsToApply = installedMods.filter(m => nextSelected.has(m.modName));
    const result = await window.api.savegames.setSavegameMods(save.path, modsToApply);
    if (!result.success) {
      useToastStore.getState().error(`Failed to update mod list: ${result.error}`);
    }
  };

  const groupedMods = React.useMemo(() => {
    const groups = {};
    installedMods.forEach(mod => {
      if (mod.isMap) return;
      const folderName = mod.folder || 'MAIN';
      if (!groups[folderName]) groups[folderName] = [];
      groups[folderName].push(mod);
    });
    return groups;
  }, [installedMods]);

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal animate-zoom-in" style={{ width: 1300, maxWidth: 'none', maxHeight: '90vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                <Sliders size={24} className="text-accent" />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 800 }}>Save Editor</h2>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>Slot {save.index} • {save.farmName}</div>
              </div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="tab-switcher" style={{ padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
          <button className={`tab-btn ${activeTab === 'general' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('general')}>
            <Globe size={14} /> General
          </button>
          <button className={`tab-btn ${activeTab === 'realism' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('realism')}>
            <Info size={14} /> Realism & Units
          </button>
          <button className={`tab-btn ${activeTab === 'controls' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('controls')}>
            <Gamepad2 size={14} /> Controls
          </button>
          <button className={`tab-btn ${activeTab === 'mods' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('mods')}>
            <Package size={14} /> Selective Mods
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          
          {activeTab === 'general' && (
            <div className="settings-tab-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div className="settings-panel">
                <h3 className="section-title"><MapIcon size={16} /> Base Information</h3>
                <div className="settings-grid">
                  <div className="setting" style={{ gridColumn: 'span 2' }}>
                    <label>Savegame Name (Farm Name)</label>
                    <div className="input-with-icon">
                      <Edit3 size={14} />
                      <input type="text" defaultValue={save.farmName} onBlur={(e) => handleUpdate('career', 'savegameName', e.target.value)} />
                    </div>
                  </div>
                  <div className="setting">
                    <label>Player Name</label>
                    <div className="input-with-icon">
                      <input 
                        type="text" 
                        defaultValue={save.playerName || 'Farmer'} 
                        style={{ paddingLeft: 'calc(var(--sp-2) + 0.5ch)' }}
                        onBlur={(e) => handleUpdate('career', 'playerName', e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="setting">
                      <label>Map</label>
                      <div className="input-with-icon">
                        <MapPin size={14} />
                        <input type="text" value={getLocalizedString(save.mapTitle, 'Unknown Map')} disabled style={{ opacity: 0.6 }} />
                      </div>
                  </div>
                  <div className="setting">
                    <label>Loan</label>
                    <div className="input-with-icon">
                      <Coins size={14} />
                      <input type="number" defaultValue={save.initialLoan || 0} onBlur={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          handleUpdate('farms', 'loan', val);
                      }} />
                    </div>
                  </div>
                  <div className="setting">
                    <label>Money</label>
                    <div className="input-with-icon">
                      <Coins size={14} />
                      <input type="number" defaultValue={Math.floor(save.money)} onBlur={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          handleUpdate('farms', 'money', val);
                      }} />
                    </div>
                  </div>
                  <div className="setting">
                      <label>Economic Difficulty</label>
                      <div className="input-with-icon">
                        <TrendingUp size={14} />
                        <select defaultValue={save.economicDifficulty || 'NORMAL'} onChange={(e) => handleUpdate('career', 'economicDifficulty', e.target.value)}>
                            <option value="EASY">Easy</option>
                            <option value="NORMAL">Normal</option>
                            <option value="HARD">Hard</option>
                        </select>
                      </div>
                  </div>
                  <div className="setting">
                    <label>Auto-Save Interval</label>
                    <div className="input-with-icon">
                      <Shield size={14} />
                      <select defaultValue={save.autoSaveInterval || "15.000000"} onChange={(e) => handleUpdate('career', 'autoSaveInterval', e.target.value)}>
                        <option value="0.000000">Off</option>
                        <option value="5.000000">5 Minutes</option>
                        <option value="10.000000">10 Minutes</option>
                        <option value="15.000000">15 Minutes</option>
                      </select>
                    </div>
                  </div>
                </div>

                </div>

                <div style={{ marginTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                   <h4 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                     <Wrench size={14} /> FLEET MAINTENANCE TOOLS
                   </h4>
                   
                   {/* Clean Fleet */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px 64px', alignItems: 'center', gap: 12 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Droplets size={14} className="text-accent" />
                          <span style={{ fontSize: 12, fontWeight: 700 }}>CLEAN FLEET</span>
                       </div>
                       <input 
                          type="range" min="0" max="100" value={fleetCleanPct} 
                          onChange={e => setFleetCleanPct(parseInt(e.target.value))}
                          style={{ width: '100%' }}
                       />
                       <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{fleetCleanPct}%</span>
                       <button 
                         className="btn btn--secondary btn--sm"
                         style={{ minWidth: 64 }}
                         onClick={async () => {
                            const res = await window.api.savegames.updateFleetMaintenance({ savePath: save.path, type: 'dirt', value: fleetCleanPct / 100 });
                            if (res.success) useToastStore.getState().success('Fleet dirt levels updated!');
                         }}
                       >Apply</button>
                    </div>

                   {/* Repair Fleet */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px 64px', alignItems: 'center', gap: 12 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Wrench size={14} className="text-accent" />
                          <span style={{ fontSize: 12, fontWeight: 700 }}>REPAIR FLEET</span>
                       </div>
                       <input 
                          type="range" min="0" max="100" value={fleetRepairPct} 
                          onChange={e => setFleetRepairPct(parseInt(e.target.value))}
                          style={{ width: '100%' }}
                       />
                       <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{fleetRepairPct}%</span>
                       <button 
                         className="btn btn--secondary btn--sm"
                         style={{ minWidth: 64 }}
                         onClick={async () => {
                            const res = await window.api.savegames.updateFleetMaintenance({ savePath: save.path, type: 'repair', value: fleetRepairPct / 100 });
                            if (res.success) useToastStore.getState().success('Fleet mechanical condition updated!');
                         }}
                       >Apply</button>
                    </div>

                   {/* Paint Repair */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px 64px', alignItems: 'center', gap: 12 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Paintbrush size={14} className="text-accent" />
                          <span style={{ fontSize: 12, fontWeight: 700 }}>PAINT REPAIR</span>
                       </div>
                       <input 
                          type="range" min="0" max="100" value={fleetPaintPct} 
                          onChange={e => setFleetPaintPct(parseInt(e.target.value))}
                          style={{ width: '100%' }}
                       />
                       <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{fleetPaintPct}%</span>
                       <button 
                         className="btn btn--secondary btn--sm"
                         style={{ minWidth: 64 }}
                         onClick={async () => {
                            const res = await window.api.savegames.updateFleetMaintenance({ savePath: save.path, type: 'paint', value: fleetPaintPct / 100 });
                            if (res.success) useToastStore.getState().success('Fleet paint condition updated!');
                         }}
                       >Apply</button>
                    </div>
                </div>

                <div className="settings-panel">
                  <h3 className="section-title"><Clock size={16} /> Environment & Time</h3>
                  <div className="settings-grid">
                    <div className="setting">
                      <label>TIME SCALE (X)</label>
                      <div className="input-with-icon">
                        <FastForward size={14} />
                        <select 
                          defaultValue={parseFloat(save.timeScale || 1.0).toFixed(1)} 
                          style={{ minWidth: 100 }}
                          onChange={(e) => handleUpdate('career', 'timeScale', parseFloat(e.target.value).toFixed(6))}
                        >
                          <option value="0.5">0.5x</option>
                          <option value="1.0">1x</option>
                          <option value="5.0">5x</option>
                          <option value="10.0">10x</option>
                          <option value="60.0">60x</option>
                          <option value="120.0">120x</option>
                        </select>
                      </div>
                    </div>
                    <div className="setting">
                      <label>MONTH</label>
                      <div className="input-with-icon">
                        <Calendar size={14} />
                        <select defaultValue={save.currentPeriod || 1} onChange={(e) => handleUpdate('environment', 'currentPeriod', e.target.value)}>
                          {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                            <option key={i+1} value={i+1}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="setting">
                      <label>DAYS PER MONTH</label>
                      <div className="input-with-icon">
                        <CalendarDays size={14} />
                        <input 
                          type="number" min="1" max="28" 
                          style={{ minWidth: 100 }}
                          defaultValue={save.plannedDaysPerPeriod || 1} 
                          onBlur={(e) => {
                             handleUpdate('career', 'plannedDaysPerPeriod', e.target.value);
                             handleUpdate('environment', 'daysPerPeriod', e.target.value);
                         }} />
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
           )}


          {activeTab === 'realism' && (
            <div className="settings-tab-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div className="settings-panel">
                <h3 className="section-title"><AlertCircle size={16} /> Gameplay Realism</h3>
                <div className="settings-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.trafficEnabled !== false} onChange={e => handleUpdate('career', 'trafficEnabled', e.target.checked)} /><span>Traffic Enabled</span></label>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.fruitDestruction !== false} onChange={e => handleUpdate('career', 'fruitDestruction', e.target.checked)} /><span>Crop Destruction</span></label>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.plowingRequiredEnabled} onChange={e => handleUpdate('career', 'plowingRequiredEnabled', e.target.checked)} /><span>Periodic Plowing</span></label>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.limeRequired !== false} onChange={e => handleUpdate('career', 'limeRequired', e.target.checked)} /><span>Lime Required</span></label>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.stonesEnabled !== false} onChange={e => handleUpdate('career', 'stonesEnabled', e.target.checked)} /><span>Field Stones</span></label>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.weedsEnabled !== false} onChange={e => handleUpdate('career', 'weedsEnabled', e.target.checked)} /><span>Weeds Enabled</span></label>

                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.isSnowEnabled !== false} onChange={e => handleUpdate('career', 'isSnowEnabled', e.target.checked)} /><span>Snow Enabled</span></label>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.stopAndGoBraking !== false} onChange={e => handleUpdate('career', 'stopAndGoBraking', e.target.checked)} /><span>Stop & Go Braking</span></label>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.trailerFillLimit} onChange={e => handleUpdate('career', 'trailerFillLimit', e.target.checked)} /><span>Trailer Fill Limit</span></label>
                    <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.automaticMotorStartEnabled !== false} onChange={e => handleUpdate('career', 'automaticMotorStartEnabled', e.target.checked)} /><span>Auto Motor Start</span></label>
                    <label className="checkbox-setting">
                      <input 
                        type="checkbox" 
                        defaultChecked={save.isTrainTabEnabled !== false} 
                        onChange={e => handleUpdate('career', 'isTrainTabEnabled', e.target.checked)} 
                      />
                      <TrainFront size={14} className="text-accent" />
                      <span>Allow Switching to Trains</span>
                    </label>
                  </div>

                  <div className="setting" style={{ marginTop: 8 }}>
                    <label>Gear Shift Mode</label>
                    <div className="input-with-icon">
                      <Settings2 size={14} />
                      <select defaultValue={save.gearShiftMode || 0} onChange={e => handleUpdate('career', 'gearShiftMode', e.target.value)}>
                        <option value="0">Automatic</option>
                        <option value="1">Manual with Clutch</option>
                        <option value="2">Manual</option>
                      </select>
                    </div>
                  </div>
                  <div className="setting" style={{ marginTop: 8 }}>
                    <label>Fuel Usage</label>
                    <div className="input-with-icon">
                      <Zap size={14} />
                      <select defaultValue={save.fuelUsage || 2} onChange={e => handleUpdate('career', 'fuelUsage', e.target.value)}>
                        <option value="1">Low</option>
                        <option value="2">Normal</option>
                        <option value="3">High</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-panel">
                <h3 className="section-title"><Users size={16} /> Helper & AI Options</h3>
                <div className="settings-grid">
                  <div className="setting">
                    <label>Buy Fuel</label>
                    <select defaultValue={save.helperBuyFuel !== false ? 'true' : 'false'} onChange={e => handleUpdate('career', 'helperBuyFuel', e.target.value)}>
                      <option value="true">Buy</option>
                      <option value="false">Off</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label>Buy Seeds</label>
                    <select defaultValue={save.helperBuySeeds !== false ? 'true' : 'false'} onChange={e => handleUpdate('career', 'helperBuySeeds', e.target.value)}>
                      <option value="true">Buy</option>
                      <option value="false">Off</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label>Buy Fertilizer</label>
                    <select defaultValue={save.helperBuyFertilizer !== false ? 'true' : 'false'} onChange={e => handleUpdate('career', 'helperBuyFertilizer', e.target.value)}>
                      <option value="true">Buy</option>
                      <option value="false">Off</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label>Slurry Source</label>
                    <select defaultValue={save.helperSlurrySource || 2} onChange={e => handleUpdate('career', 'helperSlurrySource', e.target.value)}>
                      <option value="1">Storage</option>
                      <option value="2">Buy</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="settings-panel">
                <h3 className="section-title"><Ruler size={16} /> Units & Environment</h3>
                <div className="settings-grid">
                  <div className="setting">
                    <label>Dirt Interval</label>
                    <select defaultValue={save.dirtInterval || 3} onChange={e => handleUpdate('career', 'dirtInterval', e.target.value)}>
                      <option value="1">Slow</option>
                      <option value="3">Normal</option>
                      <option value="4">Fast</option>
                      <option value="0">Off</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label>Money Unit</label>
                    <select defaultValue={save.moneyUnit || 0} onChange={e => handleUpdate('career', 'moneyUnit', e.target.value)}>
                      <option value="0">Euro (€)</option>
                      <option value="1">Dollar ($)</option>
                      <option value="2">Pound (£)</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label>Measuring Unit</label>
                    <select defaultValue={save.useMetric ? 'true' : 'false'} onChange={e => handleUpdate('career', 'useMetric', e.target.value)}>
                      <option value="true">Metric (m/km)</option>
                      <option value="false">Imperial (ft/mi)</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label>Temperature</label>
                    <select defaultValue={save.temperatureUnit || 0} onChange={e => handleUpdate('career', 'temperatureUnit', e.target.value)}>
                      <option value="0">Celsius</option>
                      <option value="1">Fahrenheit</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}


          {activeTab === 'controls' && (
            <div className="settings-tab-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div className="settings-panel">
                <h3 className="section-title"><Volume2 size={16} /> Audio & Sound</h3>
                <div className="settings-grid">
                  <label className="checkbox-setting">
                    <input type="checkbox" defaultChecked={save.isRadioEnabled !== false} onChange={e => handleUpdate('career', 'isRadioEnabled', e.target.checked)} />
                    <span>Radio Enabled</span>
                  </label>
                  <div className="setting">
                    <label>Master Volume ({Math.round((save.masterVolume || 1.0) * 100)}%)</label>
                    <input type="range" min="0" max="1" step="0.05" defaultValue={save.masterVolume || 1.0} onBlur={e => handleUpdate('career', 'masterVolume', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="settings-panel">
                <h3 className="section-title"><Video size={16} /> Camera & Visuals</h3>
                <div className="settings-grid">
                  <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.resetVehicleCamera} onChange={e => handleUpdate('career', 'resetVehicleCamera', e.target.checked)} /><span>Reset Vehicle Camera</span></label>
                  <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.indoorCameraSuspension} onChange={e => handleUpdate('career', 'indoorCameraSuspension', e.target.checked)} /><span>Indoor Camera Suspension</span></label>
                  <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.dynamicVehicleCamera} onChange={e => handleUpdate('career', 'dynamicVehicleCamera', e.target.checked)} /><span>Dynamic Vehicle Camera</span></label>
                  <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.invertYLook} onChange={e => handleUpdate('career', 'invertYLook', e.target.checked)} /><span>Invert Y-Look</span></label>
                  <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.showHints !== false} onChange={e => handleUpdate('career', 'showHints', e.target.checked)} /><span>Show Gameplay Hints</span></label>
                  <label className="checkbox-setting"><input type="checkbox" defaultChecked={save.showHelpIcons !== false} onChange={e => handleUpdate('career', 'showHelpIcons', e.target.checked)} /><span>Show Help Icons</span></label>
                </div>
              </div>

              <div className="settings-panel">
                <h3 className="section-title"><Gamepad2 size={16} /> Input Controls</h3>
                <div className="settings-grid">
                  <div className="setting">
                    <label>Camera Sensitivity</label>
                    <input type="range" min="0.5" max="2.0" step="0.1" defaultValue={save.cameraSensitivity || 1.0} onBlur={e => handleUpdate('career', 'cameraSensitivity', e.target.value)} />
                  </div>
                  <div className="setting">
                    <label>Input Help Mode</label>
                    <select defaultValue={save.inputHelpMode || 0} onChange={e => handleUpdate('career', 'inputHelpMode', e.target.value)}>
                      <option value="0">Auto</option>
                      <option value="1">Keyboard</option>
                      <option value="2">Gamepad</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}


          {activeTab === 'mods' && (
            <div className="settings-tab-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div className="search-input-wrapper" style={{ flex: 1, position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input type="text" placeholder="Search installed mods..." value={modSearchQuery} onChange={e => setModSearchQuery(e.target.value)} style={{ width: '100%', paddingLeft: 32 }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', background: 'var(--bg-tertiary)', borderRadius: 100, border: '1px solid var(--border)' }}>
                  {selectedMods.size} Selected
                </div>
                <button 
                  className="btn btn--primary btn--sm" 
                  style={{ gap: 6, padding: '0 16px', height: 32 }}
                  onClick={() => {
                    const mustHaves = useModHubStore.getState().favoriteMods.filter(m => m.isMustHave);
                    const nextSelected = new Set(selectedMods);
                    let added = 0;
                    mustHaves.forEach(mh => {
                      // Try to find the installed mod that matches this must-have
                      const installed = installedMods.find(im => 
                        (mh.modId && String(im.modId) === String(mh.modId)) || 
                        im.modName.toLowerCase() === (mh.fileName || '').replace('.zip', '').toLowerCase()
                      );
                      if (installed && !nextSelected.has(installed.modName)) {
                        nextSelected.add(installed.modName);
                        added++;
                      }
                    });
                    if (added > 0) {
                      setSelectedMods(nextSelected);
                      useToastStore.getState().success(`Adopted ${added} Must-Have mods!`);
                    } else {
                      useToastStore.getState().info("All Must-Haves already present or not installed.");
                    }
                  }}
                >
                  <Pin size={12} fill="currentColor" /> ADOPT MUST-HAVES
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 8, border: '1px solid var(--border)' }}>
                {Object.keys(groupedMods).sort().map(folderName => {
                  const items = groupedMods[folderName].filter(m => {
                    if (!modSearchQuery) return true;
                    return m.title?.toLowerCase().includes(modSearchQuery.toLowerCase()) || m.modName.toLowerCase().includes(modSearchQuery.toLowerCase());
                  });
                  if (items.length === 0) return null;
                  const isExpanded = expandedFolders[folderName];

                  return (
                    <div key={folderName} style={{ marginBottom: 4 }}>
                      <div 
                        onClick={() => setExpandedFolders(prev => {
                          const next = new Set(prev);
                          if (next.has(folderName)) next.delete(folderName);
                          else next.add(folderName);
                          return next;
                        })}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', background: isExpanded ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent', borderRadius: 8, fontSize: 12, fontWeight: 800 }}
                      >
                        {isExpanded ? <ChevronDown size={14} className="text-accent" /> : <ChevronRight size={14} className="text-accent" />}
                        <Folder size={14} className="text-accent" />
                        {folderName}
                        <span style={{ fontSize: 10, opacity: 0.3, marginLeft: 'auto' }}>{items.length} MODS</span>
                      </div>
                      
                      {isExpanded && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, padding: '8px 4px' }}>
                          {items.map(m => (
                            <div 
                              key={m.modName} 
                              onClick={() => toggleMod(m.modName)}
                              style={{ 
                                padding: 8, 
                                borderRadius: 8, 
                                background: selectedMods.has(m.modName) ? 'var(--accent-dim)' : 'var(--bg-card)',
                                border: `1px solid ${selectedMods.has(m.modName) ? 'var(--accent)' : 'var(--border-light)'}`,
                                cursor: 'pointer',
                                fontSize: 11,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                transition: 'all 0.1s'
                              }}
                            >
                              <div style={{ width: 14, height: 14, border: '1px solid var(--border)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: selectedMods.has(m.modName) ? 'var(--accent)' : 'transparent' }}>
                                {selectedMods.has(m.modName) && <Check size={10} color="white" />}
                              </div>
                               <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: selectedMods.has(m.modName) ? 'white' : 'inherit', flex: 1 }}>
                                {m.title || m.modName}
                              </span>
                              {useModHubStore.getState().favoriteMods.find(f => (f.modId && m.modId && String(f.modId) === String(m.modId)) || (f.fileName && m.fileName && f.fileName === m.fileName))?.isMustHave && (
                                <Pin size={10} fill="var(--accent)" style={{ opacity: 0.8 }} />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              

            </div>
          )}

          <div style={{ background: 'rgba(var(--accent-rgb), 0.05)', padding: '16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 'var(--fs-xs)', display: 'flex', gap: 12 }}>
            <Info size={16} className="text-accent" style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, opacity: 0.8 }}>Changes are applied instantly to the XML files. We recommend archiving your savegame first as a manual backup.</p>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', background: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn--primary" onClick={() => { onRefresh(); onClose(); }}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveSlotCard({ save, onPlay, onArchive, onCreate, onEdit, onAudit, onRename, onAdopt, onDelete, isSelected, onToggleSelection, editingName, newName, setNewName, handleRename, setEditingName, formatMoney, formatPlayTime, mods, onDrop }) {
    const isEmpty = save.modCount === 0 && (save.farmName || '').startsWith('Empty');
    const [isDragOver, setIsDragOver] = useState(false);
    
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDropInternal = (e) => {
        setIsDragOver(false);
        onDrop(e, save.index);
    };

    if (isEmpty) {
        return (
            <div 
                className={`save-card ${isSelected ? 'save-card--selected' : ''} ${isDragOver ? 'save-card--drag-over' : ''}`} 
                style={{ 
                    borderStyle: 'dashed', 
                    background: isDragOver ? 'rgba(var(--accent-rgb), 0.15)' : (isSelected ? 'var(--accent-dim)' : 'transparent'), 
                    borderColor: isDragOver ? 'var(--accent)' : 'inherit',
                    opacity: isSelected || isDragOver ? 1 : 0.6, 
                    height: 100, 
                    justifyContent: 'center', 
                    position: 'relative',
                    transition: 'all 0.2s ease'
                }} 
                onClick={onCreate}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropInternal}
            >
                {isDragOver && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
                        <div style={{ background: 'var(--accent)', color: 'white', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 900 }}>DROP TO IMPORT HERE</div>
                    </div>
                )}
                <input 
                  type="checkbox" 
                  checked={isSelected} 
                  onChange={(e) => { e.stopPropagation(); onToggleSelection(); }}
                  style={{ position: 'absolute', top: 12, left: 12, width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', zIndex: 10 }}
                />
                <Plus size={20} className="text-accent" />
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: 1 }}>SLOT {save.index}</div>
            </div>
        );
    }

    return (
            <div 
                className={`save-card ${save.isGhost ? 'save-card--ghost' : ''} ${isSelected ? 'save-card--selected' : ''} ${isDragOver ? 'save-card--drag-over' : ''}`} 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropInternal}
                style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    minHeight: 180, 
                    padding: 'var(--sp-4)', 
                    position: 'relative', 
                    border: isDragOver ? '2px solid var(--accent)' : (isSelected ? '1px solid var(--accent)' : (save.hasTemplate ? '1px solid var(--accent-dim)' : '1px solid transparent')), 
                    background: isDragOver ? 'rgba(var(--accent-rgb), 0.1)' : (isSelected ? 'var(--bg-tertiary)' : ''),
                    transition: 'all 0.2s ease'
                }}
            >
            {isDragOver && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--accent-rgb), 0.2)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, borderRadius: 'inherit' }}>
                    <div style={{ background: 'var(--accent)', color: 'white', padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 900, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>OVERWRITE SLOT {save.index}</div>
                </div>
            )}
            <input 
                type="checkbox" 
                checked={isSelected} 
                onChange={(e) => { e.stopPropagation(); onToggleSelection(); }}
                style={{ position: 'absolute', top: 14, left: 14, width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', zIndex: 10 }}
            />

            
            {/* Map Preview Background */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.25, zIndex: 0, maskImage: 'linear-gradient(to bottom, black, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)' }}>
                <MapImage mapTitle={getLocalizedString(save.mapTitle, 'Unknown Map')} mapId={save.mapId} mods={mods} />
            </div>
            {save.isGhost && (
              <div style={{ 
                position: 'absolute', 
                top: 8, 
                right: 8, 
                background: 'var(--accent)', 
                color: 'white', 
                fontSize: 8, 
                fontWeight: 900, 
                padding: '2px 6px', 
                borderRadius: 4,
                letterSpacing: 0.5,
                boxShadow: '0 0 10px var(--accent)'
              }}>
                READY FOR FIRST LAUNCH
              </div>
            )}
            {save.hasTemplate && !save.isGhost && (
              <div style={{ 
                position: 'absolute', 
                top: 8, 
                right: 8, 
                background: 'var(--accent-dim)', 
                color: 'var(--accent)', 
                fontSize: 8, 
                fontWeight: 900, 
                padding: '2px 6px', 
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <Zap size={12} fill="var(--accent)" /> AUTOMATED
              </div>
            )}
            <div style={{ flex: 1, zIndex: 1, paddingLeft: 34 }}>
                {editingName === save.folderName ? (
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} autoFocus style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--accent)' }} />
                        <button className="btn btn--primary btn--sm" onClick={handleRename}><Check size={16} /></button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditingName(null)}><X size={16} /></button>
                    </div>
                ) : (
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.8)', marginBottom: 2 }}>{save.farmName}</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', opacity: 0.9, fontSize: 11, color: 'white' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                      <MapPin size={12} className="text-accent" /> 
                      {getLocalizedString(save.mapTitle, 'Unknown Map')} 
                      {save.mapAuthor && getLocalizedString(save.mapAuthor) !== 'Unknown' && (
                        <span style={{ opacity: 0.5, fontSize: 9, marginLeft: 4 }}>BY {getLocalizedString(save.mapAuthor).toUpperCase()}</span>
                      )}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}><DollarSign size={12} className="text-accent" /> {formatMoney(save.money)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}><Clock size={12} className="text-accent" /> {formatPlayTime(save.playTime)}</span>
                    
                    {save.creationDate && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, textShadow: '0 1px 2px rgba(0,0,0,0.5)', opacity: 0.8 }}>
                        <span style={{ fontSize: 9, opacity: 0.5 }}>CREATED:</span> {save.creationDate}
                      </span>
                    )}
                    
                    {save.economicDifficulty && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, textShadow: '0 1px 2px rgba(0,0,0,0.5)', opacity: 0.8 }}>
                        <span style={{ fontSize: 9, opacity: 0.5 }}>ECONOMY:</span>
                        <span style={{ 
                          color: save.economicDifficulty === 'HARD' ? 'var(--color-error)' : (save.economicDifficulty === 'EASY' ? 'var(--color-success)' : 'white'),
                          fontWeight: 700 
                        }}>
                          {save.economicDifficulty}
                        </span>
                      </span>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 'auto', width: '100%', zIndex: 1, padding: 'var(--sp-2) 0 0 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                {save.isInitialized && !save.hasTemplate && (
                    <button className="btn btn--ghost btn--sm" onClick={onAdopt} title="Save as Master Template" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <Zap size={16} />
                    </button>
                )}
                <div style={{ flex: 1 }} />


                <button className="btn btn--ghost btn--sm" onClick={onPlay} title="Play Now" style={{ color: 'white' }}><Play size={16} /></button>
                {!save.isGhost && (
                  <>
                    <button className="btn btn--ghost btn--sm" onClick={onAudit} title="Audit Mods & Versions" style={{ color: 'rgba(255,255,255,0.7)' }}><ShieldAlert size={16} /></button>
                    <button className="btn btn--ghost btn--sm" onClick={onEdit} title="Surgical Editor" style={{ color: 'rgba(255,255,255,0.7)' }}><Sliders size={16} /></button>
                  </>
                )}
                <button className="btn btn--ghost btn--sm" onClick={onArchive} title={save.isGhost ? "Initialize map to archive" : "Archive"} disabled={save.isGhost} style={{ color: 'rgba(255,255,255,0.7)' }}><Archive size={16} /></button>
                <button className="btn btn--ghost btn--sm" onClick={onDelete} title="Delete Permamently" style={{ color: 'var(--danger)' }}><Trash2 size={16} /></button>
            </div>

        </div>
    );
}

export default function SavegamesPage() {
  const navigate = useNavigate();
  const { mods } = useLocalModsStore();
  const {
    savegames, isLoading: isSavesLoading, fetchSavegames,
  } = useSavegameStore();

  const { skipIntro } = useSettingsStore();

  const {
    archives, isLoading: isArchivesLoading, fetchArchives, deleteArchive, archiveSavegame, restoreSavegame
  } = useArchiveStore();

  const [updatingMod, setUpdatingMod] = useState(null);
  const [autoResolveMode, setAutoResolveMode] = useState(false);
  const [createActiveTab, setCreateActiveTab] = useState('basic');
  const [editingName, setEditingName] = useState(null);
  const [newName, setNewName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(null); // Archived folder name
  const [restoreSlot, setRestoreSlot] = useState('1');
  const [swapping, setSwapping] = useState(false);
  const [selectedArchives, setSelectedArchives] = useState(new Set());
  const [isArchivePanelOpen, setIsArchivePanelOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlot, setCreateSlot] = useState('1');
  const [modalSelectedMods, setModalSelectedMods] = useState(new Set());
  const [creating, setCreating] = useState(false);

  // Advanced start states
  const [createMap, setCreateMap] = useState('MapUS|Riverbend Springs|');
  const [createDifficulty, setCreateDifficulty] = useState(1);
  const [createEconomy, setCreateEconomy] = useState('NORMAL');
  const [createMoney, setCreateMoney] = useState(1000000);
  const [createLoan, setCreateLoan] = useState(0);
  const [createSeasonLength, setCreateSeasonLength] = useState(1);
  const [createTimeScale, setCreateTimeScale] = useState(1.0);
  const [missingDeps, setMissingDeps] = useState(null);
  const [createStartMonth, setCreateStartMonth] = useState(1);
  const [autoLaunchOnCreate, setAutoLaunchOnCreate] = useState(false);
  const [createMode, setCreateMode] = useState('NEW_FARMER');
  const [mapHasTemplate, setMapHasTemplate] = useState(true);
  const [selectedSaves, setSelectedSaves] = useState(new Set());
  const [includeMustHaves, setIncludeMustHaves] = useState(true);
  
  // Savegame Editor state
  const [showEditor, setShowEditor] = useState(null); // Save object
  const [showAudit, setShowAudit] = useState(null); // Save object

  const handleModeChange = (mode) => {
    setCreateMode(mode);
    if (mode === 'NEW_FARMER') {
      setCreateMoney(100000);
      setCreateLoan(0);
      setCreateEconomy('EASY');
      setCreateDifficulty(1);
    } else if (mode === 'FARM_MANAGER') {
      setCreateMoney(1500000);
      setCreateLoan(0);
      setCreateEconomy('NORMAL');
      setCreateDifficulty(2);
    } else if (mode === 'START_FROM_SCRATCH') {
      setCreateMoney(500000);
      setCreateLoan(0);
      setCreateEconomy('HARD');
      setCreateDifficulty(3);
    }
  };

  const { profiles, fetchProfiles } = useProfileStore();

  useEffect(() => {
    fetchSavegames();
    fetchProfiles();
    fetchArchives();
  }, []);

  useEffect(() => {
    // Check if the selected map has a master template whenever it changes
    const [mapId, title, modName] = createMap.split('|');
    setMissingDeps(null); // Reset missing deps
    if (mapId && window.api?.maps) {
      window.api.maps.checkTemplate(mapId, title, modName).then(exists => {
          setMapHasTemplate(exists);
          // Only force auto-launch if NOT automated; otherwise preserve user preference or reset to false
          if (!exists) {
            setAutoLaunchOnCreate(true);
          } else {
            setAutoLaunchOnCreate(false); 
          }
      });

      // Auto-select required mods for modded maps
      if (modName) {
        try {
          console.log(`[CAREER MODAL] Resolving dependencies for map: ${modName}`);
          const { installed, missing } = resolveRecursiveDependencies(modName, mods);
          
          if (installed.size > 0) {
            console.log(`[CAREER MODAL] Auto-selecting ${installed.size} mods:`, Array.from(installed));
            setModalSelectedMods(prev => {
              const next = new Set(prev);
              installed.forEach(d => next.add(d));
              return next;
            });
          }

          if (missing.size > 0) {
            console.log(`[CAREER MODAL] Missing dependencies detected:`, Array.from(missing));
            setMissingDeps(Array.from(missing));
          } else {
            setMissingDeps(null);
          }
        } catch (e) {
          console.error('[CAREER MODAL] Dependency auto-select failed:', e);
        }
      }
    }
  }, [createMap, mods]);

  const handleRename = async (save) => {
    if (!newName.trim()) {
      setEditingName(null);
      return;
    }
    const result = await window.api.savegames.rename({ 
        savegamePath: save.path, 
        newName: newName.trim() 
    });
    if (result.success) {
      useToastStore.getState().success(`Renamed to "${newName.trim()}"`);
      fetchSavegames();
    } else {
      useToastStore.getState().error(`Rename failed: ${result.error}`);
    }
    setEditingName(null);
  };

  const handleLaunch = async (slotIndex, extraOptions = {}) => {
    const result = await window.api.game.launch({ 
        savegameIndex: slotIndex,
        skipIntro: skipIntro !== false,
        ...extraOptions
    });
    
    if (result.success) {
      if (result.needsManualInit) {
        useToastStore.getState().info(`GHOST SLOT: Slot ${slotIndex} will show as 'Empty'. Select it, start the map, and SAVE ONCE to initialize.`, 20000);
      } else {
        useToastStore.getState().success(`Launching Slot ${slotIndex}...`);
      }
    } else {
      useToastStore.getState().error(result.error);
    }
  };

  const handleArchive = async (save) => {
    const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
    if (skipConfirm || window.confirm(`Archive "${save.farmName}"? This will move it from Slot ${save.index} to your Library.`)) {
      const result = await archiveSavegame(save.path);
      if (result.success) {
        useToastStore.getState().success(`Archived "${save.farmName}"`);
        fetchSavegames();
        fetchArchives();
      } else {
        useToastStore.getState().error(result.error);
      }
    }
  };

  const handleRestore = async () => {
    if (!showRestoreModal) return;
    
    let targetSlotValue = restoreSlot;
    if (targetSlotValue === 'auto') {
        const firstEmpty = allSlots.find(s => s.isEmpty);
        if (!firstEmpty) {
            useToastStore.getState().error("No empty slots available! Archive or delete a save first.");
            return;
        }
        targetSlotValue = firstEmpty.index.toString();
    }

    const targetSlot = parseInt(targetSlotValue);
    const existing = savegames.find(s => s.index === targetSlot && (s.modCount > 0 || s.farmName !== s.folderName));
    
    if (existing && !window.confirm(`Slot ${targetSlot} is occupied by "${existing.farmName}". It will be OVERWRITTEN. Continue?`)) {
        return;
    }

    // Default to swapping (moving) unless user explicitly checked "Keep Copy"
    const keepCopy = document.getElementById('keep-archive-copy')?.checked;
    const result = keepCopy 
        ? await restoreSavegame(showRestoreModal, targetSlot)
        : await window.api.savegames.swapToSlot({ archivedFolderName: showRestoreModal, slotIndex: targetSlot });

    if (result.success) {
      useToastStore.getState().success(keepCopy ? `Restored to Slot ${targetSlot}` : `Moved to Slot ${targetSlot}`);
      setShowRestoreModal(null);
      setIsArchivePanelOpen(false); // Close panel after restore
      fetchSavegames();
      fetchArchives();
    } else {
      useToastStore.getState().error(result.error);
    }
  };
  
  const handleResetFleet = async (save) => {
    if (window.confirm('Reset all vehicles to 0% dirt and 0% wear?')) {
      const result = await window.api.savegames.resetFleet({ savePath: save.path });
      if (result.success) {
        useToastStore.getState().success('Fleet maintenance complete!');
        fetchSavegames();
      } else {
        useToastStore.getState().error(result.error);
      }
    }
  };


  const handleAdopt = async (saveIndex) => {
    if (window.confirm("Adopt this savegame as a Golden Master template for this map?")) {
      const result = await window.api.savegames.adoptTemplate(saveIndex);
      if (result.success) {
        useToastStore.getState().success("Template created successfully! This map will now launch instantly in new careers.");
        fetchSavegames();
      } else {
        useToastStore.getState().error(result.error);
      }
    }
  };

  const openCreateModal = (slot = 'auto') => {
    setCreateSlot(slot.toString());
    setCreateName('New Farming Career');
    
    // Auto-select "Must Have" mods conceptually handled by toggle
    setModalSelectedMods(new Set());
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      let targetSlotValue = createSlot;
      
      // Resolve "Auto" slot
      if (targetSlotValue === 'auto') {
        const firstEmpty = allSlots.find(s => s.isEmpty);
        if (!firstEmpty) {
          useToastStore.getState().error("All 20 save slots are full! Please archive or delete a save to free up a slot.");
          return;
        }
        targetSlotValue = firstEmpty.index.toString();
      }

      const slotIndex = parseInt(targetSlotValue);
      let finalModNames = new Set(modalSelectedMods);
      if (includeMustHaves) {
        const favoriteMods = useModHubStore.getState().favoriteMods || [];
        mods
          .filter(m => !m.isMap && favoriteMods.some(fm => fm.isMustHave && ((fm.modId && m.modId && String(fm.modId) === String(m.modId)) || (fm.fileName && m.fileName && fm.fileName === m.fileName))))
          .forEach(m => finalModNames.add(m.modName));
      }
      const modsToAdd = mods.filter(m => finalModNames.has(m.modName));
      const [mapId, mapTitle, mapModName] = createMap.split('|');
      
      // Confirm overwrite if manually selected an occupied slot
      if (createSlot !== 'auto') {
        const existing = savegames.find(s => s.index === slotIndex && (s.modCount > 0 || s.farmName !== s.folderName));
        if (existing && !window.confirm(`Slot ${slotIndex} is occupied by "${existing.farmName}". Overwrite?`)) {
          return;
        }
      }

      const result = await window.api.savegames.create({
        savegameIndex: slotIndex,
        savegameName: createName.trim(),
        selectedMods: modsToAdd,
        mapId: mapId,
        mapTitle: mapTitle,
        mapModName: mapModName,
        difficulty: createDifficulty,
        economicDifficulty: createEconomy,
        initialMoney: createMoney,
        initialLoan: createLoan,
        fixedSeasonLength: createSeasonLength,
        timeScale: createTimeScale,
        startMonth: createStartMonth
      });

      if (result.success) {
        if (result.requiresEngineInit) {
          useToastStore.getState().success(`Map needs engine initialization. Launching Slot ${slotIndex} to build world...`);
          setShowCreateModal(false);
          
          // Get the mods path to ensure the engine sees the map mod
          const modsPath = await window.api.mods.detectPath();

          // Wait a moment for the user to read the toast
          if (autoLaunchOnCreate) {
              setTimeout(() => {
                handleLaunch(slotIndex, { 
                    requiresEngineInit: true, 
                    mapId: result.mapId,
                    modsPath: modsPath?.path || modsPath // Extract .path if it's an object
                });
                fetchSavegames();
              }, 1500);
          } else {
              useToastStore.getState().info("Save created. You will need to launch it once to initialize the map files.");
              fetchSavegames();
          }
        } else {
          useToastStore.getState().success(`Career created in Slot ${slotIndex}`);
          setShowCreateModal(false);
          fetchSavegames();
        }
      } else {
        useToastStore.getState().error(result.error);
      }
    } catch (err) {
      useToastStore.getState().error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleSaveSelection = (index) => {
    setSelectedSaves(prev => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
    });
  };

  const selectAllSaves = () => {
    if (selectedSaves.size === 20) setSelectedSaves(new Set());
    else setSelectedSaves(new Set([...Array(20)].map((_, i) => i + 1)));
  };

  const handleBulkDeleteSaves = async () => {
    const list = Array.from(selectedSaves);
    if (list.length === 0) return;

    const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
    if (skipConfirm || window.confirm(`Permanently delete ${list.length} career slots? This cannot be undone.`)) {
        setSwapping(true);
        try {
            for (const index of list) {
                const save = allSlots.find(s => s.index === index);
                if (save && !save.isEmpty) {
                    await window.api.savegames.delete({ path: save.path });
                }
            }
            useToastStore.getState().success(`Successfully cleared ${list.length} slots.`);
            setSelectedSaves(new Set());
            fetchSavegames();
        } catch (err) {
            useToastStore.getState().error(`Bulk delete failed: ${err.message}`);
        } finally {
            setSwapping(false);
        }
    }
  };

  const toggleArchiveSelection = (folderName) => {
    const next = new Set(selectedArchives);
    if (next.has(folderName)) next.delete(folderName);
    else next.add(folderName);
    setSelectedArchives(next);
  };

  const selectAllArchives = () => setSelectedArchives(new Set(archives.map(a => a.folderName)));
  const deselectAllArchives = () => setSelectedArchives(new Set());

  const handleBulkDeleteArchives = async () => {
    if (selectedArchives.size === 0) return;
    const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
    if (skipConfirm || window.confirm(`Are you sure you want to delete ${selectedArchives.size} careers permanently?`)) {
        for (const folderName of selectedArchives) await deleteArchive(folderName);
        useToastStore.getState().success(`Deleted ${selectedArchives.size} careers`);
        setSelectedArchives(new Set());
        fetchArchives();
    }
  };
  
  const handleBulkRestoreArchives = async () => {
    const selectedList = Array.from(selectedArchives);
    if (selectedList.length === 0) return;

    const availableSlots = allSlots.filter(s => s.isEmpty);
    
    if (availableSlots.length === 0) {
        useToastStore.getState().error("No empty slots available! Archive some saves first.");
        return;
    }

    const toRestore = selectedList.slice(0, availableSlots.length);
    const overflow = selectedList.length - toRestore.length;

    if (overflow > 0 && !window.confirm(`Only ${availableSlots.length} slots are available. ${overflow} saves will stay in archive. Proceed?`)) {
        return;
    }

    setSwapping(true);
    try {
        for (let i = 0; i < toRestore.length; i++) {
            const folderName = toRestore[i];
            const slotIndex = availableSlots[i].index;
            await restoreSavegame(folderName, slotIndex);
        }
        useToastStore.getState().success(`Successfully restored ${toRestore.length} careers.`);
        setSelectedArchives(new Set());
        fetchSavegames();
        fetchArchives();
        if (toRestore.length >= selectedList.length) setIsArchivePanelOpen(false);
    } catch (err) {
        useToastStore.getState().error(`Bulk restore failed: ${err.message}`);
    } finally {
        setSwapping(false);
    }
  };

  const toggleModalModSelection = (modName) => {
    setModalSelectedMods(prev => {
      const next = new Set(prev);
      if (next.has(modName)) next.delete(modName);
      else next.add(modName);
      return next;
    });
  };

  const applyProfileToModal = (profileId) => {
    const p = profiles.find(x => x.id === profileId);
    if (p) setModalSelectedMods(new Set((p.mods || []).map(m => m.modName)));
  };

  const formatMoney = (amount) => Math.round(amount || 0).toLocaleString();
  const formatPlayTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const allSlots = [...Array(20)].map((_, i) => {
      const idx = i + 1;
      return savegames.find(s => s.index === idx) || { index: idx, folderName: `savegame${idx}`, farmName: `Empty Slot ${idx}`, modCount: 0, isEmpty: true };
  });

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e, slotIndex = null) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    const sourcePath = file.path;

    // If slotIndex is null, find first empty slot
    let targetSlot = slotIndex;
    if (targetSlot === null) {
        const firstEmpty = allSlots.find(s => s.isEmpty);
        if (!firstEmpty) {
            useToastStore.getState().error("All slots are full. Drop onto a specific slot to overwrite it.");
            return;
        }
        targetSlot = firstEmpty.index;
    }

    // Confirm overwrite if slot is occupied
    const occupied = savegames.find(s => s.index === targetSlot && (s.modCount > 0 || s.farmName !== s.folderName));
    if (occupied && !window.confirm(`Slot ${targetSlot} is occupied by "${occupied.farmName}". Overwrite with dropped savegame?`)) {
        return;
    }

    useToastStore.getState().info(`Importing savegame to Slot ${targetSlot}...`);
    const result = await window.api.savegames.import({ sourcePath, targetIndex: targetSlot });
    if (result.success) {
        useToastStore.getState().success(`Successfully imported to Slot ${targetSlot}`);
        fetchSavegames();
    } else {
        useToastStore.getState().error(result.error);
    }
  };

  return (
    <div 
        className="page animate-fade-in"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e)}
    >
      {isDragging && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(var(--accent-rgb), 0.1)', backdropFilter: 'blur(4px)', border: '4px dashed var(--accent)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '24px 48px', borderRadius: 24, border: '1px solid var(--border)', boxShadow: 'var(--shadow-2xl)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Save size={32} />
                </div>
                <div style={{ textAlign: 'center' }}>
                    <h2 style={{ fontSize: 20, fontWeight: 800 }}>Import Savegame</h2>
                    <p style={{ fontSize: 14, opacity: 0.6 }}>Drop folder or ZIP here to import into first available slot</p>
                </div>
            </div>
        </div>
      )}
      <div className="page__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page__title">Management console</h1>
          <p className="page__subtitle">Managing 20 main savegame slots</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          {selectedSaves.size > 0 && (
            <div className="animate-fade-in" style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginRight: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{selectedSaves.size} SELECTED</span>
                <button className="btn btn--danger btn--xs" style={{ background: 'var(--error)', padding: '4px 8px' }} onClick={handleBulkDeleteSaves} disabled={swapping}>
                    <Trash2 size={12} /> Delete
                </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 12 }}>
              <input 
                type="checkbox" 
                id="select-all-main"
                checked={selectedSaves.size === 20} 
                onChange={selectAllSaves}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
              <label htmlFor="select-all-main" style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer', color: 'var(--text-secondary)' }}>SELECT ALL</label>
          </div>

          <button className="btn btn--secondary btn--sm" onClick={() => navigate('/save-transfer')} title="Transfer data between saves">
            <ArrowRightLeft size={14} /> Save Transfer
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => openCreateModal()}><Plus size={14} /> New Career</button>
          <button className={`btn btn--${isArchivePanelOpen ? 'accent' : 'secondary'} btn--sm`} onClick={() => setIsArchivePanelOpen(true)}>
            <Archive size={14} /> Archive {archives.length > 0 && `(${archives.length})`}
          </button>
          <button className="btn btn--secondary btn--sm" onClick={() => { fetchSavegames(); fetchArchives(); }}>
            <RefreshCw size={14} className={isSavesLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 'var(--sp-4)', paddingBottom: 'var(--sp-8)' }}>
        {allSlots.map(save => (
            <SaveSlotCard 
                key={save.index}
                save={save}
                onPlay={() => handleLaunch(save.index)}
                onArchive={() => handleArchive(save)}
                onCreate={() => openCreateModal(save.index)}
                onRename={() => { setEditingName(save.folderName); setNewName(save.farmName); }}
                onAdopt={() => handleAdopt(save.index)}
                onEdit={() => setShowEditor(save)}
                onAudit={() => setShowAudit(save)}
                onDelete={async () => {
                    const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
                    if (skipConfirm || window.confirm(`Delete Slot ${save.index}?`)) {
                        await window.api.savegames.delete({ path: save.path });
                        fetchSavegames();
                    }
                }}
                editingName={editingName}
                newName={newName}
                setNewName={setNewName}
                handleRename={() => handleRename(save)}
                setEditingName={setEditingName}
                formatMoney={formatMoney}
                formatPlayTime={formatPlayTime}
                isSelected={selectedSaves.has(save.index)}
                onToggleSelection={() => toggleSaveSelection(save.index)}
                mods={mods}
                onDrop={handleDrop}
            />
        ))}
      </div>

      {/* Pop-out Archive Panel Backdrop */}
      {isArchivePanelOpen && (
        <div 
          className="animate-fade-in"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 999 }}
          onClick={() => setIsArchivePanelOpen(false)}
        />
      )}

      {/* Pop-out Archive Panel Drawer */}
      <div style={{ 
          position: 'fixed', 
          top: 0, 
          right: 0, 
          bottom: 0, 
          width: 420, 
          background: 'var(--bg-secondary)', 
          borderLeft: '1px solid var(--border)', 
          zIndex: 1000,
          boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
          transform: isArchivePanelOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1.0)',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--sp-5)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Archive size={22} className="text-accent" />
                    <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>Career Archive</h2>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => setIsArchivePanelOpen(false)}>
                    <X size={20} />
                </button>
            </div>
            
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--sp-5)' }}>Careers stored outside your 20 main slots.</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)', background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{archives.length} {archives.length === 1 ? 'Career' : 'Careers'}</span>
                {archives.length > 0 && (
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn--ghost btn--xs" onClick={selectAllArchives}>All</button>
                        <button className="btn btn--ghost btn--xs" onClick={deselectAllArchives}>None</button>
                    </div>
                )}
            </div>

            {selectedArchives.size > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
                    <button 
                      className="btn btn--primary btn--sm animate-fade-in" 
                      onClick={handleBulkRestoreArchives}
                      disabled={swapping}
                      style={{ width: '100%', background: 'var(--accent)', color: 'var(--bg-primary)' }}
                    >
                        <RotateCcw size={16} /> Restore Selected ({selectedArchives.size})
                    </button>
                    <button 
                      className="btn btn--danger btn--sm animate-fade-in" 
                      onClick={handleBulkDeleteArchives}
                      disabled={swapping}
                      style={{ width: '100%', background: 'var(--error)', color: 'white' }}
                    >
                        <Trash2 size={16} /> Delete Selected ({selectedArchives.size})
                    </button>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', paddingRight: 4 }}>
                {archives.map(archive => (
                    <div key={archive.folderName} className={`save-card ${selectedArchives.has(archive.folderName) ? 'save-card--selected' : ''}`} style={{ padding: 'var(--sp-3)', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <input 
                          type="checkbox" 
                          checked={selectedArchives.has(archive.folderName)} 
                          onChange={(e) => { e.stopPropagation(); toggleArchiveSelection(archive.folderName); }}
                          style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{archive.farmName}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8, marginTop: 2 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {getLocalizedString(archive.mapTitle)}</span>
                                <span>{formatMoney(archive.money)}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn--primary btn--sm" style={{ padding: '6px' }} onClick={() => { 
                                setShowRestoreModal(archive.folderName); 
                                setRestoreSlot('auto');
                            }} title="Restore">
                                <RotateCcw size={14} />
                            </button>
                            <button className="btn btn--ghost btn--sm" style={{ color: 'var(--error)', padding: '6px' }} onClick={async () => {
                                const skipConfirm = useSettingsStore.getState().skipDeleteConfirm;
                                if (skipConfirm || window.confirm(`Delete archive "${archive.farmName}" permanently?`)) {
                                    await deleteArchive(archive.folderName);
                                    fetchArchives();
                                }
                            }} title="Delete">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
                {archives.length === 0 && !isArchivesLoading && (
                    <div className="empty-state" style={{ marginTop: 'var(--sp-8)' }}>
                        <div style={{ opacity: 0.3 }}><Archive size={48} /></div>
                        <div style={{ fontSize: 14, marginTop: 12, opacity: 0.5 }}>Archive is empty</div>
                    </div>
                )}
            </div>
      </div>

      {/* MODALS */}
      {showCreateModal && (
          <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowCreateModal(false)}>
              <div 
                className="modal animate-zoom-in" 
                style={{ 
                  width: 1300, 
                  maxWidth: 'none',
                  maxHeight: '90vh',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 0, 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: 16,
                  boxShadow: 'var(--shadow-2xl)',
                  overflow: 'hidden'
                }} 
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                <Plus size={24} strokeWidth={3} />
                            </div>
                            <div>
                                <h2 style={{ fontSize: 24, fontWeight: 800 }}>Create New Career</h2>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                    {createSlot === 'auto' ? 'Auto-assigning to next empty slot' : `Targeting Savegame Slot ${createSlot}`}
                                </div>
                            </div>
                        </div>
                        <button className="btn btn--ghost btn--icon" onClick={() => setShowCreateModal(false)}><X size={24} /></button>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="tab-switcher" style={{ padding: '0 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <button className={`tab-btn ${createActiveTab === 'basic' ? 'tab-btn--active' : ''}`} onClick={() => setCreateActiveTab('basic')}>
                        <MapIcon size={14} /> Basic & Map
                    </button>
                    <button className={`tab-btn ${createActiveTab === 'rules' ? 'tab-btn--active' : ''}`} onClick={() => setCreateActiveTab('rules')}>
                        <Sliders size={14} /> Economy & Rules
                    </button>
                    <button className={`tab-btn ${createActiveTab === 'mods' ? 'tab-btn--active' : ''}`} onClick={() => setCreateActiveTab('mods')}>
                        <Package size={14} /> Mod Selection
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
                    {createActiveTab === 'basic' && (
                        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>SAVEGAME NAME</label>
                                    <input 
                                        type="text" 
                                        value={createName} 
                                        onChange={e => setCreateName(e.target.value)} 
                                        placeholder="New Farming Career"
                                        style={{ width: '100%', padding: '14px', fontSize: 16, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }} 
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>TARGET SLOT</label>
                                    <select value={createSlot} onChange={e => setCreateSlot(e.target.value)} style={{ width: '100%', padding: '14px', fontSize: 16, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                        <option value="auto">Auto (Next Available)</option>
                                        {[...Array(20)].map((_, i) => {
                                            const idx = i + 1;
                                            const slot = allSlots.find(s => s.index === idx);
                                            const isOccupied = slot && !slot.isEmpty;
                                            return (
                                                <option key={idx} value={idx}>
                                                    Slot {idx} {isOccupied ? `(Occupied: ${slot.farmName})` : '(Empty)'}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                                        SELECT MAP {mapHasTemplate && <span style={{ color: 'var(--accent)', marginLeft: 8 }}><Zap size={10} fill="var(--accent)" /> AUTOMATED</span>}
                                    </label>
                                    <select value={createMap} onChange={e => setCreateMap(e.target.value)} style={{ width: '100%', padding: '14px', fontSize: 16, background: 'var(--bg-tertiary)', border: mapHasTemplate ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 8 }}>
                                        <optgroup label="Official Maps">
                                            <option value="MapUS|Riverbend Springs|">Riverbend Springs (US)</option>
                                            <option value="MapAS|Hutan Pantai|">Hutan Pantai (Asia)</option>
                                            <option value="MapEU|Zielonka|">Zielonka (Europe)</option>
                                            <option value="HighlandsFishingMap|Kinlaig|pdlc_highlandsFishingPack">Kinlaig (DLC)</option>
                                        </optgroup>
                                        
                                        {mods.filter(m => m.isMap).length > 0 && (
                                            <optgroup label="Modded Maps">
                                                {mods.filter(m => m.isMap).map(m => (
                                                    <option key={m.modName} value={`${m.mapId || m.modName}|${m.title}|${m.modName}`}>{m.title}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <label style={{ fontSize: 12, fontWeight: 800, display: 'block', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>MAP PREVIEW</label>
                                <div style={{ flex: 1, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', position: 'relative', boxShadow: 'var(--shadow-lg)' }}>
                                    {(() => {
                                        const [mapId, title, modName] = createMap.split('|');
                                        return <MapImage mapTitle={title} mapId={mapId} mods={mods} />;
                                    })()}
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', color: 'white' }}>
                                        <div style={{ fontWeight: 800, fontSize: 18 }}>{createMap.split('|')[1]}</div>
                                        <div style={{ fontSize: 12, opacity: 0.8 }}>{createMap.split('|')[0]}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {createActiveTab === 'rules' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {!mapHasTemplate ? (
                                <div className="animate-pulse-subtle" style={{ padding: '24px', background: 'rgba(var(--warning-rgb), 0.05)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--warning-dim)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--warning)', fontWeight: 800, fontSize: 14, marginBottom: 10 }}>
                                        <ShieldAlert size={20} /> HANDSHAKE REQUIRED
                                    </div>
                                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        This map doesn't have an automation template yet. <strong>Rules & Economy settings are locked </strong> 
                                        until you initialize the map. Simply launch, save, and exit—the Manager will learn the map settings automatically!
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>STARTING MODE</label>
                                            <select value={createMode} onChange={e => handleModeChange(e.target.value)} style={{ width: '100%', padding: '14px', border: '2px solid var(--accent)', color: 'var(--accent)', fontWeight: 800, fontSize: 16, borderRadius: 8, background: 'var(--bg-tertiary)' }}>
                                                <option value="NEW_FARMER">New Farmer</option>
                                                <option value="FARM_MANAGER">Farm Manager</option>
                                                <option value="START_FROM_SCRATCH">Start From Scratch</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                            <div>
                                                <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>INITIAL MONEY</label>
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>$</span>
                                                    <input type="number" value={createMoney} onChange={e => setCreateMoney(parseInt(e.target.value))} style={{ width: '100%', padding: '12px 12px 12px 28px', fontSize: 16, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>INITIAL LOAN</label>
                                                <div style={{ position: 'relative' }}>
                                                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>$</span>
                                                    <input type="number" value={createLoan} onChange={e => setCreateLoan(parseInt(e.target.value))} style={{ width: '100%', padding: '12px 12px 12px 28px', fontSize: 16, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>ECONOMY DIFFICULTY</label>
                                            <select value={createEconomy} onChange={e => setCreateEconomy(e.target.value)} style={{ width: '100%', padding: '14px', fontSize: 16, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                                <option value="EASY">Easy</option>
                                                <option value="NORMAL">Normal</option>
                                                <option value="HARD">Hard</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>SEASON LENGTH (DAYS)</label>
                                            <input type="number" min="1" max="28" value={createSeasonLength} onChange={e => setCreateSeasonLength(parseInt(e.target.value))} style={{ width: '100%', padding: '14px', fontSize: 16, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 20 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                    <Zap size={24} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 800, fontSize: 16 }}>Auto-launch to initialize map</div>
                                    <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>Modded maps require one launch to build the world files. We'll handle this automatically.</div>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={autoLaunchOnCreate} 
                                    onChange={e => setAutoLaunchOnCreate(e.target.checked)}
                                    style={{ width: 28, height: 28, cursor: 'pointer', accentColor: 'var(--accent)' }}
                                />
                            </div>
                        </div>
                    )}

                    {createActiveTab === 'mods' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', background: 'var(--bg-tertiary)', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={includeMustHaves} 
                                            onChange={(e) => setIncludeMustHaves(e.target.checked)}
                                            style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                                        /> 
                                        Include Must-Haves ({mods.filter(m => !m.isMap && (useModHubStore.getState().favoriteMods || []).some(fm => fm.isMustHave && ((fm.modId && m.modId && String(fm.modId) === String(m.modId)) || (fm.fileName && m.fileName && fm.fileName === m.fileName)))).length})
                                    </label>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {profiles.length > 0 && (
                                        <select onChange={e => applyProfileToModal(e.target.value)} defaultValue="" style={{ fontSize: 13, padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                            <option value="" disabled>Apply Profile...</option>
                                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    )}
                                    <button className="btn btn--secondary btn--sm" onClick={() => setModalSelectedMods(new Set(mods.filter(m => !m.isMap).map(m => m.modName)))}>Select All</button>
                                    <button className="btn btn--secondary btn--sm" onClick={() => setModalSelectedMods(new Set())}>Clear</button>
                                </div>
                            </div>

                            <div style={{ flex: 1, minHeight: 400, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {(() => {
                                  const favoriteMods = useModHubStore.getState().favoriteMods || [];
                                  
                                  // 1. Helper to deduplicate mods by title + author
                                  const deduplicate = (list) => {
                                      const map = new Map();
                                      list.forEach(m => {
                                          const key = `${m.title}|${m.author}`.toLowerCase();
                                          const existing = map.get(key);
                                          if (!existing) {
                                              map.set(key, m);
                                          } else {
                                              // Simple version comparison
                                              const v1 = String(existing.version || '0').split('.').map(p => parseInt(p) || 0);
                                              const v2 = String(m.version || '0').split('.').map(p => parseInt(p) || 0);
                                              let isNewer = false;
                                              for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
                                                  if ((v2[i] || 0) > (v1[i] || 0)) { isNewer = true; break; }
                                                  if ((v2[i] || 0) < (v1[i] || 0)) break;
                                              }
                                              if (isNewer) map.set(key, m);
                                          }
                                      });
                                      return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
                                  };

                                  const allValidMods = mods.filter(m => !m.isMap);
                                  const mustHaveMods = deduplicate(allValidMods.filter(m => 
                                      favoriteMods.some(fm => fm.isMustHave && (
                                          (fm.modId && m.modId && String(fm.modId) === String(m.modId)) || 
                                          (fm.fileName && m.fileName && fm.fileName === m.fileName)
                                      ))
                                  ));
                                  
                                  const otherMods = deduplicate(allValidMods.filter(m => 
                                      !mustHaveMods.some(mh => mh.title === m.title && mh.author === m.author)
                                  ));

                                  return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {mustHaveMods.length > 0 && includeMustHaves && (
                                          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--accent)', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8 }}>
                                              <Pin size={10} fill="var(--accent)" /> PINNED MUST-HAVES
                                            </div>
                                            {mustHaveMods.map(m => (
                                              <label key={m.modName} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', fontSize: 14, cursor: 'default', borderRadius: 8, background: 'rgba(var(--accent-rgb), 0.1)', opacity: 0.8, marginBottom: 4 }} title={`Version: ${m.version}`}>
                                                <input type="checkbox" checked={true} readOnly style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{m.title}</span>
                                                    <span style={{ fontSize: 11, opacity: 0.6 }}>{m.author} • v{m.version}</span>
                                                </div>
                                              </label>
                                            ))}
                                          </div>
                                        )}
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            {(includeMustHaves ? otherMods : deduplicate(allValidMods)).map(m => (
                                            <label key={m.modName} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', fontSize: 14, cursor: 'pointer', borderRadius: 8, background: modalSelectedMods.has(m.modName) ? 'var(--accent-dim)' : 'transparent', border: '1px solid transparent', transition: 'all 0.15s' }} className="hover-bg-subtle">
                                                <input type="checkbox" checked={modalSelectedMods.has(m.modName)} onChange={() => toggleModalModSelection(m.modName)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
                                                    <span style={{ fontWeight: 600 }}>{m.title}</span>
                                                    <span style={{ fontSize: 11, opacity: 0.4, whiteSpace: 'nowrap' }}>v{m.version}</span>
                                                </div>
                                            </label>
                                            ))}
                                        </div>
                                      </div>
                                  );
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 'var(--sp-4)', justifyContent: 'flex-end', padding: '24px 32px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{modalSelectedMods.size + (includeMustHaves ? 10 : 0)}</strong> Mods Selected
                        </div>
                    </div>
                    <button className="btn btn--ghost" style={{ height: 48, padding: '0 32px', fontSize: 16 }} onClick={() => setShowCreateModal(false)}>Cancel</button>
                    <button className="btn btn--primary" style={{ height: 48, padding: '0 48px', fontSize: 16, fontWeight: 800, background: 'var(--accent)', color: 'var(--bg-primary)' }} onClick={handleCreate} disabled={creating}>{creating ? 'Creating...' : 'Create Career'}</button>
                </div>
              </div>
          </div>
      )}

      {showRestoreModal && (
          <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowRestoreModal(null)}>
              <div className="modal-content" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
                <h2 style={{ marginBottom: 'var(--sp-4)' }}>Restore to Slot</h2>
                <div style={{ marginBottom: 'var(--sp-5)' }}>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>TARGET SLOT</label>
                    <select value={restoreSlot} onChange={e => setRestoreSlot(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <option value="auto">Auto (Next Available)</option>
                        {[...Array(20)].map((_, i) => (
                            <option key={i+1} value={i+1}>Slot {i+1} {allSlots[i].isEmpty ? '(Empty)' : `(Occupied: ${allSlots[i].farmName})`}</option>
                        ))}
                    </select>
                </div>
                <div style={{ marginBottom: 'var(--sp-6)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox" id="keep-archive-copy" style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                        Keep a copy in the Library
                    </label>
                </div>
                <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
                    <button className="btn btn--ghost" onClick={() => setShowRestoreModal(null)}>Cancel</button>
                    <button className="btn btn--primary" onClick={handleRestore}>Restore Now</button>
                </div>
              </div>
          </div>
      )}

      {showEditor && (
          <SavegameEditorModal 
            save={showEditor} 
            onClose={() => setShowEditor(null)} 
            onRefresh={fetchSavegames} 
          />
      )}

      {showAudit && (
           <ModAuditModal 
             save={showAudit} 
             allInstalledMods={mods}
             onClose={() => setShowAudit(null)} 
             onRefresh={() => { fetchSavegames(); setShowAudit(null); }} 
           />
       )}

      {missingDeps && (
          <DependencyDownloadModal 
            missingMods={missingDeps}
            onCancel={() => setMissingDeps(null)}
            onComplete={async () => {
              await useLocalModsStore.getState().scanMods(); // Refresh the list
              setMissingDeps(null);
            }}
          />
      )}
    </div>
  );
}
