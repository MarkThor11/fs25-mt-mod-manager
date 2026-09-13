import React, { useEffect, useState, useMemo } from 'react';
import {
  SlidersHorizontal, Search, RefreshCw, AlertTriangle, ShieldCheck, Download,
  Upload, Trash2, Edit2, Check, X, RotateCcw, Monitor, Gamepad2,
  FolderOpen, Plus, Sliders, ChevronDown, ChevronRight, Layers, Tag
} from 'lucide-react';
import { useKeybindStore } from '../store/useKeybindStore';
import { useToastStore } from '../store/useToastStore';

const CATEGORIES = [
  'ALL',
  'Vehicle Driving',
  'Implements & Tools',
  'Character & Hand Tools',
  'Camera & View',
  'Interface & Menus',
  'General & Other'
];

export default function KeybindsPage() {
  const {
    actions,
    devices,
    conflicts,
    backups,
    isLoading,
    error,
    selectedDevice,
    selectedCategory,
    searchQuery,
    fetchKeybinds,
    fetchBackups,
    updateBinding,
    createBackup,
    restoreBackup,
    deleteBackup,
    resetToDefaults,
    setSelectedDevice,
    setSelectedCategory,
    setSearchQuery
  } = useKeybindStore();

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [newBackupName, setNewBackupName] = useState('');
  const [editingBinding, setEditingBinding] = useState(null); // { action, device, oldInput, value }
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    fetchKeybinds();
    fetchBackups();
  }, []);

  const handleSaveBinding = async () => {
    if (!editingBinding) return;
    const { action, device, oldInput, value } = editingBinding;
    const res = await updateBinding(action, device, oldInput, value);
    if (res.success) {
      useToastStore.getState().success(`Updated binding for ${action}!`);
      setEditingBinding(null);
    } else {
      useToastStore.getState().error(`Failed to update binding: ${res.error}`);
    }
  };

  const handleCreateBackup = async () => {
    if (!newBackupName.trim()) {
      useToastStore.getState().warning('Please provide a name for this backup.');
      return;
    }
    const res = await createBackup(newBackupName.trim());
    if (res.success) {
      useToastStore.getState().success(`Saved keybind profile "${newBackupName}"!`);
      setNewBackupName('');
    } else {
      useToastStore.getState().error(`Failed to create backup: ${res.error}`);
    }
  };

  const handleRestoreBackup = async (fileName, profileName) => {
    if (!confirm(`Restore keybind profile "${profileName}"? Current bindings will be automatically backed up first.`)) return;
    const res = await restoreBackup(fileName);
    if (res.success) {
      useToastStore.getState().success(`Restored keybind profile "${profileName}"!`);
      setShowBackupModal(false);
    } else {
      useToastStore.getState().error(`Failed to restore profile: ${res.error}`);
    }
  };

  const handleDeleteBackup = async (fileName) => {
    if (!confirm('Delete this backup profile?')) return;
    const res = await deleteBackup(fileName);
    if (res.success) {
      useToastStore.getState().success('Profile deleted.');
    } else {
      useToastStore.getState().error(`Failed to delete profile: ${res.error}`);
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm('Are you sure you want to reset all keybindings to clean game defaults?\n\nA full backup of your current bindings will be saved automatically.')) return;
    setIsResetting(true);
    const res = await resetToDefaults();
    setIsResetting(false);
    if (res.success) {
      useToastStore.getState().success(res.message || 'Keybindings reset to defaults!');
    } else {
      useToastStore.getState().error(`Failed to reset: ${res.error}`);
    }
  };

  // Filter actions based on device, category, search, and conflicts
  const filteredActions = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    const conflictActionNames = new Set(conflicts.flatMap(c => c.actions));

    return actions.filter(act => {
      // Conflict filter
      if (showConflictsOnly && !conflictActionNames.has(act.action)) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && act.category !== selectedCategory) {
        return false;
      }

      // Device filter
      if (selectedDevice !== 'ALL') {
        const hasDeviceBinding = act.bindings.some(b => b.device === selectedDevice);
        if (!hasDeviceBinding) return false;
      }

      // Search filter
      if (q) {
        const matchesAction = act.action.toLowerCase().includes(q);
        const matchesCategory = act.category.toLowerCase().includes(q);
        const matchesInput = act.bindings.some(b => 
          (b.input && b.input.toLowerCase().includes(q)) || 
          (b.formattedInput && b.formattedInput.toLowerCase().includes(q))
        );
        if (!matchesAction && !matchesCategory && !matchesInput) return false;
      }

      return true;
    });
  }, [actions, selectedDevice, selectedCategory, searchQuery, showConflictsOnly, conflicts]);

  const activeDeviceName = devices.find(d => d.id === selectedDevice)?.name || 'All Devices';

  return (
    <div className="page animate-fade-in" style={{ padding: 'var(--sp-6)', maxWidth: 1600, margin: '0 auto' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-5)', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
            <SlidersHorizontal size={28} className="text-accent" /> Keybindings & Controls Manager
          </h1>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', marginTop: 4 }}>
            View, search, edit, and backup all FS25 keyboard, mouse, steering wheel, and gamepad controls.
          </p>
        </div>

        {/* Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            className="btn btn--secondary btn--sm" 
            onClick={() => fetchKeybinds()} 
            disabled={isLoading}
            title="Reload from inputBinding.xml"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button 
            className="btn btn--secondary btn--sm" 
            onClick={() => setShowBackupModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FolderOpen size={14} /> Backups & Profiles ({backups.length})
          </button>
          <button 
            className="btn btn--danger btn--sm" 
            onClick={handleResetDefaults}
            disabled={isResetting}
            title="Reset bindings to factory defaults"
          >
            <RotateCcw size={14} /> Reset Defaults
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid var(--danger)', 
          borderRadius: 'var(--radius-md)', 
          padding: '12px 16px', 
          marginBottom: 'var(--sp-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>
                Unable to Load Keybindings
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                {error}
              </div>
            </div>
          </div>
          <button 
            className="btn btn--secondary btn--sm"
            onClick={() => {
              fetchKeybinds();
              fetchBackups();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Conflict Warning Banner */}
      {conflicts.length > 0 && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid var(--danger)', 
          borderRadius: 'var(--radius-md)', 
          padding: '12px 16px', 
          marginBottom: 'var(--sp-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>
                {conflicts.length} Keybinding Conflict{conflicts.length > 1 ? 's' : ''} Detected
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                Multiple in-game actions share the exact same key or button on the same device.
              </div>
            </div>
          </div>
          <button 
            className={`btn btn--sm ${showConflictsOnly ? 'btn--danger' : 'btn--secondary'}`}
            onClick={() => setShowConflictsOnly(!showConflictsOnly)}
            style={{ fontSize: '11px', fontWeight: 700 }}
          >
            {showConflictsOnly ? 'Show All Keybinds' : 'Filter Conflicts Only'}
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ 
        background: 'var(--bg-tertiary)', 
        border: '1px solid var(--border)', 
        borderRadius: 'var(--radius-md)', 
        padding: '14px 18px', 
        marginBottom: 'var(--sp-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 240 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search action or key (e.g. Enter, Lights, Space, E)..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px 8px 36px',
                color: 'var(--text-primary)',
                fontSize: 'var(--fs-sm)',
                outline: 'none'
              }}
            />
            {searchQuery && (
              <X 
                size={14} 
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--text-muted)' }} 
              />
            )}
          </div>

          {/* Device Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-secondary)', padding: '3px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
            <button
              className={`btn btn--xs ${selectedDevice === 'ALL' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setSelectedDevice('ALL')}
            >
              All Devices
            </button>
            {devices.map(dev => (
              <button
                key={dev.id}
                className={`btn btn--xs ${selectedDevice === dev.id ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setSelectedDevice(dev.id)}
                title={dev.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
              >
                {dev.id === 'KB_MOUSE_DEFAULT' ? <Monitor size={12} /> : <Gamepad2 size={12} />}
                {dev.name.length > 20 ? dev.name.slice(0, 20) + '…' : dev.name}
              </button>
            ))}
          </div>
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginRight: 4 }}>
            Category:
          </span>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                fontSize: '11px',
                padding: '3px 10px',
                borderRadius: '100px',
                border: selectedCategory === cat ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: selectedCategory === cat ? 'var(--accent-dim)' : 'transparent',
                color: selectedCategory === cat ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: selectedCategory === cat ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results Header Count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontWeight: 600 }}>
        <span>Showing {filteredActions.length} actions for <strong>{activeDeviceName}</strong></span>
        {conflicts.length === 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
            <ShieldCheck size={14} /> No Conflicts Detected
          </span>
        )}
      </div>

      {/* Keybindings Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
        gap: '12px'
      }}>
        {filteredActions.map(act => {
          const isConflicted = conflicts.some(c => c.actions.includes(act.action));

          return (
            <div
              key={act.action}
              style={{
                background: isConflicted ? 'rgba(239, 68, 68, 0.04)' : 'var(--bg-card)',
                border: isConflicted ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
                transition: 'border-color 0.2s'
              }}
            >
              {/* Action Title & Category */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {act.action.replace(/_/g, ' ')}
                  </span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-tertiary)',
                    whiteSpace: 'nowrap'
                  }}>
                    {act.category}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                  {act.action}
                </div>
              </div>

              {/* Bindings List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {act.bindings.length === 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Unassigned
                  </div>
                ) : (
                  act.bindings.map((b, idx) => {
                    const isDeviceMatch = selectedDevice === 'ALL' || b.device === selectedDevice;
                    if (!isDeviceMatch) return null;

                    const isKeyConflict = conflicts.some(c => c.device === b.device && c.input === b.input);
                    const isEditing = editingBinding?.action === act.action && editingBinding?.device === b.device && editingBinding?.oldInput === b.input;

                    return (
                      <div
                        key={`${b.device}_${b.input}_${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          background: isKeyConflict ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-tertiary)',
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: isKeyConflict ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-subtle)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <span style={{ opacity: 0.6 }} title={b.device}>
                            {b.device === 'KB_MOUSE_DEFAULT' ? <Monitor size={14} /> : <Gamepad2 size={14} />}
                          </span>

                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editingBinding.value}
                              onChange={e => setEditingBinding(prev => ({ ...prev, value: e.target.value }))}
                              placeholder="e.g. KEY_e, KEY_space"
                              style={{
                                flex: 1,
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--accent)',
                                borderRadius: 4,
                                padding: '3px 8px',
                                fontSize: '12px',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                fontFamily: 'monospace'
                              }}
                              autoFocus
                            />
                          ) : (
                            <span 
                              style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                color: isKeyConflict ? 'var(--danger)' : 'var(--accent)',
                                background: isKeyConflict ? 'rgba(239, 68, 68, 0.15)' : 'rgba(var(--accent-rgb), 0.1)',
                                padding: '2px 8px',
                                borderRadius: 4,
                                border: `1px solid ${isKeyConflict ? 'rgba(239, 68, 68, 0.3)' : 'rgba(var(--accent-rgb), 0.2)'}`,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={b.input}
                            >
                              {b.formattedInput || b.input}
                            </span>
                          )}
                        </div>

                        {/* Edit Action Button */}
                        <div>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button 
                                className="btn btn--primary btn--xs" 
                                onClick={handleSaveBinding}
                                title="Save binding"
                                style={{ padding: '3px 6px' }}
                              >
                                <Check size={12} />
                              </button>
                              <button 
                                className="btn btn--secondary btn--xs" 
                                onClick={() => setEditingBinding(null)}
                                title="Cancel"
                                style={{ padding: '3px 6px' }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn--ghost btn--xs btn--icon"
                              onClick={() => setEditingBinding({ action: act.action, device: b.device, oldInput: b.input, value: b.input })}
                              title="Edit keybinding"
                            >
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredActions.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--text-muted)' }}>
          <SlidersHorizontal size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div>No keybindings found matching your filters.</div>
        </div>
      )}

      {/* Backup & Profile Management Modal */}
      {showBackupModal && (
        <div className="modal-overlay" onClick={() => setShowBackupModal(false)} style={{ zIndex: 1200 }}>
          <div className="modal animate-zoom-in" style={{ width: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FolderOpen size={20} className="text-accent" />
                <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, margin: 0 }}>Keybinding Backups & Profiles</h2>
              </div>
              <button className="btn btn--ghost btn--icon" onClick={() => setShowBackupModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Create Profile / Backup */}
              <div style={{ background: 'var(--bg-tertiary)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, marginBottom: 8 }}>
                  Save Current Configuration as Preset Profile
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input 
                    type="text" 
                    placeholder="Profile name (e.g. Logitech G29 Wheel, Gamepad, Flight Stick)..." 
                    value={newBackupName}
                    onChange={e => setNewBackupName(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--fs-sm)',
                      outline: 'none'
                    }}
                  />
                  <button className="btn btn--primary btn--sm" onClick={handleCreateBackup} style={{ whiteSpace: 'nowrap' }}>
                    <Plus size={14} /> Save Profile
                  </button>
                </div>
              </div>

              {/* Existing Backups List */}
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                  Saved Snapshots ({backups.length})
                </div>

                {backups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                    No backup profiles saved yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {backups.map(b => (
                      <div 
                        key={b.fileName}
                        style={{
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)' }}>
                            {b.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {new Date(b.createdAt).toLocaleString()} • {(b.sizeBytes / 1024).toFixed(1)} KB
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button 
                            className="btn btn--secondary btn--sm" 
                            onClick={() => handleRestoreBackup(b.fileName, b.name)}
                            title="Restore this profile"
                          >
                            <Upload size={14} /> Restore
                          </button>
                          <button 
                            className="btn btn--danger btn--sm btn--icon" 
                            onClick={() => handleDeleteBackup(b.fileName)}
                            title="Delete profile"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
