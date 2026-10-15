import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { CustomSlider } from '../components/common/CustomSlider';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Plus, Trash2, Save, Package, PlayCircle, Coins, Map, Settings, Info, DollarSign, Share2, Download, Copy, RefreshCw, AlertCircle, Pin, Search, ChevronLeft, ChevronRight, Folder, ChevronDown, Truck, Users, Globe, Eye, Palette, MapPin, Ruler, Thermometer, Maximize, Radio, Video, Gamepad2, Volume2, LayoutGrid, List, Pencil, Sliders } from 'lucide-react';
import { useProfileStore } from '../store/useProfileStore';
import { useModHubStore } from '../store/useModHubStore';
import { useToastStore } from '../store/useToastStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSavegameStore } from '../store/useSavegameStore';
import SaveSlotModal from '../components/profiles/SaveSlotModal';
import DependencyDownloadModal from '../components/common/DependencyDownloadModal';

import { useLocalModsStore } from '../store/useLocalModsStore';
import { resolveRecursiveDependencies } from '../utils/modUtils';
import { parseModCategory, getEffectiveModCategory, MAIN_CATEGORY_NAMES, isMapCategory, isMapMod } from '../utils/categoryUtils';

const MAPS = [
  { id: 'MapUS', title: 'Riverbend Springs' },
  { id: 'MapEU', title: 'Zielonka' },
  { id: 'MapAS', title: 'Hutan Pantai' },
];

const ProfileModImage = ({ mod, zoom, isList }) => {
  
  
  const modIdStr = mod.modId ? String(mod.modId).replace(/^0+/, '') : null;
  const cachedImg = modIdStr ? useModHubStore.getState().modCache?.[modIdStr]?.image : null;
  const [imgSrc, setImgSrc] = useState(cachedImg || mod.iconData || null);

  useEffect(() => {
    let active = true;
    if (!imgSrc && mod.filePath && window.api?.mods?.getIcon) {
        window.api.mods.getIcon({ filePath: mod.filePath, iconFile: mod.iconFile }).then(b64 => {
            if (active && b64) setImgSrc(b64);
        });
    }
    return () => { active = false; };
  }, [imgSrc, mod.filePath, mod.iconFile]);

  if (!imgSrc) {
      return <Package size={isList ? Math.floor(zoom / 2) : Math.floor(zoom / 4)} style={{ opacity: 0.2 }} />;
  }

  const finalUrl = imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc;
  return <img src={finalUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
};

export default function ProfilesPage() {
  const navigate = useNavigate();
  const { profiles, fetchProfiles, createProfile, updateProfile, deleteProfile, exportProfile, importProfile } = useProfileStore();
  const installedMods = useLocalModsStore((state) => state.mods || []);
  const scanMods = useLocalModsStore((state) => state.scanMods);
  const isScanningMods = useLocalModsStore((state) => state.isLoading);
  const { favoriteMods, toggleMustHaveMod } = useModHubStore();
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [folderZooms, setFolderZooms] = useState({});
  const [folderViewModes, setFolderViewModes] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const { expandedFolders, setExpandedFolder, skipDeleteConfirm } = useSettingsStore();
  const [missingDeps, setMissingDeps] = useState(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('profiles_sidebar_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    localStorage.setItem('profiles_sidebar_collapsed', String(next));
  };

  // Local state for the selected profile edit form
  const [profileName, setProfileName] = useState('');
  const [selectedMods, setSelectedMods] = useState(new Set());
  const [modSearchQuery, setModSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [includeMustHaves, setIncludeMustHaves] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [isSelectedSectionOpen, setIsSelectedSectionOpen] = useState(true);
  const [renamingProfileId, setRenamingProfileId] = useState(null);
  const [renamingValue, setRenamingValue] = useState('');
  
  // Template Options
  const [options, setOptions] = useState({
    isCrossPlatform: true,
    loadDefaultFarm: true,
    // General
    autoSaveInterval: 15.0,
    showHelpIcons: true,
    showHints: true,
    // Vehicle Control
    dirtInterval: 2,
    automaticMotorStartEnabled: true,
    stopAndGoBraking: true,
    trailerFillLimit: false,
    fuelUsage: 2,
    // AI Workers
    helperBuyFuel: true,
    helperBuySeeds: true,
    helperBuyFertilizer: true,
    helperSlurrySource: 2,
    helperManureSource: 2,
    // UI & Interaction
    isHelpWindowVisible: true,
    isColorBlindMode: false,
    showInteractiveZoneMarkers: true,
    showInfoTrigger: true,
    showFieldInfo: true,
    // Units
    moneyUnit: 1, // 0: EUR, 1: USD, 2: GBP
    useMetric: true,
    temperatureUnit: 0, // 0: C, 1: F
    areaUnit: 0, // 0: Hectare, 1: Acre
    // Radio & Sound
    isRadioEnabled: true,
    radioVehicleOnly: false,
    masterVolume: 1.0,
    vehicleVolume: 1.0,
    environmentVolume: 0.7,
    radioVolume: 1.0,
    musicVolume: 0.0,
    guiVolume: 0.0,
    voiceVolume: 1.0,
    // Camera
    resetVehicleCamera: true,
    indoorCameraSuspension: true,
    dynamicVehicleCamera: true,
    invertYLook: false,
    cameraSensitivity: 1.0,
    // Input Controls
    inputHelpMode: 0, // 0: Auto, 1: Keyboard, 2: Gamepad
    gearShiftMode: 0, // 0: Auto, 1: Manual with Clutch, 2: Manual
    steeringSensitivity: 1.0,
    steeringBackSpeed: 7.0,
    vehicleArmSensitivity: 1.0,
    forceFeedback: 0.5,
    steeringAssistLines: true,
    steeringAssistCruiseControl: false,
    easyArmControl: true,
    switchToTrainsEnabled: true,
    woodHarvesterAutomaticCutting: true,
  });

  useEffect(() => {
    fetchProfiles();
    if (installedMods.length === 0) {
      scanMods();
    }
  }, [fetchProfiles, scanMods]);

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  useEffect(() => {
    if (selectedProfile) {
      // Only update local state if the profile ID changed or if were not currently editing
      setProfileName(selectedProfile.name);
      setSelectedMods(new Set((selectedProfile?.mods || []).map(m => m.modName)));
      
      // Auto-inject MUST-HAVE mods that are installed
      const mustHaveModNames = installedMods
        .filter(m => favoriteMods.some(fm => fm.isMustHave && ((fm.modId && m.modId && String(fm.modId) === String(m.modId)) || (fm.fileName && m.fileName && fm.fileName === m.fileName))))
        .map(m => m.modName);
      
      if (mustHaveModNames.length > 0) {
        setSelectedMods(prev => {
          const next = new Set(prev);
          mustHaveModNames.forEach(name => next.add(name));
          return next;
        });
      }

      setOptions(prev => ({
        ...prev,
        money: selectedProfile.options?.money || 1000000,
        mapId: selectedProfile.options?.mapId || 'MapUS',
        mapTitle: selectedProfile.options?.mapTitle || 'Riverbend Springs',
        mapModName: selectedProfile.options?.mapModName || null,
        difficulty: selectedProfile.options?.difficulty || 1,
        economicDifficulty: selectedProfile.options?.economicDifficulty || 'NORMAL',
        fixedSeasonLength: selectedProfile.options?.fixedSeasonLength || 1,
        timeScale: selectedProfile.options?.timeScale || 5.0,
        startMonth: selectedProfile.options?.startMonth || 3,
        initialLoan: selectedProfile.options?.initialLoan || 0,
        startMode: selectedProfile.options?.startMode || 'NEW_FARMER',
        includeStartFarm: selectedProfile.options?.includeStartFarm ?? selectedProfile.options?.loadDefaultFarm ?? true,
        loadDefaultFarm: selectedProfile.options?.loadDefaultFarm ?? selectedProfile.options?.includeStartFarm ?? true,
        trafficEnabled: selectedProfile.options?.trafficEnabled ?? true,
        automaticMotorStartEnabled: selectedProfile.options?.automaticMotorStartEnabled ?? true,
        fruitDestruction: selectedProfile.options?.fruitDestruction ?? true,
        isSnowEnabled: selectedProfile.options?.isSnowEnabled ?? true,
        weedsEnabled: selectedProfile.options?.weedsEnabled ?? true,
        stonesEnabled: selectedProfile.options?.stonesEnabled ?? true,
        limeRequired: selectedProfile.options?.limeRequired ?? true,
        plowingRequiredEnabled: selectedProfile.options?.plowingRequiredEnabled ?? false,
        isCrossPlatform: selectedProfile.options?.isCrossPlatform ?? true,
        ...(selectedProfile.options || {})
      }));
    } else {
      setProfileName('');
      setSelectedMods(new Set());
      setOptions(prev => ({
        ...prev,
        money: 1000000,
        initialLoan: 0,
        mapId: 'MapUS',
        mapTitle: 'Riverbend Springs',
        mapModName: null,
        difficulty: 1,
        economicDifficulty: 'NORMAL',
        fixedSeasonLength: 1,
        timeScale: 5.0,
        startMonth: 3,
        startMode: 'NEW_FARMER',
        includeStartFarm: true,
        loadDefaultFarm: true,
        trafficEnabled: true,
        automaticMotorStartEnabled: true,
        fruitDestruction: true,
        isSnowEnabled: true,
        weedsEnabled: true,
        stonesEnabled: true,
        limeRequired: true,
        plowingRequiredEnabled: false,
        isCrossPlatform: true,
      }));
    }
  }, [selectedProfile]);

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [modsPath, setModsPath] = useState('');
  const [probeResult, setProbeResult] = useState(null);
  const [collapsedSettings, setCollapsedSettings] = useState(new Set());

  // Same eligibility as the Installed Mods tag counts: no DLC, no maps, no prefabs
  const isSelectableMod = (m, effCat) => {
    if (!m || m.isMap || m.isDLC || m.folder === 'DLC') return false;
    if (isMapMod(m, effCat)) return false;
    if ((effCat && String(effCat).toLowerCase().includes('prefab')) || (m.title && m.title.toLowerCase().includes('prefab')) || (m.modName && m.modName.toLowerCase().includes('prefab'))) return false;
    return true;
  };

  const isFavouriteMod = (m) => {
    const fnStr = typeof m.fileName === 'string' ? m.fileName : '';
    const mnStr = typeof m.modName === 'string' ? m.modName : '';
    const modBasename = fnStr ? fnStr.split(/[\\/]/).pop().toLowerCase() : (mnStr ? `${mnStr.toLowerCase()}.zip` : '');
    return (useModHubStore.getState().favoriteMods || []).some(fm => {
      if (!fm) return false;
      const idMatch = fm.modId && m.modId && String(fm.modId) === String(m.modId);
      const fmStr = typeof fm.fileName === 'string' ? fm.fileName : '';
      return idMatch || (fmStr && fmStr.toLowerCase() === modBasename);
    });
  };

  const groupedMods = useMemo(() => {
    const groups = {};
    const modCache = useModHubStore.getState().modCache || {};
    installedMods.forEach(mod => {
      const effCat = getEffectiveModCategory(mod, modCache);
      if (!isSelectableMod(mod, effCat)) return;
      const { main } = parseModCategory(effCat, mod.isMap);
      if (!main || main === 'Maps' || main.toLowerCase() === 'maps') return;
      const categoryName = main;
      if (!groups[categoryName]) groups[categoryName] = [];
      groups[categoryName].push(mod);
    });
    return groups;
  }, [installedMods]);

  // Live per-category totals (ignores search / crossplay filters so they match the Installed Mods tags)
  const categoryCounts = useMemo(() => {
    const counts = {};
    Object.entries(groupedMods).forEach(([name, list]) => { counts[name] = list.length; });
    counts.Favourites = Object.values(groupedMods).reduce((n, list) => n + list.filter(isFavouriteMod).length, 0);
    return counts;
  }, [groupedMods, favoriteMods]);

  const availableCategories = useMemo(() => {
    const arr = Object.keys(groupedMods).sort();
    if (categoryCounts.Favourites > 0) arr.unshift('Favourites');
    return arr;
  }, [groupedMods, categoryCounts]);

  const availableBrands = useMemo(() => {
    const brands = new Set();
    const modCache = useModHubStore.getState().modCache || {};
    const hardcoded = useModHubStore.getState().hardcodedBrands || [];
    (installedMods || []).forEach(m => {
      let b = null;
      if (m.modId && modCache[m.modId]?.brand) b = modCache[m.modId].brand;
      if (!b) {
        for (const hb of hardcoded) {
          if (m.title && m.title.toLowerCase().includes(hb.toLowerCase())) { b = hb; break; }
        }
      }
      if (b) brands.add(b);
    });
    return Array.from(brands).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [installedMods]);
  // Handle Select All in folder
  const handleSelectFolderMods = (folderName, mods, deselect = false) => {
    setSelectedMods(prev => {
      const next = new Set(prev);
      mods.forEach(m => {
        if (deselect) next.delete(m.modName);
        else next.add(m.modName);
      });
      return next;
    });
  };

  const toggleFolderExpansion = (folderName) => {
    setExpandedFolder(folderName, !expandedFolders[folderName]);
  };

  const toggleSettingsCollapse = (sectionName) => {
    setCollapsedSettings(prev => {
      const next = new Set(prev);
      if (next.has(sectionName)) next.delete(sectionName);
      else next.add(sectionName);
      return next;
    });
  };

  useEffect(() => {
    if (window.api?.mods) {
      window.api.mods.detectPath().then(res => setModsPath(res.path || res));
    }
  }, []);
 // Trigger only on ID change

  const handleCreateNew = async () => {
    const name = `Profile ${(profiles || []).length + 1}`;
    
    // Auto-select "Must Have" mods
    const mustHaveModNames = (installedMods || [])
      .filter(m => (favoriteMods || []).some(fm => fm.isMustHave && ((fm.modId && m.modId && String(fm.modId) === String(m.modId)) || (fm.fileName && m.fileName && fm.fileName === m.fileName))))
      .map(m => m.modName);
    
    const result = await createProfile(name, (installedMods || []).filter(m => mustHaveModNames.includes(m.modName)));
    if (result.success) {
      setSelectedProfileId(result.profile.id);
      if (mustHaveModNames.length > 0) {
        useToastStore.getState().success(`Template created with ${mustHaveModNames.length} Must-Have mods auto-selected`);
      } else {
        useToastStore.getState().success('Template profile created');
      }
    } else {
      useToastStore.getState().error(result.error);
    }
  };

  const handleSave = async () => {
    if (!selectedProfile) return;
    setIsSaving(true);
    let finalModNames = new Set(selectedMods);
    if (includeMustHaves) {
        (installedMods || [])
          .filter(m => (favoriteMods || []).some(fm => fm.isMustHave && ((fm.modId && m.modId && String(fm.modId) === String(m.modId)) || (fm.fileName && m.fileName && fm.fileName === m.fileName))))
          .forEach(m => finalModNames.add(m.modName));
    }
    const modsToSave = installedMods.filter(m => finalModNames.has(m.modName));
    const result = await updateProfile(selectedProfile.id, profileName, modsToSave, options);
    if (result.success) {
      useToastStore.getState().success('Profile template updated');
    } else {
      useToastStore.getState().error(result.error);
    }
    setIsSaving(false);
  };

  const handleExport = async (id, e) => {
    e.stopPropagation();
    const result = await exportProfile(id);
    if (result.success) {
      useToastStore.getState().success('Template exported successfully');
    } else if (!result.canceled) {
      useToastStore.getState().error(result.error);
    }
  };

  const handleCopyList = (p, e) => {
    e.stopPropagation();
    const modLines = (p.mods || []).map(m => `- ${m.title || m.modName} (v${m.version})`).join('\n');
    const header = `📋 ${p.name} - Mods List:\n`;
    window.api.clipboard.writeText(header + modLines);
    useToastStore.getState().success('Mod list copied to clipboard');
  };

  const handleImport = async () => {
    const result = await importProfile();
    if (result.success) {
      useToastStore.getState().success('Template imported successfully');
    } else if (!result.canceled) {
      useToastStore.getState().error(result.error);
    }
  };

  const handleInitializeSave = async (slotIndex) => {
    if (!selectedProfile) return;
    let finalModNames = new Set(selectedMods);
    if (includeMustHaves) {
        (installedMods || [])
          .filter(m => (favoriteMods || []).some(fm => fm.isMustHave && ((fm.modId && m.modId && String(fm.modId) === String(m.modId)) || (fm.fileName && m.fileName && fm.fileName === m.fileName))))
          .forEach(m => finalModNames.add(m.modName));
    }
    const modsToSave = installedMods.filter(m => finalModNames.has(m.modName));
    
    try {
      if (!window.api?.savegames) {
        useToastStore.getState().error('Savegame API not available');
        return;
      }
      const result = await window.api.savegames.create({
        savegameIndex: slotIndex,
        savegameName: profileName,
        selectedMods: modsToSave,
        ...options
      });

      if (result.success) {
        useToastStore.getState().success(`Savegame successfully created in Slot ${slotIndex}!`);
        setShowSlotModal(false);
        useSavegameStore.getState().fetchSavegames();
      } else {
        useToastStore.getState().error(result.error);
      }
    } catch (err) {
      useToastStore.getState().error(`Failed to create save: ${err.message}`);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    const { skipDeleteConfirm } = useSettingsStore.getState();
    if (!skipDeleteConfirm && !window.confirm('Delete this template?')) return;
    const result = await deleteProfile(id);
    if (result.success) {
      if (selectedProfileId === id) setSelectedProfileId(null);
      useToastStore.getState().success('Template deleted');
    } else {
      useToastStore.getState().error(result.error);
    }
  };

  const handleModeChange = (mode) => {
    let money = options.money;
    let loan = options.initialLoan;
    let eco = options.economicDifficulty;
    let diff = options.difficulty;

    if (mode === 'NEW_FARMER') {
      money = 100000;
      loan = 0;
      eco = 'EASY';
      diff = 1;
    } else if (mode === 'FARM_MANAGER') {
      money = 1500000;
      loan = 0;
      eco = 'NORMAL';
      diff = 2;
    } else if (mode === 'START_FROM_SCRATCH') {
      money = 500000;
      loan = 0;
      eco = 'HARD';
      diff = 3;
    }

    setOptions(prev => ({
      ...prev,
      startMode: mode,
      money,
      initialLoan: loan,
      economicDifficulty: eco,
      difficulty: diff,
      loadDefaultFarm: mode === 'NEW_FARMER'
    }));
  };

  const toggleMod = (modName) => {
    setSelectedMods(prev => {
      const next = new Set(prev);
      if (next.has(modName)) next.delete(modName);
      else next.add(modName);
      return next;
    });
  };

  const handleSidebarRename = async (id, newName) => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== profiles.find(p => p.id === id)?.name) {
      const p = profiles.find(p => p.id === id);
      await updateProfile(id, trimmed, p?.mods || [], p?.options || {});
      if (selectedProfileId === id) setProfileName(trimmed);
      useToastStore.getState().success(`Renamed to ${trimmed}`);
    }
    setRenamingProfileId(null);
  };

  return (
    <div className="page animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0', position: 'relative', minHeight: 0 }}>

      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
        <div>
          <h2 style={{ fontWeight: 'var(--fw-bold)', margin: 0 }}>Game Templates</h2>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', margin: 0 }}>Create game blueprints with preset mods and settings.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="btn btn--primary" onClick={handleCreateNew}>
            <Plus size={16} /> New Template
          </button>
          <button className="btn btn--secondary" onClick={handleImport}>
            <Download size={16} /> Import
          </button>
        </div>
      </div>

      <div className='hide-scrollbar' style={{ flexShrink: 0,
        display: 'flex',
        gap: 'var(--sp-2)',
        overflowX: profiles.length > 5 ? 'auto' : 'visible', 
        borderBottom: '1px solid var(--border)', 
        paddingBottom: '0', 
        marginBottom: 'var(--sp-2)',
        paddingTop: 'var(--sp-2)'
      }}>
        {profiles.map(p => (
          <button
            key={p.id}
            className={`tab-item ${selectedProfile?.id === p.id ? 'tab-item--active' : ''}`}
            onClick={() => setSelectedProfileId(p.id)}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
              borderBottom: selectedProfile?.id === p.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: selectedProfile?.id === p.id ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
              color: selectedProfile?.id === p.id ? 'var(--accent)' : 'var(--text-tertiary)',
              fontWeight: selectedProfile?.id === p.id ? 'var(--fw-bold)' : 'var(--fw-normal)',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {selectedProfile?.id === p.id ? (profileName || p.name) : p.name}
            <span style={{ 
              background: 'rgba(255,255,255,0.1)', 
              padding: '2px 6px', 
              borderRadius: 10, 
              fontSize: '10px' 
            }}>
              {selectedProfile?.id === p.id ? selectedMods.size : (p.mods || []).length}
            </span>
          </button>
        ))}
        {profiles.length === 0 && (
            <div style={{ padding: '10px', color: 'var(--text-muted)' }}>No templates created yet. Click 'New Template' to start.</div>
        )}
      </div>
      <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        {selectedProfile ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-6)', gap: 'var(--sp-4)' }}>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                    handleSave();
                  }
                }}
                style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-bold)', background: 'transparent',  borderBottom: '2px solid var(--border)', padding: 'var(--sp-1) 0', color: 'var(--text-primary)', flex: 1, outline: 'none' }}
                placeholder="Template Name"
              />
              {options.isCrossPlatform && (
                <div className="crossplay-badge-header animate-fade-in" title="Crossplay is enabled. Only console-compatible mods are visible.">
                  <Globe size={12} />
                  CROSSPLAY
                </div>
              )}
              {/* Added Icon Actions */}
              <div style={{ display: 'flex', gap: '8px', paddingRight: '16px', borderRight: '1px solid var(--border)' }}>
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={(e) => handleCopyList(selectedProfile, e)} title="Copy Mod List to Clipboard" style={{ color: 'var(--text-tertiary)' }}><Copy size={16} /></button>
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={(e) => handleExport(selectedProfile.id, e)} title="Export Template" style={{ color: 'var(--accent)' }}><Share2 size={16} /></button>
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={(e) => handleDelete(selectedProfile.id, e)} title="Delete Template" style={{ color: 'var(--error)' }}><Trash2 size={16} /></button>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button className="btn btn--secondary" onClick={handleSave} disabled={isSaving}>
                  <Save size={16} /> {isSaving ? 'Saving...' : 'Save Template'}
                </button>
                <button 
                  className="btn btn--primary" 
                  onClick={() => setShowSlotModal(true)}
                  style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
                >
                  <PlayCircle size={16} /> Create Save
                </button>
              </div>
            </div>

            <div className="tab-switcher">
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

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginTop: 'var(--sp-4)' }}>
              {activeTab === 'general' && (
                <>
                  <div className="settings-tab-content">
                    <div className="settings-panel" style={{ marginBottom: 'var(--sp-4)' }}>
                      <h3 className="section-title"><Map size={16} /> Base Information</h3>
                      <div style={{ marginBottom: 'var(--sp-4)' }}>
                          <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Starting Mode (Presets)</label>
                          <select 
                            value={options.startMode} 
                            onChange={e => handleModeChange(e.target.value)}
                            style={{ width: '100%', padding: '8px', border: '1px solid var(--accent)', background: 'var(--bg-surface)', color: 'var(--accent)', fontWeight: 700, borderRadius: 'var(--radius-sm)' }}
                          >
                              <option value="NEW_FARMER">New Farmer</option>
                              <option value="FARM_MANAGER">Farm Manager</option>
                              <option value="START_FROM_SCRATCH">Start From Scratch</option>
                          </select>
                      </div>
                      <div className="settings-grid">
                        <div className="setting">
                          <label>Starting Money</label>
                          <div className="input-with-icon">
                            <Coins size={14} />
                            <input 
                              type="number" 
                              value={options.money} 
                              onChange={e => setOptions(prev => ({ ...prev, money: parseInt(e.target.value) }))} 
                              style={{ paddingLeft: 32 }}
                            />
                          </div>
                        </div>
                        <div className="setting">
                          <label>Map Selection</label>
                          <div className="input-with-icon">
                            <Map size={14} />
                            <select 
                              value={options.mapModName ? `${options.mapId}|${options.mapTitle}|${options.mapModName}` : options.mapId}
                              style={{ paddingLeft: 32 }}
                              onChange={e => {
                                const val = e.target.value;
                                if (val.includes('|')) {
                                  const [mapId, title, modName] = val.split('|');
                                  setOptions(prev => ({ ...prev, mapId: mapId, mapModName: modName, mapTitle: title }));
                                  try {
                                    const { installed, missing } = resolveRecursiveDependencies(modName, installedMods);
                                    if (installed.size > 0) setSelectedMods(prev => { const next = new Set(prev); installed.forEach(d => next.add(d)); return next; });
                                    if (missing.size > 0) setMissingDeps(Array.from(missing)); else setMissingDeps(null);
                                  } catch (e) { console.error('[MAP SELECT] Dependency auto-select failed:', e); }
                                } else {
                                  const m = MAPS.find(m => m.id === val);
                                  setOptions(prev => ({ ...prev, mapId: val, mapModName: null, mapTitle: m?.title || 'Unknown' }));
                                }
                              }}
                            >
                              <optgroup label="Official Maps">
                                {MAPS.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                              </optgroup>
                              {installedMods.some(m => isMapMod(m, getEffectiveModCategory(m, useModHubStore.getState().modCache || {}))) && (
                                <optgroup label="Modded Maps">
                                  {installedMods.filter(m => isMapMod(m, getEffectiveModCategory(m, useModHubStore.getState().modCache || {}))).map(m => {
                                    const isCP = (
                                      m.isCrossplay || 
                                      /crossplay|\(cp\)|\[cp\]/i.test(m.title || '') ||
                                      /crossplay|\(cp\)|\[cp\]/i.test(m.modName || '') ||
                                      /crossplay|\(cp\)|\[cp\]/i.test(m.fileName || '') ||
                                      /crossplay|\(cp\)|\[cp\]/i.test(m.filePath || '') ||
                                      /crossplay|\(cp\)|\[cp\]/i.test(m.folder || '')
                                    );
                                     let baseTitle = (m.title || '').replace(/\s*[\(\[]\s*(?:crossplay|cp)\s*[\)\]]\s*$/i, '')
                                                                    .replace(/\s+crossplay\s*$/i, '')
                                                                    .replace(/\s+cp\s*$/i, '')
                                                                    .trim();
                                     const displayTitle = isCP ? `${baseTitle} (CP)` : baseTitle;
                                    const compoundValue = `${m.mapId || m.modName}|${m.title || m.modName}|${m.modName}`;
                                    return (<option key={compoundValue} value={compoundValue}>{displayTitle}</option>);
                                  })}
                                </optgroup>
                              )}
                            </select>
                          </div>
                        </div>
                        <div className="setting">
                          <label>Initial Loan</label>
                          <div className="input-with-icon">
                            <DollarSign size={14} />
                            <input 
                              type="number" 
                              value={options.initialLoan || 0} 
                              onChange={e => setOptions(prev => ({ ...prev, initialLoan: parseInt(e.target.value) }))} 
                              style={{ paddingLeft: 32 }}
                            />
                          </div>
                        </div>
                        <div className="setting">
                          <label className="checkbox-setting">
                            <input type="checkbox" checked={options.includeStartFarm ?? options.loadDefaultFarm ?? true} onChange={e => setOptions(prev => ({ ...prev, includeStartFarm: e.target.checked, loadDefaultFarm: e.target.checked }))} />
                            <span>Include Starting Farm & Vehicles</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="settings-panel" style={{ marginBottom: 'var(--sp-4)' }}>
                      <h3 className="section-title"><Settings size={16} /> Preferences</h3>
                      <div className="settings-grid">
                        <div className="setting">
                          <label>Auto Save</label>
                          <select value={options.autoSaveInterval} onChange={e => setOptions(prev => ({ ...prev, autoSaveInterval: parseFloat(e.target.value) }))}>
                            <option value="0">Off</option>
                            <option value="5">5 Min</option>
                            <option value="10">10 Min</option>
                            <option value="15">15 Min</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="settings-panel" style={{ marginBottom: 'var(--sp-4)' }}>
                      <h3 className="section-title"><Volume2 size={16} /> Audio & Sound</h3>
                      <div className="settings-grid">
                        <div className="setting">
                          <label className="checkbox-setting">
                            <input type="checkbox" checked={options.isRadioEnabled} onChange={e => setOptions(prev => ({ ...prev, isRadioEnabled: e.target.checked }))} />
                            <span>Radio Enabled</span>
                          </label>
                        </div>
                        <div className="setting">
                          <label className="checkbox-setting">
                            <input type="checkbox" checked={options.radioVehicleOnly} onChange={e => setOptions(prev => ({ ...prev, radioVehicleOnly: e.target.checked }))} />
                            <span>Radio in Vehicles Only</span>
                          </label>
                        </div>
                        <div className="setting">
                          <label>Master Volume ({Math.round((parseFloat(options.masterVolume) || 0) * 100)}%)</label>
                          <CustomSlider min="0" max="1" step="0.05" value={options.masterVolume} onChange={e => setOptions(prev => ({ ...prev, masterVolume: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>Vehicle Volume ({Math.round((parseFloat(options.vehicleVolume ?? 1.0) || 0) * 100)}%)</label>
                          <CustomSlider min="0" max="1" step="0.05" value={options.vehicleVolume ?? 1.0} onChange={e => setOptions(prev => ({ ...prev, vehicleVolume: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>Environment Volume ({Math.round((parseFloat(options.environmentVolume ?? 0.7) || 0) * 100)}%)</label>
                          <CustomSlider min="0" max="1" step="0.05" value={options.environmentVolume ?? 0.7} onChange={e => setOptions(prev => ({ ...prev, environmentVolume: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>Radio Volume ({Math.round((parseFloat(options.radioVolume ?? 1.0) || 0) * 100)}%)</label>
                          <CustomSlider min="0" max="1" step="0.05" value={options.radioVolume ?? 1.0} onChange={e => setOptions(prev => ({ ...prev, radioVolume: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>Music Volume ({Math.round((parseFloat(options.musicVolume ?? 0.0) || 0) * 100)}%)</label>
                          <CustomSlider min="0" max="1" step="0.05" value={options.musicVolume ?? 0.0} onChange={e => setOptions(prev => ({ ...prev, musicVolume: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>GUI Volume ({Math.round((parseFloat(options.guiVolume ?? 0.0) || 0) * 100)}%)</label>
                          <CustomSlider min="0" max="1" step="0.05" value={options.guiVolume ?? 0.0} onChange={e => setOptions(prev => ({ ...prev, guiVolume: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>Voice Volume ({Math.round((parseFloat(options.voiceVolume ?? 1.0) || 0) * 100)}%)</label>
                          <CustomSlider min="0" max="1" step="0.05" value={options.voiceVolume ?? 1.0} onChange={e => setOptions(prev => ({ ...prev, voiceVolume: parseFloat(e.target.value) }))} />
                        </div>
                      </div>
                    </div>

                    <div className="settings-panel" style={{ marginBottom: 'var(--sp-4)' }}>
                      <h3 className="section-title"><Video size={16} /> Camera Settings</h3>
                      <div className="settings-grid">
                        <div className="setting">
                          <label>Camera Sensitivity ({Math.round((parseFloat(options.cameraSensitivity) || 0) * 100)}%)</label>
                          <CustomSlider min="0.5" max="2.0" step="0.1" value={options.cameraSensitivity} onChange={e => setOptions(prev => ({ ...prev, cameraSensitivity: parseFloat(e.target.value) }))} />
                        </div>
                        <label className="checkbox-setting"><input type="checkbox" checked={options.resetVehicleCamera} onChange={e => setOptions(prev => ({ ...prev, resetVehicleCamera: e.target.checked }))} /><span>Reset Vehicle Camera</span></label>
                        <label className="checkbox-setting"><input type="checkbox" checked={options.indoorCameraSuspension} onChange={e => setOptions(prev => ({ ...prev, indoorCameraSuspension: e.target.checked }))} /><span>Indoor Camera Suspension</span></label>
                        <label className="checkbox-setting"><input type="checkbox" checked={options.dynamicVehicleCamera} onChange={e => setOptions(prev => ({ ...prev, dynamicVehicleCamera: e.target.checked }))} /><span>Dynamic Vehicle Camera</span></label>
                        <label className="checkbox-setting"><input type="checkbox" checked={options.invertYLook} onChange={e => setOptions(prev => ({ ...prev, invertYLook: e.target.checked }))} /><span>Invert Y-Look</span></label>
                      </div>
                    </div>

                                      </div>
                </>
              )}

              {activeTab === 'realism' && (
                <>
                  <div className="settings-tab-content">
                    <div className="settings-panel">
                      <h3 className="section-title"><AlertCircle size={16} /> Gameplay Realism</h3>
                      <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                          <label className="checkbox-setting"><input type="checkbox" checked={options.trafficEnabled} onChange={e => setOptions(prev => ({ ...prev, trafficEnabled: e.target.checked }))} /><span>Traffic Enabled</span></label>
                          <label className="checkbox-setting"><input type="checkbox" checked={options.fruitDestruction} onChange={e => setOptions(prev => ({ ...prev, fruitDestruction: e.target.checked }))} /><span>Crop Destruction</span></label>
                          <label className="checkbox-setting"><input type="checkbox" checked={options.plowingRequiredEnabled} onChange={e => setOptions(prev => ({ ...prev, plowingRequiredEnabled: e.target.checked }))} /><span>Periodic Plowing</span></label>
                          <label className="checkbox-setting"><input type="checkbox" checked={options.limeRequired} onChange={e => setOptions(prev => ({ ...prev, limeRequired: e.target.checked }))} /><span>Lime Required</span></label>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                          <label className="checkbox-setting"><input type="checkbox" checked={options.isSnowEnabled} onChange={e => setOptions(prev => ({ ...prev, isSnowEnabled: e.target.checked }))} /><span>Snow Enabled</span></label>
                          <label className="checkbox-setting"><input type="checkbox" checked={options.weedsEnabled} onChange={e => setOptions(prev => ({ ...prev, weedsEnabled: e.target.checked }))} /><span>Weeds Enabled</span></label>
                          <label className="checkbox-setting"><input type="checkbox" checked={options.stonesEnabled} onChange={e => setOptions(prev => ({ ...prev, stonesEnabled: e.target.checked }))} /><span>Field Stones</span></label>
                        </div>
                      </div>
                    </div>

                    <div className="settings-panel" style={{ marginTop: 'var(--sp-4)' }}>
                      <h3 className="section-title"><Ruler size={16} /> Measuring Units</h3>
                      <div className="settings-grid">
                        <div className="setting">
                          <label>Money Unit</label>
                          <select value={options.moneyUnit} onChange={e => setOptions(prev => ({ ...prev, moneyUnit: parseInt(e.target.value) }))}>
                            <option value="0">Euro (€)</option>
                            <option value="1">Dollar ($)</option>
                            <option value="2">Pound (£)</option>
                          </select>
                        </div>
                        <div className="setting">
                          <label>Measuring Unit</label>
                          <select value={options.useMetric ? 'true' : 'false'} onChange={e => setOptions(prev => ({ ...prev, useMetric: e.target.value === 'true' }))}>
                            <option value="true">Kilometers</option>
                            <option value="false">Miles</option>
                          </select>
                        </div>
                        <div className="setting">
                          <label>Temperature Unit</label>
                          <select value={options.temperatureUnit} onChange={e => setOptions(prev => ({ ...prev, temperatureUnit: parseInt(e.target.value) }))}>
                            <option value="0">Celsius</option>
                            <option value="1">Fahrenheit</option>
                          </select>
                        </div>
                        <div className="setting">
                          <label>Area Unit</label>
                          <select value={options.areaUnit} onChange={e => setOptions(prev => ({ ...prev, areaUnit: parseInt(e.target.value) }))}>
                            <option value="0">Hectares</option>
                            <option value="1">Acres</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'controls' && (
                <>
                  <div className="settings-tab-content">
                    <div className="settings-panel" style={{ marginBottom: 'var(--sp-4)' }}>
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
                          onClick={() => navigate('/keybinds')}
                        >
                          Open Keybinds Manager &rarr;
                        </button>
                      </div>
                    </div>

                    <div className="settings-panel">
                      <h3 className="section-title"><Gamepad2 size={16} /> Input Controls</h3>
                      <div className="settings-grid">
                        <div className="setting">
                          <label>Input Help Mode</label>
                          <select value={options.inputHelpMode} onChange={e => setOptions(prev => ({ ...prev, inputHelpMode: parseInt(e.target.value) }))}>
                            <option value="0">Auto</option>
                            <option value="1">Keyboard</option>
                            <option value="2">Gamepad</option>
                          </select>
                        </div>
                        <div className="setting">
                          <label>Gear Shift Mode</label>
                          <select value={options.gearShiftMode} onChange={e => setOptions(prev => ({ ...prev, gearShiftMode: parseInt(e.target.value) }))}>
                            <option value="0">Automatic</option>
                            <option value="1">Manual with Clutch</option>
                            <option value="2">Manual</option>
                          </select>
                        </div>
                        <div className="setting">
                          <label>Steering Sensitivity ({Math.round((parseFloat(options.steeringSensitivity) || 1.0) * 100)}%)</label>
                          <CustomSlider min="0.5" max="2.0" step="0.05" value={options.steeringSensitivity ?? 1.0} onChange={e => setOptions(prev => ({ ...prev, steeringSensitivity: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>Steering Return Speed ({parseFloat(options.steeringBackSpeed ?? 7.0).toFixed(1)})</label>
                          <CustomSlider min="1.0" max="15.0" step="0.5" value={options.steeringBackSpeed ?? 7.0} onChange={e => setOptions(prev => ({ ...prev, steeringBackSpeed: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>Vehicle Arm Sensitivity ({Math.round((parseFloat(options.vehicleArmSensitivity) || 1.0) * 100)}%)</label>
                          <CustomSlider min="0.5" max="2.0" step="0.05" value={options.vehicleArmSensitivity ?? 1.0} onChange={e => setOptions(prev => ({ ...prev, vehicleArmSensitivity: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label>Force Feedback ({Math.round((parseFloat(options.forceFeedback) || 0.5) * 100)}%)</label>
                          <CustomSlider min="0" max="1" step="0.05" value={options.forceFeedback ?? 0.5} onChange={e => setOptions(prev => ({ ...prev, forceFeedback: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="setting">
                          <label className="checkbox-setting">
                            <input type="checkbox" checked={options.steeringAssistLines !== false} onChange={e => setOptions(prev => ({ ...prev, steeringAssistLines: e.target.checked }))} />
                            <span>Steering Assist Lines</span>
                          </label>
                        </div>
                        <div className="setting">
                          <label className="checkbox-setting">
                            <input type="checkbox" checked={options.steeringAssistCruiseControl || false} onChange={e => setOptions(prev => ({ ...prev, steeringAssistCruiseControl: e.target.checked }))} />
                            <span>Steering Assist Cruise Control</span>
                          </label>
                        </div>
                        <div className="setting">
                          <label className="checkbox-setting">
                            <input type="checkbox" checked={options.easyArmControl !== false} onChange={e => setOptions(prev => ({ ...prev, easyArmControl: e.target.checked }))} />
                            <span>Easy Arm Control</span>
                          </label>
                        </div>
                        <div className="setting">
                          <label className="checkbox-setting">
                            <input type="checkbox" checked={options.switchToTrainsEnabled} onChange={e => setOptions(prev => ({ ...prev, switchToTrainsEnabled: e.target.checked }))} />
                            <span>Allow Switching to Trains</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'mods' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ marginBottom: 'var(--sp-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                      <h3 className="section-title" style={{ margin: 0 }}>Select Mods</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', background: 'var(--bg-secondary)', padding: '2px 10px', borderRadius: '100px', border: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)' }}>{selectedMods.size}</span>
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Selected</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
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
                        <option key={c} value={c}>{c} ({categoryCounts[c] ?? 0})</option>
                      ))}
                    </select>
                  )}
                  <div className="search-input-wrapper" style={{ position: 'relative', minWidth: '240px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          placeholder="Search mods..."
                          value={modSearchQuery}
                          onChange={(e) => setModSearchQuery(e.target.value)}
                          style={{
                            width: '100%',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--sp-2) var(--sp-2) var(--sp-2) 32px',
                            fontSize: 'var(--fs-sm)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            transition: 'border-color 0.2s'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                          <input 
                            type="checkbox" 
                            checked={includeMustHaves} 
                            onChange={(e) => setIncludeMustHaves(e.target.checked)}
                            style={{ accentColor: 'var(--accent)' }}
                          /> 
                          Include Must-Haves
                        </label>
                        <label style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          fontSize: 'var(--fs-xs)', 
                          color: options.isCrossPlatform ? 'orange' : 'var(--text-secondary)', 
                          cursor: 'pointer', 
                          userSelect: 'none', 
                          background: options.isCrossPlatform ? 'rgba(255,165,0,0.1)' : 'transparent', 
                          padding: '2px 8px', 
                          borderRadius: '4px',
                          border: options.isCrossPlatform ? '1px solid rgba(255, 165, 0, 0.2)' : '1px solid transparent',
                          transition: 'all 0.2s'
                        }}>
                          <input 
                            type="checkbox" 
                            checked={options.isCrossPlatform} 
                            onChange={(e) => {
                              const newVal = e.target.checked;
                              setOptions(prev => ({ ...prev, isCrossPlatform: newVal }));
                              if (newVal) {
                                // Automatically deselect incompatible mods when turning on Crossplay Only
                                setSelectedMods(prev => {
                                  const next = new Set(prev);
                                  installedMods.forEach(m => {
                                    const isPCOnly = (m.scripts && m.scripts.length > 0) || (m.specializations && m.specializations.length > 0);
                                    if (isPCOnly) next.delete(m.modName);
                                  });
                                  return next;
                                });
                              }
                            }}
                            style={{ accentColor: 'orange' }}
                          /> 
                          Crossplay Only
                        </label>
                        <div style={{ width: 1, height: 16, background: 'var(--border)' }}></div>
                        <button className="btn btn--ghost btn--sm" onClick={() => {
                          const cache = useModHubStore.getState().modCache || {};
                          const nonPCOnlyModNames = installedMods
                            .filter(m => isSelectableMod(m, getEffectiveModCategory(m, cache)))
                            .filter(m => !options.isCrossPlatform || !((m.scripts && m.scripts.length > 0) || (m.specializations && m.specializations.length > 0)))
                            .map(m => m.modName);
                          setSelectedMods(new Set(nonPCOnlyModNames));
                        }}>Select All</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setSelectedMods(new Set())}>Clear</button>
                        <div style={{ width: 1, height: 16, background: 'var(--border)' }}></div>
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-2)' }}>
                    {installedMods.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', textAlign: 'center', padding: 'var(--sp-6)' }}>
                        No installed mods found. Download some from the ModHub first!
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                        {/* COLLAPSIBLE SELECTED MODS SECTION */}
                        {(() => {
                          const explicitlySelected = installedMods.filter(m => selectedMods.has(m.modName));
                          if (explicitlySelected.length === 0) return null;
                          return (
                            <div style={{ 
                              background: 'var(--bg-secondary)', 
                              borderRadius: 'var(--radius-md)', 
                              border: '1px solid var(--accent)', 
                              overflow: 'hidden', 
                              marginBottom: 'var(--sp-2)' 
                            }}>
                              <div 
                                onClick={() => setIsSelectedSectionOpen(prev => !prev)}
                                style={{ 
                                  padding: '10px 14px', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between', 
                                  background: 'rgba(var(--accent-rgb), 0.1)', 
                                  cursor: 'pointer', 
                                  borderBottom: isSelectedSectionOpen ? '1px solid var(--border-subtle)' : 'none' 
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                                  <ChevronDown size={18} style={{ color: 'var(--accent)', transform: isSelectedSectionOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
                                    <span style={{ fontWeight: 800, fontSize: 'var(--fs-sm)', letterSpacing: '0.5px', color: 'var(--accent)' }}>
                                      SELECTED MODS ({explicitlySelected.length})
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {isSelectedSectionOpen && (
                                <div style={{ padding: 'var(--sp-3)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--sp-2)' }}>
                                  {explicitlySelected.map(mod => {
                                    const mBasename = mod.fileName ? mod.fileName.split(/[\\/\\]/).pop().toLowerCase() : (mod.modName ? `${mod.modName.toLowerCase()}.zip` : '');
                                    const isMustHave = favoriteMods.some(f => f.isMustHave && (
                                      (f.modId && mod.modId && String(f.modId) === String(mod.modId)) || 
                                      (f.fileName && f.fileName.toLowerCase() === mBasename)
                                    ));
                                    const isConflict = false; // Profiles page checks or conflicts
                                    const isPCOnly = (mod.scripts && mod.scripts.length > 0) || (mod.specializations && mod.specializations.length > 0);

                                    return (
                                      <div 
                                        key={mod.modName} 
                                        onClick={() => toggleMod(mod.modName)}
                                        className="mod-template-item mod-template-item--active"
                                        style={{ 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          gap: '12px', 
                                          padding: '8px 12px',
                                          background: 'var(--accent-dim)',
                                          borderRadius: 'var(--radius-md)',
                                          border: '2px solid var(--accent)',
                                          boxShadow: '0 2px 8px rgba(var(--accent-rgb), 0.1)',
                                          transition: 'all 0.15s ease',
                                          cursor: 'pointer'
                                        }}
                                        title="Click to deselect"
                                      >
                                        <div style={{ 
                                          width: 56, 
                                          height: 56, 
                                          borderRadius: 6, 
                                          background: 'rgba(255, 255, 255, 0.03)', 
                                          border: '1px solid var(--border-subtle)', 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          justifyContent: 'center', 
                                          overflow: 'hidden',
                                          flexShrink: 0
                                        }}>
                                          <ProfileModImage mod={mod} zoom={56} isList={true} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div 
                                            className="mod-card__title" 
                                            title={mod.title || mod.modName}
                                            style={{ 
                                              fontSize: 'var(--fs-sm)', 
                                              color: 'var(--text-primary)',
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              fontWeight: 800
                                            }}
                                          >
                                            {mod.title || mod.modName}
                                          </div>
                                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', display: 'flex', gap: 8, marginTop: 2 }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.author || 'Unknown'}</span>
                                            <span>v{mod.version || '1.0.0.0'}</span>
                                          </div>
                                          {isPCOnly && (
                                            <span className="pc-only-badge" style={{ marginTop: 2 }}>PC ONLY</span>
                                          )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                          {isMustHave && (
                                            <Pin size={14} fill="var(--accent)" style={{ color: 'var(--accent)' }} />
                                          )}
                                          <CheckSquare size={16} style={{ color: 'var(--accent)' }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {(() => {
                          const allFolderNames = Object.keys(groupedMods).sort((a,b) => a === 'MAIN' ? -1 : b === 'MAIN' ? 1 : a.localeCompare(b));
                          
                          const renderedGroups = allFolderNames.map(folderName => {
                            const folderMods = groupedMods[folderName];
                            if (selectedCategory && selectedCategory !== 'Favourites' && folderName !== selectedCategory) {
                              return null;
                            }
                            const filteredFolderMods = folderMods.filter(m => {
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
                              }
                              if (selectedBrand) {
                                const modCache = useModHubStore.getState().modCache || {};
                                let b = null;
                                if (m.modId && modCache[m.modId]?.brand) b = modCache[m.modId].brand;
                                if (!b) {
                                  const hardcoded = useModHubStore.getState().hardcodedBrands || [];
                                  for (const hb of hardcoded) {
                                    if (m.title && m.title.toLowerCase().includes(hb.toLowerCase())) { b = hb; break; }
                                  }
                                }
                                if (b !== selectedBrand) return false;
                              }
                              if (modSearchQuery) {
                                const q = modSearchQuery.toLowerCase();
                                if (!(m.title?.toLowerCase().includes(q) || m.modName.toLowerCase().includes(q))) return false;
                              }
                              if (options.isCrossPlatform) {
                                const isPCOnly = (m.scripts && m.scripts.length > 0) || (m.specializations && m.specializations.length > 0);
                                if (isPCOnly) return false;
                              }
                              return true;
                            });

                            if (filteredFolderMods.length === 0) return null;

                            const isExpanded = expandedFolders[folderName] || (modSearchQuery && filteredFolderMods.length > 0);
                            const selectedInFolder = filteredFolderMods.filter(m => selectedMods.has(m.modName)).length;
                            const allSelected = selectedInFolder === filteredFolderMods.length && filteredFolderMods.length > 0;
                            const viewMode = folderViewModes[folderName] || 'list';
                            const zoom = folderZooms[folderName] || 220;

                            // Scale factors
                            const listIconSize = Math.floor(68 + ((zoom - 120) / (350 - 120)) * 52);

                            return (
                              <div key={folderName} className="folder-selection-group" style={{ 
                                background: 'var(--bg-secondary)', 
                                borderRadius: 'var(--radius-md)', 
                                border: '1px solid var(--border-subtle)',
                                overflow: 'hidden',
                                marginBottom: 'var(--sp-2)'
                              }}>
                                <div 
                                  onClick={() => toggleFolderExpansion(folderName)}
                                  style={{ 
                                    padding: '10px 14px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    background: isExpanded ? 'rgba(var(--accent-rgb), 0.05)' : 'transparent',
                                    cursor: 'pointer',
                                    borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <Folder size={14} style={{ color: 'var(--accent)' }} />
                                    <span style={{ fontWeight: 800, fontSize: 13 }}>{folderName.toUpperCase()}</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 10 }}>
                                      {selectedInFolder} / {filteredFolderMods.length}
                                    </span>
                                  </div>
                                  
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                                    <button 
                                      className="btn btn--ghost btn--xs" 
                                      onClick={() => handleSelectFolderMods(folderName, filteredFolderMods, allSelected)}
                                      style={{ color: allSelected ? 'var(--error)' : 'var(--accent)', fontWeight: 700, fontSize: 10, marginRight: 8 }}
                                    >
                                      {allSelected ? 'DESELECT ALL' : 'SELECT ALL'}
                                    </button>

                                    {/* Zoom Slider */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.05)' }}>
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
                                        <CustomSlider
                                          min="120"
                                          max="350"
                                          step="10"
                                          value={zoom}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setFolderZooms(prev => ({ ...prev, [folderName]: val }));
                                          }}
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
                                          title="Adjust Grid Size"
                                        />
                                      </div>
                                      <LayoutGrid size={16} style={{ opacity: 0.7 }} />
                                    </div>

                                    {/* View Mode Toggle */}
                                    <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', padding: 2, borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', marginRight: 6 }}>
                                      <button 
                                        onClick={() => setFolderViewModes(prev => ({ ...prev, [folderName]: 'list' }))}
                                        style={{ 
                                          display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4, 
                                          background: viewMode === 'list' ? 'var(--accent)' : 'transparent',
                                          color: viewMode === 'list' ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                                           cursor: 'pointer', transition: 'all 0.2s', width: 32, height: 28, justifyContent: 'center'
                                        }}
                                        title="List View"
                                      >
                                        <List size={14} strokeWidth={viewMode === 'list' ? 3 : 2} />
                                      </button>
                                      <button 
                                        onClick={() => setFolderViewModes(prev => ({ ...prev, [folderName]: 'grid' }))}
                                        style={{ 
                                          display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4, 
                                          background: viewMode === 'grid' ? 'var(--accent)' : 'transparent',
                                          color: viewMode === 'grid' ? 'var(--bg-primary)' : 'var(--text-tertiary)',
                                           cursor: 'pointer', transition: 'all 0.2s', width: 32, height: 28, justifyContent: 'center'
                                        }}
                                        title="Grid View"
                                      >
                                        <LayoutGrid size={13} strokeWidth={viewMode === 'grid' ? 3 : 2} />
                                      </button>
                                    </div>

                                  </div>
                                </div>

                                {isExpanded && (
                                  <div style={{ 
                                    padding: '16px', 
                                    display: 'grid', 
                                    gridTemplateColumns: viewMode === 'grid' 
                          ? `repeat(auto-fill, minmax(${Math.max(240, zoom * 1.3)}px, 1fr))`
                                      : `repeat(auto-fill, minmax(${Math.max(280, zoom)}px, 1fr))`, 
                                    gap: '12px' 
                                  }}>
                                    {filteredFolderMods.map(mod => {
                                      const isMustHave = favoriteMods.some(fm => fm.isMustHave && ((fm.modId && mod.modId && String(fm.modId) === String(mod.modId)) || (fm.fileName && mod.fileName && fm.fileName === mod.fileName)));
                                      const isPCOnly = (mod.scripts && mod.scripts.length > 0) || (mod.specializations && mod.specializations.length > 0);
                                      const isConflict = options.isCrossPlatform && isPCOnly;
                                      const isSelected = selectedMods.has(mod.modName);
                                      
                                      
                                      
                                      
                                      

                                      if (viewMode === 'grid') {
                                        return (
                                          <div 
                                            key={mod.modName} 
                                            onClick={() => toggleMod(mod.modName)}
                                            style={{ 
                                              display: 'flex', 
                                              flexDirection: 'column', 
                                              gap: '12px', 
                                              padding: '12px',
                                              background: isConflict ? 'rgba(255, 100, 0, 0.05)' : 'var(--bg-tertiary)',
                                              borderRadius: 'var(--radius-md)',
                                              border: isSelected ? '2px solid var(--accent)' : (isConflict ? '1px solid rgba(255, 100, 0, 0.3)' : '1px solid var(--border-subtle)'),
                                              boxShadow: isSelected ? '0 0 15px var(--accent-dim)' : 'var(--shadow-sm)',
                                              transition: 'all 0.2s',
                                              cursor: 'pointer',
                                              position: 'relative'
                                            }}
                                          >
                                            <div style={{ 
                                              width: '100%', 
                                              aspectRatio: '1/1', 
                                              background: 'rgba(255,255,255,0.03)', 
                                              borderRadius: 'var(--radius-sm)', 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              justifyContent: 'center', 
                                              overflow: 'hidden',
                                              border: '1px solid rgba(255,255,255,0.05)'
                                            }}>
                                              <ProfileModImage mod={mod} zoom={zoom} isList={false} />
                                              {isMustHave && (
                                                <div style={{ position: 'absolute', top: 6, right: 6, color: 'var(--accent)', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}>
                                                  <Pin size={14} fill="var(--accent)" />
                                                </div>
                                              )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                                              <div 
                                                  className="mod-card__title"
                                                  style={{ 
                                                    fontSize: zoom < 160 ? 11 : 13, 
                                                    color: isConflict ? 'orange' : 'var(--text-primary)',
                                                    whiteSpace: 'normal',
                                                      fontWeight: 800,
                                                    height: 'auto'
                                                  }}
                                                  title={mod.title || mod.modName}
                                                >
                                                {mod.title || mod.modName}
                                              </div>
                                                {zoom >= 160 && (
                                                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>{mod.author || 'Unknown'}</div>
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, opacity: 0.7 }}>
                                                      <span>v{mod.version || '1.0.0.0'}</span>
                                                    </div>
                                                  </div>
                                                )}
                                              {isPCOnly && <div className="pc-only-badge">PC ONLY</div>}
                                            </div>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              readOnly
                                              style={{ position: 'absolute', top: 8, left: 8, accentColor: isConflict ? 'orange' : 'var(--accent)', width: 16, height: 16 }}
                                            />
                                          </div>
                                        );
                                      }

                                      return (
                                        <div 
                                          key={mod.modName} 
                                          onClick={() => toggleMod(mod.modName)}
                                          className={`mod-template-item ${isSelected ? 'mod-template-item--active' : ''} ${isConflict ? 'mod-template-item--conflict' : ''}`}
                                          style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '16px', 
                                            padding: '10px 16px',
                                            background: isConflict ? 'rgba(255, 100, 0, 0.05)' : 'var(--bg-tertiary)',
                                            borderRadius: 'var(--radius-md)',
                                            border: isSelected ? '2px solid var(--accent)' : (isConflict ? '1px solid rgba(255, 100, 0, 0.3)' : '1px solid var(--border-subtle)'),
                                            boxShadow: isSelected ? '0 4px 12px rgba(var(--accent-rgb), 0.1)' : 'var(--shadow-sm)',
                                            transition: 'all 0.15s ease',
                                            cursor: 'pointer',
                                            opacity: (isMustHave && !isSelected) ? 0.8 : 1
                                          }}
                                        >

                                          <div style={{ 
                                            width: listIconSize, 
                                            height: listIconSize, 
                                            borderRadius: 6, 
                                            background: 'rgba(255, 255, 255, 0.03)', 
                                            border: '1px solid var(--border-subtle)', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            overflow: 'hidden',
                                            flexShrink: 0,
                                            transition: 'all 0.1s ease'
                                          }}>
                                            <ProfileModImage mod={mod} zoom={listIconSize} isList={true} />
                                          </div>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div 
                                                className="mod-card__title" 
                                                title={mod.title || mod.modName}
                                                style={{ 
                                                  fontSize: 'var(--fs-sm)', 
                                                  color: isConflict ? 'orange' : 'var(--text-primary)',
                                                  whiteSpace: 'normal',
                                                      fontWeight: 800,
                                                  height: 'auto'
                                                }}
                                              >
                                              {mod.title || mod.modName}
                                            </div>
                                              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', display: 'flex', gap: 12, marginTop: 4 }}>
                                                <span>{mod.author || 'Unknown'}</span>
                                                <span>v{mod.version || '1.0.0.0'}</span>
                                              </div>
                                            {isPCOnly && (
                                              <span className="pc-only-badge">PC ONLY</span>
                                            )}
                                          </div>
                                          <button 
                                            className="pin-btn" 
                                            onClick={(e) => { e.stopPropagation(); toggleMustHaveMod(mod); }}
                                            title={isMustHave ? "Remove from Must-Have" : "Make Must-Have"}
                                            style={{ 
                                              background: 'transparent',
                                              
                                              padding: '4px',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              borderRadius: 'var(--radius-sm)',
                                              color: isMustHave ? 'var(--accent)' : 'var(--text-muted)',
                                              opacity: isMustHave ? 1 : 0.4,
                                              transition: 'all 0.2s'
                                            }}
                                          >
                                            <Pin size={16} fill={isMustHave ? "var(--accent)" : "none"} strokeWidth={isMustHave ? 2.5 : 2} />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          });

                          if (renderedGroups.every(g => g === null) && modSearchQuery) {
                            return (
                              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', textAlign: 'center', padding: 'var(--sp-6)' }}>
                                No mods match your search.
                              </div>
                            );
                          }

                          return renderedGroups;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <Package size={64} style={{ marginBottom: 'var(--sp-4)', opacity: 0.2 }} />
            <h3 style={{ color: 'var(--text-secondary)' }}>Welcome to Game Templates</h3>
            <p style={{ maxWidth: 300, textAlign: 'center', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)' }}>
              Create presets for different playstyles (e.g. "Start from Scratch" or "Mod Testing") and launch new games instantly.
            </p>
          </div>
        )}
      </div>

      {showSlotModal && (
        <SaveSlotModal 
          profile={selectedProfile} 
          onClose={() => setShowSlotModal(false)}
          onCreate={handleInitializeSave}
        />
      )}

      {missingDeps && (
          <DependencyDownloadModal 
            missingMods={missingDeps}
            onCancel={() => setMissingDeps(null)}
            onComplete={async () => {
              await scanMods(); // Refresh the list
              setMissingDeps(null);
            }}
          />
      )}

      <style>{`
        .tab-switcher {
          display: flex;
          gap: var(--sp-1);
          background: var(--bg-secondary);
          padding: 4px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-subtle);
          margin-bottom: var(--sp-6);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          border: none;
          background: transparent;
          color: var(--text-tertiary);
          font-size: var(--fs-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tab-btn:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.03);
        }

        .tab-btn--active {
          background: rgba(255, 255, 255, 0.1);
          color: var(--accent);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .settings-tab-content {
          display: flex;
          flex-direction: column;
          gap: var(--sp-6);
          animation: tabFadeIn 0.3s ease-out;
        }

        @keyframes tabFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .mod-group-header {
          font-size: 10px;
          font-weight: 800;
          color: var(--text-tertiary);
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          opacity: 0.8;
          letter-spacing: 0.05em;
        }
        .mod-group {
          margin-bottom: 16px;
        }
        .section-title {
          font-size: var(--fs-xs);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-tertiary);
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: var(--sp-4);
        }

        .settings-panel {
          background: rgba(255, 255, 255, 0.02);
          border-radius: var(--radius-lg);
          padding: var(--sp-4);
          border: 1px solid var(--border-light);
        }

        .settings-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--sp-4);
        }

        .setting {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .setting label {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 2px;
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-with-icon :global(svg) {
          position: absolute;
          left: 10px;
          color: var(--text-muted);
        }

        .input-with-icon input, .input-with-icon select, .setting select {
          width: 100%;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 8px 10px;
          padding-left: 32px;
          color: var(--text-primary);
          font-size: var(--fs-sm);
          outline: none;
        }

        .setting select {
          padding-left: 10px;
        }

        .checkbox-label, .checkbox-setting {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          color: var(--text-secondary);
          user-select: none;
          transition: color 0.2s;
        }

        .checkbox-label:hover, .checkbox-setting:hover {
          color: var(--text-primary);
        }

        .checkbox-label input, .checkbox-setting input {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: var(--accent);
        }

        .mod-template-item {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-2) var(--sp-3);
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .mod-template-item:hover {
          border-color: var(--border-light);
        }

        .mod-template-item--active {
          border-color: var(--accent);
          background: var(--accent-dim);
        }

        .mod-name {
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pc-only-badge {
          font-size: 8px;
          padding: 1px 4px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-tertiary);
          font-weight: 800;
          border: 1px solid var(--border-subtle);
          margin-top: 2px;
          display: inline-block;
        }

        .mod-template-item--conflict {
          border-color: rgba(255, 100, 0, 0.4) !important;
        }

        .mod-template-item--conflict .pc-only-badge {
          background: rgba(255, 100, 0, 0.2);
          color: orange;
          border-color: rgba(255, 100, 0, 0.4);
        }

        .mod-icon-mini {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }

        .mod-icon-mini img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .crossplay-badge-header {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 165, 0, 0.1);
          color: orange;
          border: 1px solid rgba(255, 165, 0, 0.3);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }

        .dlc-badge {
          font-size: 9px;
          padding: 1px 4px;
          border-radius: 4px;
          background: var(--accent);
          color: var(--bg-primary);
          font-weight: 800;
        }

        .zoom-control-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-secondary);
          padding: 4px 12px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          margin-left: 8px;
        }

        .range-slider {
          -webkit-appearance: none;
          width: 80px;
          height: 4px;
          background: var(--border);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }

        .range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          background: var(--accent);
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid var(--bg-primary);
          box-shadow: 0 0 5px rgba(0,0,0,0.3);
          transition: transform 0.1s ease;
          margin-top: -5px; /* Center the thumb on the track */
        }

        .range-slider::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: var(--border);
          border-radius: 2px;
        }

        .range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
      `}</style>
    </div>
  );
}
