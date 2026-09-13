import React, { useEffect, useState, useMemo } from 'react';
import {
  SlidersHorizontal, Search, RefreshCw, AlertTriangle, ShieldCheck, Download,
  Upload, Trash2, Edit2, Check, X, RotateCcw, Monitor, Gamepad2,
  FolderOpen, Plus, Sliders, ChevronDown, ChevronRight, Layers, Tag, Disc, Radio
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
  const [captureModal, setCaptureModal] = useState(null); // { action, device, oldInput }
  const [detectedInput, setDetectedInput] = useState(null); // { rawInput, display }

  useEffect(() => {
    fetchKeybinds();
    fetchBackups();
  }, []);

  // Map browser KeyboardEvent.code / key to FS25 XML input string
  const mapCodeToFS25 = (e) => {
    const code = e.code;
    const key = e.key;

    // Modifiers alone don't finalize
    const isModifier = ['Shift', 'Control', 'Alt', 'Meta'].includes(key);

    const parts = [];
    if (e.ctrlKey && key !== 'Control') parts.push(e.location === 2 ? 'KEY_rctrl' : 'KEY_lctrl');
    if (e.shiftKey && key !== 'Shift') parts.push(e.location === 2 ? 'KEY_rshift' : 'KEY_lshift');
    if (e.altKey && key !== 'Alt') parts.push(e.location === 2 ? 'KEY_ralt' : 'KEY_lalt');

    let mainKey = '';
    if (!isModifier) {
      if (code.startsWith('Key')) {
        mainKey = 'KEY_' + code.slice(3).toLowerCase();
      } else if (code.startsWith('Digit')) {
        mainKey = 'KEY_' + code.slice(5);
      } else if (code.startsWith('Numpad')) {
        mainKey = 'KEY_numpad' + code.slice(6).toLowerCase();
      } else if (code.startsWith('F') && !isNaN(code.slice(1))) {
        mainKey = 'KEY_' + code.toLowerCase();
      } else {
        const special = {
          'Space': 'KEY_space',
          'Enter': 'KEY_return',
          'NumpadEnter': 'KEY_numpadenter',
          'Backspace': 'KEY_backspace',
          'Tab': 'KEY_tab',
          'Escape': 'KEY_escape',
          'ArrowUp': 'KEY_up',
          'ArrowDown': 'KEY_down',
          'ArrowLeft': 'KEY_left',
          'ArrowRight': 'KEY_right',
          'Insert': 'KEY_insert',
          'Delete': 'KEY_delete',
          'Home': 'KEY_home',
          'End': 'KEY_end',
          'PageUp': 'KEY_pageup',
          'PageDown': 'KEY_pagedown',
          'Comma': 'KEY_comma',
          'Period': 'KEY_period',
          'Slash': 'KEY_slash',
          'Backslash': 'KEY_backslash',
          'Semicolon': 'KEY_semicolon',
          'Quote': 'KEY_apostrophe',
          'Minus': 'KEY_minus',
          'Equal': 'KEY_equals',
          'BracketLeft': 'KEY_lbracket',
          'BracketRight': 'KEY_rbracket'
        };
        mainKey = special[code] || ('KEY_' + key.toLowerCase());
      }
      parts.push(mainKey);
    } else {
      if (key === 'Control') parts.push(e.location === 2 ? 'KEY_rctrl' : 'KEY_lctrl');
      else if (key === 'Shift') parts.push(e.location === 2 ? 'KEY_rshift' : 'KEY_lshift');
      else if (key === 'Alt') parts.push(e.location === 2 ? 'KEY_ralt' : 'KEY_lalt');
    }

    return parts.join(' ');
  };

  // Keyboard & Mouse listener for capture modal
  useEffect(() => {
    if (!captureModal) {
      setDetectedInput(null);
      return;
    }

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        setCaptureModal(null);
        setDetectedInput(null);
        return;
      }
      const raw = mapCodeToFS25(e);
      if (raw) {
        setDetectedInput({
          rawInput: raw,
          display: raw.replace(/KEY_lshift/gi, 'Left Shift').replace(/KEY_rshift/gi, 'Right Shift').replace(/KEY_lctrl/gi, 'Left Ctrl').replace(/KEY_rctrl/gi, 'Right Ctrl').replace(/KEY_lalt/gi, 'Left Alt').replace(/KEY_ralt/gi, 'Right Alt').replace(/KEY_space/gi, 'Space').replace(/KEY_return/gi, 'Enter').replace(/KEY_/gi, '').toUpperCase()
        });
      }
    };

    const handleMouseDown = (e) => {
      // Only capture mouse buttons inside the capture modal box
      const target = e.target.closest('#keybind-capture-zone');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      let raw = '';
      if (e.button === 0) raw = 'MOUSE_BUTTON_LEFT';
      else if (e.button === 1) raw = 'MOUSE_BUTTON_MIDDLE';
      else if (e.button === 2) raw = 'MOUSE_BUTTON_RIGHT';
      else raw = `MOUSE_BUTTON_${e.button + 1}`;

      const mods = [];
      if (e.ctrlKey) mods.push('KEY_lctrl');
      if (e.shiftKey) mods.push('KEY_lshift');
      if (e.altKey) mods.push('KEY_lalt');
      mods.push(raw);
      const full = mods.join(' ');

      setDetectedInput({
        rawInput: full,
        display: full.replace(/MOUSE_BUTTON_LEFT/gi, 'Left Click').replace(/MOUSE_BUTTON_RIGHT/gi, 'Right Click').replace(/MOUSE_BUTTON_MIDDLE/gi, 'Middle Click').replace(/KEY_/gi, '').toUpperCase()
      });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);

    // Gamepad polling loop
    let animId;
    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of gamepads) {
        if (!gp) continue;
        // Check buttons
        for (let bIdx = 0; bIdx < gp.buttons.length; bIdx++) {
          if (gp.buttons[bIdx]?.pressed) {
            const raw = `BUTTON_${bIdx + 1}`;
            setDetectedInput({
              rawInput: raw,
              display: `${gp.id.includes('G27') || gp.id.includes('Wheel') ? 'Wheel' : 'Gamepad'} Button ${bIdx + 1}`
            });
            break;
          }
        }
        // Check axes
        for (let aIdx = 0; aIdx < gp.axes.length; aIdx++) {
          const val = gp.axes[aIdx];
          if (Math.abs(val) > 0.6) {
            const dir = val > 0 ? '+' : '-';
            const raw = `AXIS_${aIdx + 1}${dir}`;
            setDetectedInput({
              rawInput: raw,
              display: `Axis ${aIdx + 1} (${dir})`
            });
            break;
          }
        }
      }
      animId = requestAnimationFrame(pollGamepad);
    };
    animId = requestAnimationFrame(pollGamepad);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [captureModal]);

  const handleApplyCapturedInput = async () => {
    if (!captureModal || !detectedInput) return;
    const { action, device, oldInput } = captureModal;
    const res = await updateBinding(action, device, oldInput, detectedInput.rawInput);
    if (res.success) {
      useToastStore.getState().success(`Bound ${action} to ${detectedInput.display}!`);
      setCaptureModal(null);
      setDetectedInput(null);
    } else {
      useToastStore.getState().error(`Failed to assign binding: ${res.error}`);
    }
  };

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

  const handleClearBinding = async (action, device, oldInput) => {
    if (!confirm(`Clear this binding for ${action}?`)) return;
    const res = await updateBinding(action, device, oldInput, '');
    if (res.success) {
      useToastStore.getState().success(`Cleared binding for ${action}!`);
    } else {
      useToastStore.getState().error(`Failed to clear binding: ${res.error}`);
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

  // Extract distinct categories from actual actions
  const availableCategories = useMemo(() => {
    const set = new Set();
    actions.forEach(a => {
      if (a.context) set.add(a.context);
      else if (a.category) set.add(a.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [actions]);

  // Filter actions based on category, search, and conflicts
  const filteredActions = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    const conflictActionNames = new Set(conflicts.flatMap(c => c.actions));

    return actions.filter(act => {
      if (showConflictsOnly && !conflictActionNames.has(act.action)) {
        return false;
      }

      if (selectedCategory !== 'ALL' && act.context !== selectedCategory && act.category !== selectedCategory) {
        return false;
      }

      if (q) {
        const matchesAction = act.action.toLowerCase().includes(q);
        const matchesCategory = (act.category || '').toLowerCase().includes(q);
        const matchesContext = (act.context || '').toLowerCase().includes(q);
        const matchesInput = act.bindings.some(b => 
          (b.input && b.input.toLowerCase().includes(q)) || 
          (b.formattedInput && b.formattedInput.toLowerCase().includes(q))
        );
        if (!matchesAction && !matchesCategory && !matchesContext && !matchesInput) return false;
      }

      return true;
    });
  }, [actions, selectedCategory, searchQuery, showConflictsOnly, conflicts]);

  // Devices columns: Ensure Keyboard/Mouse is first, followed by detected gamepads/controllers
  const deviceColumns = useMemo(() => {
    if (!devices || devices.length === 0) {
      return [{ id: 'KB_MOUSE_DEFAULT', name: 'Keyboard & Mouse', isDefault: true }];
    }
    const kb = devices.filter(d => d.id === 'KB_MOUSE_DEFAULT');
    const others = devices.filter(d => d.id !== 'KB_MOUSE_DEFAULT');
    return [...kb, ...others];
  }, [devices]);

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
                Multiple actions in the same player state share the exact same key without a modifier.
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

          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>
            Showing <strong>{filteredActions.length}</strong> actions across <strong>{deviceColumns.length}</strong> input devices
          </div>
        </div>

        {/* State Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginRight: 4 }}>
            Filter State:
          </span>
          {availableCategories.map(cat => (
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

      {/* In-Game Style Keybindings Table */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                {/* Left Column: Action Name & Context */}
                <th style={{ 
                  padding: '14px 18px', 
                  fontSize: 'var(--fs-xs)', 
                  fontWeight: 800, 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em', 
                  color: 'var(--text-secondary)',
                  width: '32%',
                  minWidth: 260
                }}>
                  Action / Function
                </th>

                {/* Columns for Each Device (Keyboard/Mouse, Gamepad/Wheel) */}
                {deviceColumns.map(dev => (
                  <th key={dev.id} style={{ 
                    padding: '14px 18px', 
                    fontSize: 'var(--fs-xs)', 
                    fontWeight: 800, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em', 
                    color: 'var(--text-secondary)',
                    borderLeft: '1px solid var(--border)',
                    minWidth: 280
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {dev.id === 'KB_MOUSE_DEFAULT' ? <Monitor size={15} className="text-accent" /> : <Gamepad2 size={15} className="text-accent" />}
                      <span>{dev.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredActions.map((act, rIdx) => {
                const isConflicted = conflicts.some(c => c.actions.includes(act.action));

                return (
                  <tr 
                    key={act.action}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isConflicted 
                        ? 'rgba(239, 68, 68, 0.05)' 
                        : (rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)'),
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isConflicted) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                    onMouseLeave={e => {
                      if (!isConflicted) e.currentTarget.style.background = (rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)');
                    }}
                  >
                    {/* Left Column: Action Details */}
                    <td style={{ padding: '12px 18px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--text-primary)' }}>
                            {act.action.replace(/_/g, ' ')}
                          </span>
                          {act.context && (
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'rgba(59, 130, 246, 0.1)',
                              color: 'var(--accent, #60a5fa)',
                              whiteSpace: 'nowrap'
                            }}>
                              {act.context}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {act.action}
                        </div>
                      </div>
                    </td>

                    {/* Columns for Each Device */}
                    {deviceColumns.map(dev => {
                      const devBindings = act.bindings.filter(b => b.device === dev.id);

                      return (
                        <td 
                          key={dev.id} 
                          style={{ 
                            padding: '10px 18px', 
                            verticalAlign: 'middle',
                            borderLeft: '1px solid var(--border-subtle)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            {devBindings.length === 0 ? (
                              <button
                                className="btn btn--ghost btn--xs"
                                style={{ 
                                  fontSize: '11px', 
                                  color: 'var(--text-muted)', 
                                  fontStyle: 'italic',
                                  border: '1px dashed var(--border)',
                                  padding: '4px 10px',
                                  borderRadius: 4
                                }}
                                onClick={() => setCaptureModal({ action: act.action, device: dev.id, oldInput: '' })}
                              >
                                + Assign
                              </button>
                            ) : (
                              devBindings.map((b, bIdx) => {
                                const isKeyConflict = conflicts.some(c => c.device === b.device && c.input === b.input);
                                const isEditing = editingBinding?.action === act.action && editingBinding?.device === b.device && editingBinding?.oldInput === b.input;

                                if (isEditing) {
                                  return (
                                    <div 
                                      key={`${b.device}_${b.input}_${bIdx}`} 
                                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', padding: '3px 6px', borderRadius: 6, border: '1px solid var(--accent)' }}
                                    >
                                      <input 
                                        type="text" 
                                        value={editingBinding.value}
                                        onChange={e => setEditingBinding(prev => ({ ...prev, value: e.target.value }))}
                                        placeholder="KEY_e, BUTTON_1..."
                                        style={{
                                          width: 140,
                                          background: 'transparent',
                                          border: 'none',
                                          fontSize: '12px',
                                          color: 'var(--text-primary)',
                                          outline: 'none',
                                          fontFamily: 'monospace'
                                        }}
                                        autoFocus
                                      />
                                      <button 
                                        className="btn btn--primary btn--xs" 
                                        onClick={handleSaveBinding}
                                        title="Save binding"
                                        style={{ padding: '2px 5px' }}
                                      >
                                        <Check size={12} />
                                      </button>
                                      <button 
                                        className="btn btn--secondary btn--xs" 
                                        onClick={() => setEditingBinding(null)}
                                        title="Cancel"
                                        style={{ padding: '2px 5px' }}
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={`${b.device}_${b.input}_${bIdx}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      background: isKeyConflict ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                                      border: isKeyConflict ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                                      borderRadius: 'var(--radius-sm)',
                                      padding: '4px 10px',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                    }}
                                  >
                                    <span 
                                      style={{
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        color: isKeyConflict ? 'var(--danger)' : 'var(--accent)',
                                        fontFamily: 'var(--font-mono, monospace)',
                                        letterSpacing: '0.02em',
                                        cursor: 'pointer'
                                      }}
                                      onClick={() => setCaptureModal({ action: act.action, device: b.device, oldInput: b.input })}
                                      title="Click to re-bind by pressing any key or controller button"
                                    >
                                      {b.formattedInput || b.input}
                                    </span>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
                                      <button
                                        className="btn btn--ghost btn--xs btn--icon"
                                        onClick={() => setCaptureModal({ action: act.action, device: b.device, oldInput: b.input })}
                                        title="Press Key/Button to Rebind"
                                        style={{ padding: '2px', height: 'auto', width: 'auto', opacity: 0.8 }}
                                      >
                                        <Disc size={11} className="text-accent" />
                                      </button>
                                      <button
                                        className="btn btn--ghost btn--xs btn--icon"
                                        onClick={() => setEditingBinding({ action: act.action, device: b.device, oldInput: b.input, value: b.input })}
                                        title="Type raw XML name manually"
                                        style={{ padding: '2px', height: 'auto', width: 'auto', opacity: 0.5 }}
                                      >
                                        <Edit2 size={11} />
                                      </button>
                                      <button
                                        className="btn btn--ghost btn--xs btn--icon"
                                        onClick={() => handleClearBinding(act.action, b.device, b.input)}
                                        title="Unassign"
                                        style={{ padding: '2px', height: 'auto', width: 'auto', opacity: 0.5, color: 'var(--danger)' }}
                                      >
                                        <X size={11} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filteredActions.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--text-muted)' }}>
          <SlidersHorizontal size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div>No keybindings found matching your filters.</div>
        </div>
      )}

      {/* Live Key & Gamepad Capture Modal (Press any key or button) */}
      {captureModal && (
        <div 
          className="modal-overlay" 
          onClick={() => setCaptureModal(null)} 
          style={{ zIndex: 1300, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)' }}
        >
          <div 
            id="keybind-capture-zone"
            className="modal animate-zoom-in" 
            style={{ 
              width: 520, 
              padding: '24px', 
              textAlign: 'center', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: 16,
              border: '2px solid var(--accent)',
              boxShadow: '0 8px 32px rgba(var(--accent-rgb), 0.25)'
            }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)' }}>
              {captureModal.device === 'KB_MOUSE_DEFAULT' ? <Monitor size={28} /> : <Gamepad2 size={28} />}
            </div>

            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                {devices.find(d => d.id === captureModal.device)?.name || 'Device'}
              </div>
              <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, margin: '4px 0 0 0', color: 'var(--text-primary)' }}>
                {captureModal.action.replace(/_/g, ' ')}
              </h2>
            </div>

            <div style={{ 
              width: '100%', 
              padding: '20px', 
              background: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8
            }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                {detectedInput ? 'Captured Input:' : 'Press any key, mouse button, or controller button...'}
              </div>
              <div style={{ 
                fontSize: detectedInput ? '22px' : '16px', 
                fontWeight: 800, 
                color: detectedInput ? 'var(--accent)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono, monospace)',
                minHeight: 32,
                display: 'flex',
                alignItems: 'center'
              }}>
                {detectedInput ? detectedInput.display : 'Listening for input...'}
              </div>
              {detectedInput && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                  Raw XML: {detectedInput.rawInput}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <button 
                className="btn btn--secondary" 
                style={{ flex: 1 }} 
                onClick={() => setCaptureModal(null)}
              >
                Cancel (Esc)
              </button>
              <button 
                className="btn btn--primary" 
                style={{ flex: 1 }} 
                disabled={!detectedInput}
                onClick={handleApplyCapturedInput}
              >
                Confirm Binding
              </button>
            </div>
          </div>
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
