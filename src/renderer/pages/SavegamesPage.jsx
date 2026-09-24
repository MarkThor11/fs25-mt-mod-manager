import { CustomSlider } from '../components/common/CustomSlider';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save, Play, RefreshCw, Edit3, MapPin,
  Clock, DollarSign, Package, Check, X,
  Plus, ChevronDown, ChevronRight, Gamepad2, Trash2, TrendingUp, Shield, Download, AlertTriangle,
  Archive, RotateCcw, Info, Zap, Folder, Sliders, Cloud, Wrench, ShieldAlert, Pin, Users, Globe, Map as MapIcon, Settings, AlertCircle, Ruler, Volume2, Video, Search, Coins, Thermometer, Calendar, CalendarDays, FastForward, TrainFront, UserCheck, Settings2, Sparkles, Droplets, Paintbrush, ArrowRightLeft, Anchor, Truck, Tractor, Car, Wheat, Share2, Lock, Unlock, Crown, Server, User
} from 'lucide-react';
import { useSavegameStore } from '../store/useSavegameStore';
import { useToastStore } from '../store/useToastStore';
import { useProfileStore } from '../store/useProfileStore';
import { useArchiveStore } from '../store/useArchiveStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useModHubStore } from '../store/useModHubStore';
import { useDownloadStore } from '../store/useDownloadStore';
import MapImage, { MAP_PREVIEWS } from '../components/common/MapImage';
import { resolveRecursiveDependencies, matchModWithDependency, getActiveConflictsForSave } from '../utils/modUtils';
import DependencyDownloadModal from '../components/common/DependencyDownloadModal';
import MapSelectDropdown from '../components/common/MapSelectDropdown';
import { COMBINE_HARVESTER_ICON } from '../assets/combineIconData';

const getLocalizedString = (val, defaultVal = 'Unknown') => {
    if (!val) return defaultVal;
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val.en || val.de || val.fr || Object.values(val)[0] || defaultVal;
    return String(val);
};

const CombineHarvesterIcon = ({ size = 24, color = 'currentColor', style = {} }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={style}
  >
    {/* Detached Front Cutter Reel */}
    <circle cx="3" cy="14" r="2.8" />
    <path d="M0.2 14H5.8" />
    <path d="M3 11.2V16.8" />
    <path d="M1 12L5 16" />
    <path d="M1 16L5 12" />
    {/* Cutter Bar Under Reel */}
    <path d="M0.2 17.5H6.5" />
    {/* Feeder House Arm (Creating the Gap) */}
    <path d="M5.8 14.5L10 12.5" />
    {/* Driver Cabin */}
    <path d="M10 12.5V6.5H14.5L17 10.5V12.5" />
    <path d="M12 6.5V10.5H17" />
    {/* Grain Body & Rear */}
    <path d="M10 12.5H22V16.5" />
    {/* Unloading Spout */}
    <path d="M14 6.5L19.5 4H22" />
    {/* Front Large Wheel */}
    <circle cx="11.5" cy="17.5" r="2.5" />
    {/* Rear Wheel */}
    <circle cx="19.5" cy="18" r="1.5" />
    <path d="M14 18.5H18" />
  </svg>
);

const TelehandlerIcon = ({ size = 24, color = 'currentColor', style = {} }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={style}
  >
    {/* Extended Telescopic Boom Arm */}
    <path d="M16 11.5L5 5.5" />
    <path d="M17 13.5L7.5 8" />
    {/* Front Pallet Fork Attachment */}
    <path d="M5 5.5L2.5 5.5V10H5" />
    {/* Driver Cabin */}
    <path d="M8 13.5V7.5H12L14.5 10.5V13.5" />
    <path d="M10 7.5V10.5H14.5" />
    {/* Lower Body Frame */}
    <path d="M9.5 16H14.5" />
    <path d="M4.5 16H2.5V13.5H8" />
    <path d="M19.5 16H21.5V12.5H16" />
    {/* Front Wheel */}
    <circle cx="7" cy="16.5" r="2.5" />
    {/* Rear Wheel */}
    <circle cx="17" cy="16.5" r="2.5" />
  </svg>
);

const WheelLoaderIcon = ({ size = 24, color = 'currentColor', style = {} }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={style}
  >
    {/* Large Front Loader Bucket Scoop */}
    <path d="M1 10.5L3.8 16H7.5L5 10.5H1" />
    <path d="M1 10.5H5" />
    {/* Lift Arm & Z-Bar Linkage */}
    <path d="M11.5 11.5L5 12" />
    <path d="M12.5 8.5L7 14.5" />
    {/* Central Articulation Joint */}
    <path d="M12 11.5V16" />
    {/* Driver Cabin */}
    <path d="M10 11.5V6H14.5L17.5 9.5V11.5" />
    <path d="M12 6V9.5H17.5" />
    {/* Rear Chassis & Engine Cover */}
    <path d="M17.5 9.5H22V15H17.5" />
    {/* Heavy Front Wheel */}
    <circle cx="7" cy="16.5" r="2.5" />
    {/* Heavy Rear Wheel */}
    <circle cx="17.5" cy="16.5" r="2.5" />
    {/* Underbody Tie Line */}
    <path d="M9.5 16.5H15" />
  </svg>
);

const formatMoney = (amount) => Math.round(amount || 0).toLocaleString();
const formatPlayTime = (minutes) => {
  const hours = Math.floor((minutes || 0) / 60);
  const mins = Math.round((minutes || 0) % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

/**
 * Mod Audit Modal - Checks versions and missing mods for a savegame
 */
function ModAuditModal({ save, allInstalledMods, onClose, onRefresh }) {
  const [resolving, setResolving] = useState(false);
  const [syncStatus, setSyncStatus] = useState({}); // modName -> status

  const auditResults = (save.mods || []).map(reqRaw => {
    const reqModName = typeof reqRaw === 'string' ? reqRaw : reqRaw?.modName || '';
    const reqVersion = typeof reqRaw === 'string' ? null : reqRaw?.version;
    const installed = allInstalledMods.find(m => m.modName.toLowerCase() === reqModName.toLowerCase());
    
    let status = 'MISSING';
    let localVersion = null;
    let needsUpdate = false;

    if (installed) {
      status = 'INSTALLED';
      localVersion = installed.version;
      
      if (reqVersion && installed.version) {
        // Simple version check (we can use semantic compare in backend later, 
        // but for UI red/green mismatch is the primary concern)
        if (installed.version !== reqVersion) {
          status = 'VERSION_MISMATCH';
          needsUpdate = true;
        }
      }
    }

    return { 
        ...(typeof reqRaw === 'string' ? { modName: reqRaw } : reqRaw), 
        modName: reqModName, 
        version: reqVersion,
        status, 
        localVersion, 
        needsUpdate 
    };
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

        {/* Server Mod Download Link Banner */}
        {save.serverModUrl && (
          <div style={{ padding: '10px 24px', background: 'rgba(6, 182, 212, 0.12)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Globe size={16} style={{ color: '#06b6d4' }} />
              <span><strong>Server Mod Host:</strong> Download server-specific mods provided by the host.</span>
            </div>
            <button 
              className="btn btn--primary btn--xs"
              onClick={() => window.api?.shell?.openExternal ? window.api.shell.openExternal(save.serverModUrl) : window.open(save.serverModUrl, '_blank')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, background: '#06b6d4', borderColor: '#0891b2' }}
            >
              <Globe size={13} /> Open Server Mod Page
            </button>
          </div>
        )}

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
 * Server Export & Sharing Modal
 */
function ServerExportModal({ save, onClose, onExportComplete }) {
  const [exportType, setExportType] = useState('player'); // 'player' | 'admin' | 'standard'
  const [serverName, setServerName] = useState(save.serverName || save.farmName || `Slot ${save.index} Server`);
  const [serverModUrl, setServerModUrl] = useState(save.serverModUrl || '');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const cleanTitle = (serverName || save.farmName || `Slot${save.index || ''}`).replace(/[\\/:*?"<>|]/g, '_');
      const defaultName = save.index ? `${cleanTitle}_Slot${save.index}` : cleanTitle;

      if (exportType === 'standard') {
        useToastStore.getState().info(`Preparing standard backup for ${defaultName}...`);
        const result = await window.api.savegames.export({ savePath: save.path, defaultName });
        if (result.success) {
          useToastStore.getState().success(`Savegame exported successfully to ${result.filePath}`);
          if (onExportComplete) onExportComplete();
          onClose();
        } else if (!result.canceled) {
          useToastStore.getState().error(result.error || 'Failed to export savegame');
        }
      } else {
        useToastStore.getState().info(`Packaging multiplayer server save (${exportType === 'player' ? 'Player Locked' : 'Admin'})...`);
        const result = await window.api.savegames.exportServerSave({
          savePath: save.path,
          defaultName,
          accessLevel: exportType,
          serverName: serverName.trim(),
          serverModUrl: serverModUrl.trim()
        });
        if (result.success) {
          useToastStore.getState().success(`Multiplayer server save (${exportType.toUpperCase()}) exported to ${result.filePath}`);
          if (onExportComplete) onExportComplete();
          onClose();
        } else if (!result.canceled) {
          useToastStore.getState().error(result.error || 'Failed to export server save');
        }
      }
    } catch (err) {
      useToastStore.getState().error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal-content animate-zoom-in" style={{ width: 640, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
                <Share2 size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 800 }}>Export & Share Savegame</h2>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>Slot {save.index} • {save.farmName}</div>
              </div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Target Audience / Access Mode Selection */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Package Format & Access Rights
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Option 1: Player Version (Locked) */}
              <div 
                onClick={() => setExportType('player')}
                style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: 14, 
                  padding: '14px 16px', 
                  borderRadius: 10, 
                  border: exportType === 'player' ? '2px solid #06b6d4' : '1px solid var(--border)',
                  background: exportType === 'player' ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(6, 182, 212, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22d3ee', flexShrink: 0, marginTop: 2 }}>
                  <Lock size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>Multiplayer Server (Player Version - Locked)</span>
                    <span style={{ fontSize: 9, fontWeight: 900, background: 'rgba(6, 182, 212, 0.2)', color: '#22d3ee', padding: '2px 6px', borderRadius: 4 }}>RECOMMENDED FOR MEMBERS</span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Ideal for distributing to general server members. Savegame editor is set to View-Only mode so players cannot tamper with money, difficulty, or cheats, preserving fair multiplayer gameplay.
                  </p>
                </div>
              </div>

              {/* Option 2: Admin Version */}
              <div 
                onClick={() => setExportType('admin')}
                style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: 14, 
                  padding: '14px 16px', 
                  borderRadius: 10, 
                  border: exportType === 'admin' ? '2px solid #eab308' : '1px solid var(--border)',
                  background: exportType === 'admin' ? 'rgba(234, 179, 8, 0.08)' : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(234, 179, 8, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fde047', flexShrink: 0, marginTop: 2 }}>
                  <Crown size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>Multiplayer Server (Admin Version - Full Rights)</span>
                    <span style={{ fontSize: 9, fontWeight: 900, background: 'rgba(234, 179, 8, 0.2)', color: '#fde047', padding: '2px 6px', borderRadius: 4 }}>CO-HOSTS & ADMINS</span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Provides full Save Editor privileges and farm permissions management to trusted co-administrators or dedicated server managers.
                  </p>
                </div>
              </div>

              {/* Option 3: Standard Backup */}
              <div 
                onClick={() => setExportType('standard')}
                style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: 14, 
                  padding: '14px 16px', 
                  borderRadius: 10, 
                  border: exportType === 'standard' ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: exportType === 'standard' ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>
                  <Save size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>Standard Career Backup (Single Player)</span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Standard ZIP archive of your savegame folder without multiplayer server metadata tags.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Multiplayer Details (Only if Player or Admin package selected) */}
          {exportType !== 'standard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--bg-base)', padding: 16, borderRadius: 10, border: '1px solid var(--border)' }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                  Server Display Name
                </label>
                <input 
                  type="text"
                  value={serverName}
                  onChange={e => setServerName(e.target.value)}
                  placeholder="e.g. Dedicated Farm Server US-1"
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Server Mod Host Link (Optional)</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>Direct URL or cloud folder (Google Drive, Mega, Web host)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Globe size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input 
                    type="url"
                    value={serverModUrl}
                    onChange={e => setServerModUrl(e.target.value)}
                    placeholder="https://example.com/fs25-mods or drive link"
                    style={{ width: '100%', padding: '8px 12px 8px 32px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  If players have missing or out-of-date mod versions, the launcher will guard against joining and provide this direct link.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button className="btn btn--secondary" onClick={onClose} disabled={isExporting}>Cancel</button>
          <button 
            className="btn btn--primary" 
            onClick={handleExport}
            disabled={isExporting}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}
          >
            <Share2 size={16} />
            {isExporting ? 'Exporting Package...' : (exportType === 'standard' ? 'Export Standard ZIP' : `Export ${exportType === 'player' ? 'Player' : 'Admin'} Package`)}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Savegame Editor Modal Component
 */
function SavegameEditorModal({ save, onClose, onRefresh, onLaunch, onToggleMode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
    const [pendingLaunchSlot, setPendingLaunchSlot] = useState(null)
  const [launchExtraOptions, setLaunchExtraOptions] = useState({});
  const [conflictResolutionData, setConflictResolutionData] = useState(null);

  // Local audio state so labels update live as sliders are dragged
  const [audioVols, setAudioVols] = useState({
    masterVolume:      parseFloat(save.masterVolume      ?? 1.0),
    vehicleVolume:     parseFloat(save.vehicleVolume     ?? 1.0),
    environmentVolume: parseFloat(save.environmentVolume ?? 0.7),
    musicVolume:       parseFloat(save.musicVolume       ?? 0.0),
    radioVolume:       parseFloat(save.radioVolume       ?? 1.0),
    guiVolume:         parseFloat(save.guiVolume         ?? 0.0),
    voiceVolume:       parseFloat(save.voiceVolume       ?? 1.0),
  });

  // Local controls state so labels update live as sliders are dragged
  const [controlsSettings, setControlsSettings] = useState({
    steeringSensitivity: parseFloat(save.steeringSensitivity || 1.0),
    steeringBackSpeed: parseFloat(save.steeringBackSpeed ?? 7.0),
    vehicleArmSensitivity: parseFloat(save.vehicleArmSensitivity || 1.0),
    forceFeedback: parseFloat(save.forceFeedback ?? 0.5),
    cameraSensitivity: parseFloat(save.cameraSensitivity || 1.0),
  });


  const handleResolveConflicts = async (modsToDisableSet) => {
      const data = conflictResolutionData;
      if (!data) return;
      
      const safeMods = (data.mods || []).filter(m => {
          const name = typeof m === 'string' ? m : m.modName;
          return !modsToDisableSet.has(name.toLowerCase());
      });
      
      const result = window.api.savegames.setSavegameMods
          ? await window.api.savegames.setSavegameMods(data.savePath, safeMods.map(m => typeof m === 'string' ? { modName: m } : m))
          : await window.api.savegames.updateSavegameMods(data.savePath, safeMods.map(m => typeof m === 'string' ? { modName: m } : m));
          
      await import('../store/useToastStore').then(module => module.useToastStore.getState().success('Conflicts resolved successfully.'));
      await useSavegameStore.getState().fetchSavegames();
      
      setConflictResolutionData(null);
      
      if (data.action === 'launch' && pendingLaunchSlot) {
          const numericSlot = parseInt(pendingLaunchSlot, 10);
          useSavegameStore.setState({ isGameRunning: true, playingSlot: numericSlot, launchGraceUntil: Date.now() + 25000 });
          useSettingsStore.getState().setSavegameSlot(numericSlot);
          
          await window.api.game.launch({
              savegameIndex: pendingLaunchSlot,
              skipIntro: useSettingsStore.getState().skipIntro !== false,
              autoStart: true,
              ...launchExtraOptions
          });
          
          setPendingLaunchSlot(null);
          setLaunchExtraOptions({});
      }
  };
const [activeTab, setActiveTab] = useState('general');
  const [modSearchQuery, setModSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMods, setSelectedMods] = useState(new Set((save.mods || []).map(m => typeof m === 'string' ? m : m?.modName)));
  const activeModalConflicts = getActiveConflictsForSave(selectedMods, useLocalModsStore.getState().conflicts);
  const { mods: installedMods } = useLocalModsStore();
  const [expandedFolders, setExpandedFolders] = useState(new Set(['MAIN']));
  const [fleetCleanPct, setFleetCleanPct] = useState(100);
  const [fleetRepairPct, setFleetRepairPct] = useState(100);
  const [fleetPaintPct, setFleetPaintPct] = useState(100);
  const [usedMods, setUsedMods] = useState(new Set());
  const [showOnlyUsed, setShowOnlyUsed] = useState(false);
  const availableCategories = React.useMemo(() => {
        const cats = new Set();
        const modCache = useModHubStore.getState().modCache || {};
        const { favoriteMods } = useModHubStore.getState();
        
        const parseModCategory = (cat, isMap) => {
            if (isMap) return 'Maps';
            if (!cat) return null;
            let s = String(cat).toLowerCase();
            if (s.includes('map')) return 'Maps';
            if (s.includes('tractor') || s.includes('truck') || s.includes('car') || s.includes('bike') || s.includes('harvester') || s.includes('loader') || s.includes('telehandler') || s.includes('forklift') || s.includes('excavator') || s.includes('forwarder') || s.includes('drivable') || s.includes('vehicle')) return 'Vehicles';
            if (s.includes('trailer') || s.includes('cultivat') || s.includes('plow') || s.includes('seeder') || s.includes('planter') || s.includes('roller') || s.includes('spreader') || s.includes('sprayer') || s.includes('mower') || s.includes('tedder') || s.includes('windrower') || s.includes('header') || s.includes('tool') || s.includes('spader') || s.includes('subsoiler') || s.includes('harrow') || s.includes('weeder') || s.includes('mulcher') || s.includes('belt') || s.includes('leveler') || s.includes('compaction') || s.includes('winch') || s.includes('cutter') || s.includes('chainsaw') || s.includes('shovel') || s.includes('implement') || s.includes('yield') || s.includes('slurry') || s.includes('manure') || s.includes('forage')) return 'Implements';
            if (s.includes('placeable') || s.includes('shed') || s.includes('silo') || s.includes('production') || s.includes('farmhouse') || s.includes('animal') || s.includes('decoration')) return 'Placeables';
            if (s.includes('object') || s.includes('bale') || s.includes('pallet') || s.includes('bigbag') || s.includes('weight')) return 'Objects';
            if (s.includes('pack') || s.includes('package')) return 'Packs';
            if (s.includes('gameplay') || s.includes('script') || s.includes('prefab')) return 'Gameplay and Scripts';
            return 'Other';
        };

        let hasFavs = false;

        (installedMods || []).forEach(m => {
            let catStr = m.category;
            if (m.modId && modCache[m.modId]?.category) {
                catStr = modCache[m.modId].category;
            }
            const mainCat = parseModCategory(catStr, m.isMap);
            if (mainCat) cats.add(mainCat);

            const fnStr = typeof m.fileName === 'string' ? m.fileName : '';
            const mnStr = typeof m.modName === 'string' ? m.modName : '';
            const modBasename = fnStr ? fnStr.split(/[\\/\\]/).pop().toLowerCase() : (mnStr ? `${mnStr.toLowerCase()}.zip` : '');
            
            const isFav = (favoriteMods||[]).some(fm => {
                if (!fm) return false;
                const idMatch = fm.modId && m.modId && String(fm.modId) === String(m.modId);
                const fmStr = typeof fm.fileName === 'string' ? fm.fileName : '';
                return idMatch || (fmStr && fmStr.toLowerCase() === modBasename);
            });
            if (isFav) hasFavs = true;
        });

        const arr = Array.from(cats).sort();
        if (hasFavs) arr.unshift('Favourites');
        return arr;
    }, [installedMods]);

    const availableBrands = React.useMemo(() => {
      const brands = new Set();
      const modCache = useModHubStore.getState().modCache || {};
      const hardcoded = useModHubStore.getState().hardcodedBrands || [];
      (installedMods || []).forEach(m => {
          let b = null;
          if (m.modId && modCache[m.modId]?.brand) b = modCache[m.modId].brand;
          if (!b) {
              for (const hb of hardcoded) {
                  if (m.title && m.title.toLowerCase().includes(hb.toLowerCase())) {
                      b = hb;
                      break;
                  }
              }
          }
          if (b) brands.add(b);
      });
      return Array.from(brands).sort();
  }, [installedMods]);
  const [isDeselectingUnused, setIsDeselectingUnused] = useState(false);

  useEffect(() => {
    if (!window.api?.savegames?.getUsedMods || !save?.path) return;
    window.api.savegames.getUsedMods(save.path).then(res => {
      if (res && res.usedModNames) {
        setUsedMods(new Set(res.usedModNames.map(m => m.toLowerCase())));
      }
    }).catch(err => console.warn('[USED_MODS] Failed to fetch used mods:', err));
  }, [save?.path]);

  // Spawn & Persistence State
  const [isPersistenceActive, setIsPersistenceActive] = useState(false);
  const [playerPos, setPlayerPos] = useState(null);
  const [defaultPos, setDefaultPos] = useState(null);

  useEffect(() => {
    if (activeTab === 'spawn' && !defaultPos && window.api?.savegames?.getMapHomeCoordinates) {
      window.api.savegames.getMapHomeCoordinates(save.path)
        .then(res => { if (res) setDefaultPos(res); })
        .catch(e => console.error("Error fetching default coords", e));
    }
  }, [activeTab, save.path, defaultPos]);

  const [selectedSpawnMode, setSelectedSpawnMode] = useState(() => {
    try {
      const saved = localStorage.getItem(`selected_spawn_${save.path}`);
      if (saved) return JSON.parse(saved).mode || null;
    } catch(e) {}
    return null;
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState(() => {
    try {
      const saved = localStorage.getItem(`selected_spawn_${save.path}`);
      if (saved) return JSON.parse(saved).vehicleUniqueId || null;
    } catch(e) {}
    return null;
  });
  const [isVehicleListOpen, setIsVehicleListOpen] = useState(false);
  const [searchFleetQuery, setSearchFleetQuery] = useState('');
  const [fleet, setFleet] = useState([]);
  const [hasStoreDeliveries, setHasStoreDeliveries] = useState(null); // null = optimistically true to prevent flashing
  const [customSpawnInfo, setCustomSpawnInfo] = useState({ x: 0, y: 0, z: 0, type: 'Home' });

  useEffect(() => {
    if (!window.api?.savegames) return;
    
    // Check Persistence
    let hasDeliveries = (save.mods || []).some(m => m === 'FS25_storeDeliveries' || m?.modName === 'FS25_storeDeliveries');
    setIsPersistenceActive(hasDeliveries);

    // Auto-enable persistence if not already active and hasn't been manually disabled by the user
    const disableKey = `persistence_disabled_${save.path}`;
    if (!hasDeliveries && localStorage.getItem(disableKey) !== 'true') {
      window.api.savegames.updateNativeEnhancement({ savePath: save.path, includeBridge: true, includeDeliveries: true }).then(res => {
        if (res.success) {
          setIsPersistenceActive(true);
          if (onRefresh) onRefresh();
        }
      });
    }

    // Fetch Player Position, Fleet & Mod Status if on spawn tab
    if (activeTab === 'spawn') {
      window.api.savegames.getPlayerPosition(save.path).then(pos => {
        setPlayerPos(pos);
        if (pos) {
          const savedRaw = localStorage.getItem(`selected_spawn_${save.path}`);
          if (!savedRaw && pos.vehicleUniqueId) {
            setSelectedSpawnMode('vehicle');
            setSelectedVehicleId(pos.vehicleUniqueId);
          }
        }
      });
      const getMapModName = (mapId) => {
        if (mapId && mapId.includes('.')) {
          return mapId.split('.')[0];
        }
        return null;
      };
      const mapModName = getMapModName(save.mapId);
      window.api.savegames.getFleetPositions(save.path, mapModName).then(res => {
        const fleetList = Array.isArray(res) ? res : (res?.items || []);
        setFleet(fleetList);
        const savedRaw = localStorage.getItem(`selected_spawn_${save.path}`);
        if (savedRaw) {
          try {
            const parsed = JSON.parse(savedRaw);
            if (parsed.mode) setSelectedSpawnMode(parsed.mode);
            if (parsed.vehicleUniqueId) setSelectedVehicleId(parsed.vehicleUniqueId);
          } catch(e) {}
        }
      });
      if (window.api.savegames.checkStoreDeliveries) {
        window.api.savegames.checkStoreDeliveries().then(setHasStoreDeliveries);
      }
      if (window.api.savegames.getStoreDeliveryCoordinates) {
        window.api.savegames.getStoreDeliveryCoordinates(save.path).then(res => {
          if (res) setCustomSpawnInfo(res);
        });
      }
    }
  }, [activeTab, save.path, save.mods]);

  // Farm Permissions State
  const [farmData, setFarmData] = useState(null);
  const [loadingFarm, setLoadingFarm] = useState(false);
  const [savingFarm, setSavingFarm] = useState(false);

  useEffect(() => {
    if (activeTab === 'multiplayer' && window.api?.savegames?.getFarmPermissions && save?.path) {
      setLoadingFarm(true);
      window.api.savegames.getFarmPermissions(save.path).then(res => {
        setLoadingFarm(false);
        if (res && res.success) {
          setFarmData(res);
        }
      }).catch(err => {
        setLoadingFarm(false);
        console.error('[FARMS] Error loading farm permissions:', err);
      });
    }
  }, [activeTab, save?.path]);

  const handleSaveFarmPermissions = async () => {
    if (save.isEditorLocked) {
      useToastStore.getState().error('Save editing is locked by the server host.');
      return;
    }
    if (!farmData?.permissions || !window.api?.savegames?.updateFarmPermissions) return;
    setSavingFarm(true);
    try {
      const res = await window.api.savegames.updateFarmPermissions({
        savePath: save.path,
        permissions: farmData.permissions
      });
      if (res && res.success) {
        useToastStore.getState().success('In-game farm permissions updated successfully!');
      } else {
        useToastStore.getState().error(res?.error || 'Failed to update farm permissions');
      }
    } catch (err) {
      useToastStore.getState().error(err.message);
    } finally {
      setSavingFarm(false);
    }
  };

  const handleUpdate = async (fileType, attribute, value) => {
    if (save.isEditorLocked) {
      useToastStore.getState().error('Save editing is locked by the server host (Player Version).');
      return;
    }
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

    // Apply conflict resolution if toggling ON
    const { conflictSensitivity } = useSettingsStore.getState();
    if (conflictSensitivity !== 'off' && nextSelected.has(modName)) {
        const allConflicts = useLocalModsStore.getState().conflicts;
        const activeConflictsMap = getActiveConflictsForSave(nextSelected, allConflicts);
        if (activeConflictsMap.has(modName.toLowerCase())) {
            if (conflictSensitivity === 'auto-disable_REMOVED') {
                const conflictDataArr = activeConflictsMap.get(modName.toLowerCase());
                conflictDataArr.forEach(c => {
                    c.activeConflictingMods.forEach(otherModName => {
                        nextSelected.delete(otherModName);
                    });
                });
                import('../store/useToastStore').then(m => m.useToastStore.getState().info('Auto-disabled conflicting mods to maintain stability.'));
            } else if (conflictSensitivity === 'warn' || conflictSensitivity === 'resolve') {
                import('../store/useToastStore').then(m => m.useToastStore.getState().warning('Warning: The selected mod conflicts with other active mods.'));
            }
        }
    }

    setSelectedMods(nextSelected);
    
    // Auto-save the mod list change surgically
    if (!window.api?.savegames) return;
    const modsToApply = installedMods.filter(m => nextSelected.has(m.modName));
    const result = window.api.savegames.setSavegameMods
      ? await window.api.savegames.setSavegameMods(save.path, modsToApply)
      : await window.api.savegames.setMods({ savegamePath: save.path, mods: modsToApply });
    if (!result?.success) {
      useToastStore.getState().error(`Failed to update mod list: ${result?.error || 'Unknown error'}`);
    }
  };

  const groupedMods = React.useMemo(() => {
    const groups = {};
    const modCache = useModHubStore.getState().modCache || {};
    installedMods.forEach(mod => {
      if (mod.isMap) return;
      
      let catStr = mod.category;
      if (mod.modId && modCache[mod.modId]?.category) catStr = modCache[mod.modId].category;
      
      // Filter out prefabs
      if ((catStr && catStr.toLowerCase().includes('prefab')) || (mod.title && mod.title.toLowerCase().includes('prefab')) || (mod.modName && mod.modName.toLowerCase().includes('prefab'))) return;

      const folderName = mod.folder || 'MAIN';
      if (!groups[folderName]) groups[folderName] = [];
      groups[folderName].push(mod);
    });
    return groups;
  }, [installedMods]);

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal animate-zoom-in" style={{ width: '98vw', maxWidth: 1800, height: '98vh', maxHeight: '98vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
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
          <button className={`tab-btn ${activeTab === 'general' ? 'tab-btn--active' : ''}`} title="Basic savegame settings and economy." onClick={() => setActiveTab('general')}>
            <Globe size={14} /> General
          </button>
          <button className={`tab-btn ${activeTab === 'realism' ? 'tab-btn--active' : ''}`} title="Simulation realism and environment options." onClick={() => setActiveTab('realism')}>
            <Info size={14} /> Realism & Units
          </button>
          <button className={`tab-btn ${activeTab === 'controls' ? 'tab-btn--active' : ''}`} title="Player and camera controls." onClick={() => setActiveTab('controls')}>
            <Gamepad2 size={14} /> Controls
          </button>
          <button className={`tab-btn ${activeTab === 'spawn' ? 'tab-btn--active' : ''}`} title="Choose spawn location." onClick={() => setActiveTab('spawn')}>
            <MapPin size={14} /> Spawn & Persistence
          </button>
          <button className={`tab-btn ${activeTab === 'mods' ? 'tab-btn--active' : ''}`} title="Choose exactly which mods are active for this save." onClick={() => setActiveTab('mods')}>
            <Package size={14} /> Selective Mods
          </button>
          <button className={`tab-btn ${activeTab === 'multiplayer' ? 'tab-btn--active' : ''}`} title="In-game farm permissions and server rights." onClick={() => setActiveTab('multiplayer')}>
            <Users size={14} /> Farm Permissions
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          
          {save.isEditorLocked && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 14, 
              padding: '14px 20px', 
              background: 'rgba(6, 182, 212, 0.12)', 
              border: '1px solid #06b6d4', 
              borderRadius: 12, 
              color: 'var(--text-primary)' 
            }}>
              <Lock size={22} style={{ color: '#06b6d4', flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
                <strong style={{ color: '#22d3ee' }}>Server Locked (Player Version):</strong> This savegame was configured and locked by the server host. Savegame editing (money, realism, vehicles, parameters) is set to View-Only mode to preserve server integrity and fairness.
              </div>
            </div>
          )}
          
          {activeTab === 'general' && (
            <div className="settings-tab-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              {/* Save Mode Selector Panel */}
              <div className="settings-panel" style={{ background: save.isServerSave ? 'rgba(6, 182, 212, 0.05)' : 'rgba(var(--accent-rgb), 0.05)', border: `1px solid ${save.isServerSave ? '#06b6d4' : 'var(--border)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {save.isServerSave ? <Globe size={18} style={{ color: '#06b6d4' }} /> : <User size={18} className="text-accent" />}
                      {save.isServerSave ? 'Multiplayer Server Mode' : 'Single Player Career Mode'}
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {save.isServerSave 
                        ? 'Tagged as a Multiplayer Server save. Launches to MP menu with dedicated server mods active.' 
                        : 'Standard Single Player save. Auto-starts directly into your career map with full Save Editor privileges.'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={`btn btn--sm ${!save.isServerSave ? 'btn--primary' : 'btn--ghost'}`}
                      onClick={() => onToggleMode && onToggleMode(save, false)}
                      style={{ fontWeight: 700 }}
                    >
                      <User size={14} /> Single Player Mode
                    </button>
                    <button
                      className={`btn btn--sm ${save.isServerSave ? 'btn--primary' : 'btn--ghost'}`}
                      onClick={() => onToggleMode && onToggleMode(save, true)}
                      style={{ fontWeight: 700, background: save.isServerSave ? '#06b6d4' : undefined, borderColor: save.isServerSave ? '#0891b2' : undefined }}
                    >
                      <Globe size={14} /> Multiplayer Server Mode
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-panel">
                <h3 className="section-title"><MapIcon size={16} /> Base Information</h3>
                <div className="settings-grid">
                  <div className="setting" style={{ gridColumn: 'span 2' }}>
                    <label title="The name of your farm as it appears in multiplayer and menus.">Savegame Name (Farm Name)</label>
                    <div className="input-with-icon">
                      <Edit3 size={14} />
                      <input type="text" defaultValue={save.farmName} onBlur={(e) => handleUpdate('career', 'savegameName', e.target.value)} />
                    </div>
                  </div>
                  <div className="setting">
                    <label title="The main character name in this savegame.">Player Name</label>
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
                      <label title="The map loaded for this savegame. Note: Changing this requires replacing your map files.">Map</label>
                      <div className="input-with-icon">
                        <MapPin size={14} />
                        <input type="text" value={getLocalizedString(save.mapTitle, 'Unknown Map')} disabled style={{ opacity: 0.6 }} />
                      </div>
                  </div>
                  <div className="setting">
                    <label title="The current bank loan amount.">Loan</label>
                    <div className="input-with-icon">
                      <Coins size={14} />
                      <input type="number" defaultValue={save.initialLoan || 0} onBlur={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          handleUpdate('farms', 'loan', val);
                      }} />
                    </div>
                  </div>
                  <div className="setting">
                    <label title="The current bank balance.">Money</label>
                    <div className="input-with-icon">
                      <Coins size={14} />
                      <input type="number" defaultValue={Math.floor(save.money)} onBlur={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          handleUpdate('farms', 'money', val);
                      }} />
                    </div>
                  </div>
                  <div className="setting">
                      <label title="Affects crop selling prices and contract payouts.">Economic Difficulty</label>
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
                    <label title="How frequently the game automatically saves.">Auto-Save Interval</label>
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
                       <CustomSlider 
                          min="0" max="100" value={fleetCleanPct} 
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
                        title="Apply the selected setting or spawn item.">Apply</button>
                    </div>

                   {/* Repair Fleet */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px 64px', alignItems: 'center', gap: 12 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Wrench size={14} className="text-accent" />
                          <span style={{ fontSize: 12, fontWeight: 700 }}>REPAIR FLEET</span>
                       </div>
                       <CustomSlider 
                          min="0" max="100" value={fleetRepairPct} 
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
                        title="Apply the selected setting or spawn item.">Apply</button>
                    </div>

                   {/* Paint Repair */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px 64px', alignItems: 'center', gap: 12 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Paintbrush size={14} className="text-accent" />
                          <span style={{ fontSize: 12, fontWeight: 700 }}>PAINT REPAIR</span>
                       </div>
                       <CustomSlider 
                          min="0" max="100" value={fleetPaintPct} 
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
                        title="Apply the selected setting or spawn item.">Apply</button>
                    </div>
                </div>

                <div className="settings-panel">
                  <h3 className="section-title"><Clock size={16} /> Environment & Time</h3>
                  <div className="settings-grid">
                    <div className="setting">
                      <label title="The speed at which in-game time passes.">TIME SCALE (X)</label>
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
                      <label title="Current time of day in the savegame.">TIME OF DAY</label>
                      <div className="input-with-icon">
                        <Clock size={14} />
                        <input 
                          type="time" 
                          defaultValue={save.formattedTime || "08:00"} 
                          style={{ minWidth: 100 }}
                          onBlur={(e) => handleUpdate('environment', 'dayTime', e.target.value)} 
                        />
                      </div>
                    </div>
                    <div className="setting">
                      <label title="Current month/season in the savegame.">MONTH / SEASON</label>
                      <div className="input-with-icon">
                        <Calendar size={14} />
                        <select defaultValue={save.currentPeriod || 6} onChange={(e) => handleUpdate('environment', 'currentPeriod', e.target.value)}>
                          <option value="1">March (Spring)</option>
                          <option value="2">April (Spring)</option>
                          <option value="3">May (Spring)</option>
                          <option value="4">June (Summer)</option>
                          <option value="5">July (Summer)</option>
                          <option value="6">August (Summer - Default)</option>
                          <option value="7">September (Autumn)</option>
                          <option value="8">October (Autumn)</option>
                          <option value="9">November (Autumn)</option>
                          <option value="10">December (Winter)</option>
                          <option value="11">January (Winter)</option>
                          <option value="12">February (Winter)</option>
                        </select>
                      </div>
                    </div>
                    <div className="setting">
                      <label title="How many in-game days are in a month.">DAYS PER MONTH</label>
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
                    <div className="setting">
                      <label title="Weather currently playing out in the savegame.">CURRENT WEATHER</label>
                      <div className="input-with-icon">
                        <Cloud size={14} />
                        <select defaultValue={save.weather || 'SUN'} onChange={(e) => handleUpdate('environment', 'weather', e.target.value)}>
                          <option value="SUN">Clear / Sunny</option>
                          <option value="CLOUDY">Cloudy / Overcast</option>
                          <option value="RAIN">Rain</option>
                        </select>
                      </div>
                    </div>
                   </div>
                 </div>
              <div className="settings-panel">
                <h3 className="section-title"><Volume2 size={16} /> Audio &amp; Sound</h3>
                <div className="settings-grid">
                  <label className="checkbox-setting" title="Enables the in-game radio.">
                    <input type="checkbox" defaultChecked={save.isRadioEnabled !== false} onChange={e => handleUpdate('career', 'isRadioEnabled', e.target.checked)} />
                    <span>Radio Enabled</span>
                  </label>
                  <label className="checkbox-setting" title="Plays radio only when driving vehicles.">
                    <input type="checkbox" defaultChecked={save.radioVehicleOnly} onChange={e => handleUpdate('career', 'radioVehicleOnly', e.target.checked)} />
                    <span>Radio in Vehicles Only</span>
                  </label>
                  <div className="setting">
                    <label title="Overall volume level for the game. Stored in game.xml">Master Volume ({Math.round(audioVols.masterVolume * 100)}%)</label>
                    <CustomSlider min="0" max="1" step="0.05" value={audioVols.masterVolume}
                      onChange={e => setAudioVols(v => ({ ...v, masterVolume: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('audio', 'masterVolume', e.target.value)} />
                  </div>
                  <div className="setting">
                    <label title="Vehicle engine and working sounds.">Vehicle Volume ({Math.round(audioVols.vehicleVolume * 100)}%)</label>
                    <CustomSlider min="0" max="1" step="0.05" value={audioVols.vehicleVolume}
                      onChange={e => setAudioVols(v => ({ ...v, vehicleVolume: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('audio', 'vehicleVolume', e.target.value)} />
                  </div>
                  <div className="setting">
                    <label title="Ambient environment and weather sounds.">Environment Volume ({Math.round(audioVols.environmentVolume * 100)}%)</label>
                    <CustomSlider min="0" max="1" step="0.05" value={audioVols.environmentVolume}
                      onChange={e => setAudioVols(v => ({ ...v, environmentVolume: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('audio', 'environmentVolume', e.target.value)} />
                  </div>
                  <div className="setting">
                    <label title="Radio station broadcast volume.">Radio Volume ({Math.round(audioVols.radioVolume * 100)}%)</label>
                    <CustomSlider min="0" max="1" step="0.05" value={audioVols.radioVolume}
                      onChange={e => setAudioVols(v => ({ ...v, radioVolume: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('audio', 'radioVolume', e.target.value)} />
                  </div>
                  <div className="setting">
                    <label title="In-game background music volume.">Music Volume ({Math.round(audioVols.musicVolume * 100)}%)</label>
                    <CustomSlider min="0" max="1" step="0.05" value={audioVols.musicVolume}
                      onChange={e => setAudioVols(v => ({ ...v, musicVolume: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('audio', 'musicVolume', e.target.value)} />
                  </div>
                  <div className="setting">
                    <label title="Menu clicks and UI audio volume.">GUI Volume ({Math.round(audioVols.guiVolume * 100)}%)</label>
                    <CustomSlider min="0" max="1" step="0.05" value={audioVols.guiVolume}
                      onChange={e => setAudioVols(v => ({ ...v, guiVolume: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('audio', 'guiVolume', e.target.value)} />
                  </div>
                  <div className="setting">
                    <label title="Multiplayer voice chat volume.">Voice Volume ({Math.round(audioVols.voiceVolume * 100)}%)</label>
                    <CustomSlider min="0" max="1" step="0.05" value={audioVols.voiceVolume}
                      onChange={e => setAudioVols(v => ({ ...v, voiceVolume: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('audio', 'voiceVolume', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="settings-panel">
                <h3 className="section-title"><Video size={16} /> Camera & Visuals</h3>
                <div className="settings-grid">
                  <div className="setting">
                    <label title="Mouse and controller look sensitivity.">Camera Sensitivity ({Math.round(controlsSettings.cameraSensitivity * 100)}%)</label>
                    <CustomSlider 
                      min="0.5" 
                      max="2.0" 
                      step="0.1" 
                      value={controlsSettings.cameraSensitivity} 
                      onChange={e => setControlsSettings(s => ({ ...s, cameraSensitivity: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('career', 'cameraSensitivity', e.target.value)} 
                    />
                  </div>
                  <label className="checkbox-setting" title="Camera snaps back to center when you enter."><input type="checkbox" defaultChecked={save.resetVehicleCamera} onChange={e => handleUpdate('career', 'resetVehicleCamera', e.target.checked)} /><span>Reset Vehicle Camera</span></label>
                  <label className="checkbox-setting" title="Camera bounces with the vehicle seat."><input type="checkbox" defaultChecked={save.indoorCameraSuspension} onChange={e => handleUpdate('career', 'indoorCameraSuspension', e.target.checked)} /><span>Indoor Camera Suspension</span></label>
                  <label className="checkbox-setting" title="Camera FOV adjusts based on speed."><input type="checkbox" defaultChecked={save.dynamicVehicleCamera} onChange={e => handleUpdate('career', 'dynamicVehicleCamera', e.target.checked)} /><span>Dynamic Vehicle Camera</span></label>
                  <label className="checkbox-setting" title="Inverts mouse Y axis."><input type="checkbox" defaultChecked={save.invertYLook} onChange={e => handleUpdate('career', 'invertYLook', e.target.checked)} /><span>Invert Y-Look</span></label>
                  <label className="checkbox-setting" title="Shows tutorial popups during gameplay."><input type="checkbox" defaultChecked={save.showHints !== false} onChange={e => handleUpdate('career', 'showHints', e.target.checked)} /><span>Show Gameplay Hints</span></label>
                  <label className="checkbox-setting" title="Shows interactive icons at triggers."><input type="checkbox" defaultChecked={save.showHelpIcons !== false} onChange={e => handleUpdate('career', 'showHelpIcons', e.target.checked)} /><span>Show Help Icons</span></label>
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
                    <label className="checkbox-setting" title="Turns AI cars on the road on or off."><input type="checkbox" defaultChecked={save.trafficEnabled !== false} onChange={e => handleUpdate('career', 'trafficEnabled', e.target.checked)} /><span>Traffic Enabled</span></label>
                    <label className="checkbox-setting" title="Vehicles destroy crops when driving over them."><input type="checkbox" defaultChecked={save.fruitDestruction !== false} onChange={e => handleUpdate('career', 'fruitDestruction', e.target.checked)} /><span>Crop Destruction</span></label>
                    <label className="checkbox-setting" title="Tornados and hail destroy crops."><input type="checkbox" defaultChecked={save.disasterDestructionState !== 'DISABLED'} onChange={e => handleUpdate('career', 'disasterDestructionState', e.target.checked ? 'ENABLED' : 'DISABLED')} /><span>Disaster Destruction</span></label>
                    <label className="checkbox-setting" title="Fields require plowing after certain crops."><input type="checkbox" defaultChecked={save.plowingRequiredEnabled} onChange={e => handleUpdate('career', 'plowingRequiredEnabled', e.target.checked)} /><span>Periodic Plowing</span></label>
                    <label className="checkbox-setting" title="Fields need lime to maintain maximum yield."><input type="checkbox" defaultChecked={save.limeRequired !== false} onChange={e => handleUpdate('career', 'limeRequired', e.target.checked)} /><span>Lime Required</span></label>
                    <label className="checkbox-setting" title="Stones will surface during cultivation."><input type="checkbox" defaultChecked={save.stonesEnabled !== false} onChange={e => handleUpdate('career', 'stonesEnabled', e.target.checked)} /><span>Field Stones</span></label>
                    <label className="checkbox-setting" title="Weeds will grow and reduce crop yield."><input type="checkbox" defaultChecked={save.weedsEnabled !== false} onChange={e => handleUpdate('career', 'weedsEnabled', e.target.checked)} /><span>Weeds Enabled</span></label>

                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <label className="checkbox-setting" title="Snow accumulates during winter."><input type="checkbox" defaultChecked={save.isSnowEnabled !== false} onChange={e => handleUpdate('career', 'isSnowEnabled', e.target.checked)} /><span>Snow Enabled</span></label>
                    <label className="checkbox-setting" title="Pushing reverse once stops the tractor, twice reverses."><input type="checkbox" defaultChecked={save.stopAndGoBraking !== false} onChange={e => handleUpdate('career', 'stopAndGoBraking', e.target.checked)} /><span>Stop & Go Braking</span></label>
                    <label className="checkbox-setting" title="Trailers respect their weight capacity limits."><input type="checkbox" defaultChecked={save.trailerFillLimit} onChange={e => handleUpdate('career', 'trailerFillLimit', e.target.checked)} /><span>Trailer Fill Limit</span></label>
                    <label className="checkbox-setting" title="Vehicles start automatically when you enter."><input type="checkbox" defaultChecked={save.automaticMotorStartEnabled !== false} onChange={e => handleUpdate('career', 'automaticMotorStartEnabled', e.target.checked)} /><span>Auto Motor Start</span></label>
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
                    <label title="How quickly vehicles consume fuel.">Fuel Usage</label>
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
                    <label title="Whether helpers automatically buy fuel when empty.">Buy Fuel</label>
                    <select defaultValue={save.helperBuyFuel !== false ? 'true' : 'false'} onChange={e => handleUpdate('career', 'helperBuyFuel', e.target.value)}>
                      <option value="true">Buy</option>
                      <option value="false">Off</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label title="Whether helpers automatically buy seeds when empty.">Buy Seeds</label>
                    <select defaultValue={save.helperBuySeeds !== false ? 'true' : 'false'} onChange={e => handleUpdate('career', 'helperBuySeeds', e.target.value)}>
                      <option value="true">Buy</option>
                      <option value="false">Off</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label title="Whether helpers automatically buy fertilizer when empty.">Buy Fertilizer</label>
                    <select defaultValue={save.helperBuyFertilizer !== false ? 'true' : 'false'} onChange={e => handleUpdate('career', 'helperBuyFertilizer', e.target.value)}>
                      <option value="true">Buy</option>
                      <option value="false">Off</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label title="Where AI workers get slurry from.">Slurry Source</label>
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
                    <label title="How fast vehicles get dirty.">Dirt Interval</label>
                    <select defaultValue={save.dirtInterval || 3} onChange={e => handleUpdate('career', 'dirtInterval', e.target.value)}>
                      <option value="1">Slow</option>
                      <option value="3">Normal</option>
                      <option value="4">Fast</option>
                      <option value="0">Off</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label title="Currency displayed in-game.">Money Unit</label>
                    <select defaultValue={save.moneyUnit || 0} onChange={e => handleUpdate('career', 'moneyUnit', e.target.value)}>
                      <option value="0">Euro (€)</option>
                      <option value="1">Dollar ($)</option>
                      <option value="2">Pound (£)</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label title="Unit used for distances and capacities.">Measuring Unit</label>
                    <select defaultValue={save.useMetric ? 'true' : 'false'} onChange={e => handleUpdate('career', 'useMetric', e.target.value)}>
                      <option value="true">Metric (m/km)</option>
                      <option value="false">Imperial (ft/mi)</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label title="Unit for temperature (Celsius/Fahrenheit).">Temperature</label>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: 'var(--fs-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sliders size={16} className="text-accent" /> Keybindings & Controller Mappings
                    </h4>
                    <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                      Manage device keys, detect conflict overlaps, and create backup snapshot profiles.
                    </p>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn--secondary btn--sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => {
                      if (onClose) onClose();
                      navigate('/keybinds');
                    }}
                  >
                    Open Keybinds Manager &rarr;
                  </button>
                </div>
              </div>

              <div className="settings-panel">
                <h3 className="section-title"><Gamepad2 size={16} /> Input Controls</h3>
                <div className="settings-grid">
                  <div className="setting">
                    <label title="Keyboard or Controller hints displayed.">Input Help Mode</label>
                    <select defaultValue={save.inputHelpMode || 0} onChange={e => handleUpdate('career', 'inputHelpMode', e.target.value)}>
                      <option value="0">Auto</option>
                      <option value="1">Keyboard</option>
                      <option value="2">Gamepad</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label title="Manual or automatic transmission mode.">Gear Shift Mode</label>
                    <select defaultValue={save.gearShiftMode || 0} onChange={e => handleUpdate('career', 'gearShiftMode', e.target.value)}>
                      <option value="0">Automatic</option>
                      <option value="1">Manual with Clutch</option>
                      <option value="2">Manual</option>
                    </select>
                  </div>
                  <div className="setting">
                    <label title="How sensitive vehicle steering is.">Steering Sensitivity ({Math.round(controlsSettings.steeringSensitivity * 100)}%)</label>
                    <CustomSlider 
                      min="0.5" 
                      max="2.0" 
                      step="0.05" 
                      value={controlsSettings.steeringSensitivity} 
                      onChange={e => setControlsSettings(s => ({ ...s, steeringSensitivity: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('career', 'steeringSensitivity', e.target.value)} 
                    />
                  </div>
                  <div className="setting">
                    <label title="How fast the steering wheel centers after turning.">Steering Return Speed ({controlsSettings.steeringBackSpeed.toFixed(1)})</label>
                    <CustomSlider 
                      min="1.0" 
                      max="15.0" 
                      step="0.5" 
                      value={controlsSettings.steeringBackSpeed} 
                      onChange={e => setControlsSettings(s => ({ ...s, steeringBackSpeed: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('career', 'steeringBackSpeed', e.target.value)} 
                    />
                  </div>
                  <div className="setting">
                    <label title="Sensitivity when operating cranes, loaders, and excavator arms.">Vehicle Arm Sensitivity ({Math.round(controlsSettings.vehicleArmSensitivity * 100)}%)</label>
                    <CustomSlider 
                      min="0.5" 
                      max="2.0" 
                      step="0.05" 
                      value={controlsSettings.vehicleArmSensitivity} 
                      onChange={e => setControlsSettings(s => ({ ...s, vehicleArmSensitivity: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('career', 'vehicleArmSensitivity', e.target.value)} 
                    />
                  </div>
                  <div className="setting">
                    <label title="Force feedback strength on wheels and controllers.">Force Feedback ({Math.round(controlsSettings.forceFeedback * 100)}%)</label>
                    <CustomSlider 
                      min="0" 
                      max="1" 
                      step="0.05" 
                      value={controlsSettings.forceFeedback} 
                      onChange={e => setControlsSettings(s => ({ ...s, forceFeedback: parseFloat(e.target.value) }))}
                      onBlur={e => handleUpdate('career', 'forceFeedback', e.target.value)} 
                    />
                  </div>
                  <label className="checkbox-setting" title="Shows GPS guidance and steering assist lines on the field.">
                    <input type="checkbox" defaultChecked={save.steeringAssistLines !== false} onChange={e => handleUpdate('career', 'steeringAssistLines', e.target.checked)} />
                    <span>Steering Assist Lines</span>
                  </label>
                  <label className="checkbox-setting" title="Automatically engages cruise control with steering assist.">
                    <input type="checkbox" defaultChecked={save.steeringAssistCruiseControl} onChange={e => handleUpdate('career', 'steeringAssistCruiseControl', e.target.checked)} />
                    <span>Steering Assist Cruise Control</span>
                  </label>
                  <label className="checkbox-setting" title="Simplified crane and front loader arm control scheme.">
                    <input type="checkbox" defaultChecked={save.easyArmControl !== false} onChange={e => handleUpdate('career', 'easyArmControl', e.target.checked)} />
                    <span>Easy Arm Control</span>
                  </label>
                </div>
              </div>
            </div>
          )}


          {activeTab === 'spawn' && (
            <div className="settings-tab-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              
              {/* Manager-Managed Persistence Panel */}
              <div style={{ 
                background: isPersistenceActive ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-tertiary)', 
                border: `1px solid ${isPersistenceActive ? 'var(--accent)' : 'var(--border)'}`, 
                borderRadius: 8, 
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ 
                    width: 40, height: 40, borderRadius: 8, 
                    background: isPersistenceActive ? 'var(--accent)' : 'var(--bg-secondary)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    color: isPersistenceActive ? 'var(--bg-base)' : 'var(--text-tertiary)' 
                  }}>
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Manager-Managed Persistence</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Enable this to have the manager automatically ensure you spawn exactly where you left off.</p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {isPersistenceActive && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
                      <Check size={14} /> NATIVE ENHANCEMENT ACTIVE
                    </div>
                  )}
                  <button 
                    className={`btn btn--sm ${isPersistenceActive ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ border: isPersistenceActive ? 'none' : '1px solid var(--border)' }}
                    onClick={async () => {
                      if (!window.api?.savegames) return;
                      const newState = !isPersistenceActive;
                      const res = await window.api.savegames.updateNativeEnhancement({ savePath: save.path, includeBridge: newState, includeDeliveries: newState });
                      if (res.success) {
                        setIsPersistenceActive(newState);
                        if (!newState) {
                          localStorage.setItem(`persistence_disabled_${save.path}`, 'true');
                        } else {
                          localStorage.removeItem(`persistence_disabled_${save.path}`);
                        }
                        useToastStore.getState().success(newState ? "Persistence Activated" : "Persistence Deactivated");
                      } else {
                        useToastStore.getState().error("Failed: " + res.error);
                      }
                    }}
                  >
                    {isPersistenceActive ? 'DISABLE' : 'ENABLE'}
                  </button>
                </div>
              </div>

              {/* Player Teleportation */}
              <div className="settings-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <MapPin size={16} className="text-accent" />
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }} title="Move your character to specific coordinates.">PLAYER TELEPORTATION</div>
                </div>
                
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }} title="Your current coordinates in this save.">Current Saved Position</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {playerPos ? `${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}, ${playerPos.z.toFixed(1)}` : (isPersistenceActive && defaultPos ? `Default Starting Point (${defaultPos.x.toFixed(1)}, ${defaultPos.y.toFixed(1)}, ${defaultPos.z.toFixed(1)})` : 'Unknown or Not Saved')}
                  </div>
                </div>
              </div>

              {/* Quick Teleport Presets */}
              <div className="settings-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: (isVehicleListOpen || selectedSpawnMode === 'vehicle') ? 1 : 'none', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <MapIcon size={16} className="text-accent" />
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-primary)' }} title="Jump to common map locations.">QUICK TELEPORT PRESETS</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: (isVehicleListOpen || selectedSpawnMode === 'vehicle') ? 16 : 0 }}>
                  
                  {/* Preset 1: Custom Spawn Point */}
                  <div 
                    onClick={async () => {
                      // Toggle off if already selected
                      if (selectedSpawnMode === 'custom') {
                        setSelectedSpawnMode(null);
                        setSelectedVehicleId(null);
                        localStorage.removeItem(`selected_spawn_${save.path}`);
                        await window.api.savegames.resetPlayerSpawn(save.path);
                        useToastStore.getState().info('Spawn preset cleared — game will use default spawn.');
                        window.api.savegames.getPlayerPosition(save.path).then(setPlayerPos);
                        return;
                      }
                      setSelectedSpawnMode('custom');
                      setSelectedVehicleId(null);
                      localStorage.setItem(`selected_spawn_${save.path}`, JSON.stringify({ mode: 'custom' }));
                      if (hasStoreDeliveries === false) {
                        useToastStore.getState().info('Install the Store Deliveries mod to use this spawn point.');
                        return;
                      }
                      const res = await window.api?.savegames?.getStoreDeliveryCoordinates(save.path);
                      if (res) {
                        const setRes = await window.api.savegames.setPlayerPosition({ savePath: save.path, x: res.x, y: res.y, z: res.z });
                        if (setRes && setRes.success) {
                          useToastStore.getState().success(res.type === 'Custom' ? 'Custom spawn point applied!' : 'Spawning at home location. Set a delivery point in-game to customise.');
                          window.api.savegames.getPlayerPosition(save.path).then(setPlayerPos);
                        } else {
                          useToastStore.getState().error('Failed to set spawn: ' + (setRes?.error || 'Unknown error'));
                        }
                      } else {
                        useToastStore.getState().info('Custom spawn selected. Set your delivery point in-game using Store Deliveries, then come back to apply it.');
                      }
                    }}
                    style={{ 
                      padding: '16px', 
                      background: selectedSpawnMode === 'custom' ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg-base)', 
                      border: selectedSpawnMode === 'custom' ? '2px solid var(--accent)' : '1px solid var(--border)', 
                      borderRadius: 8, 
                      cursor: 'pointer', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      transition: 'all 0.2s', 
                      opacity: hasStoreDeliveries !== false ? 1 : 0.85,
                      boxShadow: selectedSpawnMode === 'custom' ? '0 0 12px rgba(var(--accent-rgb), 0.2)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Pin size={16} style={{ color: selectedSpawnMode === 'custom' ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                      {selectedSpawnMode === 'custom' && (
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(var(--accent-rgb), 0.15)', padding: '2px 8px', borderRadius: 100 }}>
                          <Check size={12} /> ACTIVE
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                      Custom Spawn Point ({customSpawnInfo.type === 'Custom' ? 'Custom' : 'Home'})
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {hasStoreDeliveries !== false ? (
                        customSpawnInfo.type === 'Custom' ? "Custom spawn point active" : "Set spawn point with Store Deliveries mod"
                      ) : (
                        <span>
                          <span 
                            style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--accent)', fontWeight: 700 }} 
                            onClick={async (e) => {
                              e.stopPropagation();
                              useDownloadStore.getState().addDownload('store-deliveries', 'Store Deliveries');
                              useToastStore.getState().info('Downloading Store Deliveries mod...');
                              try {
                                const result = await window.api.savegames.downloadStoreDeliveries();
                                if (result?.success) {
                                  useToastStore.getState().success('Store Deliveries mod downloaded!');
                                  const hasDeliv = await window.api.savegames.checkStoreDeliveries();
                                  setHasStoreDeliveries(hasDeliv);
                                  window.api.savegames.getStoreDeliveryCoordinates?.(save.path).then(setCustomSpawnInfo);
                                } else {
                                  throw new Error(result?.error || 'Install failed');
                                }
                              } catch (err) {
                                useToastStore.getState().error('Download failed: ' + err.message);
                              } finally {
                                useDownloadStore.getState().removeDownload('store-deliveries');
                              }
                            }}
                          >
                            Download the Store Deliveries mod
                          </span>
                          {" to enable this feature"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preset 2: Vehicle Shop */}
                  <div 
                    onClick={async () => {
                      // Toggle off if already selected
                      if (selectedSpawnMode === 'shop') {
                        setSelectedSpawnMode(null);
                        setSelectedVehicleId(null);
                        localStorage.removeItem(`selected_spawn_${save.path}`);
                        await window.api.savegames.resetPlayerSpawn(save.path);
                        useToastStore.getState().info('Spawn preset cleared — game will use default spawn.');
                        window.api.savegames.getPlayerPosition(save.path).then(setPlayerPos);
                        return;
                      }
                      setSelectedSpawnMode('shop');
                      setSelectedVehicleId(null);
                      localStorage.setItem(`selected_spawn_${save.path}`, JSON.stringify({ mode: 'shop' }));
                      const res = await window.api?.savegames?.getMapShopCoordinates(save.path);
                      if (res) {
                          const setRes = await window.api.savegames.setPlayerPosition({ savePath: save.path, x: res.x, y: res.y, z: res.z });
                          if (setRes && setRes.success) {
                              useToastStore.getState().success("Selected Vehicle Shop Spawn Point!");
                              window.api.savegames.getPlayerPosition(save.path).then(setPlayerPos);
                          } else {
                              useToastStore.getState().error("Failed to set spawn: " + (setRes?.error || "Unknown error"));
                          }
                      } else {
                          useToastStore.getState().error("Could not find Vehicle Shop coordinates for this map.");
                      }
                    }}
                    style={{ 
                      padding: '16px', background: selectedSpawnMode === 'shop' ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg-base)', 
                      border: selectedSpawnMode === 'shop' ? '2px solid var(--accent)' : '1px solid var(--border)', 
                      borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', transition: 'all 0.2s',
                      boxShadow: selectedSpawnMode === 'shop' ? '0 0 12px rgba(var(--accent-rgb), 0.2)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <MapPin size={16} style={{ color: selectedSpawnMode === 'shop' ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                      {selectedSpawnMode === 'shop' && (
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(var(--accent-rgb), 0.15)', padding: '2px 8px', borderRadius: 100 }}>
                          <Check size={12} /> ACTIVE
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Vehicle Shop</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Ready to buy equipment</div>
                  </div>

                  {/* Preset 3: Vehicle of Choice */}
                  {(() => {
                    const selVehicle = fleet.find(v => (v.uniqueId || v.id) === selectedVehicleId || String(v.uniqueId) === String(selectedVehicleId) || String(v.id) === String(selectedVehicleId));
                    return (
                      <div 
                        onClick={async () => {
                          // Toggle off if already selected
                          if (selectedSpawnMode === 'vehicle') {
                            setSelectedSpawnMode(null);
                            setSelectedVehicleId(null);
                            setIsVehicleListOpen(false);
                            localStorage.removeItem(`selected_spawn_${save.path}`);
                            await window.api.savegames.resetPlayerSpawn(save.path);
                            useToastStore.getState().info('Spawn preset cleared — game will use default spawn.');
                            window.api.savegames.getPlayerPosition(save.path).then(setPlayerPos);
                            return;
                          }
                          setSelectedSpawnMode('vehicle');
                          setIsVehicleListOpen(prev => !prev);
                        }}
                        style={{ 
                          padding: '16px', background: selectedSpawnMode === 'vehicle' ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg-base)', 
                          border: selectedSpawnMode === 'vehicle' ? '2px solid var(--accent)' : '1px solid var(--border)', 
                          borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', transition: 'all 0.2s',
                          boxShadow: selectedSpawnMode === 'vehicle' ? '0 0 12px rgba(var(--accent-rgb), 0.2)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Tractor size={16} style={{ color: selectedSpawnMode === 'vehicle' ? 'var(--accent)' : 'var(--text-tertiary)' }} />
                          {selectedSpawnMode === 'vehicle' && (
                            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(var(--accent-rgb), 0.15)', padding: '2px 8px', borderRadius: 100 }}>
                              <Check size={12} /> ACTIVE
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Vehicle of Choice</div>
                        <div style={{ fontSize: 11, color: selectedSpawnMode === 'vehicle' && selVehicle ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: selectedSpawnMode === 'vehicle' && selVehicle ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {selectedSpawnMode === 'vehicle' && selVehicle ? `${selVehicle.brand} ${selVehicle.name}` : 'Select From Available Vehicles'}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Vehicle List (Only shows when Vehicle of Choice is active or toggled open) */}
                {(isVehicleListOpen || selectedSpawnMode === 'vehicle') && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 300, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-base)', overflow: 'hidden' }}>
                    
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                        <Tractor size={14} /> VEHICLE LIST
                      </div>
                      <button className="btn btn--ghost btn--sm" style={{ width: 24, height: 24, padding: 0 }} onClick={() => setIsVehicleListOpen(false)}><X size={14} /></button>
                    </div>

                    <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
                      <div className="search-input-wrapper" style={{ flex: 1, position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                        <input 
                          type="text" 
                          placeholder="Search by brand, model or field..." 
                          value={searchFleetQuery} 
                          onChange={e => setSearchFleetQuery(e.target.value)} 
                          style={{ width: '100%', paddingLeft: 32, background: 'var(--bg-tertiary)', border: 'none' }} 
                        />
                      </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignContent: 'start' }}>
                      {fleet.filter(v => !searchFleetQuery || `${v.brand} ${v.name} ${v.displayType || v.type}`.toLowerCase().includes(searchFleetQuery.toLowerCase())).map((v, i) => {
                        const vId = v.uniqueId || v.id;
                        const isSelectedVehicle = selectedSpawnMode === 'vehicle' && selectedVehicleId && (String(selectedVehicleId) === String(v.uniqueId) || String(selectedVehicleId) === String(v.id) || selectedVehicleId === vId);
                        return (
                          <div 
                            key={i} 
                            onClick={async () => {
                              if (!window.api?.savegames) return;
                              setSelectedSpawnMode('vehicle');
                              setSelectedVehicleId(vId);
                              localStorage.setItem(`selected_spawn_${save.path}`, JSON.stringify({ mode: 'vehicle', vehicleUniqueId: vId }));
                              const res = await window.api.savegames.setPlayerPosition({ savePath: save.path, x: v.x, y: v.y, z: v.z, vehicleUniqueId: v.uniqueId });
                              if (res.success) {
                                useToastStore.getState().success(`Selected spawn vehicle: ${v.brand} ${v.name}`);
                                window.api.savegames.getPlayerPosition(save.path).then(setPlayerPos);
                              } else {
                                useToastStore.getState().error("Failed to set spawn position: " + res.error);
                              }
                            }}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 12, 
                              padding: '12px', 
                              background: isSelectedVehicle ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--bg-tertiary)', 
                              borderRadius: 8, 
                              border: isSelectedVehicle ? '2px solid var(--accent)' : '1px solid transparent', 
                              cursor: 'pointer', 
                              transition: 'all 0.2s',
                              position: 'relative',
                              boxShadow: isSelectedVehicle ? '0 0 12px rgba(var(--accent-rgb), 0.25)' : 'none'
                            }}
                            onMouseEnter={e => { if (!isSelectedVehicle) e.currentTarget.style.borderColor = 'var(--accent)'; }}
                            onMouseLeave={e => { if (!isSelectedVehicle) e.currentTarget.style.borderColor = 'transparent'; }}
                          >
                            <div style={{ width: 42, height: 42, borderRadius: 8, background: 'rgba(var(--accent-rgb), 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent)' }}>
                              {(() => {
                                const t = (v.displayType || v.type || '').toLowerCase();
                                if (t.includes('tractor')) return <Tractor size={24} />;
                                if (t.includes('combine') || t.includes('harvester')) return <CombineHarvesterIcon size={24} />;
                                if (t.includes('telehandler') || t.includes('teleloader')) return <TelehandlerIcon size={24} />;
                                if (t.includes('wheel loader') || t.includes('wheelloader')) return <WheelLoaderIcon size={24} />;
                                if (t.includes('truck')) return <Truck size={24} />;
                                if (t.includes('car') || t.includes('pickup')) return <Car size={24} />;
                                return <Truck size={24} />;
                              })()}
                            </div>
                            <div style={{ overflow: 'hidden', flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.brand} {v.name}</div>
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: isSelectedVehicle ? 'var(--accent)' : 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}>
                                <span>{v.displayType || v.type || 'Vehicle'}</span>
                                {isSelectedVehicle && (
                                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Check size={12} /> ACTIVE
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {fleet.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                          No drivable vehicles found in savegame.
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

            </div>
          )}


          {activeTab === 'mods' && (
                    <div className="settings-tab-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', flex: 1, minHeight: 0 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div className="search-input-wrapper" style={{ flex: '0 0 250px', position: 'relative' }}>
                          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                          <input type="text" placeholder="Search installed mods..." value={modSearchQuery} onChange={e => setModSearchQuery(e.target.value)} style={{ width: '100%', paddingLeft: 32 }} />
                        </div>
                        {availableBrands && availableBrands.length > 0 && (
                          <select 
                              value={selectedBrand} 
                              onChange={e => setSelectedBrand(e.target.value)}
                              title="Filter mods by brand."
                              style={{ width: 140, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                          >
                              <option value="">All Brands</option>
                              {availableBrands.map(b => (
                                  <option key={b} value={b}>{b}</option>
                              ))}
                          </select>
                        )}
                        {availableCategories && availableCategories.length > 0 && (
                          <select 
                              value={selectedCategory} 
                              onChange={e => setSelectedCategory(e.target.value)}
                              title="Filter mods by category."
                              style={{ width: 140, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                          >
                              <option value="">All Categories</option>
                              {availableCategories.map(c => (
                                  <option key={c} value={c}>{c}</option>
                              ))}
                          </select>
                        )}
                        <select 
                            value={selectedFolder} 
                            onChange={e => setSelectedFolder(e.target.value)}
                            title="Filter by mod folder."
                            style={{ width: 160, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="ALL">All Folders</option>
                            {Object.keys(groupedMods).sort().map(folderName => (
                                <option key={folderName} value={folderName}>{folderName}</option>
                            ))}
                        </select>
                        <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', background: 'var(--bg-tertiary)', borderRadius: 100, border: '1px solid var(--border)' }}>
                          {selectedMods.size} Selected
                        </div>
                        <label title="Filter the list to only show mods currently used in this savegame."
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            userSelect: 'none',
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: `1px solid ${showOnlyUsed ? 'var(--accent)' : 'var(--border)'}`,
                            background: showOnlyUsed ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg-tertiary)',
                            color: showOnlyUsed ? 'var(--accent)' : 'var(--text-secondary)',
                            transition: 'all 0.15s'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={showOnlyUsed}
                            onChange={e => setShowOnlyUsed(e.target.checked)}
                            style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                          />
                          <span>Show Used Only ({usedMods.size})</span>
                        </label>
                        <button 
                          className="btn btn--secondary btn--sm"
                          style={{ gap: 6, padding: '0 14px', height: 32, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border)' }}
                          onClick={() => {
                            const nextSelected = new Set(selectedMods);
                            const toRemove = [];
                            installedMods.forEach(mod => {
                              if (nextSelected.has(mod.modName) && !usedMods.has(mod.modName.toLowerCase())) {
                                toRemove.push(mod.modName);
                              }
                            });
                            if (toRemove.length > 0) {
                              setIsDeselectingUnused(true);
                              toRemove.forEach(m => nextSelected.delete(m));
                              setSelectedMods(nextSelected);
                              const modsToApply = installedMods.filter(m => nextSelected.has(m.modName));
                              window.api.savegames.setSavegameMods(save.path, modsToApply).then(() => {
                                setIsDeselectingUnused(false);
                                onRefresh();
                              });
                            }
                          }}
                        >
                          <Trash2 size={14} />
                          DESELECT UNUSED MODS
                        </button>
                        <button 
                          className="btn btn--sm"
                          title="Toggle all Must-Have mods."
                          style={{ gap: 6, padding: '0 14px', height: 32, fontSize: 11, fontWeight: 700, 
                                   background: (() => {
                                       const favsForToggle = useModHubStore.getState().favoriteMods || [];
                                       let activeCount = 0;
                                       let totalCount = 0;
                                       installedMods.forEach(m => {
                                           const mnStr = typeof m.modName === 'string' ? m.modName : '';
                                           if (!mnStr) return;
                                           const fnStr = typeof m.fileName === 'string' ? m.fileName : '';
                                           const modBasename = fnStr ? fnStr.split(/[\\/\\]/).pop().toLowerCase() : `${mnStr.toLowerCase()}.zip`;
                                           const isMustHave = favsForToggle.some(fm => {
                                               if (!fm || !fm.isMustHave) return false;
                                               const idMatch = fm.modId && m.modId && String(fm.modId) === String(m.modId);
                                               const fmStr = typeof fm.fileName === 'string' ? fm.fileName : '';
                                               return idMatch || (fmStr && fmStr.toLowerCase() === modBasename);
                                           });
                                           if (isMustHave) {
                                               totalCount++;
                                               if (selectedMods.has(mnStr)) activeCount++;
                                           }
                                       });
                                       return (totalCount > 0 && activeCount === totalCount) ? 'var(--accent)' : 'transparent';
                                   })(),
                                   color: (() => {
                                       const favsForToggle = useModHubStore.getState().favoriteMods || [];
                                       let activeCount = 0;
                                       let totalCount = 0;
                                       installedMods.forEach(m => {
                                           const mnStr = typeof m.modName === 'string' ? m.modName : '';
                                           if (!mnStr) return;
                                           const fnStr = typeof m.fileName === 'string' ? m.fileName : '';
                                           const modBasename = fnStr ? fnStr.split(/[\\/\\]/).pop().toLowerCase() : `${mnStr.toLowerCase()}.zip`;
                                           const isMustHave = favsForToggle.some(fm => {
                                               if (!fm || !fm.isMustHave) return false;
                                               const idMatch = fm.modId && m.modId && String(fm.modId) === String(m.modId);
                                               const fmStr = typeof fm.fileName === 'string' ? fm.fileName : '';
                                               return idMatch || (fmStr && fmStr.toLowerCase() === modBasename);
                                           });
                                           if (isMustHave) {
                                               totalCount++;
                                               if (selectedMods.has(mnStr)) activeCount++;
                                           }
                                       });
                                       return (totalCount > 0 && activeCount === totalCount) ? 'white' : 'var(--text-secondary)';
                                   })(),
                                   border: '1px solid ' + (() => {
                                       const favsForToggle = useModHubStore.getState().favoriteMods || [];
                                       let activeCount = 0;
                                       let totalCount = 0;
                                       installedMods.forEach(m => {
                                           const mnStr = typeof m.modName === 'string' ? m.modName : '';
                                           if (!mnStr) return;
                                           const fnStr = typeof m.fileName === 'string' ? m.fileName : '';
                                           const modBasename = fnStr ? fnStr.split(/[\\/\\]/).pop().toLowerCase() : `${mnStr.toLowerCase()}.zip`;
                                           const isMustHave = favsForToggle.some(fm => {
                                               if (!fm || !fm.isMustHave) return false;
                                               const idMatch = fm.modId && m.modId && String(fm.modId) === String(m.modId);
                                               const fmStr = typeof fm.fileName === 'string' ? fm.fileName : '';
                                               return idMatch || (fmStr && fmStr.toLowerCase() === modBasename);
                                           });
                                           if (isMustHave) {
                                               totalCount++;
                                               if (selectedMods.has(mnStr)) activeCount++;
                                           }
                                       });
                                       return (totalCount > 0 && activeCount === totalCount) ? 'var(--accent)' : 'var(--border)';
                                   })()
                                 }}
                          onClick={async () => {
                            try {
                                const nextSelected = new Set(selectedMods);
                                let changed = false;
                                const favs = useModHubStore.getState().favoriteMods || [];
                                
                                const mustHaveModNames = new Set();
                                installedMods.forEach(mod => {
                                    const fnStr = typeof mod.fileName === 'string' ? mod.fileName : '';
                                    const mnStr = typeof mod.modName === 'string' ? mod.modName : '';
                                    const modBasename = fnStr ? fnStr.split(/[\\/\\]/).pop().toLowerCase() : (mnStr ? `${mnStr.toLowerCase()}.zip` : '');
                                    
                                    const isMustHave = favs.some(fm => {
                                        if (!fm || !fm.isMustHave) return false;
                                        const idMatch = fm.modId && mod.modId && String(fm.modId) === String(mod.modId);
                                        const fmStr = typeof fm.fileName === 'string' ? fm.fileName : '';
                                        return idMatch || (fmStr && fmStr.toLowerCase() === modBasename);
                                    });
                                    if (isMustHave && mnStr) {
                                        mustHaveModNames.add(mnStr);
                                    }
                                });
                                
                                const isAdoptMustHavesActive = mustHaveModNames.size > 0 && Array.from(mustHaveModNames).every(mn => nextSelected.has(mn));
                                
                                if (isAdoptMustHavesActive) {
                                    // Turn OFF
                                    mustHaveModNames.forEach(mn => {
                                        if (nextSelected.has(mn)) {
                                            nextSelected.delete(mn);
                                            changed = true;
                                        }
                                    });
                                } else {
                                    // Turn ON
                                    mustHaveModNames.forEach(mn => {
                                        if (!nextSelected.has(mn)) {
                                            nextSelected.add(mn);
                                            changed = true;
                                        }
                                    });
                                }
                                
                                if (changed) {
    const { conflictSensitivity } = useSettingsStore.getState();
    if (conflictSensitivity !== 'off') {
        const allConflicts = useLocalModsStore.getState().conflicts;
        const activeMap = getActiveConflictsForSave(nextSelected, allConflicts);
        if (activeMap.size > 0) {
            if (conflictSensitivity === 'auto-disable_REMOVED') {
                activeMap.forEach((_, modName) => nextSelected.delete(Array.from(nextSelected).find(m => m.toLowerCase() === modName) || modName));
                import('../store/useToastStore').then(m => m.useToastStore.getState().info(`Auto-disabled ${activeMap.size} conflicting mods.`));
            } else if (conflictSensitivity === 'warn' || conflictSensitivity === 'resolve') {
                import('../store/useToastStore').then(m => m.useToastStore.getState().warning(`Warning: Must-haves introduced ${activeMap.size} conflicts.`));
            }
        }
    }

    setSelectedMods(nextSelected);
    const modsToApply = installedMods.filter(m => typeof m.modName === 'string' && nextSelected.has(m.modName));

    const result = window.api.savegames.setSavegameMods
                                    ? await window.api.savegames.setSavegameMods(save.path, modsToApply)
                                    : await window.api.savegames.updateSavegameMods(save.path, modsToApply);
                                    
                                  if (result && !result.success) {
                                      import('../store/useToastStore').then(module => module.useToastStore.getState().error(result.error || "Failed to update mods"));
                                  } else {
                                      onRefresh();
                                  }
                                } else {
                                  import('../store/useToastStore').then(module => module.useToastStore.getState().info("No Must-Have mods available to toggle."));
                                }
                            } catch(err) {
                                console.error("Adopt Must Haves error:", err);
                                import('../store/useToastStore').then(module => module.useToastStore.getState().error("Error: " + err.message));
                            }
                          }}
                        >
                          <Pin size={14} />
                          ADOPT MUST-HAVES
                        </button>
                      </div>

                      <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8, padding: '8px 4px' }}>
                          {(() => {
                              let list = [];
                              if (selectedFolder === 'ALL') {
                                  Object.values(groupedMods).forEach(arr => list.push(...arr));
                              } else {
                                  list = groupedMods[selectedFolder] || [];
                              }
                              
                              const displayedMods = list.filter(m => {
                                  if (showOnlyUsed && !usedMods.has(m.modName.toLowerCase())) return false;
                                  if (selectedCategory) {
                                      if (selectedCategory === 'Favourites') {
                                          const fnStr = typeof m.fileName === 'string' ? m.fileName : '';
                                          const mnStr = typeof m.modName === 'string' ? m.modName : '';
                                          const modBasename = fnStr ? fnStr.split(/[\\/\\]/).pop().toLowerCase() : (mnStr ? `${mnStr.toLowerCase()}.zip` : '');
                                          const isFav = (useModHubStore.getState().favoriteMods||[]).some(fm => {
                                              if (!fm) return false;
                                              const idMatch = fm.modId && m.modId && String(fm.modId) === String(m.modId);
                                              const fmStr = typeof fm.fileName === 'string' ? fm.fileName : '';
                                              return idMatch || (fmStr && fmStr.toLowerCase() === modBasename);
                                          });
                                          if (!isFav) return false;
                                      } else {
                                          let catStr = m.category;
                                          const modCache = useModHubStore.getState().modCache || {};
                                          if (m.modId && modCache[m.modId]?.category) catStr = modCache[m.modId].category;
                                          
                                          const parseModCategory = (cat, isMap) => {
            if (isMap) return 'Maps';
            if (!cat) return null;
            let s = String(cat).toLowerCase();
            if (s.includes('map')) return 'Maps';
            if (s.includes('tractor') || s.includes('truck') || s.includes('car') || s.includes('bike') || s.includes('harvester') || s.includes('loader') || s.includes('telehandler') || s.includes('forklift') || s.includes('excavator') || s.includes('forwarder') || s.includes('drivable') || s.includes('vehicle')) return 'Vehicles';
            if (s.includes('trailer') || s.includes('cultivat') || s.includes('plow') || s.includes('seeder') || s.includes('planter') || s.includes('roller') || s.includes('spreader') || s.includes('sprayer') || s.includes('mower') || s.includes('tedder') || s.includes('windrower') || s.includes('header') || s.includes('tool') || s.includes('spader') || s.includes('subsoiler') || s.includes('harrow') || s.includes('weeder') || s.includes('mulcher') || s.includes('belt') || s.includes('leveler') || s.includes('compaction') || s.includes('winch') || s.includes('cutter') || s.includes('chainsaw') || s.includes('shovel') || s.includes('implement') || s.includes('yield') || s.includes('slurry') || s.includes('manure') || s.includes('forage')) return 'Implements';
            if (s.includes('placeable') || s.includes('shed') || s.includes('silo') || s.includes('production') || s.includes('farmhouse') || s.includes('animal') || s.includes('decoration')) return 'Placeables';
            if (s.includes('object') || s.includes('bale') || s.includes('pallet') || s.includes('bigbag') || s.includes('weight')) return 'Objects';
            if (s.includes('pack') || s.includes('package')) return 'Packs';
            if (s.includes('gameplay') || s.includes('script') || s.includes('prefab')) return 'Gameplay and Scripts';
            return 'Other';
        };
                                          
                                          const mainCat = parseModCategory(catStr, m.isMap);
                                          if (mainCat !== selectedCategory) return false;
                                      }
                                  }
                                  if (selectedBrand) {
                                      let b = null;
                                      const modCache = useModHubStore.getState().modCache || {};
                                      if (m.modId && modCache[m.modId]?.brand) b = modCache[m.modId].brand;
                                      if (!b) {
                                          const hardcoded = useModHubStore.getState().hardcodedBrands || [];
                                          for (const hb of hardcoded) {
                                              if (m.title && m.title.toLowerCase().includes(hb.toLowerCase())) { b = hb; break; }
                                          }
                                      }
                                      if (b !== selectedBrand) return false;
                                  }
                                  if (!modSearchQuery) return true;
                                  return m.title?.toLowerCase().includes(modSearchQuery.toLowerCase()) || m.modName.toLowerCase().includes(modSearchQuery.toLowerCase());
                              }).sort((a, b) => (a.title || a.modName).localeCompare(b.title || b.modName));
                              
                              if (displayedMods.length === 0) {
                                  return <div style={{ padding: 20, textAlign: 'center', opacity: 0.5, gridColumn: '1 / -1' }}>No mods found matching your criteria.</div>;
                              }
                              
                              return displayedMods.map(m => {
                                const conflictData = activeModalConflicts && activeModalConflicts.get(m.modName);
                                const isConflicting = !!conflictData;
                                const mBasename = m.fileName ? m.fileName.split(/[\\/\\]/).pop().toLowerCase() : (m.modName ? `${m.modName.toLowerCase()}.zip` : '');
                                const isMustHave = useModHubStore.getState().favoriteMods.some(f => f.isMustHave && (
                                    (f.modId && m.modId && String(f.modId) === String(m.modId)) || 
                                    (f.fileName && f.fileName.toLowerCase() === mBasename)
                                ));
                                return (
                                  <div
                                    key={m.modName}
                                    onClick={() => toggleMod(m.modName)}
                                    style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 12, 
                                      padding: '8px', 
                                      fontSize: 14, 
                                      cursor: 'pointer', 
                                      borderRadius: 10, 
                                      background: isConflicting ? 'rgba(255, 100, 0, 0.05)' : (selectedMods.has(m.modName) ? 'var(--accent-dim)' : 'var(--bg-card)'), 
                                      border: `2px solid ${isConflicting ? 'rgba(255, 100, 0, 0.6)' : (selectedMods.has(m.modName) ? 'var(--accent)' : 'var(--border-light)')}`, 
                                      transition: 'all 0.15s',
                                      contentVisibility: 'auto',
                                      containIntrinsicSize: '64px 80px'
                                    }} 
                                    className="hover-bg-subtle"
                                  >
                                    <MiniModIcon mod={m} size={64} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12, overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                                          <span style={{ fontWeight: 700, fontSize: 13, color: isConflicting ? 'orange' : 'inherit', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{m.title || m.modName}</span>
                                          <span style={{ fontSize: 11, opacity: 0.6, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{m.author || 'Unknown'} • v{m.version}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                          {isMustHave && <Pin size={14} fill="var(--accent)" style={{ opacity: 0.8 }} />}
                                          {usedMods.has(m.modName.toLowerCase()) && (
                                            <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.18)', padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5 }}>IN USE</span>
                                          )}
                                          {isConflicting && (
                                            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConflictInfoMod(m); }} style={{ cursor: 'pointer', color: 'orange', padding: '2px 4px', display: 'flex' }} title="Show conflict details">
                                              <ShieldAlert size={16} />
                                            </div>
                                          )}
                                        </div>
                                    </div>
                                  </div>
                                );
                              });
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

          {activeTab === 'multiplayer' && (
            <div className="settings-tab-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              {loadingFarm ? (
                <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}>Loading farm permissions from farms.xml...</div>
              ) : farmData ? (
                <>
                  {/* Farm Overview Card */}
                  <div className="settings-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                      <div>
                        <h3 className="section-title" style={{ marginBottom: 4 }}><Users size={16} /> {farmData.farmName}</h3>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Farm ID {farmData.farmId} • {farmData.playersCount || 1} Registered Member(s)</div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ background: 'var(--bg-tertiary)', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block' }}>FARM BALANCE</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{formatMoney(farmData.money)}</span>
                        </div>
                        <div style={{ background: 'var(--bg-tertiary)', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block' }}>OUTSTANDING LOAN</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>{formatMoney(farmData.loan)}</span>
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      Set the baseline permissions for players who join your farm in multiplayer. Farm Managers always retain full access, while standard farm hands adhere to the toggles below.
                    </p>
                  </div>

                  {/* Permissions Toggles Grid */}
                  <div className="settings-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h3 className="section-title" style={{ margin: 0 }}><Shield size={16} /> Member Access Rights</h3>
                      {!save.isEditorLocked && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button 
                            className="btn btn--ghost btn--xs"
                            onClick={() => {
                              const allTrue = {};
                              Object.keys(farmData.permissions).forEach(k => allTrue[k] = true);
                              setFarmData({ ...farmData, permissions: allTrue });
                            }}
                          >
                            Grant All
                          </button>
                          <button 
                            className="btn btn--ghost btn--xs"
                            onClick={() => {
                              const allFalse = {};
                              Object.keys(farmData.permissions).forEach(k => allFalse[k] = false);
                              setFarmData({ ...farmData, permissions: allFalse });
                            }}
                          >
                            Revoke All
                          </button>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                      {[
                        { key: 'buyVehicle', title: 'Buy Vehicles & Tools', desc: 'Allow members to buy machinery from the dealership' },
                        { key: 'sellVehicle', title: 'Sell Vehicles & Tools', desc: 'Allow members to sell owned machinery' },
                        { key: 'buyPlaceable', title: 'Buy Buildings & Placeables', desc: 'Allow placing sheds, silos, fences, and productions' },
                        { key: 'sellPlaceable', title: 'Sell Buildings & Placeables', desc: 'Allow selling or demolishing owned farm structures' },
                        { key: 'manageContracts', title: 'Manage Field Contracts', desc: 'Allow accepting and completing NPC field missions' },
                        { key: 'tradeAnimals', title: 'Trade Livestock', desc: 'Allow buying, selling, and breeding animals' },
                        { key: 'createFields', title: 'Create Fields', desc: 'Allow plows to cut new fields into the landscape' },
                        { key: 'landscaping', title: 'Landscaping & Sculpting', desc: 'Allow terrain sculpting and ground painting' },
                        { key: 'hireAssistant', title: 'Hire AI Helpers', desc: 'Allow hiring automated workers' },
                        { key: 'resetVehicle', title: 'Reset Vehicles', desc: 'Allow teleporting stuck vehicles back to the shop' },
                        { key: 'manageProductions', title: 'Manage Productions', desc: 'Allow changing recipes and activating production chains' },
                        { key: 'cutTrees', title: 'Cut Trees & Forestry', desc: 'Allow chainsaws and forestry harvesters to fell timber' },
                        { key: 'transferMoney', title: 'Transfer Money', desc: 'Allow sending money to other farms or players' },
                        { key: 'updateFarm', title: 'Update Farm Profile', desc: 'Allow renaming the farm or altering farm branding' },
                        { key: 'manageContracting', title: 'Contracting Rights', desc: 'Allow granting contractor access to other farms' },
                      ].map(item => {
                        const isAllowed = farmData.permissions[item.key] !== false;
                        return (
                          <div 
                            key={item.key} 
                            style={{ 
                              background: 'var(--bg-tertiary)', 
                              padding: '12px 14px', 
                              borderRadius: 10, 
                              border: isAllowed ? '1px solid rgba(var(--accent-rgb), 0.3)' : '1px solid var(--border)',
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              gap: 12,
                              opacity: save.isEditorLocked ? 0.7 : 1
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: isAllowed ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{item.title}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{item.desc}</div>
                            </div>
                            <input 
                              type="checkbox"
                              checked={isAllowed}
                              disabled={save.isEditorLocked}
                              onChange={(e) => {
                                setFarmData({
                                  ...farmData,
                                  permissions: {
                                    ...farmData.permissions,
                                    [item.key]: e.target.checked
                                  }
                                });
                              }}
                              style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: save.isEditorLocked ? 'not-allowed' : 'pointer' }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {!save.isEditorLocked && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <button 
                          className="btn btn--primary btn--sm" 
                          onClick={handleSaveFarmPermissions}
                          disabled={savingFarm}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                        >
                          <Save size={14} /> {savingFarm ? 'Saving Permissions...' : 'Save Permissions to farms.xml'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}>No farms.xml found for this savegame.</div>
              )}
            </div>
          )}
                  <div style={{ background: 'rgba(var(--accent-rgb), 0.05)', padding: '16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 'var(--fs-xs)', display: 'flex', gap: 12 }}>
            <Info size={16} className="text-accent" style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, opacity: 0.8 }}>Changes are applied instantly to the XML files. We recommend archiving your savegame first as a manual backup.</p>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', background: 'var(--bg-tertiary)', display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn--secondary" onClick={() => { onRefresh(); onClose(); }}>Done</button>
            <button className="btn btn--primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={async () => {
              onRefresh();
              onClose();
              await onLaunch(save.index);
            }}>
              <Gamepad2 size={16} /> Launch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveSlotCard({ save, onPlay, onArchive, onRollback, onCreate, onEdit, onAudit, onRename, onAdopt, onDelete, onExport, onToggleMode, isSelected, onToggleSelection, editingName, newName, setNewName, handleRename, setEditingName, formatMoney, formatPlayTime, mods, onDrop, isPlaying, isGameRunning }) {
    const isEmpty = save.modCount === 0 && (save.farmName || '').startsWith('Empty');
    const [isDragOver, setIsDragOver] = useState(false);
    
    const versionMismatches = React.useMemo(() => {
        if (!save.mods || !mods) return 0;
        let mismatches = 0;
        for (const req of save.mods) {
            if (!req.version) continue;
            const installed = mods.find(m => (m.modName || '').toLowerCase() === (req.modName || '').toLowerCase());
            if (installed && installed.version && installed.version !== req.version) {
                mismatches++;
            }
        }
        return mismatches;
    }, [save.mods, mods]);

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
                    border: isPlaying ? '1px solid #22c55e' : (isDragOver ? '2px solid var(--accent)' : (isSelected ? '1px solid var(--accent)' : (save.hasTemplate ? '1px solid var(--accent-dim)' : '1px solid transparent'))), 
                    boxShadow: isPlaying ? '0 0 20px rgba(34, 197, 94, 0.25)' : (isSelected ? '0 0 15px rgba(var(--accent-rgb), 0.2)' : 'none'), 
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

            {/* Top Badges Container */}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 6, zIndex: 5 }}>
              {isPlaying && (
                <div style={{ 
                  background: 'rgba(34, 197, 94, 0.25)', 
                  border: '1px solid #22c55e', 
                  color: '#4ade80', 
                  fontSize: 8, 
                  fontWeight: 900, 
                  padding: '2px 8px', 
                  borderRadius: 4, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 5, 
                  boxShadow: '0 0 12px rgba(34, 197, 94, 0.6)', 
                  letterSpacing: 0.5 
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                  ACTIVE IN-GAME
                </div>
              )}

              {save.isServerSave && (
                <div style={{ 
                  background: isPlaying ? (save.serverAccessLevel === 'admin' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(6, 182, 212, 0.2)') : 'var(--bg-tertiary)', 
                  border: isPlaying ? `1px solid ${save.serverAccessLevel === 'admin' ? '#eab308' : '#06b6d4'}` : '1px solid var(--border)', 
                  color: isPlaying ? (save.serverAccessLevel === 'admin' ? '#fde047' : '#22d3ee') : 'var(--text-secondary)', 
                  fontSize: 8, 
                  fontWeight: 900, 
                  padding: '2px 8px', 
                  borderRadius: 4, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 4, 
                  boxShadow: isPlaying ? `0 0 10px ${save.serverAccessLevel === 'admin' ? 'rgba(234, 179, 8, 0.4)' : 'rgba(6, 182, 212, 0.4)'}` : 'none', 
                  letterSpacing: 0.5 
                }}>
                  {save.serverAccessLevel === 'admin' ? <Crown size={10} /> : <Lock size={10} />}
                  {save.serverAccessLevel === 'admin' ? 'MP SERVER (ADMIN)' : 'MP SERVER (PLAYER)'}
                </div>
              )}

              {save.hasTemplate && !save.isGhost && (
                <div style={{ 
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

              {save.isGhost && (
                <div style={{ 
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
            </div>
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
            <div style={{ display: 'flex', gap: 2, alignItems: 'center', marginTop: 'auto', width: '100%', zIndex: 1, padding: 'var(--sp-2) 0 0 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                {save.isServerSave && (
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 4, 
                    background: versionMismatches > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.2)',
                    border: `1px solid ${versionMismatches > 0 ? '#ef4444' : '#22c55e'}`,
                    color: versionMismatches > 0 ? '#fca5a5' : '#86efac',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 800,
                    marginRight: 4
                  }}>
                    {versionMismatches > 0 ? <ShieldAlert size={10} /> : <Check size={10} />}
                    {versionMismatches > 0 ? `${versionMismatches} OUT OF DATE` : 'MODS SYNCED'}
                  </span>
                )}
                {save.isInitialized && !save.hasTemplate && (
                    <button className="btn btn--ghost btn--sm" onClick={onAdopt} title="Save as Master Template" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <Zap size={16} />
                    </button>
                )}
                <div style={{ flex: 1 }} />


                <button 
                  className={`btn btn--sm ${isPlaying ? 'btn--primary' : 'btn--ghost'}`} 
                  onClick={onPlay} 
                  disabled={isGameRunning && !isPlaying}
                  title={isPlaying ? "Active In-Game (Currently Running)" : (isGameRunning ? "Another slot is running" : "Play Now")} 
                  style={{ 
                    color: '#ffffff', 
                    ...(isPlaying ? { 
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', 
                      borderColor: '#4ade80',
                      boxShadow: '0 0 15px rgba(74, 222, 128, 0.95), 0 0 30px rgba(34, 197, 94, 0.65), inset 0 0 8px rgba(255, 255, 255, 0.6)', 
                      animation: 'playGlowPulse 1.8s ease-in-out infinite',
                      transformOrigin: 'center center',
                      zIndex: 2
                    } : (isGameRunning ? { 
                      opacity: 0.35, 
                      cursor: 'not-allowed' 
                    } : {})) 
                  }}
                >
                  <Play size={16} fill={isPlaying ? "currentColor" : "none"} />
                </button>
                {!save.isGhost && (
                  <>
                    <button className="btn btn--ghost btn--sm" onClick={onAudit} title="Audit Mods & Versions" style={{ color: 'rgba(255,255,255,0.7)' }}><ShieldAlert size={16} /></button>
                    <button 
                      className="btn btn--ghost btn--sm" 
                      onClick={onEdit} 
                      title={save.isEditorLocked ? "View Server Save (Editor Locked by Host)" : "Surgical Editor"} 
                      style={{ color: save.isEditorLocked ? '#22d3ee' : 'rgba(255,255,255,0.7)' }}
                    >
                      {save.isEditorLocked ? <Lock size={16} /> : <Sliders size={16} />}
                    </button>
                  </>
                )}
                <button className="btn btn--ghost btn--sm" onClick={onRollback} title="Rollback from Engine Backup" style={{ color: 'rgba(255,255,255,0.7)' }}><RotateCcw size={16} /></button>
                <button 
                  className="btn btn--ghost btn--sm" 
                  onClick={onToggleMode} 
                  title={save.isGhost ? "Initialize save to toggle mode" : (save.isServerSave ? "Convert Slot to Single Player Mode" : "Convert Slot to Multiplayer Server Mode")} 
                  disabled={save.isGhost} 
                  style={{ color: save.isServerSave ? '#06b6d4' : 'rgba(255,255,255,0.7)' }}
                >
                  {save.isServerSave ? (<Globe size={16} />) : (<User size={16} />)}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={onExport} title={save.isGhost ? "Initialize map to export" : "Export Savegame (ZIP)"} disabled={save.isGhost} style={{ color: 'var(--accent)' }}><Share2 size={16} /></button>
                <button className="btn btn--ghost btn--sm" onClick={onArchive} title={save.isGhost ? "Initialize map to archive" : "Archive"} disabled={save.isGhost} style={{ color: 'rgba(255,255,255,0.7)' }}><Archive size={16} /></button>
                <button className="btn btn--ghost btn--sm" onClick={onDelete} title="Delete Permamently" style={{ color: 'var(--danger)' }}><Trash2 size={16} /></button>
            </div>

        </div>
    );
}






const MiniModIcon = React.memo(({ mod, size = 64 }) => {
    const [error, setError] = React.useState(false);
    let imageUrl = null;
    
    if (mod?.iconData && !mod.iconData.startsWith('CATEGORY:')) {
        imageUrl = mod.iconData.startsWith('http') || mod.iconData.startsWith('data:') ? mod.iconData : `data:image/png;base64,${mod.iconData}`;
    } else {
        const filePath = mod?.filePath || (mod?.fileName ? useLocalModsStore.getState().mods.find(m => m.fileName === mod.fileName || m.modName === mod.modName)?.filePath : null);
        if (filePath) {
            imageUrl = `mod-icon://icon?path=${encodeURIComponent(filePath)}`;
        }
    }
    
    return (
        <div style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {imageUrl && !error ? (
                <img 
                    src={imageUrl} 
                    alt={mod?.title || mod?.modName || ""} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    loading="lazy"
                    decoding="async"
                    onError={() => setError(true)} 
                />
            ) : (
                <div style={{ fontSize: size * 0.4, fontWeight: 900, color: 'var(--text-secondary)' }}>
                    {(mod?.title || mod?.modName || 'M').charAt(0).toUpperCase()}
                </div>
            )}
        </div>
    );
});


function ConflictResolutionModal({ data, onClose, onResolve }) {
  const [selections, setSelections] = React.useState({});

  const conflictGroups = React.useMemo(() => {
    const groups = [];
    const seenCombos = new Set();
    
    data.activeConflictsMap.forEach((conflicts, modName) => {
        conflicts.forEach(c => {
            const allInvolved = [modName, ...c.activeConflictingMods].map(m => m.toLowerCase()).sort();
            const comboKey = c.type + ':' + c.name + ':' + allInvolved.join(',');
            if (!seenCombos.has(comboKey)) {
                seenCombos.add(comboKey);
                groups.push({
                    type: c.type,
                    name: c.name,
                    involved: allInvolved
                });
            }
        });
    });
    return groups;
  }, [data.activeConflictsMap]);

  const handleSelect = (groupIndex, modToKeep) => {
      setSelections(prev => ({ ...prev, [groupIndex]: modToKeep }));
  };

  const handleApply = () => {
      const modsToDisable = new Set();
      conflictGroups.forEach((g, idx) => {
          const keptMod = selections[idx];
          g.involved.forEach(m => {
              if (m !== keptMod) modsToDisable.add(m);
          });
      });
      onResolve(modsToDisable);
  };

  return (
    <div className="modal-overlay animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 10000 }}>
        <div className="modal-content" style={{ width: 600, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,100,0,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'orange' }}>
                    <ShieldAlert size={24} />
                    <h2 style={{ margin: 0, fontSize: 18 }}>Resolve Mod Conflicts</h2>
                </div>
            </div>
            
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
                <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>
                    The following mods have scripts or specializations that overlap. Running them together may cause game instability or crashes. For each conflict, please select which mod you want to keep enabled.
                </p>

                {conflictGroups.map((g, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'orange' }}>
                            Conflict: {g.type} ({g.name})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {g.involved.map(m => (
                                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, padding: '8px 12px', background: selections[idx] === m ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--bg-card)', border: `1px solid ${selections[idx] === m ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6 }}>
                                    <input type="radio" name={`conflict-${idx}`} checked={selections[idx] === m} onChange={() => handleSelect(idx, m)} style={{ accentColor: 'var(--accent)' }} />
                                    <span style={{ fontWeight: selections[idx] === m ? 700 : 400 }}>{m}</span>
                                </label>
                            ))}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, padding: '8px 12px', background: selections[idx] === 'DISABLE_ALL' ? 'rgba(255,0,0,0.1)' : 'var(--bg-card)', border: `1px solid ${selections[idx] === 'DISABLE_ALL' ? 'red' : 'var(--border)'}`, borderRadius: 6, marginTop: 4 }}>
                                <input type="radio" name={`conflict-${idx}`} checked={selections[idx] === 'DISABLE_ALL'} onChange={() => handleSelect(idx, 'DISABLE_ALL')} />
                                <span style={{ opacity: 0.8 }}>Disable all of them</span>
                            </label>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--bg-tertiary)' }}>
                <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
                <button className="btn btn--primary" disabled={Object.keys(selections).length !== conflictGroups.length} onClick={handleApply}>
                    <Check size={16} /> Apply & Continue
                </button>
            </div>
        </div>
    </div>
  );
}

export default function SavegamesPage() {
  const navigate = useNavigate();
  const { mods } = useLocalModsStore();
  const {
    savegames, isLoading: isSavesLoading, fetchSavegames,
    isGameRunning, playingSlot
  } = useSavegameStore();

  const { skipIntro, cloudBackupPath } = useSettingsStore();
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  useEffect(() => {
    const unsub = window.api?.on?.cloudSyncComplete?.((data) => {
      useToastStore.getState().success(`Cloud Backup: Auto-synced Slot ${data.savegameIndex} to cloud!`);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const {
    archives, isLoading: isArchivesLoading, fetchArchives, deleteArchive, archiveSavegame, restoreSavegame
  } = useArchiveStore();

  const [updatingMod, setUpdatingMod] = useState(null);
  const [autoResolveMode, setAutoResolveMode] = useState(false);
  const [createActiveTab, setCreateActiveTab] = useState('basic');
    const [createBrandFilter, setCreateBrandFilter] = useState('');
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
  const [createMap, setCreateMap] = useState('MapUS|Riverbend Springs|||');
  const [createDifficulty, setCreateDifficulty] = useState(1);
  const [createEconomy, setCreateEconomy] = useState('NORMAL');
  const [createMoney, setCreateMoney] = useState(1000000);
  const [createLoan, setCreateLoan] = useState(0);
  const [createSeasonLength, setCreateSeasonLength] = useState(1);
  const [createTimeScale, setCreateTimeScale] = useState(1.0);
  const [missingDeps, setMissingDeps] = useState(null);
  const [createStartMonth, setCreateStartMonth] = useState('DEFAULT');
  const [createStartTime, setCreateStartTime] = useState('DEFAULT');
  const [createStartWeather, setCreateStartWeather] = useState('DEFAULT');
  const [autoLaunchOnCreate, setAutoLaunchOnCreate] = useState(false);
  const [createMode, setCreateMode] = useState('NEW_FARMER');
  const [includeStartFarm, setIncludeStartFarm] = useState(true);
  const [includeStartVehicles, setIncludeStartVehicles] = useState(true);
  const [mapHasTemplate, setMapHasTemplate] = useState(false);
  const [selectedSaves, setSelectedSaves] = useState(new Set());
  const [includeMustHaves, setIncludeMustHaves] = useState(true);
  const [localMissingDeps, setLocalMissingDeps] = useState([]);
    
    const availableCreateBrands = React.useMemo(() => {
        const brands = new Set();
        const modCache = useModHubStore.getState().modCache || {};
        const hardcoded = useModHubStore.getState().hardcodedBrands || [];
        (mods || []).forEach(m => {
            let b = null;
            if (m.modId && modCache[m.modId]?.brand) b = modCache[m.modId].brand;
            if (!b) {
                for (const hb of hardcoded) {
                    if (m.title && m.title.toLowerCase().includes(hb.toLowerCase())) {
                        b = hb;
                        break;
                    }
                }
            }
            if (b) brands.add(b);
        });
        return Array.from(brands).sort();
    }, [mods]);
  
    const activeModalConflicts = getActiveConflictsForSave(modalSelectedMods, useLocalModsStore.getState().conflicts);
  // Savegame Editor state
  const [showEditor, setShowEditor] = useState(null); // Save object
  const [showAudit, setShowAudit] = useState(null); // Save object
  const [serverExportSave, setServerExportSave] = useState(null); // Save object for export modal
  const [saveFilter, setSaveFilter] = useState('all'); // 'all' | 'single' | 'multiplayer'
  const [showRollback, setShowRollback] = useState(null); // Save object
  const [engineBackups, setEngineBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const handleModeChange = (mode) => {
    setCreateMode(mode);
    if (mode === 'NEW_FARMER') {
      setCreateMoney(100000);
      setCreateLoan(0);
      setCreateEconomy('EASY');
      setCreateDifficulty(1);
      setIncludeStartFarm(true);
      setIncludeStartVehicles(true);
    } else if (mode === 'FARM_MANAGER') {
      setCreateMoney(1500000);
      setCreateLoan(0);
      setCreateEconomy('NORMAL');
      setCreateDifficulty(2);
      setIncludeStartFarm(false);
      setIncludeStartVehicles(false);
    } else if (mode === 'START_FROM_SCRATCH') {
      setCreateMoney(500000);
      setCreateLoan(0);
      setCreateEconomy('HARD');
      setCreateDifficulty(3);
      setIncludeStartFarm(false);
      setIncludeStartVehicles(false);
    }
  };

  const { profiles, fetchProfiles } = useProfileStore();

  useEffect(() => {
    fetchSavegames();
    fetchProfiles();
    fetchArchives();
  }, []);

  useEffect(() => {
    (async () => {
      // Check if the selected map has a master template whenever it changes
      const [mapId, title, modName] = createMap.split('|');
      setMissingDeps(null); // Reset missing deps
      setModalSelectedMods(new Set()); // Reset selected mods to prevent accumulation from previous map selections
      setLocalMissingDeps([]); // Clear previous missing deps
      setMapHasTemplate(false); // Clear automation badge immediately while checking template
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

        // Auto-select required mods for custom modded maps (skip official DLCs like pdlc_highlandsFishingPack)
        const cleanMapModName = (modName || '').split('.')[0];
        if (cleanMapModName && !cleanMapModName.toLowerCase().startsWith('pdlc_') && !['mapus', 'mapeu', 'mapas', 'highlandsfishingmap'].includes(cleanMapModName.toLowerCase())) {
          try {
            console.log(`[CAREER MODAL] Resolving dependencies for map: ${cleanMapModName}. Total mods available: ${mods ? mods.length : 0}`);
            const cLow = cleanMapModName.toLowerCase();
            const birglandMod = mods ? mods.find(m => 
              m.isMap && (
                (m.modName && (m.modName.toLowerCase() === cLow || m.modName.toLowerCase().split('.')[0] === cLow)) ||
                (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === cLow) ||
                (m.title && (title && m.title.toLowerCase() === title.toLowerCase()))
              )
            ) || mods.find(m => m.modName && (m.modName.toLowerCase() === cLow || m.modName.toLowerCase().split('.')[0] === cLow)) : null;

            if (birglandMod) {
              console.log(`[CAREER MODAL] Found map mod object:`, JSON.stringify({
                  modName: birglandMod.modName,
                  isMap: birglandMod.isMap,
                  dependenciesCount: birglandMod.dependencies ? birglandMod.dependencies.length : 0,
                  dependencies: birglandMod.dependencies
              }));
            } else {
              console.log(`[CAREER MODAL] Map mod '${cleanMapModName}' not found in mods array, resolving by name fallback.`);
            }

            let targetForDeps = birglandMod || cleanMapModName;
            if (birglandMod && (!birglandMod.dependencies || birglandMod.dependencies.length === 0) && birglandMod.modId && window.api?.modhub?.fetchModDetail) {
              try {
                const detail = await window.api.modhub.fetchModDetail({ modId: birglandMod.modId });
                if (detail && detail.dependencies && Array.isArray(detail.dependencies) && detail.dependencies.length > 0) {
                  targetForDeps = { ...birglandMod, dependencies: detail.dependencies };
                }
              } catch (dErr) {
                console.warn('[CAREER MODAL] Could not fetch ModHub dependencies for map:', dErr.message);
              }
            }

            const { installed, missing } = resolveRecursiveDependencies(targetForDeps, mods);
            const installedList = Array.isArray(installed) ? installed : Array.from(installed || []);
            const missingList = Array.isArray(missing) ? missing : Array.from(missing || []);
            
            const hasSubfolderSiblings = birglandMod && birglandMod.folder && birglandMod.folder !== '' && birglandMod.folder !== 'mods';
            
            setModalSelectedMods(prev => {
              const next = new Set(prev);
              // Always ensure the map mod itself is in modalSelectedMods
              if (birglandMod && birglandMod.modName) {
                next.add(birglandMod.modName);
              } else if (cleanMapModName) {
                next.add(cleanMapModName);
              }

              installedList.forEach(d => {
                if (d) {
                  const matchedModObj = mods ? mods.find(m => (m.modName || '').toLowerCase() === d.toLowerCase() || (m.fileName || '').replace(/\.zip$/i, '').toLowerCase() === d.toLowerCase()) : null;
                  next.add(matchedModObj ? matchedModObj.modName : d);
                }
              });

              // Also auto-select non-map sibling mods from the map's dedicated subfolder
              if (hasSubfolderSiblings) {
                const fLow = birglandMod.folder.toLowerCase();
                const sibs = (mods || []).filter(m => m.folder && m.folder.toLowerCase() === fLow && !m.isMap && m.modName);
                sibs.forEach(s => {
                  if (s.modName) next.add(s.modName);
                });
              }

              return next;
            });

            if (missingList.length > 0) {
              console.log(`[CAREER MODAL] Missing dependencies detected:`, missingList);
              setLocalMissingDeps(missingList);
            }
          } catch (e) {
            console.error('[CAREER MODAL] Dependency auto-select failed:', e);
          }
        }
      }
    })();
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
    // Optimistically mark the slot as active and notify immediately so the user knows it's launching
    const numericSlot = parseInt(slotIndex, 10);
    useSavegameStore.setState({ isGameRunning: true, playingSlot: numericSlot, launchGraceUntil: Date.now() + 25000 });
    useSettingsStore.getState().setSavegameSlot(numericSlot);
    useToastStore.getState().info(`Preparing & Launching Slot ${slotIndex}...`);

    // Re-apply spawn position right before launch so game always reads the latest choice
    try {
      const fs25Root = await window.api.savegames.getAll().then(saves => saves).catch(() => null);
      const savePath = (() => {
        const allSaves = useSavegameStore.getState().savegames;
        const s = allSaves.find(sg => sg.index === slotIndex);
        return s?.path;
      })();
      if (savePath) {
        const spawnPref = (() => { try { return JSON.parse(localStorage.getItem(`selected_spawn_${savePath}`) || '{}'); } catch { return {}; } })();
        if (spawnPref.mode === 'custom') {
          const coords = await window.api.savegames.getStoreDeliveryCoordinates(savePath);
          if (coords) await window.api.savegames.setPlayerPosition({ savePath, x: coords.x, y: coords.y, z: coords.z });
        } else if (spawnPref.mode === 'shop') {
          const coords = await window.api.savegames.getMapShopCoordinates(savePath);
          if (coords) await window.api.savegames.setPlayerPosition({ savePath, x: coords.x, y: coords.y, z: coords.z });
        } else if (spawnPref.mode === 'vehicle' && spawnPref.vehicleId) {
          await window.api.savegames.setPlayerPosition({ savePath, vehicleUniqueId: spawnPref.vehicleId });
        } else {
          // No preset selected: ensure save has the map's native start point if currently unspawned
          const curPos = await window.api.savegames.getPlayerPosition(savePath);
          if (!curPos || (curPos.x === 0 && curPos.y === 0 && curPos.z === 0)) {
            const defCoords = await window.api.savegames.getMapHomeCoordinates(savePath);
            if (defCoords && defCoords.x !== undefined) {
              await window.api.savegames.setPlayerPosition({ savePath, x: defCoords.x, y: defCoords.y, z: defCoords.z });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[LAUNCH] Could not re-apply spawn position:', e);
    }

    const allSaves = useSavegameStore.getState().savegames;
    const saveToLaunch = allSaves.find(sg => sg.index === slotIndex);

    // Strict Multiplayer Server Mod Version Audit & Guard
    if (saveToLaunch && saveToLaunch.isServerSave) {
      try {
        const serverPrep = await window.api.savegames.prepareServerModsFolder({ slotIndex, savePath: saveToLaunch.path });
        if (serverPrep && serverPrep.stats && (serverPrep.stats.mismatchedCount > 0 || serverPrep.stats.missingCount > 0)) {
          useSavegameStore.setState({ isGameRunning: false, playingSlot: null, launchGraceUntil: 0 });
          useToastStore.getState().warning(`Cannot launch server save: ${serverPrep.stats.mismatchedCount} mod version mismatch(es) and ${serverPrep.stats.missingCount} missing mod(s). Mod audit required.`);
          setShowAudit(saveToLaunch);
          return; // Abort launch!
        }
      } catch (err) {
        console.error('[LAUNCH-GUARD] Failed to verify server mods:', err);
      }
    }

    const { conflictSensitivity } = useSettingsStore.getState();
    if (conflictSensitivity !== 'off') {
      if (saveToLaunch && saveToLaunch.mods) {
        const allConflicts = useLocalModsStore.getState().conflicts;
        const activeConflictsMap = getActiveConflictsForSave(saveToLaunch.mods, allConflicts);
        
        if (activeConflictsMap.size > 0) {
          if (conflictSensitivity === 'resolve') {
            useSavegameStore.setState({ isGameRunning: false, playingSlot: null, launchGraceUntil: 0 });
            setPendingLaunchSlot(slotIndex);
            setLaunchExtraOptions(extraOptions);
            setConflictResolutionData({
                savePath: saveToLaunch.path,
                mods: saveToLaunch.mods,
                activeConflictsMap,
                action: 'launch'
            });
            return;
          } else if (conflictSensitivity === 'warn' || conflictSensitivity === 'resolve') {
            useSavegameStore.setState({ isGameRunning: false, playingSlot: null, launchGraceUntil: 0 });
            import('../store/useToastStore').then(module => module.useToastStore.getState().error(`Launch prevented: Found ${activeConflictsMap.size} active script conflicts.`));
            return; // ABORT LAUNCH
          }
        }
      }
    }

    const result = await window.api.game.launch({ 
        savegameIndex: slotIndex,
        skipIntro: skipIntro !== false,
        autoStart: true,
        ...extraOptions
    });
    
    if (result.success) {
      if (result.needsManualInit) {
        useToastStore.getState().info(`GHOST SLOT: Slot ${slotIndex} is preparing for first-time load. Once the map loads, SAVE ONCE in-game to initialize.`, 20000);
      } else {
        useToastStore.getState().success(`Game launched into Slot ${slotIndex}!`);
      }
    } else {
      // Launch failed — revert the optimistic state so the UI doesn't appear stuck
      useSavegameStore.setState({ isGameRunning: false, playingSlot: null, launchGraceUntil: 0 });
      useSettingsStore.getState().setSavegameSlot(null);
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

  const handleExportSave = (save) => {
    setServerExportSave(save);
  };

  const handleToggleServerMode = async (targetSave, enableServerMode, options = {}) => {
    if (!window.api?.savegames?.toggleServerMode || !targetSave) return;
    let savePath = targetSave.path;
    if (!savePath && targetSave.index) {
      // Fallback path resolution if targetSave.path is missing
      const allSaves = useSavegameStore.getState().savegames;
      const match = allSaves.find(s => s.index === targetSave.index);
      savePath = match?.path;
    }
    if (!savePath && targetSave.folderName) {
      const fs25Path = await window.api.savegames.getFs25Path?.().catch(() => null);
      if (fs25Path) savePath = `${fs25Path}/${targetSave.folderName}`;
    }
    if (!savePath) {
      useToastStore.getState().error('Could not locate save folder path.');
      return;
    }
    try {
      const res = await window.api.savegames.toggleServerMode({
        savePath,
        enableServerMode,
        options
      });
      if (res && res.success) {
        useToastStore.getState().success(
          enableServerMode 
            ? `Converted Slot ${targetSave.index} to Multiplayer Server Mode` 
            : `Converted Slot ${targetSave.index} to Single Player Mode`
        );
        await fetchSavegames();
        if (showEditor && showEditor.index === targetSave.index) {
          setShowEditor(prev => prev ? {
            ...prev,
            isServerSave: enableServerMode,
            isEditorLocked: enableServerMode ? (res.serverMeta?.accessLevel === 'player') : false,
            serverAccessLevel: enableServerMode ? (res.serverMeta?.accessLevel || 'player') : null
          } : null);
        }
      } else {
        useToastStore.getState().error(res?.error || 'Failed to toggle mode');
      }
    } catch (err) {
      useToastStore.getState().error(err.message);
    }
  };

  const handleManualCloudSync = async () => {
    let targetPath = cloudBackupPath;
    if (!targetPath) {
      const selected = await window.api.dialog.selectFolder();
      if (!selected) return;
      await useSettingsStore.getState().setCloudBackupPath(selected);
      targetPath = selected;
    }
    setIsCloudSyncing(true);
    try {
      const activeSaves = allSlots.filter(s => !s.isGhost && !s.isEmpty && s.path);
      if (activeSaves.length === 0) {
        useToastStore.getState().info("No active savegames to sync.");
        setIsCloudSyncing(false);
        return;
      }
      useToastStore.getState().info(`Syncing ${activeSaves.length} savegame(s) to backup folder...`);
      let syncedCount = 0;
      for (const save of activeSaves) {
        const res = await window.api.savegames.syncToCloud({ savePath: save.path, cloudPath: targetPath });
        if (res.success) syncedCount++;
      }
      useToastStore.getState().success(`Backup complete: ${syncedCount} of ${activeSaves.length} save(s) backed up to ${targetPath}`);
    } catch (err) {
      useToastStore.getState().error(`Backup error: ${err.message}`);
    } finally {
      setIsCloudSyncing(false);
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
    setCreateStartMonth('DEFAULT');
    setCreateStartTime('DEFAULT');
    setCreateStartWeather('DEFAULT');
    
    // Reset map to default so the useEffect always re-fires when user picks a map
    setCreateMap('MapUS|Riverbend Springs|||');
    setModalSelectedMods(new Set());
    setShowCreateModal(true);
  };

  const openRollback = async (save) => {
    setShowRollback(save);
    setLoadingBackups(true);
    const result = await window.api.savegames.getEngineBackups({ slotIndex: save.index });
    setEngineBackups(result.backups || []);
    setLoadingBackups(false);
  };

  const handleEngineRollback = async (backupFolderName) => {
    const save = showRollback;
    if (window.confirm(`WARNING: This will permanently overwrite Slot ${save.index} with this backup. Are you sure?`)) {
        useToastStore.getState().info('Restoring backup...');
        const result = await window.api.savegames.restoreEngineBackup({ 
            slotIndex: save.index, 
            backupFolderName 
        });
        if (result.success) {
            useToastStore.getState().success(`Slot ${save.index} restored successfully!`);
            setShowRollback(null);
            fetchSavegames();
        } else {
            useToastStore.getState().error('Failed to restore backup: ' + result.error);
        }
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    if (localMissingDeps && localMissingDeps.length > 0) {
      setMissingDeps(localMissingDeps);
      useToastStore.getState().warning("Please download the required dependencies for this map first.");
      return;
    }
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
          .filter(m => !m.isMap && favoriteMods.some(fm => fm.isMustHave && ((fm.modId && m.modId && String(fm.modId) === String(m.modId)) || (fm.fileName && fm.fileName.toLowerCase() === (m.fileName ? m.fileName.split(/[\\/\\]/).pop().toLowerCase() : (m.modName ? `${m.modName.toLowerCase()}.zip` : ""))))))
          .forEach(m => finalModNames.add(m.modName));
      }

      // Safety net: always resolve map dependencies for custom maps even if UI missed them
      const [mapIdForDeps, mapTitleForDeps, mapModForDeps] = createMap.split('|');
      const cleanMapForDeps = (mapModForDeps || '').split('.')[0];
      if (cleanMapForDeps && !cleanMapForDeps.toLowerCase().startsWith('pdlc_') && !['mapus', 'mapeu', 'mapas', 'highlandsfishingmap'].includes(cleanMapForDeps.toLowerCase())) {
        try {
          const cLow = cleanMapForDeps.toLowerCase();
          console.log(`[CREATE-SAFETY] Resolving dependencies for ${cleanMapForDeps}. Total mods: ${mods ? mods.length : 0}`);
          const mapObj = mods ? mods.find(m => 
            m.isMap && (
              (m.modName && (m.modName.toLowerCase() === cLow || m.modName.toLowerCase().split('.')[0] === cLow)) ||
              (m.fileName && m.fileName.replace(/\.zip$/i, '').toLowerCase() === cLow) ||
              (m.title && (mapTitleForDeps && m.title.toLowerCase() === mapTitleForDeps.toLowerCase()))
            )
          ) || mods.find(m => m.modName && m.modName.toLowerCase() === cLow) : null;

          if (mapObj && mapObj.modName) {
            finalModNames.add(mapObj.modName);
          } else {
            finalModNames.add(cleanMapForDeps);
          }

          let targetForDeps = mapObj || cleanMapForDeps;
          if (mapObj && (!mapObj.dependencies || mapObj.dependencies.length === 0) && mapObj.modId && window.api?.modhub?.fetchModDetail) {
            try {
              const detail = await window.api.modhub.fetchModDetail({ modId: mapObj.modId });
              if (detail && detail.dependencies && Array.isArray(detail.dependencies) && detail.dependencies.length > 0) {
                targetForDeps = { ...mapObj, dependencies: detail.dependencies };
              }
            } catch (_) {}
          }

          const resolvedMetadata = {};
          if (targetForDeps && typeof targetForDeps === 'object' && targetForDeps.dependencies && window.api?.modhub?.fetchModDetail) {
            for (const dep of targetForDeps.dependencies) {
              if (typeof dep === 'object' && dep.url) {
                const idMatch = dep.url.match(/mod_id=(\d+)/i) || dep.url.match(/storage\/(\d+)\//i);
                if (idMatch && idMatch[1]) {
                  const depId = idMatch[1].replace(/^0+/, '');
                  try {
                    const detail = await window.api.modhub.fetchModDetail({ modId: depId });
                    if (detail) {
                      const zipName = detail.fileName || (detail.downloadUrl ? detail.downloadUrl.split('/').pop() : null);
                      if (zipName) {
                        const metaObj = { modId: depId, fileName: zipName.replace(/\.zip$/i, '').toLowerCase(), title: detail.title };
                        resolvedMetadata[depId] = metaObj;
                        if (dep.title) resolvedMetadata[dep.title] = metaObj;
                        if (dep.url) resolvedMetadata[dep.url] = metaObj;
                      }
                    }
                  } catch (_) {}
                }
              }
            }
          }

          const { installed } = resolveRecursiveDependencies(targetForDeps, mods, {}, resolvedMetadata);
          const installedList = Array.isArray(installed) ? installed : Array.from(installed || []);
          installedList.forEach(d => {
            const matchedModObj = mods ? mods.find(m => matchModWithDependency(m, d, resolvedMetadata)) : null;
            if (matchedModObj && matchedModObj.modName) {
              finalModNames.add(matchedModObj.modName);
            } else {
              finalModNames.add(typeof d === 'string' ? d : (d.modName || d.fileName || d.title || ''));
            }
          });
          console.log(`[CREATE] Safety net resolved ${installedList.length} map dependencies:`, installedList);

          // Auto-include all mods from "Map Dependencies" folder and dedicated subfolders
          const mapDepMods = (mods || []).filter(m => !m.isMap && m.folder && (m.folder.toLowerCase() === 'map dependencies' || (mapObj && mapObj.folder && m.folder.toLowerCase() === mapObj.folder.toLowerCase() && m.folder.toLowerCase() !== 'mods')));
          mapDepMods.forEach(s => {
            if (s.modName) finalModNames.add(s.modName);
          });
          console.log(`[CREATE] Auto-included ${mapDepMods.length} map dependency mods from dedicated folders.`);
        } catch (e) {
          console.error('[CREATE] Safety net dependency resolution failed:', e);
        }
      }

      // Case-insensitive lookup set for modsToAdd filtering
      const selectedLower = new Set(Array.from(finalModNames).map(s => String(s).toLowerCase()));
      const modsToAdd = (mods || []).filter(m => {
        if (!m || !m.modName) return false;
        const mNameLow = m.modName.toLowerCase();
        const fNameLow = (m.fileName || '').replace(/\.zip$/i, '').toLowerCase();
        if (selectedLower.has(mNameLow) || selectedLower.has(fNameLow)) return true;
        for (const fn of finalModNames) {
          if (matchModWithDependency(m, fn)) return true;
        }
        return false;
      });
      const [mapId, mapTitle, mapModName, , filePath] = createMap.split('|');
      
      // Confirm overwrite if manually selected an occupied slot
      if (createSlot !== 'auto') {
        const existing = savegames.find(s => s.index === slotIndex && (s.modCount > 0 || s.farmName !== s.folderName));
        if (existing && !window.confirm(`Slot ${slotIndex} is occupied by "${existing.farmName}". Overwrite?`)) {
          return;
        }
      }

      // Clear any previous spawn preset on this slot so fresh save uses map's native start point
      try {
        const slotSave = savegames.find(s => s.index === slotIndex);
        if (slotSave?.path) {
          localStorage.removeItem(`selected_spawn_${slotSave.path}`);
        }
      } catch (e) {}

      const result = await window.api.savegames.create({
        savegameIndex: slotIndex,
        savegameName: createName.trim(),
        selectedMods: modsToAdd,
        mapId: mapId,
        mapTitle: mapTitle,
        mapModName: mapModName,
        mapFilePath: filePath || null,
        difficulty: createDifficulty,
        economicDifficulty: createEconomy,
        initialMoney: createMoney,
        initialLoan: createLoan,
        fixedSeasonLength: createSeasonLength,
        timeScale: createTimeScale,
        startMonth: createStartMonth,
        startTime: createStartTime,
        startWeather: createStartWeather,
        includeStartFarm: includeStartFarm,
        includeStartVehicles: includeStartVehicles
      });

      if (result.success) {
        if (result.path) {
          try { localStorage.removeItem(`selected_spawn_${result.path}`); } catch (e) {}
        }
        if (result.requiresEngineInit) {
          useToastStore.getState().success(`Map needs engine initialization. Launching Slot ${slotIndex} to build world...`);
          setShowCreateModal(false);
          
          // Wait a moment for the user to read the toast
          if (true) {
              setTimeout(() => {
                handleLaunch(slotIndex, { 
                    requiresEngineInit: true, 
                    mapId: result.mapId 
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
          if (autoLaunchOnCreate) {
              setTimeout(() => {
                handleLaunch(slotIndex);
              }, 1500);
          }
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
    if (p) {
        const next = new Set((p.mods || []).map(m => m.modName));
        const { conflictSensitivity } = useSettingsStore.getState();
        if (conflictSensitivity !== 'off') {
            const allConflicts = useLocalModsStore.getState().conflicts;
            const activeMap = getActiveConflictsForSave(next, allConflicts);
            if (activeMap.size > 0) {
                if (conflictSensitivity === 'auto-disable_REMOVED') {
                    activeMap.forEach((_, modName) => next.delete(Array.from(next).find(m => m.toLowerCase() === modName) || modName));
                    import('../store/useToastStore').then(m => m.useToastStore.getState().info(`Auto-disabled  conflicting mods from profile.`));
                } else if (conflictSensitivity === 'warn' || conflictSensitivity === 'resolve') {
                    import('../store/useToastStore').then(m => m.useToastStore.getState().warning(`Warning: Profile contains script conflicts.`));
                }
            }
        }
        setModalSelectedMods(next);
    }
};

  const allSlots = [...Array(20)].map((_, i) => {
      const idx = i + 1;
      return savegames.find(s => s.index === idx) || { index: idx, folderName: `savegame${idx}`, farmName: `Empty Slot ${idx}`, modCount: 0, isEmpty: true };
  });

  const displayedSlots = React.useMemo(() => {
    if (saveFilter === 'all') return allSlots;
    if (saveFilter === 'single') return allSlots.filter(s => !s.isServerSave && !s.isEmpty);
    if (saveFilter === 'multiplayer') return allSlots.filter(s => s.isServerSave);
    return allSlots;
  }, [allSlots, saveFilter]);

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

          <button 
            className="btn btn--secondary btn--sm" 
            onClick={handleManualCloudSync} 
            disabled={isCloudSyncing}
            title={cloudBackupPath ? `Backup Folder: ${cloudBackupPath}. Click to sync all active saves now.` : "Click to select a Backup Folder and sync saves."}
          >
            <Cloud size={14} /> 
            {isCloudSyncing ? 'Syncing...' : 'Backup Sync'}
          </button>
          <button className="btn btn--secondary btn--sm" onClick={() => navigate('/save-transfer')} title="Transfer data between saves">
            <ArrowRightLeft size={14} /> Save Transfer
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => openCreateModal()}><Plus size={14} /> New Career</button>
          <button className={`btn btn--${isArchivePanelOpen ? 'accent' : 'secondary'} btn--sm`} onClick={() => setIsArchivePanelOpen(true)}>
            <Archive size={14} /> Archive {archives.length > 0 && `(${archives.length})`}
          </button>
        </div>
      </div>

      {/* Top Filter Tabs: Option 1 (All Saves | Single Player | Multiplayer Servers) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-secondary)', padding: '4px', borderRadius: 10, border: '1px solid var(--border)' }}>
          <button 
            className={`btn btn--xs ${saveFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setSaveFilter('all')}
            style={{ fontWeight: 700, padding: '6px 14px' }}
          >
            All Saves ({allSlots.length})
          </button>
          <button 
            className={`btn btn--xs ${saveFilter === 'single' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setSaveFilter('single')}
            style={{ fontWeight: 700, padding: '6px 14px' }}
          >
            Single Player ({allSlots.filter(s => !s.isServerSave && !s.isEmpty).length})
          </button>
          <button 
            className={`btn btn--xs ${saveFilter === 'multiplayer' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setSaveFilter('multiplayer')}
            style={{ 
              fontWeight: 700, 
              padding: '6px 14px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              ...(saveFilter === 'multiplayer' ? { background: '#06b6d4', borderColor: '#0891b2', color: '#ffffff' } : {}) 
            }}
          >
            <Server size={13} /> Multiplayer Servers ({allSlots.filter(s => s.isServerSave).length})
          </button>
        </div>

        {saveFilter === 'multiplayer' && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} />
            Dedicated Server Isolation &bull; Single Player Saves Auto-Quarantined In-Game
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 'var(--sp-4)', paddingBottom: 'var(--sp-8)' }}>
        {displayedSlots.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '48px 24px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 16, border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Server size={40} style={{ color: 'var(--text-tertiary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {saveFilter === 'multiplayer' ? 'No Multiplayer Server Saves' : 'No Single Player Saves'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, margin: 0, lineHeight: 1.5 }}>
              {saveFilter === 'multiplayer' 
                ? 'No multiplayer server saves found. You can export any existing career as a server package with admin or player rights, or drag-and-drop a server save ZIP onto any slot.'
                : 'No active single player careers found. Click "New Career" to start one or switch to "All Saves".'}
            </p>
            <button className="btn btn--secondary btn--sm" onClick={() => setSaveFilter('all')} style={{ marginTop: 8 }}>
              View All Saves
            </button>
          </div>
        ) : (
          displayedSlots.map(save => (
            <SaveSlotCard 
                key={save.index}
                save={save}
                onPlay={() => handleLaunch(save.index)}
                onExport={() => handleExportSave(save)}
                onToggleMode={() => handleToggleServerMode(save, !save.isServerSave)}
                onArchive={() => handleArchive(save)}
                onRollback={() => openRollback(save)}
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
                isPlaying={isGameRunning && Number(playingSlot) === Number(save.index)}
                isGameRunning={isGameRunning}
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
          ))
        )}
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
                            <button className="btn btn--ghost btn--sm" style={{ color: 'var(--accent)', padding: '6px' }} onClick={() => handleExportSave(archive)} title="Export Archive (ZIP)">
                                <Share2 size={14} />
                            </button>
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
                                    <MapSelectDropdown 
                                        value={createMap} 
                                        onChange={val => setCreateMap(val)} 
                                        mods={mods} 
                                        mapHasTemplate={mapHasTemplate} 
                                    />
                                    
                                    {localMissingDeps.length > 0 && (
                                        <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, color: '#f87171', fontSize: 13 }} className="animate-fade-in">
                                            <div style={{ fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AlertTriangle size={14} style={{ color: '#ef4444' }} /> MISSING DEPENDENCIES ({localMissingDeps.length})
                                                </div>
                                                <button 
                                                    className="btn btn--xs btn--primary"
                                                    style={{ background: '#ef4444', color: '#fff', border: 'none', fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                                    onClick={() => setMissingDeps(localMissingDeps)}
                                                >
                                                    <Download size={12} /> Download Required Mods
                                                </button>
                                            </div>
                                            <div style={{ opacity: 0.9, fontSize: 12, lineHeight: 1.5 }}>
                                                This map requires the following mods which are not installed:
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', marginTop: 6, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {localMissingDeps.map(dep => (
                                                        <span key={dep} style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }}>
                                                            {dep}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <label style={{ fontSize: 12, fontWeight: 800, display: 'block', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>MAP PREVIEW</label>
                                <div style={{ flex: 1, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', position: 'relative', boxShadow: 'var(--shadow-lg)' }}>
                                     {(() => {
                                         const [mapId, title, modName, iconData, filePath] = createMap.split('|');
                                         if (iconData || filePath) {
                                             if (iconData && !iconData.startsWith('CATEGORY:')) {
                                                 return <img src={iconData} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
                                             }
                                             if (filePath) {
                                                 return <img src={`mod-icon://icon?path=${encodeURIComponent(filePath)}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
                                             }
                                         }
                                         return <MapImage mapTitle={title} mapId={mapId} mods={mods} />;
                                     })()}
                                     <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', color: 'white' }}>
                                         <div style={{ fontWeight: 800, fontSize: 18 }}>
                                             {(() => {
                                                 const [, title, modName] = createMap.split('|');
                                                 const mapMod = mods.find(m => m.modName === modName || m.title === title);
                                                 const isCP = mapMod && (
                                                     mapMod.isCrossplay || 
                                                     /crossplay|\(cp\)|\[cp\]/i.test(mapMod.title || '') ||
                                                     /crossplay|\(cp\)|\[cp\]/i.test(mapMod.modName || '') ||
                                                     /crossplay|\(cp\)|\[cp\]/i.test(mapMod.fileName || '') ||
                                                     /crossplay|\(cp\)|\[cp\]/i.test(mapMod.filePath || '') ||
                                                     /crossplay|\(cp\)|\[cp\]/i.test(mapMod.folder || '')
                                                 );
                                                  if (isCP && title) {
                                                      let baseTitle = title.replace(/\s*[\(\[]\s*(?:crossplay|cp)\s*[\)\]]\s*$/i, '')
                                                                           .replace(/\s+crossplay\s*$/i, '')
                                                                           .replace(/\s+cp\s*$/i, '')
                                                                           .trim();
                                                      return `${baseTitle} (CP)`;
                                                  }
                                                  return title;
                                             })()}
                                         </div>
                                         <div style={{ fontSize: 12, opacity: 0.8 }}>{createMap.split('|')[0]}</div>
                                     </div>
                                 </div>
                            </div>
                        </div>
                    )}

                    {createActiveTab === 'rules' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {!mapHasTemplate && (
                                <div className="animate-pulse-subtle" style={{ padding: '16px 20px', background: 'rgba(var(--accent-rgb), 0.08)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--accent-dim)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent)', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                                        <Zap size={18} /> INITIAL MAP HARVEST MODE
                                    </div>
                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                        Money, Difficulty, Farmlands, and Equipment can be customized below! <strong>Start Month & Weather are set to Map Default</strong> for this first launch so the game engine generates all native crops on fields.
                                    </p>
                                </div>
                            )}

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

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>STARTING MONTH</label>
                                    <select 
                                        value={mapHasTemplate ? createStartMonth : 'DEFAULT'} 
                                        onChange={e => setCreateStartMonth(e.target.value)} 
                                        disabled={!mapHasTemplate}
                                        style={{ width: '100%', padding: '14px', fontSize: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, opacity: !mapHasTemplate ? 0.6 : 1 }}
                                    >
                                        <option value="DEFAULT">Map Default (Native Season)</option>
                                        <option value="1">March (Spring)</option>
                                        <option value="2">April (Spring)</option>
                                        <option value="3">May (Spring)</option>
                                        <option value="4">June (Summer)</option>
                                        <option value="5">July (Summer)</option>
                                        <option value="6">August (Summer)</option>
                                        <option value="7">September (Autumn)</option>
                                        <option value="8">October (Autumn)</option>
                                        <option value="9">November (Autumn)</option>
                                        <option value="10">December (Winter)</option>
                                        <option value="11">January (Winter)</option>
                                        <option value="12">February (Winter)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>STARTING TIME</label>
                                    <select value={createStartTime} onChange={e => setCreateStartTime(e.target.value)} style={{ width: '100%', padding: '14px', fontSize: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                        <option value="DEFAULT">Map Default (08:00 AM)</option>
                                        <option value="06:00">06:00 AM (Dawn)</option>
                                        <option value="07:00">07:00 AM (Sunrise)</option>
                                        <option value="08:00">08:00 AM (Morning)</option>
                                        <option value="09:00">09:00 AM</option>
                                        <option value="10:00">10:00 AM</option>
                                        <option value="12:00">12:00 PM (Noon)</option>
                                        <option value="14:00">02:00 PM (Afternoon)</option>
                                        <option value="18:00">06:00 PM (Evening)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>STARTING WEATHER</label>
                                    <select 
                                        value={mapHasTemplate ? createStartWeather : 'DEFAULT'} 
                                        onChange={e => setCreateStartWeather(e.target.value)} 
                                        disabled={!mapHasTemplate}
                                        style={{ width: '100%', padding: '14px', fontSize: 14, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, opacity: !mapHasTemplate ? 0.6 : 1 }}
                                    >
                                        <option value="DEFAULT">Map Default</option>
                                        <option value="SUN">Clear / Sunny</option>
                                        <option value="CLOUDY">Cloudy / Overcast</option>
                                        <option value="RAIN">Rain</option>
                                    </select>
                                </div>
                            </div>

                            {/* Dual Starting Farm Toggles */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: 16, border: includeStartFarm ? '1px solid var(--accent)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: includeStartFarm ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: includeStartFarm ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                                        <MapPin size={22} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800, fontSize: 15 }}>Starting Farmlands & Fields</div>
                                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Owns default map fields automatically.</div>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        checked={includeStartFarm} 
                                        onChange={e => setIncludeStartFarm(e.target.checked)}
                                        style={{ width: 24, height: 24, cursor: 'pointer', accentColor: 'var(--accent)' }}
                                    />
                                </div>

                                <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: 16, border: includeStartVehicles ? '1px solid var(--accent)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: includeStartVehicles ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: includeStartVehicles ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                                        <Tractor size={22} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800, fontSize: 15 }}>Starting Vehicles & Equipment</div>
                                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Spawns default starting tractors & machinery.</div>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        checked={includeStartVehicles} 
                                        onChange={e => setIncludeStartVehicles(e.target.checked)}
                                        style={{ width: 24, height: 24, cursor: 'pointer', accentColor: 'var(--accent)' }}
                                    />
                                </div>
                            </div>

                            <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                    <Zap size={22} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 800, fontSize: 15 }}>Auto-launch to initialize map</div>
                                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Modded maps require one launch to build the world files. We'll handle this automatically.</div>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={autoLaunchOnCreate} 
                                    onChange={e => setAutoLaunchOnCreate(e.target.checked)}
                                    style={{ width: 24, height: 24, cursor: 'pointer', accentColor: 'var(--accent)' }}
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
                                        Include Must-Haves ({mods.filter(m => !m.isMap && (useModHubStore.getState().favoriteMods || []).some(fm => fm.isMustHave && ((fm.modId && m.modId && String(fm.modId) === String(m.modId)) || (fm.fileName && fm.fileName.toLowerCase() === (m.fileName ? m.fileName.split(/[\\/\\]/).pop().toLowerCase() : (m.modName ? `${m.modName.toLowerCase()}.zip` : '')))))).length})
                                    </label>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {profiles.length > 0 && (
                                        <select onChange={e => applyProfileToModal(e.target.value)} defaultValue="" style={{ fontSize: 13, padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                            <option value="" disabled>Apply Profile...</option>
                                            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    )}
                                    <button className="btn btn--secondary btn--sm" onClick={() => {
    const next = new Set(mods.filter(m => !m.isMap).map(m => m.modName));
    const { conflictSensitivity } = useSettingsStore.getState();
    if (conflictSensitivity !== 'off') {
        const allConflicts = useLocalModsStore.getState().conflicts;
        const activeMap = getActiveConflictsForSave(next, allConflicts);
        if (activeMap.size > 0) {
            if (conflictSensitivity === 'auto-disable_REMOVED') {
                activeMap.forEach((_, modName) => next.delete(Array.from(next).find(m => m.toLowerCase() === modName) || modName));
                import('../store/useToastStore').then(m => m.useToastStore.getState().info(`Auto-disabled ${activeMap.size} conflicting mods.`));
            } else if (conflictSensitivity === 'warn' || conflictSensitivity === 'resolve') {
                import('../store/useToastStore').then(m => m.useToastStore.getState().warning(`Warning: ${activeMap.size} script conflicts.`));
            }
        }
    }
    setModalSelectedMods(next);
}}>Select All</button>
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
                                          (fm.fileName && fm.fileName.toLowerCase() === (m.fileName ? m.fileName.split(/[\\/\\]/).pop().toLowerCase() : (m.modName ? `${m.modName.toLowerCase()}.zip` : "")))
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
                                            {mustHaveMods.map(m => {
                                              const conflictData = activeModalConflicts && activeModalConflicts.get(m.modName);
                                              const isConflicting = !!conflictData;
                                              return (
                                              <div 
                                                key={m.modName} 
                                                style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: 12, 
                                                    padding: '8px', 
                                                    fontSize: 14, 
                                                    cursor: 'default', 
                                                    borderRadius: 10, 
                                                    background: isConflicting ? 'rgba(255, 100, 0, 0.05)' : 'rgba(var(--accent-rgb), 0.1)', 
                                                    border: `2px solid ${isConflicting ? 'rgba(255, 100, 0, 0.5)' : 'var(--accent)'}`, 
                                                    opacity: isConflicting ? 1 : 0.8, 
                                                    marginBottom: 4,
                                                    contentVisibility: 'auto',
                                                    containIntrinsicSize: '64px 80px'
                                                }} 
                                                title={`Version: ${m.version}`}
                                              >
                                                <div style={{ flexShrink: 0 }}>
                                                  <MiniModIcon mod={m} size={64} />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                                                    <span style={{ color: isConflicting ? 'orange' : 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{m.title}</span>
                                                    <span style={{ fontSize: 11, opacity: 0.6, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{m.author} • v{m.version}</span>
                                                </div>
                                                {isConflicting && (
                                                  <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConflictInfoMod(m); }} style={{ cursor: 'pointer', color: 'orange', padding: '2px 4px', display: 'flex' }} title="Show conflict details">
                                                    <ShieldAlert size={16} />
                                                  </div>
                                                )}
                                              </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            {(includeMustHaves ? otherMods : deduplicate(allValidMods)).map(m => (
                                            <div 
  key={m.modName} 
  onClick={() => toggleModalModSelection(m.modName)}
  style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 12, 
      padding: '8px', 
      fontSize: 14, 
      cursor: 'pointer', 
      borderRadius: 10, 
      background: (activeModalConflicts && activeModalConflicts.get(m.modName)) ? 'rgba(255, 100, 0, 0.05)' : (modalSelectedMods.has(m.modName) ? 'var(--accent-dim)' : 'transparent'), 
      border: `2px solid ${(activeModalConflicts && activeModalConflicts.get(m.modName)) ? 'rgba(255, 100, 0, 0.6)' : (modalSelectedMods.has(m.modName) ? 'var(--accent)' : 'transparent')}`, 
      transition: 'all 0.15s',
      contentVisibility: 'auto',
      containIntrinsicSize: '64px 80px'
  }} 
  className="hover-bg-subtle"
>
    <div style={{ flexShrink: 0 }}>
      <MiniModIcon mod={m} size={64} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: (activeModalConflicts && activeModalConflicts.get(m.modName)) ? 'orange' : 'inherit', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{m.title}</span>
          <span style={{ fontSize: 11, opacity: 0.6, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{m.author || 'Unknown'} • v{m.version}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {(activeModalConflicts && activeModalConflicts.get(m.modName)) && (
            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConflictInfoMod(m); }} style={{ cursor: 'pointer', color: 'orange', padding: '2px 4px', display: 'flex' }} title="Show conflict details">
              <ShieldAlert size={16} />
            </div>
          )}
        </div>
    </div>
</div>
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
                            <strong style={{ color: 'var(--text-primary)' }}>
                                {(() => {
                                    const mustHavesCount = includeMustHaves ? mods.filter(m => 
                                      !m.isMap && (useModHubStore.getState().favoriteMods || []).some(fm => 
                                        fm.isMustHave && (
                                          (fm.modId && m.modId && String(fm.modId) === String(m.modId)) || 
                                          (fm.fileName && fm.fileName.toLowerCase() === (m.fileName ? m.fileName.split(/[\\/\\]/).pop().toLowerCase() : (m.modName ? `${m.modName.toLowerCase()}.zip` : "")))
                                        )
                                      )
                                    ).length : 0;
                                    return modalSelectedMods.size + mustHavesCount;
                                })()}
                            </strong> Mods Selected
                        </div>
                    </div>
                    <button className="btn btn--ghost" style={{ height: 48, padding: '0 32px', fontSize: 16 }} title="Discard all changes without saving." onClick={() => setShowCreateModal(false)}>Cancel</button>
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
                    <button className="btn btn--ghost" title="Discard all changes without saving." onClick={() => setShowRestoreModal(null)}>Cancel</button>
                    <button className="btn btn--primary" onClick={handleRestore}>Restore Now</button>
                </div>
              </div>
          </div>
      )}

      {showRollback && (
          <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowRollback(null)}>
              <div className="modal-content" style={{ width: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <RotateCcw className="text-accent" /> Engine Backups
                      </h2>
                      <button className="btn btn--ghost btn--icon" onClick={() => setShowRollback(null)}><X size={24} /></button>
                  </div>
                  
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
                      Farming Simulator automatically creates a backup every time you save your game. You can instantly restore Slot {showRollback.index} to any of these historical points.
                  </p>

                  <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 8, minHeight: 200 }}>
                      {loadingBackups ? (
                          <div style={{ padding: 32, textAlign: 'center', opacity: 0.5 }}>Loading engine backups...</div>
                      ) : engineBackups.length === 0 ? (
                          <div style={{ padding: 32, textAlign: 'center', opacity: 0.5 }}>No backups found for Slot {showRollback.index}</div>
                      ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {engineBackups.map(backup => (
                                  <div key={backup.folderName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                                      <div>
                                          <div style={{ fontWeight: 800, fontSize: 14 }}>{backup.date}</div>
                                          <div style={{ fontSize: 11, opacity: 0.5 }}>{backup.folderName}</div>
                                      </div>
                                      <button 
                                          className="btn btn--primary btn--sm" 
                                          onClick={() => handleEngineRollback(backup.folderName)}
                                      >
                                          RESTORE
                                      </button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {showEditor && (
          <SavegameEditorModal 
            save={showEditor} 
            onClose={() => setShowEditor(null)} 
            onRefresh={fetchSavegames}
            onLaunch={handleLaunch}
            onToggleMode={handleToggleServerMode}
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

      {serverExportSave && (
          <ServerExportModal 
            save={serverExportSave} 
            onClose={() => setServerExportSave(null)} 
            onExportComplete={fetchSavegames} 
          />
      )}

      {missingDeps && (
           <DependencyDownloadModal 
             missingMods={missingDeps}
             subFolder="Map Dependencies"
             onCancel={() => setMissingDeps(null)}
             onComplete={async () => {
               await useLocalModsStore.getState().scanMods(null, true);
               setMissingDeps(null);
             }}
           />
       )}
    </div>
  );
}
