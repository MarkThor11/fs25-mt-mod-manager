import React, { useEffect, useState, useMemo } from 'react';
import {
  SlidersHorizontal, Search, RefreshCw, AlertTriangle, ShieldCheck, Download,
  Upload, Trash2, Check, X, RotateCcw, Monitor, Gamepad2,
  FolderOpen, Plus, Sliders, ChevronDown, ChevronRight, Layers, Tag
} from 'lucide-react';
import { useKeybindStore } from '../store/useKeybindStore';
import { useToastStore } from '../store/useToastStore';

export default function KeybindsPage() {
  const {
    actions,
    devices,
    conflicts,
    backups,
    isLoading,
    error,
    selectedCategory,
    searchQuery,
    fetchKeybinds,
    fetchBackups,
    updateBinding,
    createBackup,
    restoreBackup,
    deleteBackup,
    resetToDefaults,
    setSelectedCategory,
    setSearchQuery
  } = useKeybindStore();

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [newBackupName, setNewBackupName] = useState('');
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

  // State: which sections are collapsed
  const [collapsedSections, setCollapsedSections] = useState({});
  const toggleSection = (key) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);

  // Filter actions based on search and conflicts only (no category filter — we section by category)
  const filteredActions = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    const conflictActionNames = new Set(conflicts.flatMap(c => c.actions));

    return actions.filter(act => {
      if (showConflictsOnly && !conflictActionNames.has(act.action)) return false;

      // Show only actions where ALL device bindings are empty
      if (showUnassignedOnly) {
        const hasAnyBinding = act.bindings.some(b => b.input && b.input.trim() !== '');
        if (hasAnyBinding) return false;
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
  }, [actions, searchQuery, showConflictsOnly, showUnassignedOnly, conflicts]);

  // Group filtered actions by their context/category label
  const groupedActions = useMemo(() => {
    const groups = new Map();
    filteredActions.forEach(act => {
      const key = act.context || act.category || 'General';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(act);
    });
    return Array.from(groups.entries()); // [ [sectionName, actionsArray], ... ]
  }, [filteredActions]);

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
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap'
      }}>
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

        <button
          onClick={() => setShowUnassignedOnly(!showUnassignedOnly)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 'var(--radius-sm)',
            border: showUnassignedOnly ? '1px solid var(--warning, #f59e0b)' : '1px solid var(--border)',
            background: showUnassignedOnly ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
            color: showUnassignedOnly ? 'var(--warning, #f59e0b)' : 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: showUnassignedOnly ? 700 : 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease'
          }}
          title="Show only actions with no key assigned"
        >
          <AlertTriangle size={13} />
          Show Unassigned
        </button>

        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          Showing <strong>{filteredActions.length}</strong> actions across <strong>{deviceColumns.length}</strong> input device{deviceColumns.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Grouped / Sectioned Keybindings Tables */}
      {groupedActions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--text-muted)' }}>
          <SlidersHorizontal size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div>No keybindings found matching your filters.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupedActions.map(([sectionName, sectionActions]) => {
            const isCollapsed = !!collapsedSections[sectionName];
            const sectionConflicts = sectionActions.filter(act =>
              conflicts.some(c => c.actions.includes(act.action))
            ).length;

            return (
              <div
                key={sectionName}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
                }}
              >
                {/* Section Header (Collapsible) */}
                <button
                  onClick={() => toggleSection(sectionName)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 18px',
                    background: 'var(--bg-secondary)',
                    border: 'none',
                    borderBottom: isCollapsed ? 'none' : '2px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--text-primary)',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                >
                  {isCollapsed
                    ? <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    : <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  }
                  <span style={{ fontWeight: 800, fontSize: 'var(--fs-sm)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', flex: 1 }}>
                    {sectionName}
                  </span>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>
                    {sectionActions.length} action{sectionActions.length !== 1 ? 's' : ''}
                  </span>
                  {sectionConflicts > 0 && (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: '11px', fontWeight: 700, color: 'var(--danger)',
                      background: 'rgba(239,68,68,0.12)', borderRadius: 100,
                      padding: '2px 10px'
                    }}>
                      <AlertTriangle size={11} /> {sectionConflicts} conflict{sectionConflicts !== 1 ? 's' : ''}
                    </span>
                  )}
                </button>

                {/* Section Table (hidden when collapsed) */}
                {!isCollapsed && (
                  <div style={{ overflowX: 'auto', width: '100%' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <th style={{ 
                            padding: '10px 18px', 
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
                          {deviceColumns.map(dev => (
                            <th key={dev.id} style={{ 
                              padding: '10px 18px', 
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
                        {sectionActions.map((act, rIdx) => {
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
                              {/* Left Column: Action Name */}
                              <td style={{ padding: '14px 18px', verticalAlign: 'middle' }}>
                                <span style={{ 
                                  fontWeight: 700, 
                                  fontSize: 'var(--fs-base, 15px)', 
                                  color: isConflicted ? 'var(--danger)' : 'var(--text-primary)',
                                  letterSpacing: '0.01em'
                                }}>
                                  {act.action
                                    .toLowerCase()
                                    .split('_')
                                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                                    .join(' ')
                                  }
                                </span>
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
                                          className="btn btn--ghost btn--sm"
                                          style={{ 
                                            fontSize: '12px', 
                                            color: 'var(--text-muted)', 
                                            border: '1px dashed var(--border)',
                                            padding: '5px 14px',
                                            borderRadius: 6,
                                            cursor: 'pointer'
                                          }}
                                          onClick={() => setCaptureModal({ action: act.action, device: dev.id, oldInput: '' })}
                                          title="Click to assign a key or controller button"
                                        >
                                          + Assign
                                        </button>
                                      ) : (
                                        devBindings.map((b, bIdx) => {
                                          const isKeyConflict = conflicts.some(c => c.device === b.device && c.input === b.input);

                                          return (
                                            <div
                                              key={`${b.device}_${b.input}_${bIdx}`}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                background: isKeyConflict ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                                                border: isKeyConflict ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '5px 12px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                                transition: 'all 0.15s ease'
                                              }}
                                            >
                                              <button
                                                type="button"
                                                onClick={() => setCaptureModal({ action: act.action, device: b.device, oldInput: b.input })}
                                                style={{
                                                  background: 'none',
                                                  border: 'none',
                                                  padding: 0,
                                                  margin: 0,
                                                  cursor: 'pointer',
                                                  fontSize: '13px',
                                                  fontWeight: 700,
                                                  color: isKeyConflict ? 'var(--danger)' : 'var(--accent)',
                                                  fontFamily: 'var(--font-mono, monospace)',
                                                  letterSpacing: '0.02em',
                                                  outline: 'none'
                                                }}
                                                title="Click to re-bind by pressing any key or controller button"
                                              >
                                                {b.formattedInput || b.input}
                                              </button>

                                              <button
                                                className="btn btn--ghost btn--xs btn--icon"
                                                onClick={() => handleClearBinding(act.action, b.device, b.input)}
                                                title="Unassign key"
                                                style={{ padding: '2px', height: 'auto', width: 'auto', opacity: 0.5, color: 'var(--danger)' }}
                                              >
                                                <X size={12} />
                                              </button>
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Live Key & Gamepad Capture Modal (Press any key or button) */}
      {captureModal && (() => {
        const isKB = captureModal.device === 'KB_MOUSE_DEFAULT';

        // Suggested keys for Keyboard/Mouse device
        const KB_SUGGESTIONS = [
          {
            group: 'Letters',
            keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => ({ raw: `KEY_${l.toLowerCase()}`, label: l }))
          },
          {
            group: 'Numbers',
            keys: '1234567890'.split('').map(n => ({ raw: `KEY_${n}`, label: n }))
          },
          {
            group: 'Function',
            keys: Array.from({ length: 12 }, (_, i) => ({ raw: `KEY_f${i + 1}`, label: `F${i + 1}` }))
          },
          {
            group: 'Special',
            keys: [
              { raw: 'KEY_space',     label: 'Space' },
              { raw: 'KEY_return',    label: 'Enter' },
              { raw: 'KEY_tab',       label: 'Tab' },
              { raw: 'KEY_backspace', label: '⌫ Back' },
              { raw: 'KEY_escape',    label: 'Esc' },
              { raw: 'KEY_lshift',    label: 'L Shift' },
              { raw: 'KEY_rshift',    label: 'R Shift' },
              { raw: 'KEY_lctrl',     label: 'L Ctrl' },
              { raw: 'KEY_rctrl',     label: 'R Ctrl' },
              { raw: 'KEY_lalt',      label: 'L Alt' },
              { raw: 'KEY_ralt',      label: 'R Alt' },
              { raw: 'KEY_delete',    label: 'Del' },
              { raw: 'KEY_insert',    label: 'Ins' },
              { raw: 'KEY_home',      label: 'Home' },
              { raw: 'KEY_end',       label: 'End' },
              { raw: 'KEY_pageup',    label: 'PgUp' },
              { raw: 'KEY_pagedown',  label: 'PgDn' },
            ]
          },
          {
            group: 'Arrows',
            keys: [
              { raw: 'KEY_up',    label: '↑' },
              { raw: 'KEY_down',  label: '↓' },
              { raw: 'KEY_left',  label: '←' },
              { raw: 'KEY_right', label: '→' },
            ]
          },
          {
            group: 'Numpad',
            keys: [
              ...Array.from({ length: 10 }, (_, i) => ({ raw: `KEY_numpad${i}`, label: `Num ${i}` })),
              { raw: 'KEY_numpadplus',   label: 'Num +' },
              { raw: 'KEY_numpadminus',  label: 'Num -' },
              { raw: 'KEY_numpadmultiply', label: 'Num *' },
              { raw: 'KEY_numpaddivide', label: 'Num /' },
              { raw: 'KEY_numpadenter',  label: 'Num ↵' },
              { raw: 'KEY_numpadperiod', label: 'Num .' },
            ]
          },
          {
            group: 'Mouse',
            keys: [
              { raw: 'MOUSE_BUTTON_LEFT',   label: 'LMB' },
              { raw: 'MOUSE_BUTTON_RIGHT',  label: 'RMB' },
              { raw: 'MOUSE_BUTTON_MIDDLE', label: 'MMB' },
              { raw: 'MOUSE_BUTTON_4',      label: 'M4' },
              { raw: 'MOUSE_BUTTON_5',      label: 'M5' },
              { raw: 'MOUSE_AXIS_X+',       label: 'Mouse →' },
              { raw: 'MOUSE_AXIS_X-',       label: 'Mouse ←' },
              { raw: 'MOUSE_AXIS_Y+',       label: 'Mouse ↓' },
              { raw: 'MOUSE_AXIS_Y-',       label: 'Mouse ↑' },
              { raw: 'MOUSE_WHEEL_UP',      label: 'Scroll ↑' },
              { raw: 'MOUSE_WHEEL_DOWN',    label: 'Scroll ↓' },
            ]
          },
        ];

        // Suggested keys for Gamepad/Wheel device
        const GP_SUGGESTIONS = [
          {
            group: 'Buttons',
            keys: Array.from({ length: 16 }, (_, i) => ({ raw: `BUTTON_${i + 1}`, label: `Btn ${i + 1}` }))
          },
          {
            group: 'Axes',
            keys: [
              { raw: 'AXIS_1+', label: 'Axis 1+' }, { raw: 'AXIS_1-', label: 'Axis 1−' },
              { raw: 'AXIS_2+', label: 'Axis 2+' }, { raw: 'AXIS_2-', label: 'Axis 2−' },
              { raw: 'AXIS_3+', label: 'Axis 3+' }, { raw: 'AXIS_3-', label: 'Axis 3−' },
              { raw: 'AXIS_4+', label: 'Axis 4+' }, { raw: 'AXIS_4-', label: 'Axis 4−' },
              { raw: 'AXIS_5+', label: 'Axis 5+' }, { raw: 'AXIS_5-', label: 'Axis 5−' },
              { raw: 'AXIS_6+', label: 'Axis 6+' }, { raw: 'AXIS_6-', label: 'Axis 6−' },
            ]
          },
        ];

        const suggestions = isKB ? KB_SUGGESTIONS : GP_SUGGESTIONS;

        // Build map: rawInput → list of action titles that already use it (for this device)
        const usedInputMap = new Map(); // raw → [actionTitle, ...]
        actions.forEach(act => {
          act.bindings
            .filter(b => b.device === captureModal.device && b.input && b.input.trim())
            // exclude the binding being replaced
            .filter(b => !(act.action === captureModal.action && b.input === captureModal.oldInput))
            .forEach(b => {
              const title = act.action
                .toLowerCase().split('_')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              if (!usedInputMap.has(b.input)) usedInputMap.set(b.input, []);
              usedInputMap.get(b.input).push(title);
            });
        });

        // Well-known system / external app keys (keyboard only) that are commonly reserved
        // These are known to conflict with Windows, Nvidia overlay, Steam, etc.
        const SYSTEM_RESERVED = new Set([
          // Windows system
          'KEY_escape', 'KEY_tab', 'KEY_backspace',
          'KEY_lwin', 'KEY_rwin',
          // Windows + common apps often grab F-keys in combos, but standalone
          // F-keys sometimes grabbed by OEM software / Fn layer:
          'KEY_f1', // help in many apps
          // Print Screen / Scroll Lock / Pause often grabbed by OS
          // Nvidia GeForce Overlay defaults: Alt+Z, Alt+F1–F4, Ctrl+Shift+F5
          // Since we show single keys, flag the ones Nvidia grabs solo:
          // (None solo — Nvidia uses combos, so no single-key conflicts to flag here)
          // Common Steam overlay: Shift+Tab — again a combo
          // Windows snipping / clipboard shortcuts use Win+key combos
          // Flag only things that truly cannot be used alone safely:
          'KEY_return', // Enter is grabbed by UI focus systems
        ]);

        return (
          <div 
            className="modal-overlay" 
            onClick={() => setCaptureModal(null)} 
            style={{ zIndex: 1300, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)' }}
          >
            <div 
              id="keybind-capture-zone"
              className="modal animate-zoom-in" 
              style={{ 
                width: 680, 
                maxWidth: '95vw',
                maxHeight: '90vh',
                padding: '24px', 
                textAlign: 'center', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: 16,
                border: '2px solid var(--accent)',
                boxShadow: '0 8px 32px rgba(var(--accent-rgb), 0.25)',
                overflowY: 'auto'
              }} 
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: '50%', background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', flexShrink: 0 }}>
                  {isKB ? <Monitor size={22} /> : <Gamepad2 size={22} />}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                    {devices.find(d => d.id === captureModal.device)?.name || 'Device'}
                  </div>
                  <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    {captureModal.action
                      .toLowerCase()
                      .split('_')
                      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ')}
                  </h2>
                </div>
              </div>

              {/* Live detection area */}
              <div style={{ 
                width: '100%', 
                padding: '14px 20px', 
                background: detectedInput ? 'rgba(var(--accent-rgb), 0.08)' : 'var(--bg-tertiary)', 
                borderRadius: 'var(--radius-md)', 
                border: detectedInput ? '1px solid var(--accent)' : '1px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                transition: 'all 0.2s ease'
              }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 2 }}>
                    {detectedInput ? 'Captured input:' : 'Press any key, mouse button, or controller input...'}
                  </div>
                  <div style={{ 
                    fontSize: detectedInput ? '20px' : '14px', 
                    fontWeight: 800, 
                    color: detectedInput ? 'var(--accent)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}>
                    {detectedInput ? detectedInput.display : 'Listening...'}
                  </div>
                  {detectedInput && (
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginTop: 2 }}>
                      {detectedInput.rawInput}
                    </div>
                  )}
                </div>
                {detectedInput && (
                  <button
                    onClick={() => setDetectedInput(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}
                    title="Clear"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Suggested Keys Panel */}
              <div style={{ width: '100%', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                    Suggested Keys — click to select
                  </div>
                  {/* Legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: 'var(--text-muted)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger, #ef4444)', display: 'inline-block' }} />
                      Already in use
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: 'var(--text-muted)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning, #f59e0b)', display: 'inline-block' }} />
                      May conflict with system
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {suggestions.map(({ group, keys }) => (
                    <div key={group}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {group}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {keys.map(({ raw, label }) => {
                          const isSelected = detectedInput?.rawInput === raw;
                          const usedBy = usedInputMap.get(raw); // array of action names, or undefined
                          const isUsed = !!usedBy;
                          const isReserved = isKB && SYSTEM_RESERVED.has(raw);

                          // Priority: selected > in-use > system-reserved > default
                          let bg, border, color, opacity;
                          if (isSelected) {
                            bg = 'var(--accent)'; border = '1px solid var(--accent)';
                            color = 'var(--bg-primary)'; opacity = 1;
                          } else if (isUsed) {
                            bg = 'rgba(239, 68, 68, 0.1)'; border = '1px solid rgba(239, 68, 68, 0.5)';
                            color = 'var(--danger, #ef4444)'; opacity = 1;
                          } else if (isReserved) {
                            bg = 'rgba(245, 158, 11, 0.1)'; border = '1px solid rgba(245, 158, 11, 0.4)';
                            color = 'var(--warning, #f59e0b)'; opacity = 1;
                          } else {
                            bg = 'var(--bg-tertiary)'; border = '1px solid var(--border)';
                            color = 'var(--text-secondary)'; opacity = 1;
                          }

                          const tooltip = isSelected
                            ? raw
                            : isUsed
                              ? `In use by: ${usedBy.join(', ')}`
                              : isReserved
                                ? `May conflict with Windows or system apps`
                                : raw;

                          return (
                            <button
                              key={raw}
                              onClick={() => setDetectedInput({ rawInput: raw, display: label })}
                              style={{
                                position: 'relative',
                                padding: '5px 10px',
                                borderRadius: 6,
                                border,
                                background: bg,
                                color,
                                fontSize: '12px',
                                fontWeight: isSelected ? 700 : 500,
                                fontFamily: 'var(--font-mono, monospace)',
                                cursor: 'pointer',
                                transition: 'all 0.12s ease',
                                minWidth: 36,
                                textAlign: 'center',
                                opacity
                              }}
                              title={tooltip}
                            >
                              {label}
                              {/* Small status dot for used/reserved (not when selected) */}
                              {!isSelected && (isUsed || isReserved) && (
                                <span style={{
                                  position: 'absolute',
                                  top: -3,
                                  right: -3,
                                  width: 7,
                                  height: 7,
                                  borderRadius: '50%',
                                  background: isUsed ? 'var(--danger, #ef4444)' : 'var(--warning, #f59e0b)',
                                  border: '1px solid var(--bg-card)'
                                }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', paddingTop: 4 }}>
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
        );
      })()}

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
