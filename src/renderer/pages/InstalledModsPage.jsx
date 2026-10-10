import { CustomSlider } from '../components/common/CustomSlider';
import React, { useEffect, useState, useMemo, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Download, Trash2, FolderOpen, Package, Lock, Loader2, Info,
  CheckCircle, Check, AlertTriangle, HardDrive, Search, List, LayoutGrid, ChevronDown, ChevronRight, ChevronsUp, ChevronsDown,
  Tag, Plus, X, Settings2, Folder, FolderPlus, FolderOutput, Eye, EyeOff, MoreVertical, Zap, Layers, RefreshCcw,
  Heart, Star, Share2, Pencil, GripVertical, User, Pin, ArrowRightLeft, Move, Filter, Crown } from 'lucide-react';
import { useLocalModsStore } from '../store/useLocalModsStore';
import { useSavegameStore } from '../store/useSavegameStore';
import { useDownloadStore } from '../store/useDownloadStore';
import { useToastStore } from '../store/useToastStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useModHubStore } from '../store/useModHubStore';
import { useProfileStore } from '../store/useProfileStore';
import DependencyDownloadModal from '../components/common/DependencyDownloadModal';
import { resolveRecursiveDependencies, matchModWithDependency, normalizeForMatching } from '../utils/modUtils';

const getDriveLetter = (filePath) => {
  if (!filePath) return '';
  const match = filePath.match(/^([a-zA-Z]:)/);
  return match ? match[1].toUpperCase() : '';
};

// --- GIANTS MODHUB CATEGORY DIRECTORY ---
const MODHUB_CATEGORY_MAP = {
  // Official & Top-level Filters
  officialmods: { main: 'Official Mods', sub: null },
  latest: { main: 'Latest', sub: null },
  gameplay: { main: 'Gameplay', sub: null },

  // Maps
  mapeurope: { main: 'Maps', sub: 'European Maps' },
  mapnorthamerica: { main: 'Maps', sub: 'North American Maps' },
  mapsouthamerica: { main: 'Maps', sub: 'South American Maps' },
  mapothers: { main: 'Maps', sub: 'Other/Fantasy Maps' },
  maps: { main: 'Maps', sub: null },

  // Drivables
  tractorss: { main: 'Drivables', sub: 'Small Tractors' },
  tractorsm: { main: 'Drivables', sub: 'Medium Tractors' },
  tractorsl: { main: 'Drivables', sub: 'Large Tractors' },
  trucks: { main: 'Drivables', sub: 'Trucks' },
  cars: { main: 'Drivables', sub: 'Cars & Bikes' },
  miscdrivables: { main: 'Drivables', sub: 'Miscellaneous' },

  // Loaders
  frontloadervehicles: { main: 'Loaders', sub: 'Front Loader Vehicles' },
  frontloaders: { main: 'Loaders', sub: 'Front Loaders' },
  frontloadertools: { main: 'Loaders', sub: 'Front Loader Tools' },
  teleloadervehicles: { main: 'Loaders', sub: 'Telehandlers' },
  teleloadertools: { main: 'Loaders', sub: 'Telehandler Tools' },
  wheelloadervehicles: { main: 'Loaders', sub: 'Wheel Loaders' },
  wheelloadertools: { main: 'Loaders', sub: 'Wheel Loader Tools' },
  skidsteervehicles: { main: 'Loaders', sub: 'Skid Steer Loaders' },
  skidsteertools: { main: 'Loaders', sub: 'Skid Steer Loader Tools' },
  forklifts: { main: 'Loaders', sub: 'Forklifts' },

  // Trailers
  trailers: { main: 'Trailers', sub: 'Trailers' },
  augerwagons: { main: 'Trailers', sub: 'Auger Wagons' },
  trailerschangingsystem: { main: 'Trailers', sub: 'Changing Systems' },
  trailersflatbed: { main: 'Trailers', sub: 'Flatbed Trailers' },
  lowloaders: { main: 'Trailers', sub: 'Low Loaders' },
  trailerssemi: { main: 'Trailers', sub: 'Semi Trailers' },

  // Soil Cultivation
  plows: { main: 'Soil Cultivation', sub: 'Plows' },
  cultivators: { main: 'Soil Cultivation', sub: 'Cultivators' },
  discharrows: { main: 'Soil Cultivation', sub: 'Disc Harrows' },
  powerharrows: { main: 'Soil Cultivation', sub: 'Power Harrows' },
  subsoilers: { main: 'Soil Cultivation', sub: 'Subsoilers' },
  spaders: { main: 'Soil Cultivation', sub: 'Spaders' },
  stonepickers: { main: 'Soil Cultivation', sub: 'Stone Pickers' },
  mulchers: { main: 'Soil Cultivation', sub: 'Mulchers' },

  // Seeding
  seeders: { main: 'Seeding', sub: 'Seeders' },
  planters: { main: 'Seeding', sub: 'Planters' },
  seedtanks: { main: 'Seeding', sub: 'Seed Tanks' },
  palletseeds: { main: 'Seeding', sub: 'Seeds' },

  // Yield Improvements
  sprayers: { main: 'Yield Improvements', sub: 'Sprayers' },
  fertilizerspreaders: { main: 'Yield Improvements', sub: 'Fertilizer Spreaders' },
  slurrytanks: { main: 'Yield Improvements', sub: 'Slurry Tankers' },
  slurrytools: { main: 'Yield Improvements', sub: 'Slurry Tools' },
  slurrytransport: { main: 'Yield Improvements', sub: 'Slurry Transport' },
  manurespreaders: { main: 'Yield Improvements', sub: 'Manure Spreaders' },
  weeders: { main: 'Yield Improvements', sub: 'Weeders' },
  rollers: { main: 'Yield Improvements', sub: 'Rollers' },
  palletfertilizerherbicide: { main: 'Yield Improvements', sub: 'Consumables' },

  // Combine Harvesting
  harvesters: { main: 'Combine Harvesting', sub: 'Harvesters' },
  cutters: { main: 'Combine Harvesting', sub: 'Grain Headers' },
  cornheaders: { main: 'Combine Harvesting', sub: 'Corn Headers' },
  specialheaders: { main: 'Combine Harvesting', sub: 'Special Headers' },
  cuttertrailers: { main: 'Combine Harvesting', sub: 'Header Trailers' },
  combinewindrower: { main: 'Combine Harvesting', sub: 'Windrower' },

  // Forage Harvesting
  forageharvesters: { main: 'Forage Harvesting', sub: 'Harvesters' },
  forageharvestercutters: { main: 'Forage Harvesting', sub: 'Headers' },
  forageharvestercuttertrailers: { main: 'Forage Harvesting', sub: 'Header Trailers' },
  leveler: { main: 'Forage Harvesting', sub: 'Levelers' },
  silocompaction: { main: 'Forage Harvesting', sub: 'Silo Compaction' },
  palletsilage: { main: 'Forage Harvesting', sub: 'Consumables' },

  // Grassland
  mowers: { main: 'Grassland', sub: 'Mowers' },
  tedders: { main: 'Grassland', sub: 'Tedders' },
  windrowers: { main: 'Grassland', sub: 'Windrowers' },
  loaderwagons: { main: 'Grassland', sub: 'Forage Wagons' },
  grasslandcare: { main: 'Grassland', sub: 'Grassland Care' },
  palletgrassland: { main: 'Grassland', sub: 'Consumables' },

  // Baling
  balerssquare: { main: 'Baling', sub: 'Square balers' },
  balersround: { main: 'Baling', sub: 'Round Balers' },
  baleloaders: { main: 'Baling', sub: 'Transport' },
  balewrappers: { main: 'Baling', sub: 'Wrappers' },
  balingmisc: { main: 'Baling', sub: 'Miscellaneous' },
  palletbaling: { main: 'Baling', sub: 'Consumables' },

  // Animals
  foragemixers: { main: 'Animals', sub: 'Forage Mixers' },
  barrels: { main: 'Animals', sub: 'Barrels' },
  animaltransport: { main: 'Animals', sub: 'Animal Transport' },
  strawblowers: { main: 'Animals', sub: 'Straw Blowers' },
  palletanimals: { main: 'Animals', sub: 'Food' },

  // Rootcrops
  beetharvesters: { main: 'Rootcrops', sub: 'Beet Harvesters' },
  beetharvestercutters: { main: 'Rootcrops', sub: 'Beet Harvester Headers' },
  beetloading: { main: 'Rootcrops', sub: 'Beet Loading' },
  potatoplanting: { main: 'Rootcrops', sub: 'Potato Planters' },
  potatoharvesting: { main: 'Rootcrops', sub: 'Potato Technology' },

  // Vegetables
  vegetableplanters: { main: 'Vegetables', sub: 'Vegetable Planters' },
  vegetableharvesters: { main: 'Vegetables', sub: 'Vegetable Harvesters' },
  spinachharvesters: { main: 'Vegetables', sub: 'Spinach Harvesters' },
  greenbeanharvesters: { main: 'Vegetables', sub: 'Green Bean Harvesters' },
  peaharvesters: { main: 'Vegetables', sub: 'Pea Harvesters' },
  palletvegetables: { main: 'Vegetables', sub: 'Consumables' },

  // Special Crops
  riceplanters: { main: 'Special Crops', sub: 'Rice Planters' },
  riceharvesters: { main: 'Special Crops', sub: 'Rice Harvesters' },
  sugarcaneplanters: { main: 'Special Crops', sub: 'Sugarcane Planters' },
  sugarcaneharvesters: { main: 'Special Crops', sub: 'Sugarcane Harvesters' },
  sugarcanetransport: { main: 'Special Crops', sub: 'Sugarcane Transport' },
  cottonharvesters: { main: 'Special Crops', sub: 'Cotton Harvesters' },
  cottontransport: { main: 'Special Crops', sub: 'Cotton Transport' },
  specialcropspallets: { main: 'Special Crops', sub: 'Consumables' },

  // Grapes & Olives
  grapeharvesters: { main: 'Grapes & Olives', sub: 'Grape Harvesters' },
  oliveharvesters: { main: 'Grapes & Olives', sub: 'Olive Harvesters' },
  grapetrailers: { main: 'Grapes & Olives', sub: 'Grape Trailers' },
  grapetools: { main: 'Grapes & Olives', sub: 'Grape Tools' },

  // Forestry
  forestryharvesters: { main: 'Forestry', sub: 'Harvesters' },
  forestryforwarders: { main: 'Forestry', sub: 'Forwarders' },
  forestryexcavators: { main: 'Forestry', sub: 'Excavators' },
  forestryexcavatortools: { main: 'Forestry', sub: 'Excavator Tools' },
  woodtransport: { main: 'Forestry', sub: 'Wood Transport' },
  woodchippers: { main: 'Forestry', sub: 'Wood Chippers' },
  forestrymulchers: { main: 'Forestry', sub: 'Mulchers' },
  forestrywinches: { main: 'Forestry', sub: 'Winches' },
  forestryplanters: { main: 'Forestry', sub: 'Tree Planters' },
  forestrystumpcutters: { main: 'Forestry', sub: 'Stump Cutters' },
  forestrymisc: { main: 'Forestry', sub: 'Miscellaneous' },
  palletforestry: { main: 'Forestry', sub: 'Saplings' },

  // Miscellaneous
  weights: { main: 'Miscellaneous', sub: 'Weights' },
  belts: { main: 'Miscellaneous', sub: 'Belt Systems' },
  winterequipment: { main: 'Miscellaneous', sub: 'Winter Equipment' },
  misc: { main: 'Miscellaneous', sub: 'Miscellaneous' },

  // Objects
  pallets: { main: 'Objects', sub: 'Pallets' },
  bigbags: { main: 'Objects', sub: 'Big Bags' },
  bigbagpallets: { main: 'Objects', sub: 'Big Bag Pallets' },
  bales: { main: 'Objects', sub: 'Bales' },
  ibc: { main: 'Objects', sub: 'Pallet Tanks' },
  objectanimal: { main: 'Objects', sub: 'Animals' },
  objectmisc: { main: 'Objects', sub: 'Miscellaneous' },

  // Hand Tools
  chainsaws: { main: 'Hand Tools', sub: 'Chainsaws' },
  shovels: { main: 'Hand Tools', sub: 'Shovels' },
  flashlights: { main: 'Hand Tools', sub: 'Flashlights' },
  markingspray: { main: 'Hand Tools', sub: 'Marking spray' },
  handtoolsmisc: { main: 'Hand Tools', sub: 'Miscellaneous' },

  // Placeable
  animalpens: { main: 'Placeable', sub: 'Animal Pens' },
  fences: { main: 'Placeable', sub: 'Fences' },
  trees: { main: 'Placeable', sub: 'Trees' },
  storages: { main: 'Placeable', sub: 'Storages' },
  containers: { main: 'Placeable', sub: 'Containers' },
  dieseltanks: { main: 'Placeable', sub: 'Diesel Tanks' },
  watertanks: { main: 'Placeable', sub: 'Water Tanks' },
  fillabletanks: { main: 'Placeable', sub: 'Fillable Tanks' },
  silos: { main: 'Placeable', sub: 'Grain Silos' },
  siloextensions: { main: 'Placeable', sub: 'Silo Extensions' },
  sheds: { main: 'Placeable', sub: 'Sheds' },
  gardensheds: { main: 'Placeable', sub: 'Garden Sheds' },
  farmhouses: { main: 'Placeable', sub: 'Farmhouses' },
  beehives: { main: 'Placeable', sub: 'Beehives' },
  generators: { main: 'Placeable', sub: 'Power Generators' },
  floodlighting: { main: 'Placeable', sub: 'Floodlighting' },
  decoration: { main: 'Placeable', sub: 'Decoration' },
  productionpoints: { main: 'Placeable', sub: 'Production Sites' },
  sellingpoints: { main: 'Placeable', sub: 'Selling Points' },
  placeablemisc: { main: 'Placeable', sub: 'Miscellaneous' },

  // Package & Prefab
  package: { main: 'Package', sub: 'Package' },
  prefab: { main: 'Prefab', sub: 'Prefab' }
};

// Populate reverse lookup keys for Main category labels and Subcategory labels
Object.values(MODHUB_CATEGORY_MAP).forEach(entry => {
  if (entry.main) {
    const mainKey = entry.main.toLowerCase().replace(/[\s_\-]+/g, '');
    if (!MODHUB_CATEGORY_MAP[mainKey]) {
      MODHUB_CATEGORY_MAP[mainKey] = { main: entry.main, sub: null };
    }
  }
  if (entry.sub) {
    const subKey = entry.sub.toLowerCase().replace(/[\s_\-]+/g, '');
    if (!MODHUB_CATEGORY_MAP[subKey]) {
      MODHUB_CATEGORY_MAP[subKey] = entry;
    }
  }
});

const getPathLabel = (rootPath) => {
  if (!rootPath) return '';
  const drive = getDriveLetter(rootPath);
  const parts = rootPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const folderName = parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
  return drive ? `${drive} (${folderName})` : folderName;
};

// --- GLOBAL VIRTUALIZATION OBSERVER ---
const observerCallbacks = new Map();
let globalObserver = null;

const getGlobalObserver = () => {
  if (!globalObserver) {
    globalObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const callback = observerCallbacks.get(entry.target);
          if (callback) callback(entry.isIntersecting);
        });
      },
      { rootMargin: '600px' } // Preload 600px ahead to prevent blank flashes
    );
  }
  return globalObserver;
};

const VirtualModCard = React.memo((props) => {
  const height = props.isIconOnly ? (props.zoom || 180) : 320;
  return (
    <div style={{ minHeight: height, width: '100%', contentVisibility: 'auto', containIntrinsicSize: `auto ${height}px` }}>
      <ModCard {...props} />
    </div>
  );
});

// --- MAIN COMPONENT ---
const LocalModIcon = React.memo(({ mod }) => {
  const [error, setError] = useState(false);

  let imageUrl = mod.iconData || mod.storeData || null;
  if (imageUrl && typeof imageUrl === 'string') {
    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:') && !imageUrl.startsWith('CATEGORY:')) {
      imageUrl = `data:image/png;base64,${imageUrl}`;
    }
  }

    const fallbackCategory = (typeof imageUrl === 'string' && imageUrl.startsWith('CATEGORY:')) ? imageUrl : 'CATEGORY:generic';
  const categoryType = fallbackCategory.split(':')[1] || 'generic';

  const DLC_ICONS = {
    "beans and alpacas":    "https://www.farming-simulator.com/img/content/products/fs25/fs25beansandalpacas-cover.jpg",
    "pumps and hoses":      "https://www.farming-simulator.com/img/content/products/fs25/fs25pumpsnhoses-cover.jpg",
    "pumps & hoses":        "https://www.farming-simulator.com/img/content/products/fs25/fs25pumpsnhoses-cover.jpg",
    "emergency pack":       "https://www.farming-simulator.com/img/content/products/fs25/fs25emergency-cover.jpg",
    "emergency two":        "https://www.farming-simulator.com/img/content/products/fs25/fs25emergency-cover.jpg",
    "sky agriculture":      "https://www.farming-simulator.com/img/content/products/fs25/fs25skyagriculture-cover.jpg",
    "vredo":                "https://www.farming-simulator.com/img/content/products/fs25/fs25vredo-cover.jpg",
    "season pass 2":        "https://www.farming-simulator.com/img/content/products/fs25/fs25seasonpass2-cover.jpg",
    "jcb":                  "https://www.farming-simulator.com/img/content/products/fs25/fs25jcbwft-cover.jpg",
    "highlands":            "https://www.farming-simulator.com/img/content/products/fs25/fs25highlandsfishing-cover.jpg",
    "mercedes":             "https://www.farming-simulator.com/img/content/products/fs25/fs25mercedesbenztrucks-cover.jpg",
    "straw harvest":        "https://www.farming-simulator.com/img/content/products/fs25/fs25strawharvest-cover.jpg",
    "plains and prairies":  "https://www.farming-simulator.com/img/content/products/fs25/fs25plainsandprairies-cover.jpg",
    "plains & prairies":    "https://www.farming-simulator.com/img/content/products/fs25/fs25plainsandprairies-cover.jpg",
    "precision farming":    "https://www.farming-simulator.com/img/content/products/fs25/fs25precisionfarming-cover.jpg",
    "nexat":                "https://www.farming-simulator.com/img/content/products/fs25/fs25nexat-cover.jpg",
    "season pass 1":        "https://www.farming-simulator.com/img/content/products/fs25/fs25seasonpass1-cover.jpg",
    "macdon":               "https://www.farming-simulator.com/img/content/products/fs25/fs25macdon-cover.jpg",
    "new holland cr11":     "https://www.farming-simulator.com/img/content/products/fs25/fs25nhcr11gold-cover.jpg",
    "nhcr11":               "https://www.farming-simulator.com/img/content/products/fs25/fs25nhcr11gold-cover.jpg",
    "daimler":              "https://www.farming-simulator.com/img/content/products/fs25/fs25mercedesbenztrucks-cover.jpg",
  };

  const titleLower = (mod.title || "").toLowerCase();
  let finalImageUrl = imageUrl;
  let isDLCOverride = false;

  // For DLC mods, ALWAYS prefer the official cover image from farming-simulator.com
  // This handles: missing icons, CATEGORY: fallbacks, and cached-but-broken icons
  if (mod.isDLC) {
      for (const [key, url] of Object.entries(DLC_ICONS)) {
          if (titleLower.includes(key)) {
              finalImageUrl = url;
              isDLCOverride = true;
              break;
          }
      }
  }

  if (finalImageUrl && !finalImageUrl.startsWith('CATEGORY:') && (!error || isDLCOverride)) {
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <img 
            src={finalImageUrl} 
            style={{ width: '100%', height: '100%', objectFit: 'cover', border: '1px solid var(--border)' }} 
            alt={mod.title || ""} 
            loading="lazy" 
            onError={() => setError(true)}
          />
        </div>
      );
  }

  if (mod.isDLC) {
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid #fbbf24', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={48} color="#fbbf24" style={{ filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))', marginBottom: 8 }} />
            <span style={{ color: '#fbbf24', fontWeight: 900, fontSize: 14, letterSpacing: 1 }}>OFFICIAL DLC</span>
        </div>
      );
  }

  if (error || (mod.iconData && mod.iconData.startsWith('CATEGORY:'))) {
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <img 
          src={imageUrl} 
          style={{ width: '100%', height: '100%', objectFit: 'cover', border: '1px solid var(--border)' }} 
          alt={mod.title || ""} 
          loading="lazy" 
          onError={() => setError(true)}
        />
      </div>
    );
  }

  if (error || (mod.iconData && mod.iconData.startsWith('CATEGORY:'))) {
    const CatIcon = (() => {
      switch (categoryType) {
        case 'map': return Layers;
        case 'vehicle': return Zap;
        case 'tool': return Package;
        case 'pack': return Layers;
        default: return Package;
      }
    })();
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--accent)' }}>
          <CatIcon size={64} strokeWidth={1} style={{ opacity: 0.3 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <img 
        src={`mod-icon://icon?path=${encodeURIComponent(mod.filePath)}`} 
        style={{ width: '100%', height: '100%', objectFit: 'cover', border: '1px solid var(--border)' }} 
        alt="" 
        loading="lazy" 
        onError={() => setError(true)}
      />
    </div>
  );
});

const ModCard = React.memo(({ mod, isSelected, onToggleSelect, onNavigate, onUpdate, onUninstall, status, updateInfo, isUpdating, formatSize, isIconOnly }) => {
  const { toggleFavoriteMod, favoriteMods, toggleFavoriteAuthor, favoriteAuthors, toggleMustHaveMod } = useModHubStore();
  const isFavMod = favoriteMods.some(f => f.isFavorite !== false && ((f.modId && mod.modId && String(f.modId) === String(mod.modId)) || (f.fileName && mod.fileName && f.fileName === mod.fileName)));
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
        onClick={() => onNavigate(mod.fileName, mod.isDLC || mod.folder === 'DLC')}
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
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            const { setModTags } = useLocalModsStore.getState();
                            const isLocked = (mod.tags || []).includes('lock-updates');
                            const newTags = isLocked 
                                ? mod.tags.filter(t => t !== 'lock-updates') 
                                : [...(mod.tags || []), 'lock-updates'];
                            setModTags(mod.fileName || mod.modId, [...new Set(newTags)]);
                            useToastStore.getState().success(isLocked ? `Auto-updates unlocked for ${mod.title}` : `Auto-updates locked for ${mod.title}`);
                        }}
                        style={{ 
                            color: (mod.tags || []).includes('lock-updates') ? 'var(--danger)' : 'rgba(255,255,255,0.8)', 
                            filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', 
                            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer'
                        }}
                        title={(mod.tags || []).includes('lock-updates') ? "Unlock auto-updates for this mod" : "Lock mod version (Disable auto-update)"}
                    >
                        <Lock size={16} fill={(mod.tags || []).includes('lock-updates') ? "currentColor" : "none"} />
                    </button>
                </div>
            )}

            {!mod.isDLC && mod.folder !== 'DLC' && (
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
            )}

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
                                    toggleMustHaveMod(mod);
                                }}
                                style={{ 
                                    color: isMustHave ? 'var(--accent)' : 'var(--text-muted)', 
                                    opacity: 1,
                                    cursor: 'pointer',
                                    background: 'transparent', border: 'none', padding: 0, display: 'flex'
                                }}
                                title={isMustHave ? "Remove from Must-Haves" : "Mark as Must-Have"}
                            >
                                <Pin size={14} fill={isMustHave ? "currentColor" : "none"} strokeWidth={isMustHave ? 2.5 : 2} />
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const { setModTags } = useLocalModsStore.getState();
                                    const isLocked = (mod.tags || []).includes('lock-updates');
                                    const newTags = isLocked 
                                        ? mod.tags.filter(t => t !== 'lock-updates') 
                                        : [...(mod.tags || []), 'lock-updates'];
                                    setModTags(mod.fileName || mod.modId, [...new Set(newTags)]);
                                    useToastStore.getState().success(isLocked ? `Auto-updates unlocked for ${mod.title}` : `Auto-updates locked for ${mod.title}`);
                                }}
                                style={{ 
                                    color: (mod.tags || []).includes('lock-updates') ? 'var(--danger)' : 'var(--text-muted)', 
                                    background: 'transparent', border: 'none', padding: 0, display: 'flex', cursor: 'pointer'
                                }}
                                title={(mod.tags || []).includes('lock-updates') ? "Unlock auto-updates for this mod" : "Lock mod version (Disable auto-update)"}
                            >
                                <Lock size={14} fill={(mod.tags || []).includes('lock-updates') ? "currentColor" : "none"} />
                            </button>
                        </div>
                    </div>
                )}
                
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {!mod.isDLC && (
                            <>
                                <span style={{ fontSize: 11, fontWeight: 800, color: status === 'update' ? 'var(--warning)' : 'var(--text-primary)' }}>
                                    {status === 'update' ? `v${mod.version} ➔ v${updateInfo.remoteVersion}` : `v${mod.version}`}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                        {formatSize(mod.size)}
                                    </span>
                                    {mod.filePath && getDriveLetter(mod.filePath) && (
                                        <span 
                                            style={{ 
                                                fontSize: 9, 
                                                fontWeight: 800, 
                                                padding: '1px 5px', 
                                                borderRadius: 4, 
                                                background: 'rgba(255,255,255,0.07)', 
                                                color: 'var(--text-secondary)', 
                                                border: '1px solid var(--border)', 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: 3 
                                            }}
                                            title={`Stored on Drive ${getDriveLetter(mod.filePath)}`}
                                        >
                                            <HardDrive size={9} /> {getDriveLetter(mod.filePath)}
                                        </span>
                                    )}
                                </div>
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




// --- LAZY REQUIREMENTS BADGE ---
// Computes dependency status per-folder after the folder is already rendered,
// so it never blocks the initial page paint. Previously this ran inside the
// global `folders` useMemo, doing O(N×M) work before a single pixel appeared.
const FolderRequirements = React.memo(({ folderMods, allMods, sessionInstalled, isResolving, resolvingStatus, folderName }) => {
  const maps = useMemo(() => folderMods.filter(m => m.isMap && m.dependencies && m.dependencies.length > 0), [folderMods]);
  const [result, setResult] = useState({ status: 'none', missing: [] });

  useEffect(() => {
    if (maps.length === 0) {
      setResult({ status: 'none', missing: [] });
      return;
    }
    const timer = setTimeout(() => {
      const missingMods = new Set();
      for (const map of maps) {
        const { missing } = resolveRecursiveDependencies(map, allMods, sessionInstalled);
        missing.forEach(m => missingMods.add(m));
      }
      setResult({
        status: missingMods.size === 0 ? 'satisfied' : 'missing',
        missing: Array.from(missingMods)
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [maps, allMods, sessionInstalled]);

  if (result.status === 'none') return null;

  return (
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
            : `${result.missing.length} Missing`}
      </div>
    </div>
  );
});

const LazyModList = ({

  folderMods,
  folderName,
  folderZooms,
  selectedMods,
  toggleSelect,
  handleNavigate,
  handleUpdateCallback,
  handleUninstallCallback,
  getModStatus,
  getUpdateInfo,
  updatingMod,
  activeDownloadsKeys,
  formatSize,
  iconOnlyFolders,
  installedModsViewMode,
  favModIds,
  favAuthorNames,
  mustHaveIds,
  navigate,
  setIsInternalDragging,
  handleUpdate,
  handleUninstall
}) => {
  const [visibleCount, setVisibleCount] = useState(20);
  const sentinelRef = React.useRef(null);
  const { toggleFavoriteMod, toggleFavoriteAuthor, toggleMustHaveMod } = useModHubStore();
  const { installedTagFilter: rawSelectedTags, setInstalledTagFilter: setSelectedTags } = useSettingsStore();
  const selectedTags = Array.isArray(rawSelectedTags) ? rawSelectedTags : [];

  useEffect(() => {
    setVisibleCount(20);
  }, [folderMods]);

  useEffect(() => {
    if (visibleCount >= folderMods.length) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((prev) => Math.min(prev + 30, folderMods.length));
      }
    }, {
      root: null,
      rootMargin: '300px',
      threshold: 0.1
    });

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [folderMods.length, visibleCount]);

  const visibleMods = useMemo(() => {
    return folderMods.slice(0, visibleCount);
  }, [folderMods, visibleCount]);

  return (
    <>
      {installedModsViewMode === 'grid' || installedModsViewMode === 'icons' ? (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `repeat(auto-fill, minmax(${folderZooms[folderName] || 180}px, 1fr))`, 
          gap: 16 
        }}>
          {visibleMods.map((mod, modIdx) => (
            <div 
              key={`${mod.fileName}-${modIdx}`}
              style={{ 
                  contentVisibility: 'auto', 
                  containIntrinsicSize: `auto 250px` 
              }}
            >
              <VirtualModCard 
                  mod={mod}
                  isSelected={selectedMods.includes(mod.fileName)}
                  onToggleSelect={toggleSelect}
                  onNavigate={handleNavigate}
                  onUpdate={handleUpdateCallback}
                  onUninstall={handleUninstallCallback}
                  status={getModStatus(mod)}
                  updateInfo={getUpdateInfo(mod)}
                  isUpdating={updatingMod === mod.fileName || (mod.modId && activeDownloadsKeys.includes(String(mod.modId)))}
                  formatSize={formatSize}
                  isIconOnly={iconOnlyFolders.includes(folderName)}
                  zoom={folderZooms[folderName] || 180}
              />
            </div>
          ))}
        </div>
      ) : (
        visibleMods.map((mod) => {
          const status = getModStatus(mod);
          const updateInfo = getUpdateInfo(mod);
          const isUpdating = updatingMod === mod.fileName || (mod.modId && activeDownloadsKeys.includes(String(mod.modId)));
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
              {!mod.isDLC && mod.folder !== 'DLC' ? (
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
              ) : (
                <div style={{ width: 32 }} />
              )}

              <div 
                onClick={() => onNavigate(mod.fileName, mod.isDLC || mod.folder === 'DLC')}
                style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, cursor: 'pointer' }}
              >
                {(() => {
                  const zoom = folderZooms[folderName] || 180;
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
                      <span 
                        key={i} 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                        }}
                        style={{ 
                          fontSize: 10, 
                          padding: '2px 8px', 
                          borderRadius: 6, 
                          background: selectedTags.includes(tag) ? 'var(--accent)' : 'var(--bg-tertiary)', 
                          color: selectedTags.includes(tag) ? 'var(--bg-primary)' : 'var(--text-secondary)', 
                          border: '1px solid var(--border)', 
                          fontWeight: 700, 
                          textTransform: 'uppercase',
                          cursor: 'pointer'
                        }}
                        title={`Click to filter by ${tag}`}
                      >
                          {tag}
                      </span>
                  ))}
              </div>

              <div style={{ width: 110, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                {!mod.isDLC && (
                  <>
                    <span>{formatSize(mod.size)}</span>
                    {mod.filePath && getDriveLetter(mod.filePath) && (
                      <span 
                        style={{ 
                          fontSize: 9, 
                          fontWeight: 800, 
                          padding: '1px 5px', 
                          borderRadius: 4, 
                          background: 'rgba(255,255,255,0.07)', 
                          color: 'var(--text-secondary)', 
                          border: '1px solid var(--border)', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: 3 
                        }}
                        title={`Stored on Drive ${getDriveLetter(mod.filePath)}`}
                      >
                        <HardDrive size={9} /> {getDriveLetter(mod.filePath)}
                      </span>
                    )}
                  </>
                )}
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
                  <>
                    <button
                      className={`btn btn--icon btn--sm ${(mod.tags || []).includes('lock-updates') ? 'btn--accent' : 'btn--secondary'}`}
                      onClick={() => {
                        const { setModTags } = useLocalModsStore.getState();
                        const isLocked = (mod.tags || []).includes('lock-updates');
                        const newTags = isLocked 
                            ? mod.tags.filter(t => t !== 'lock-updates') 
                            : [...(mod.tags || []), 'lock-updates'];
                        setModTags(mod.fileName || mod.modId, [...new Set(newTags)]);
                        useToastStore.getState().success(isLocked ? `Auto-updates unlocked for ${mod.title}` : `Auto-updates locked for ${mod.title}`);
                      }}
                      style={{ 
                          width: 32, 
                          height: 32, 
                          color: (mod.tags || []).includes('lock-updates') ? 'var(--danger)' : 'var(--text-muted)',
                          background: (mod.tags || []).includes('lock-updates') ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                          borderColor: (mod.tags || []).includes('lock-updates') ? 'var(--danger)' : 'var(--border)'
                      }}
                      title={(mod.tags || []).includes('lock-updates') ? "Unlock auto-updates for this mod" : "Lock mod version (Disable auto-update)"}
                    >
                        <Lock size={14} fill={(mod.tags || []).includes('lock-updates') ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="btn btn--danger btn--icon btn--sm"
                      onClick={() => handleUninstall(mod)}
                      style={{ width: 32, height: 32, background: 'var(--danger)', color: 'white' }}
                    >
                        <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
      
      {visibleCount < folderMods.length && (
        <div 
          ref={sentinelRef} 
          style={{ 
            padding: '24px', 
            textAlign: 'center', 
            fontSize: 'var(--fs-xs)', 
            color: 'var(--text-muted)', 
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}
        >
          Loading more items... ({visibleCount} of {folderMods.length} loaded)
        </div>
      )}
    </>
  );
};



export default function InstalledModsPage() {
  const {
    mods: rawMods, allFolders, isLoading, isScanning, isCheckingUpdates, updates, error,
    isResolving, resolvingStatus, showOnlyUpdates, setShowOnlyUpdates,
    scanMods, checkUpdates, uninstallMod, updateMod, updateAllMods, initListeners, toggleAutoResolve,
    createFolder, renameFolder, deleteFolder, moveModsToFolder, moveFolderToDrive, bulkMoveFoldersToDrive, exportCollection,
  } = useLocalModsStore();

  const { 
    hiddenFolders, toggleHiddenFolder, installedModsViewMode, setInstalledModsViewMode,
    folderOrder, setFolderOrder, folderZooms, setFolderZoom, isInternalDragging, setIsInternalDragging,
    iconOnlyFolders, toggleIconOnlyFolder, isOnline, isLoaded, modUpdateMode, modsPaths, modsPath,
    showTagBar, setShowTagBar, installedTagFilter: rawSelectedTags, setInstalledTagFilter: setSelectedTags
  } = useSettingsStore();
  const selectedTags = Array.isArray(rawSelectedTags) ? rawSelectedTags : [];
  const { toggleFavoriteMod, toggleFavoriteAuthor, favoriteMods, favoriteAuthors, modCache = {} } = useModHubStore();
  const sessionInstalled = useDownloadStore((s) => s.sessionInstalled);
  const activeDownloadsKeysStr = useDownloadStore((s) => Object.keys(s.activeDownloads || {}).sort().join(','));
  const activeDownloadsKeys = useMemo(() => activeDownloadsKeysStr ? activeDownloadsKeysStr.split(',') : [], [activeDownloadsKeysStr]);
  const navigate = useNavigate();

  // useDeferredValue lets React prioritize urgent renders (user interactions) over
  // the expensive useMemo recalculations that happen when a background scan updates mods.
  // Without this, every background scan would cause a synchronous freeze while all
  // memos (filteredMods, modLookupIndex, folders, etc.) recompute across 3k mods.
  const mods = useDeferredValue(rawMods);

  const favModIdsSet = useMemo(() => {
    const set = new Set();
    (favoriteMods || []).forEach(fv => {
      if (fv.modId) set.add(String(fv.modId));
      if (fv.fileName) set.add(fv.fileName);
    });
    return set;
  }, [favoriteMods]);

  const mustHaveIdsSet = useMemo(() => {
    const set = new Set();
    (favoriteMods || []).filter(fv => fv.isMustHave).forEach(fv => {
      if (fv.modId) set.add(String(fv.modId));
      if (fv.fileName) set.add(fv.fileName);
    });
    return set;
  }, [favoriteMods]);

  const favAuthorsSet = useMemo(() => {
    return new Set((favoriteAuthors || []).map(fa => (fa.name || '').toLowerCase()));
  }, [favoriteAuthors]);

  const updateFileNamesSet = useMemo(() => {
    return new Set((updates || []).map(u => u.fileName));
  }, [updates]);

  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [updatingMod, setUpdatingMod] = useState(null);
  const [autoResolveMode, setAutoResolveMode] = useState(false);
  const [selectedDriveFilter, setSelectedDriveFilter] = useState('ALL');
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [driveMoveModal, setDriveMoveModal] = useState(null);
  const [selectedTargetDrive, setSelectedTargetDrive] = useState('');
  const [migrationProgress, setMigrationProgress] = useState(null);

  useEffect(() => {
    if (isLoaded && rawMods.length === 0) scanMods();
  }, [isLoaded, rawMods.length]);

  useEffect(() => {
    const unsub = initListeners();
    
    // Check initial setting
    window.api.settings.get('autoResolveDependencies').then(val => {
        setAutoResolveMode(val === 'true');
    });

    const unsubMove = window.api.on.moveProgress((data) => {
        useToastStore.getState().info(`Moving mods: ${data.percent}% (${data.current}/${data.total})`, { id: 'move-progress' });
        setMigrationProgress(prev => ({ ...(prev || {}), ...data, active: true }));
    });

    return () => {
      unsub?.();
      unsubMove();
    };
  }, []);
  
  const [tagSearch, setTagSearch] = useState('');
  const [tagSortBy, setTagSortBy] = useState('count'); // 'count' or 'alpha'

  // Helper to extract ModHub main category and sub-category from category strings
  const parseModCategory = (cat, isMap) => {
    if (isMap) return { main: 'Maps', sub: null };
    if (!cat) return { main: null, sub: null };
    let s = String(cat).trim();
    if (s.startsWith('CATEGORY:')) s = s.substring(9).trim();
    if (!s || s.length > 50 || s.includes('<') || s.includes('\n') || s.includes('\r')) return { main: null, sub: null };
    
    const lower = s.toLowerCase().replace(/[\s_\-]+/g, '');
    if (['generic', 'skipped', 'dlc', 'unknown', 'latest'].includes(lower)) return { main: null, sub: null };
    if (lower.includes('map')) return { main: 'Maps', sub: null };

    if (MODHUB_CATEGORY_MAP[lower]) {
      return MODHUB_CATEGORY_MAP[lower];
    }

    if (s.includes(' - ')) {
      const parts = s.split(' - ').map(p => p.trim());
      const mParsed = parseModCategory(parts[0], false);
      const sParsed = parseModCategory(parts[1], false);
      const mainName = mParsed.main || parts[0];
      const subName = sParsed.sub || parts[1];
      return { main: mainName, sub: mainName !== subName ? subName : null };
    }

    const titleCase = s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
    return { main: 'Objects & Misc', sub: titleCase };
  };

  // Helper to resolve effective ModHub category for a mod by querying modCache with complete key normalization
  const getEffectiveModCategory = useCallback((m) => {
    if (!m) return null;
    if (m.isMap) return 'Maps';

    // 1. ModHub Cache lookup by modId (raw, stripped leading zeros, padded 8 digits)
    if (m.modId) {
      const cleanId = String(m.modId).replace(/^0+/, '');
      const paddedId = cleanId.padStart(8, '0');
      for (const k of [cleanId, paddedId, `id_${cleanId}`, `id_${paddedId}`, String(m.modId)]) {
        if (modCache[k]?.category) return modCache[k].category;
      }
    }

    // 2. ModHub Cache lookup by fileName (case-insensitive & normalized variants)
    if (m.fileName) {
      const base = String(m.fileName).split(/[/\\]/).pop().toLowerCase();
      const noZip = base.replace(/\.zip$/i, '');
      const noPrefix = noZip.replace(/^(?:fs25|fs22|pdlc)_/i, '');
      const cleanAlphanum = noPrefix.replace(/[^a-z0-9]/g, '');

      for (const k of [
        base,
        noZip,
        noPrefix,
        cleanAlphanum,
        `file_${base}`,
        `file_${noZip}`,
        `file_${m.fileName}`
      ]) {
        if (modCache[k]?.category) return modCache[k].category;
      }
    }

    // 3. ModHub Cache lookup by modName or title
    if (m.modName) {
      const normModName = String(m.modName).toLowerCase().trim();
      const cleanModName = normModName.replace(/[^a-z0-9]/g, '');
      for (const k of [normModName, cleanModName, `title_${cleanModName}`]) {
        if (modCache[k]?.category) return modCache[k].category;
      }
    }

    if (m.title) {
      const normTitle = String(m.title).toLowerCase().trim();
      const cleanTitle = normTitle.replace(/[^a-z0-9]/g, '');
      for (const k of [normTitle, cleanTitle, `title_${cleanTitle}`]) {
        if (modCache[k]?.category) return modCache[k].category;
      }
      if (modCache._byCleanTitle && modCache._byCleanTitle[cleanTitle]?.category) {
        return modCache._byCleanTitle[cleanTitle].category;
      }
    }

    // 4. Mod's explicit category property from XML
    if (m.category) return m.category;
    if (m.extraContent) return m.extraContent;

    return null;
  }, [modCache]);

  // Helper for backward compatibility and filtering
  const normalizeCategory = (cat, isMap) => {
    const parsed = parseModCategory(cat, isMap);
    return parsed.sub || parsed.main;
  };

  // Helper to map any mod to an intuitive high-level "Key Filter"
  const getModKeyFilter = useCallback((mod) => {
    return null;
  }, []);

  // Helper to determine if a mod matches a given tag name
  const doesModMatchTag = useCallback((m, tag) => {
    if (!m || !tag || typeof tag !== 'string') return false;
    const tLower = tag.toLowerCase().trim();
    if (!tLower) return false;

    const effCat = getEffectiveModCategory(m);

    // 1. Built-in / Functional Filter Tags
    if (tLower === 'maps') return Boolean(m.isMap || (effCat && String(effCat).toLowerCase().includes('map')));
    if (tLower === 'crossplay') return Boolean(m.isCrossplay);
    if (tLower === 'lock-updates' || tLower === 'auto-updates locked') return Boolean((m.tags || []).includes('lock-updates'));
    if (tLower === 'pinned' || tLower === 'pinned mods' || tLower === 'must-have' || tLower === 'must-haves') {
      const modIdStr = m.modId ? String(m.modId) : null;
      return Boolean(m.isMustHave || (modIdStr && mustHaveIdsSet.has(modIdStr)) || (m.fileName && mustHaveIdsSet.has(m.fileName)));
    }
    if (tLower === 'favorites' || tLower === 'favourites' || tLower === 'favorite mods' || tLower === 'favourite mods') {
      const modIdStr = m.modId ? String(m.modId) : null;
      const isFavMod = (modIdStr && favModIdsSet.has(modIdStr)) || (m.fileName && favModIdsSet.has(m.fileName));
      const isFavAuth = m.author && favAuthorsSet.has(m.author.toLowerCase());
      return Boolean(isFavMod || isFavAuth);
    }
    if (tLower === 'updates' || tLower === 'updates available' || tLower === 'has-updates') {
      return Boolean(m.fileName && updateFileNamesSet.has(m.fileName));
    }

    // 2. Category matching (from mod's resolved ModHub category field)
    const { main, sub } = parseModCategory(effCat, m.isMap);
    if (main && main.toLowerCase() === tLower) return true;
    if (sub && sub.toLowerCase() === tLower) return true;
    if (effCat && String(effCat).toLowerCase().trim() === tLower) return true;

    // 3. Custom mod tags (m.tags array)
    if (m.tags && Array.isArray(m.tags)) {
      for (let i = 0; i < m.tags.length; i++) {
        const t = m.tags[i];
        if (!t) continue;
        const tClean = String(t).trim();
        if (tClean.toLowerCase() === tLower) return true;
        const norm = parseModCategory(tClean, false);
        if (norm.main && norm.main.toLowerCase() === tLower) return true;
        if (norm.sub && norm.sub.toLowerCase() === tLower) return true;
      }
    }

    return false;
  }, [getEffectiveModCategory, mustHaveIdsSet, favModIdsSet, favAuthorsSet, updateFileNamesSet]);

  // Compute clean structured tags: Key Filters (Rounded up concepts), Categories (Main ModHub categories), Subcategories, and Custom User Tags
  const { keyFilters, functionalTags, categoryTags, customTags, allUniqueTags } = useMemo(() => {
    const eligibleMods = mods.filter(m => {
      if (!m || m.isDLC || m.folder === 'DLC') return false;
      if (selectedDriveFilter !== 'ALL') {
        const rootNorm = selectedDriveFilter.replace(/\\/g, '/').toLowerCase();
        const rootWithSlash = rootNorm.endsWith('/') ? rootNorm : rootNorm + '/';
        const p = (m.filePath || '').replace(/\\/g, '/').toLowerCase();
        if (!p.startsWith(rootWithSlash)) return false;
      }
      return true;
    });

    const candidateMainCats = new Set();
    const candidateSubCats = new Set();
    const candidateCustomTags = new Set();

    for (let i = 0; i < eligibleMods.length; i++) {
      const mod = eligibleMods[i];

      // 1. ModHub Main categories & Subcategories (resolved via ModHub cache + fallback)
      const effCat = getEffectiveModCategory(mod);
      const { main, sub } = parseModCategory(effCat, mod.isMap);
      if (main && main.toLowerCase() !== 'prefab' && main.toLowerCase() !== 'prefabs') {
        candidateMainCats.add(main);
      }
      if (sub && sub.toLowerCase() !== 'prefab' && sub.toLowerCase() !== 'prefabs') {
        candidateSubCats.add(sub);
      }

      // 2. User & Functional Tags
      if (Array.isArray(mod.tags)) {
        for (let j = 0; j < mod.tags.length; j++) {
          const rawTag = mod.tags[j];
          if (!rawTag) continue;
          const trimmed = String(rawTag).trim();
          if (trimmed.length > 30 || trimmed.length < 2) continue;
          if (trimmed.startsWith('<') || trimmed.endsWith('>')) continue;
          if (trimmed.includes('{') || trimmed.includes('}')) continue;
          const lower = trimmed.toLowerCase();
          if (['dlc', 'lock-updates', 'maps', 'generic', 'skipped', 'unknown', 'prefab', 'prefabs'].includes(lower)) continue;

          const normalizedTag = normalizeCategory(trimmed) || trimmed;
          if (
            normalizedTag === main ||
            normalizedTag === sub ||
            normalizedTag.toLowerCase() === 'unknown'
          ) continue;

          candidateCustomTags.add(trimmed);
        }
      }
    }

    const countForTag = (tagName) => {
      let count = 0;
      for (let i = 0; i < eligibleMods.length; i++) {
        if (doesModMatchTag(eligibleMods[i], tagName)) count++;
      }
      return count;
    };

    const sortFn = (a, b) => {
      if (tagSortBy === 'alpha') {
        return a.label.localeCompare(b.label);
      }
      return b.count - a.count || a.label.localeCompare(b.label);
    };

    const assignedTagNamesLower = new Set();

    // Key Filters (Top Section)
    const kfList = [];

    // Favourites
    const favCount = countForTag('Favourites');
    kfList.push({ name: 'Favourites', label: 'Favourites', count: favCount, isFunctional: true });
    assignedTagNamesLower.add('favourites');
    assignedTagNamesLower.add('favorites');
    assignedTagNamesLower.add('favorite mods');
    assignedTagNamesLower.add('favourite mods');

    // Pinned Mods (Must-Haves)
    const pinnedCount = countForTag('Pinned Mods');
    kfList.push({ name: 'Pinned Mods', label: 'Pinned Mods', count: pinnedCount, isFunctional: true });
    assignedTagNamesLower.add('pinned mods');
    assignedTagNamesLower.add('pinned');
    assignedTagNamesLower.add('must-have');
    assignedTagNamesLower.add('must-haves');

    // Updates Available
    const updatesCount = countForTag('Updates Available');
    kfList.push({ name: 'Updates Available', label: 'Updates Available', count: updatesCount, isFunctional: true });
    assignedTagNamesLower.add('updates available');
    assignedTagNamesLower.add('updates');
    assignedTagNamesLower.add('has-updates');

    // Auto-Updates Locked
    const lockedCount = countForTag('lock-updates');
    kfList.push({ name: 'lock-updates', label: 'Auto-Updates Locked', count: lockedCount, isFunctional: true });
    assignedTagNamesLower.add('lock-updates');
    assignedTagNamesLower.add('auto-updates locked');

    // Crossplay
    const crossplayCount = countForTag('Crossplay');
    kfList.push({ name: 'Crossplay', label: 'Crossplay', count: crossplayCount, isFunctional: true });
    assignedTagNamesLower.add('crossplay');

    kfList.sort(sortFn);

    // Categories (ModHub Main categories)
    const mainCategories = [];
    Array.from(candidateMainCats).forEach(main => {
      if (assignedTagNamesLower.has(main.toLowerCase())) return;
      const c = countForTag(main);
      if (c > 0) {
        mainCategories.push({ name: main, label: main, count: c, isMainCategory: true });
        assignedTagNamesLower.add(main.toLowerCase());
      }
    });
    mainCategories.sort(sortFn);

    // Subcategories (Granular types like Small Tractors, Low Loaders, Sheds)
    const subCategories = [];
    Array.from(candidateSubCats).forEach(sub => {
      if (assignedTagNamesLower.has(sub.toLowerCase())) return;
      const c = countForTag(sub);
      if (c > 0) {
        subCategories.push({ name: sub, label: sub, count: c, isCategory: true });
        assignedTagNamesLower.add(sub.toLowerCase());
      }
    });
    subCategories.sort(sortFn);

    // User/custom tags
    const custom = [];
    Array.from(candidateCustomTags).forEach(customTag => {
      if (assignedTagNamesLower.has(customTag.toLowerCase())) return;
      const c = countForTag(customTag);
      if (c > 0) {
        custom.push({ name: customTag, label: customTag, count: c, isCustom: true });
        assignedTagNamesLower.add(customTag.toLowerCase());
      }
    });
    custom.sort(sortFn);

    const all = [...kfList, ...mainCategories, ...subCategories, ...custom];
    return {
      keyFilters: kfList,
      functionalTags: mainCategories,
      categoryTags: subCategories,
      customTags: custom,
      allUniqueTags: all
    };
  }, [mods, selectedDriveFilter, tagSortBy, doesModMatchTag]);

  const [selectedMods, setSelectedMods] = useState([]);
  const savegames = useSavegameStore(s => s.savegames);
  const fetchSavegames = useSavegameStore(s => s.fetchSavegames);
  const profiles = useProfileStore(s => s.profiles);
  const fetchProfiles = useProfileStore(s => s.fetchProfiles);
  
  useEffect(() => {
    if (!savegames || savegames.length === 0) fetchSavegames();
    if (!profiles || profiles.length === 0) fetchProfiles();
  }, []);

  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const { expandedFolders, setExpandedFolder, collapseAllFolders, expandAllFolders, skipDeleteConfirm } = useSettingsStore();
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggedFolder, setDraggedFolder] = useState(null);
  const [canDragFolder, setCanDragFolder] = useState(false);
  const [dropIndicator, setDropIndicator] = useState(null); // { folderName, position: 'top' | 'bottom' }
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [folderSortBy, setFolderSortBy] = useState('default'); // 'default' or 'size'
  
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

  const driveStats = useMemo(() => {
    if (!modsPaths || modsPaths.length === 0) return [];
    return modsPaths.map((rootPath, idx) => {
      const rootNorm = rootPath.replace(/\\/g, '/').toLowerCase();
      const rootWithSlash = rootNorm.endsWith('/') ? rootNorm : rootNorm + '/';
      const driveLetter = getDriveLetter(rootPath);
      const parts = rootPath.replace(/\\/g, '/').split('/').filter(Boolean);
      const folderName = parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
      const shortLabel = driveLetter ? `${driveLetter} (${folderName})` : folderName;
      
      let count = 0;
      let size = 0;
      
      for (let i = 0; i < rawMods.length; i++) {
        const m = rawMods[i];
        if (m && !m.isDLC && m.filePath) {
          const p = m.filePath.replace(/\\/g, '/').toLowerCase();
          if (p.startsWith(rootWithSlash)) {
            count++;
            size += m.size || 0;
          }
        }
      }
      
      return {
        rootPath,
        driveLetter: driveLetter || `Drive ${idx + 1}`,
        folderName,
        shortLabel,
        isPrimary: idx === 0,
        count,
        size
      };
    });
  }, [modsPaths, rawMods]);

  const filteredMods = useMemo(() => {
    const sLower = searchQuery.toLowerCase().trim();

    return mods.filter((m) => {
      if (!m) return false;
      const isDLCItem = m.isDLC || m.folder === 'DLC';

      // Drive filtering
      if (selectedDriveFilter !== 'ALL') {
        if (isDLCItem) return false;
        const rootNorm = selectedDriveFilter.replace(/\\/g, '/').toLowerCase();
        const rootWithSlash = rootNorm.endsWith('/') ? rootNorm : rootNorm + '/';
        const p = (m.filePath || '').replace(/\\/g, '/').toLowerCase();
        if (!p.startsWith(rootWithSlash)) return false;
      }

      if (sLower) {
        const titleMatch = m.title && m.title.toLowerCase().includes(sLower);
        const authorMatch = m.author && m.author.toLowerCase().includes(sLower);
        const tagMatch = m.tags && m.tags.some(t => t.toLowerCase().includes(sLower));
        if (!titleMatch && !authorMatch && !tagMatch) return false;
      }

      if (!isDLCItem) {
        if (showOnlyFavorites) {
          const isModFav = (m.modId && favModIdsSet.has(String(m.modId))) || favModIdsSet.has(m.fileName);
          const isAuthorFav = m.author && favAuthorsSet.has(m.author.toLowerCase());
          if (!isModFav && !isAuthorFav) return false;
        }

        if (Array.isArray(selectedTags) && selectedTags.length > 0) {
          const hasMatch = selectedTags.some(tag => doesModMatchTag(m, tag));
          if (!hasMatch) return false;
        }

        if (showOnlyUpdates) {
          if (!updateFileNamesSet.has(m.fileName)) return false;
        }
      }

      return true;
    });
  }, [mods, selectedDriveFilter, searchQuery, showOnlyFavorites, favModIdsSet, favAuthorsSet, selectedTags, showOnlyUpdates, updateFileNamesSet]);

  const modLookupIndex = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    const byFile = new Map();

    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      if (m.modId) byId.set(String(m.modId).replace(/^0+/, ''), m);
      if (m.modName) {
        const norm = m.modName.toLowerCase();
        byName.set(norm, m);
      }
      if (m.fileName) {
        const cleanFile = m.fileName.split(/[/\\]/).pop().replace(/\.zip$/i, '').toLowerCase();
        byFile.set(cleanFile, m);
      }
      if (m.title) {
        byName.set(m.title.toLowerCase(), m);
      }
    }
    return { byId, byName, byFile };
  }, [mods]);

  const folders = useMemo(() => {
    const findFastMatch = (dep) => {
        if (!dep) return null;
        
        // 1. Try URL extraction (high precision matching for ModHub map dependencies)
        const depUrl = typeof dep === 'object' ? dep.url : (typeof dep === 'string' && dep.includes('http') ? dep : null);
        if (depUrl) {
            const idMatch = depUrl.match(/mod_id=(\d+)/i) || depUrl.match(/storage\/(\d+)\//i);
            if (idMatch && idMatch[1]) {
                const cleanId = idMatch[1].replace(/^0+/, '');
                if (modLookupIndex.byId.has(cleanId)) return modLookupIndex.byId.get(cleanId);
            }
            const fileMatch = depUrl.match(/\/([^\/]+\.zip)$/i);
            if (fileMatch && fileMatch[1]) {
                const cleanFile = fileMatch[1].replace(/\.zip$/i, '').toLowerCase();
                if (modLookupIndex.byFile.has(cleanFile)) return modLookupIndex.byFile.get(cleanFile);
            }
        }

        // 2. Try explicit modId property
        if (typeof dep === 'object' && dep.modId) {
            const cleanId = String(dep.modId).replace(/^0+/, '');
            if (modLookupIndex.byId.has(cleanId)) return modLookupIndex.byId.get(cleanId);
        }

        // 3. Try filename / modName / title
        let depStr = typeof dep === 'string' ? dep : (dep.fileName || dep.modName || dep.technicalName || dep.title || '');
        if (depStr) {
            const norm = depStr.replace(/\.zip$/i, '').toLowerCase();
            if (modLookupIndex.byFile.has(norm)) return modLookupIndex.byFile.get(norm);
            if (modLookupIndex.byName.has(norm)) return modLookupIndex.byName.get(norm);
        }

        return null;
    };

    // 1. Group physical mods into their folders (Maps are excluded from MAIN and routed to their own map group)
    const folderKeyMap = new Map(); // normalized lower -> canonical folder name

    const getCanonicalFolder = (folderName) => {
        if (!folderName) return '';
        const lower = folderName.toLowerCase();
        if (folderKeyMap.has(lower)) return folderKeyMap.get(lower);
        folderKeyMap.set(lower, folderName);
        return folderName;
    };

    // Pre-populate canonical keys from allFolders so disk folder casing takes priority
    (allFolders || []).forEach(f => {
        if (f) getCanonicalFolder(f);
    });

    const groups = filteredMods.reduce((acc, mod) => {
      let folder = mod.folder || '';
      if (mod.isMap && !folder) {
        let cleanTitle = (mod.title || '').trim();
        const isCP = mod.isCrossplay || 
                     /crossplay|\(cp\)|\[cp\]/i.test(cleanTitle) || 
                     /crossplay|\(cp\)|\[cp\]/i.test(mod.fileName || '') || 
                     /crossplay|\(cp\)|\[cp\]/i.test(mod.modName || '');
        if (isCP) {
          cleanTitle = cleanTitle.replace(/\s*[\(\[]\s*(?:crossplay|cp)\s*[\)\]]\s*$/i, '')
                                 .replace(/\s+crossplay\s*$/i, '')
                                 .replace(/\s+cp\s*$/i, '')
                                 .trim();
          cleanTitle = `${cleanTitle} (CP)`;
        }
        folder = cleanTitle.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Custom Maps';
      }
      const canonical = getCanonicalFolder(folder);
      if (!acc[canonical]) acc[canonical] = [];
      acc[canonical].push(mod);
      return acc;
    }, { '': [] });
    
    // 2. Identify all Map Folders
    const mapFolders = Object.keys(groups).filter(name => groups[name].some(m => m.isMap));
    
    // 3. Virtual Injection: If a mod is a dependency of a map in a folder, show it there virtually.
    // Use a fileName Set per folder for O(1) visibility checks instead of calling the
    // expensive matchModWithDependency in a nested loop for every dep × every mod.
    mapFolders.forEach(folderName => {
        const modsInThisFolder = groups[folderName];
        const mapsInFolder = modsInThisFolder.filter(m => m.isMap);
        // Build a fast lookup of filenames (normalized basename) and mod identities already in this folder
        const folderBaseNames = new Set(modsInThisFolder.map(m => (m.fileName || '').split(/[/\\]/).pop().toLowerCase().replace(/\.zip$/i, '')));
        const folderModNames = new Set(modsInThisFolder.map(m => (m.modName || '').toLowerCase()).filter(Boolean));
        const folderModIds = new Set(modsInThisFolder.map(m => m.modId ? String(m.modId).replace(/^0+/, '') : null).filter(Boolean));

        mapsInFolder.forEach(mapMod => {
            if (mapMod.dependencies && mapMod.dependencies.length > 0) {
                mapMod.dependencies.forEach(dep => {
                    const physicalDep = findFastMatch(dep);
                    if (!physicalDep) return; // dep not installed at all, nothing to inject
                    
                    const depBaseName = (physicalDep.fileName || '').split(/[/\\]/).pop().toLowerCase().replace(/\.zip$/i, '');
                    const depModName = (physicalDep.modName || '').toLowerCase();
                    const depModId = physicalDep.modId ? String(physicalDep.modId).replace(/^0+/, '') : null;

                    // Skip if any physical copy of this mod already exists in this folder
                    if (folderBaseNames.has(depBaseName)) return;
                    if (depModName && folderModNames.has(depModName)) return;
                    if (depModId && folderModIds.has(depModId)) return;

                    // Inject the physical dep as a virtual reference
                    modsInThisFolder.push({ ...physicalDep, isVirtual: true });
                    folderBaseNames.add(depBaseName);
                    if (depModName) folderModNames.add(depModName);
                    if (depModId) folderModIds.add(depModId);
                });
            }
        });
    });


    // 4. Include empty folders from allFolders case-insensitively ONLY when viewing ALL drives AND no filter is active
    const isFilteringActive = showOnlyUpdates || showOnlyFavorites || Boolean((searchQuery || '').trim()) || (selectedTags && selectedTags.length > 0) || selectedDriveFilter !== 'ALL';

    if (selectedDriveFilter === 'ALL' && !isFilteringActive) {
      (allFolders || []).forEach(f => {
        const canonical = getCanonicalFolder(f);
        if (!groups[canonical]) groups[canonical] = [];
      });
    }

    // 5. Strict Map & Filter Pruning
    const showingOnlyMaps = selectedTags.includes('Maps');
    let finalKeys = Object.keys(groups);

    // When any filter is active, hide empty folders so matching mods are immediately obvious
    if (isFilteringActive) {
      finalKeys = finalKeys.filter(name => groups[name] && groups[name].length > 0);
    }

    if (showingOnlyMaps) {
      finalKeys = finalKeys.filter(name => groups[name] && groups[name].some(m => m.isMap));
    }

    // Pre-calculate total sizes once in O(N) for instant sorting and rendering
    const folderSizeMap = new Map();
    for (let i = 0; i < finalKeys.length; i++) {
      const name = finalKeys[i];
      const list = groups[name] || [];
      let sum = 0;
      for (let j = 0; j < list.length; j++) {
        sum += (list[j].size || 0);
      }
      folderSizeMap.set(name, sum);
    }

    // 6. DLC folder first, then sort by Size or Alphabetical/Order
    const sortedKeys = finalKeys.sort((a,b) => {
        if (a === 'DLC') return -1;
        if (b === 'DLC') return 1;
        if (folderSortBy === 'size') {
            const diff = (folderSizeMap.get(b) || 0) - (folderSizeMap.get(a) || 0);
            if (diff !== 0) return diff;
        }
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
        
        // Internal sort: Maps first, then by title using fast string comparison
        modsInFolder.sort((a, b) => {
            if (a.isMap && !b.isMap) return -1;
            if (!a.isMap && b.isMap) return 1;
            const tA = (a.title || a.fileName || '').toLowerCase();
            const tB = (b.title || b.fileName || '').toLowerCase();
            return tA < tB ? -1 : (tA > tB ? 1 : 0);
        });

        // Final uniqueness guard for folder mods
        const seenFolderModFiles = new Set();
        const uniqueModsInFolder = modsInFolder.filter(m => {
            if (seenFolderModFiles.has(m.fileName)) return false;
            seenFolderModFiles.add(m.fileName);
            return true;
        });

        acc[name] = {
            mods: uniqueModsInFolder,
            totalSize: folderSizeMap.get(name) || 0,
            isHidden: hiddenFolders.includes(name),
            // Requirements are computed lazily per-folder to avoid blocking initial render.
            // resolveRecursiveDependencies on 3k mods × many map folders was the main perf bottleneck.
            requirements: null 
        };
        return acc;
    }, {});
  }, [mods, filteredMods, allFolders, searchQuery, hiddenFolders, folderOrder, selectedTags, showOnlyFavorites, showOnlyUpdates, selectedDriveFilter, folderSortBy]);

  const flatViewList = useMemo(() => {
    return Object.values(folders).flatMap(f => f.mods);
  }, [folders]);

  const favModIds = useMemo(() => new Set(favoriteMods.map(f => f.modId ? String(f.modId) : f.fileName)), [favoriteMods]);
  const mustHaveIds = useMemo(() => new Set(favoriteMods.filter(f => f.isMustHave).map(f => f.modId ? String(f.modId) : f.fileName)), [favoriteMods]);
  const favAuthorNames = useMemo(() => new Set(favoriteAuthors.map(f => f.name.toLowerCase())), [favoriteAuthors]);



  const toggleSelect = React.useCallback((fileName, e) => {
    const targetMod = mods.find(m => m.fileName === fileName);
    if (targetMod && (targetMod.isDLC || targetMod.folder === 'DLC')) return;
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

  const toggleAllInFolder = (folderName, modsInFolder) => {
    const fileNames = modsInFolder.map(m => m.fileName);
    const allSelected = fileNames.length > 0 && fileNames.every(f => selectedMods.includes(f));
    
    if (allSelected) {
        setSelectedMods(prev => prev.filter(f => !fileNames.includes(f)));
    } else {
        setSelectedMods(prev => [...new Set([...prev, ...fileNames])]);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setShowFolderInput(false);
    useToastStore.getState().success(`Folder "${newFolderName}" created.`);
  };

  const handleFlattenSubfolders = async () => {
    const toastStore = useToastStore.getState();
    toastStore.info("Moving all subfolder mods to main folder...", { id: 'flatten-mods' });
    const { flattenSubfolders } = useLocalModsStore.getState();
    const result = await flattenSubfolders();

    if (result.success) {
      if (result.movedCount > 0) {
        toastStore.success(`Successfully moved ${result.movedCount} mods from subfolders to main folder!`, { id: 'flatten-mods' });
      } else {
        toastStore.info("All mods are already in the main folder.", { id: 'flatten-mods' });
      }
    } else {
      toastStore.error(`Flatten subfolders failed: ${result.error}`, { id: 'flatten-mods' });
    }
  };

  const handleMoveTo = async (dest, targetRoot = null) => {
    if (selectedMods.length === 0) return;
    
    const movableMods = selectedMods.filter(fileName => {
        const mod = mods.find(m => m.fileName === fileName);
        return mod && !mod.isDLC && !mod.isVirtual;
    });
    
    if (movableMods.length === 0) {
        useToastStore.getState().warning("DLCs and shared mods cannot be moved.");
        setSelectedMods([]);
        return;
    }

    const result = await moveModsToFolder(movableMods, dest, targetRoot);
    setSelectedMods([]);
    
    if (result.success) {
      const destLabel = dest || 'MAIN';
      const rootLabel = targetRoot ? ` [Drive ${getDriveLetter(targetRoot)}]` : '';
      const msg = result.errors && result.errors.length > 0 
        ? `Moved ${result.completed}/${result.total} mods to ${destLabel}${rootLabel} (some errors).`
        : `Successfully moved ${result.completed} mods to ${destLabel}${rootLabel}.`;
      
      useToastStore.getState().success(msg, { id: 'move-progress', duration: 2500 });
    } else {
      const errorMsg = result.errors?.[0]?.error || result.error || 'Unknown error';
      useToastStore.getState().error(`Failed: ${errorMsg}`, { id: 'move-progress' });
    }
  };

  const handleMoveFolderToDrive = async (folderName, targetRootPath, targetFolderName = null) => {
    if (!targetRootPath) {
      useToastStore.getState().warning("Please select a destination drive.");
      return;
    }

    const folderMods = folders[folderName]?.mods || [];
    const physicalFiles = folderMods.filter(m => !m.isVirtual).map(m => m.fileName);

    if (physicalFiles.length === 0) {
      useToastStore.getState().warning(`No physical mod files found in "${folderName || 'MAIN'}" to move.`);
      setDriveMoveModal(null);
      return;
    }

    setMigrationProgress({ percent: 0, current: 0, total: physicalFiles.length, active: true, label: `Migrating ${physicalFiles.length} files from "${folderName || 'MAIN'}"...` });
    useToastStore.getState().info(`Moving folder "${folderName || 'MAIN'}" to target drive...`, { id: 'move-folder' });
    try {
      const result = await moveFolderToDrive(folderName, targetRootPath, targetFolderName || folderName, physicalFiles);
      if (result.success && result.completed > 0) {
        const driveLetter = getDriveLetter(targetRootPath);
        setMigrationProgress(prev => ({ ...(prev || {}), percent: 100, current: physicalFiles.length, fileIndex: physicalFiles.length, status: 'complete', label: 'Migration complete!' }));
        useToastStore.getState().success(`Moved ${result.completed} mods from "${folderName || 'MAIN'}" to Drive ${driveLetter || targetRootPath}!`, { id: 'move-folder', duration: 3000 });
        await new Promise(r => setTimeout(r, 600));
      } else {
        const errMsg = result.errors?.[0]?.error || result.error || 'No files were moved.';
        useToastStore.getState().error(`Failed to move folder: ${errMsg}`, { id: 'move-folder' });
      }
    } finally {
      setMigrationProgress(null);
      setDriveMoveModal(null);
    }
  };

  const handleBulkMoveFoldersToDrive = async (foldersToMove, targetRootPath) => {
    if (!foldersToMove || foldersToMove.length === 0 || !targetRootPath) return;

    const folderMap = {};
    let totalFiles = 0;
    for (const f of foldersToMove) {
      const fMods = (folders[f]?.mods || []).filter(m => !m.isVirtual).map(m => m.fileName);
      folderMap[f] = fMods;
      totalFiles += fMods.length;
    }

    if (totalFiles === 0) {
      useToastStore.getState().warning("No physical mod files found in selected folders to move.");
      setDriveMoveModal(null);
      return;
    }

    setMigrationProgress({ percent: 0, current: 0, total: totalFiles, active: true, label: `Migrating ${foldersToMove.length} folders (${totalFiles} files)...` });
    useToastStore.getState().info(`Moving ${foldersToMove.length} folders to target drive...`, { id: 'bulk-folder-move' });
    try {
      const result = await bulkMoveFoldersToDrive(foldersToMove, targetRootPath, folderMap);
      setSelectedFolders([]);
      if (result.success && result.completed > 0) {
        const driveLetter = getDriveLetter(targetRootPath);
        setMigrationProgress(prev => ({ ...(prev || {}), percent: 100, current: totalFiles, fileIndex: totalFiles, status: 'complete', label: 'Migration complete!' }));
        useToastStore.getState().success(`Successfully moved ${result.completed} files across ${foldersToMove.length} folders to Drive ${driveLetter || targetRootPath}!`, { id: 'bulk-folder-move', duration: 3000 });
        await new Promise(r => setTimeout(r, 600));
      } else {
        const errMsg = result.errors?.[0]?.error || result.error || 'Bulk folder move failed.';
        useToastStore.getState().error(`Bulk folder move failed: ${errMsg}`, { id: 'bulk-folder-move' });
      }
    } finally {
      setMigrationProgress(null);
      setDriveMoveModal(null);
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

  const handleConsolidateDependencies = async () => {
    if (!confirm('This will move all non-map mods out of map subfolders into the dedicated "Map Dependencies" folder.\n\nEach map will still show its dependencies as virtual links.\n\nProceed?')) return;
    useToastStore.getState().info('Consolidating dependencies into "Map Dependencies" folder…');
    try {
      const result = await window.api.mods.consolidateDependencies();
      if (result?.success) {
        useToastStore.getState().success(`Done! Moved ${result.movedCount} mods, removed ${result.removedCount} duplicates.`);
        await scanMods();
      } else {
        useToastStore.getState().error(`Consolidation failed: ${result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      useToastStore.getState().error(`Consolidation error: ${err.message}`);
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
          <div className="page__subtitle" style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{filteredMods.filter(m => !m.isVirtual && !m.isDLC && m.folder !== 'DLC' && !m.fileName?.toLowerCase().startsWith('pdlc_') && !m.fileName?.toLowerCase().endsWith('.dlc') && !hiddenFolders.includes(m.folder || '')).length}</span> mods • <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{Object.keys(folders).filter(f => f !== 'DLC').length}</span> folders visible
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
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
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
            className={`btn btn--xs ${installedModsViewMode === 'grid' || installedModsViewMode === 'icons' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setInstalledModsViewMode('grid')}
            style={{ 
              padding: '6px 14px', 
              borderRadius: 6,
              background: (installedModsViewMode === 'grid' || installedModsViewMode === 'icons') ? 'var(--accent)' : 'var(--bg-surface)',
              color: (installedModsViewMode === 'grid' || installedModsViewMode === 'icons') ? 'var(--bg-primary)' : 'var(--text-secondary)',
              border: (installedModsViewMode === 'grid' || installedModsViewMode === 'icons') ? 'none' : '1px solid var(--border)',
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: '0.05em'
            }}
          >
            GRID
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

        {modUpdateMode !== 'auto' && (
          <>
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
            {updates.length > 0 && (
              <button 
                className="btn btn--primary btn--sm animate-fade-in"
                onClick={() => updateAllMods()}
                style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)' }}
                title="Download and install all available mod updates concurrently"
              >
                <Download size={14} /> Update All ({updates.length})
              </button>
            )}
          </>
        )}

        <button 
          className={`btn ${showTagBar || selectedTags.length > 0 ? 'btn--primary' : 'btn--secondary'} btn--sm`}
          onClick={() => setShowTagBar(!showTagBar)}
          style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
          title="Toggle Category & Tag Filter Panel"
        >
          <Tag size={14} /> Tags
          {selectedTags.length > 0 && (
            <span style={{ 
                background: showTagBar ? 'white' : 'var(--accent)', 
                color: showTagBar ? 'var(--accent)' : 'white', 
                borderRadius: 10, 
                padding: '1px 6px', 
                fontSize: 10,
                fontWeight: 900,
                minWidth: 18,
                textAlign: 'center'
            }}>
                {selectedTags.length}
            </span>
          )}
        </button>
        <button 
          className="btn btn--secondary btn--sm"
          onClick={() => {
            const folderKeys = Object.keys(folders);
            const areAllCollapsed = folderKeys.length > 0 && folderKeys.every(f => expandedFolders[f] === false);
            if (areAllCollapsed) {
              expandAllFolders(folderKeys);
            } else {
              collapseAllFolders(folderKeys);
            }
          }}
          style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
          title={Object.keys(folders).length > 0 && Object.keys(folders).every(f => expandedFolders[f] === false) ? "Expand all folders" : "Collapse all folders"}
        >
          {Object.keys(folders).length > 0 && Object.keys(folders).every(f => expandedFolders[f] === false) ? (
            <ChevronsDown size={14} />
          ) : (
            <ChevronsUp size={14} />
          )}
          {Object.keys(folders).length > 0 && Object.keys(folders).every(f => expandedFolders[f] === false) ? "Expand All" : "Collapse All"}
        </button>

        <button 
          className={`btn ${folderSortBy === 'size' ? 'btn--primary' : 'btn--secondary'} btn--sm`}
          onClick={() => setFolderSortBy(folderSortBy === 'size' ? 'default' : 'size')}
          style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
          title={folderSortBy === 'size' ? "Sorted by largest total folder size. Click to reset." : "Sort folders by largest total size"}
        >
          <HardDrive size={14} />
          {folderSortBy === 'size' ? 'Sorted: Size' : 'Sort: Size'}
        </button>

        {/* Drive / Folder Location Filter Selector */}
        {modsPaths && modsPaths.length > 1 && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              className="select-custom"
              value={selectedDriveFilter}
              onChange={(e) => setSelectedDriveFilter(e.target.value)}
              style={{
                height: 36,
                background: selectedDriveFilter === 'ALL' ? 'var(--bg-tertiary)' : 'var(--accent)',
                color: selectedDriveFilter === 'ALL' ? 'var(--text-primary)' : 'var(--bg-primary)',
                border: selectedDriveFilter === 'ALL' ? '1px solid var(--border)' : '1px solid var(--accent)',
                borderRadius: 'var(--radius-md)',
                padding: '0 28px 0 12px',
                fontSize: 'var(--fs-xs)',
                fontWeight: 800,
                cursor: 'pointer',
                outline: 'none',
                minWidth: 150,
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none'
              }}
              title="Filter library by storage folder / drive"
            >
              <option value="ALL">ALL LOCATIONS ({mods.length} MODS)</option>
              {driveStats.map(ds => (
                <option key={ds.rootPath} value={ds.rootPath}>
                  {ds.shortLabel} {ds.isPrimary ? '[PRIMARY] ' : ''}({ds.count} MODS)
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: 10, pointerEvents: 'none', opacity: 0.7, color: selectedDriveFilter === 'ALL' ? 'var(--text-secondary)' : 'var(--bg-primary)' }} />
          </div>
        )}

        {/* Bulk Folder Actions */}
        {selectedFolders.length > 0 && (
          <div className="animate-fade-in-down" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            background: '#3b82f6', 
            color: 'white',
            padding: '4px 8px 4px 12px', 
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em' }}>{selectedFolders.length} FOLDERS SELECTED</span>
            <button 
              className="btn btn--sm"
              onClick={() => setDriveMoveModal({
                type: 'bulk_folders',
                targetRootPath: modsPaths?.[0] || ''
              })}
              style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', height: 28, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <HardDrive size={13} /> MIGRATE TO DRIVE...
            </button>
            <button 
              className="btn btn--sm" 
              onClick={() => setSelectedFolders([])} 
              style={{ padding: 0, width: 24, height: 24, background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: 'pointer' }}
              title="Clear folder selection"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Bulk Mod Actions — fixed bottom-centre pill via portal */}
        {selectedMods.length > 0 && createPortal(
          <div style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(15, 23, 42, 0.92)',
            color: 'white',
            padding: '10px 18px',
            borderRadius: 40,
            boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px var(--accent)',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(12px)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.05em', paddingRight: 10, borderRight: '1px solid rgba(255,255,255,0.2)', color: 'var(--accent)' }}>
              {selectedMods.length} SELECTED
            </span>

            {/* ADD TO SAVE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>ADD TO SAVE</span>
              <div style={{ position: 'relative' }}>
                <select
                  value=""
                  onChange={async (e) => {
                    const savePath = e.target.value;
                    if (!savePath) return;
                    const savegame = savegames.find(s => s.path === savePath);
                    if (!savegame) return;
                    const existingModNames = (savegame.mods || []).map(m => m.modName);
                    const selectedModObjects = mods.filter(m => selectedMods.includes(m.fileName));
                    const newMods = [...(savegame.mods || [])];
                    let addedCount = 0;
                    selectedModObjects.forEach(m => {
                      if (!existingModNames.includes(m.modName)) { newMods.push({ modName: m.modName, title: m.title }); addedCount++; }
                    });
                    if (addedCount === 0) { useToastStore.getState().info('All selected mods are already in this savegame.'); setSelectedMods([]); return; }
                    const result = await window.api.savegames.setMods({ savegamePath: savePath, mods: newMods });
                    if (result.success) { useToastStore.getState().success(`Added ${addedCount} mods to ${savegame.farmName || savegame.name}`); setSelectedMods([]); fetchSavegames(); }
                    else { useToastStore.getState().error('Failed to add mods to save'); }
                  }}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '0 26px 0 10px', height: 30, fontSize: 11, fontWeight: 700, borderRadius: 8, appearance: 'none', cursor: 'pointer', outline: 'none', minWidth: 140 }}
                >
                  <option value="" disabled hidden>Select savegame...</option>
                  {savegames.map(s => (
                    <option key={s.path} value={s.path} style={{ background: '#0f172a' }}>{s.farmName || s.name}</option>
                  ))}
                </select>
                <ChevronDown size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
              </div>
            </div>

            <span style={{ opacity: 0.2 }}>|</span>

            {/* ADD TO PROFILE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>ADD TO PROFILE</span>
              <div style={{ position: 'relative' }}>
                <select
                  value=""
                  onChange={async (e) => {
                    const profileId = e.target.value;
                    if (!profileId) return;
                    const { profiles, updateProfile } = useProfileStore.getState();
                    const profile = profiles.find(p => String(p.id) === profileId);
                    if (!profile) return;
                    const existingModNames = new Set((profile.mods || []).map(m => m.modName || m.fileName));
                    const selectedModObjects = mods.filter(m => selectedMods.includes(m.fileName));
                    const toAdd = selectedModObjects.filter(m => !existingModNames.has(m.modName || m.fileName));
                    if (toAdd.length === 0) { useToastStore.getState().info('All selected mods are already in this profile.'); setSelectedMods([]); return; }
                    const newMods = [...(profile.mods || []), ...toAdd.map(m => ({ modName: m.modName || m.fileName, title: m.title, fileName: m.fileName, modId: m.modId }))];
                    const result = await updateProfile(profile.id, profile.name, newMods, profile.options || {});
                    if (result?.success) { useToastStore.getState().success(`Added ${toAdd.length} mods to profile "${profile.name}"`); setSelectedMods([]); }
                    else { useToastStore.getState().error('Failed to update profile'); }
                  }}
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '0 26px 0 10px', height: 30, fontSize: 11, fontWeight: 700, borderRadius: 8, appearance: 'none', cursor: 'pointer', outline: 'none', minWidth: 140 }}
                >
                  <option value="" disabled hidden>Select profile...</option>
                  {(profiles || []).map(p => (
                    <option key={p.id} value={String(p.id)} style={{ background: '#0f172a' }}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }} />
              </div>
            </div>

            <button onClick={() => setSelectedMods([])}
              style={{ marginLeft: 4, padding: 0, width: 26, height: 26, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Clear selection"
            >
              <X size={13} />
            </button>
          </div>,
          document.body
        )}
      </div>

      {showTagBar && (
        <div className="tag-filter-panel animate-fade-in-down" style={{ 
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          marginBottom: 24,
          minHeight: 220,
          boxShadow: '0 6px 24px rgba(0, 0, 0, 0.28)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18
        }}>
          {/* Header Row: Title, active count, quick search, and Clear button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Filter size={17} />
              </div>
              <div>
                <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.02em', color: 'var(--text-primary)' }}>
                  Categories & Tags
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                  ({allUniqueTags.length} available)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 2,
                gap: 2
              }}>
                <button
                  type="button"
                  onClick={() => setTagSortBy('count')}
                  style={{
                    height: 26,
                    padding: '0 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: tagSortBy === 'count' ? 'var(--primary)' : 'transparent',
                    color: tagSortBy === 'count' ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Sort by mod count (highest first)"
                >
                  Qty
                </button>
                <button
                  type="button"
                  onClick={() => setTagSortBy('alpha')}
                  style={{
                    height: 26,
                    padding: '0 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: tagSortBy === 'alpha' ? 'var(--primary)' : 'transparent',
                    color: tagSortBy === 'alpha' ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Sort alphabetically (A to Z)"
                >
                  A-Z
                </button>
              </div>

              <div style={{ position: 'relative', width: 200 }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter chips..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: 32,
                    padding: '0 10px 0 28px',
                    fontSize: 12,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                />
                {tagSearch && (
                  <button 
                    onClick={() => setTagSearch('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {selectedTags.length > 0 && (
                <button 
                  className="btn btn--secondary btn--xs"
                  onClick={() => setSelectedTags([])}
                  style={{ height: 32, padding: '0 12px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                >
                  <X size={13} /> Clear Filters ({selectedTags.length})
                </button>
              )}
            </div>
          </div>

          {/* Section 1: Key Filters (Rounded up core concepts: Tractors, Combines, Implements, etc.) */}
          {keyFilters.length > 0 && (!tagSearch || keyFilters.some(t => t.label.toLowerCase().includes(tagSearch.toLowerCase()))) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Key Filters
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                {keyFilters
                  .filter(t => !tagSearch || t.label.toLowerCase().includes(tagSearch.toLowerCase()))
                  .map(tag => {
                    const isSelected = selectedTags.includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        onClick={() => {
                          setSelectedTags(prev => 
                            isSelected ? prev.filter(t => t !== tag.name) : [...prev, tag.name]
                          );
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '6px 14px',
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                          color: isSelected ? '#ffffff' : 'var(--text-primary)',
                          border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                          boxShadow: isSelected ? '0 2px 8px var(--accent-dim)' : 'none'
                        }}
                      >
                        {tag.name === 'lock-updates' ? <Lock size={12} /> : <Tag size={12} />}
                        {tag.label}
                        <span style={{
                          background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-tertiary)',
                          color: isSelected ? '#ffffff' : 'var(--text-muted)',
                          padding: '2px 7px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 800
                        }}>
                          {tag.count}
                        </span>
                      </button>
                    );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Categories (Main ModHub categories) */}
          {functionalTags.length > 0 && (!tagSearch || functionalTags.some(t => t.label.toLowerCase().includes(tagSearch.toLowerCase()))) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Categories
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                {functionalTags
                  .filter(t => !tagSearch || t.label.toLowerCase().includes(tagSearch.toLowerCase()))
                  .map(tag => {
                    const isSelected = selectedTags.includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        onClick={() => {
                          setSelectedTags(prev => 
                            isSelected ? prev.filter(t => t !== tag.name) : [...prev, tag.name]
                          );
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '5px 13px',
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                          border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                          boxShadow: isSelected ? '0 2px 8px var(--accent-dim)' : 'none'
                        }}
                      >
                        {tag.label}
                        <span style={{
                          background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-tertiary)',
                          color: isSelected ? '#ffffff' : 'var(--text-muted)',
                          padding: '2px 7px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 800
                        }}>
                          {tag.count}
                        </span>
                      </button>
                    );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Subcategories */}
          {categoryTags.length > 0 && (!tagSearch || categoryTags.some(t => t.label.toLowerCase().includes(tagSearch.toLowerCase()))) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Subcategories
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, maxHeight: 320, overflowY: 'auto', paddingRight: 6 }}>
                {categoryTags
                  .filter(t => !tagSearch || t.label.toLowerCase().includes(tagSearch.toLowerCase()))
                  .map(tag => {
                    const isSelected = selectedTags.includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        onClick={() => {
                          setSelectedTags(prev => 
                            isSelected ? prev.filter(t => t !== tag.name) : [...prev, tag.name]
                          );
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '5px 13px',
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                          border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                          boxShadow: isSelected ? '0 2px 8px var(--accent-dim)' : 'none'
                        }}
                      >
                        {tag.label}
                        <span style={{
                          background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-tertiary)',
                          color: isSelected ? '#ffffff' : 'var(--text-muted)',
                          padding: '2px 7px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 800
                        }}>
                          {tag.count}
                        </span>
                      </button>
                    );
                })}
              </div>
            </div>
          )}

          {/* Section 4: Custom User Tags */}
          {customTags.length > 0 && (!tagSearch || customTags.some(t => t.label.toLowerCase().includes(tagSearch.toLowerCase()))) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                User Tags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                {customTags
                  .filter(t => !tagSearch || t.label.toLowerCase().includes(tagSearch.toLowerCase()))
                  .map(tag => {
                    const isSelected = selectedTags.includes(tag.name);
                    return (
                      <button
                        key={tag.name}
                        onClick={() => {
                          setSelectedTags(prev => 
                            isSelected ? prev.filter(t => t !== tag.name) : [...prev, tag.name]
                          );
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '4px 11px',
                          borderRadius: 7,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                          border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)'
                        }}
                      >
                        <Tag size={11} />
                        {tag.label}
                        <span style={{
                          background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-tertiary)',
                          color: isSelected ? '#ffffff' : 'var(--text-muted)',
                          padding: '2px 6px',
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 800
                        }}>
                          {tag.count}
                        </span>
                      </button>
                    );
                })}
              </div>
            </div>
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

      {/* Active Filter Banners */}
      {showOnlyUpdates && (
        <div className="filter-banner animate-fade-in" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          marginBottom: 16,
          background: 'rgba(234, 179, 8, 0.12)',
          border: '1px solid rgba(234, 179, 8, 0.35)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--text-primary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(234, 179, 8, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#eab308'
            }}>
              <Download size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                Filtered by: Available Updates ({filteredMods.length} mod{filteredMods.length === 1 ? '' : 's'})
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {modUpdateMode === 'auto'
                  ? 'Updates download automatically in the background. Showing installed mods with pending updates.'
                  : 'Only installed mods that have a newer version available on ModHub are shown.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {modUpdateMode !== 'auto' && filteredMods.length > 0 && (
              <button 
                className="btn btn--primary btn--sm" 
                onClick={() => updateAllMods(filteredMods)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                title="Download and install all pending updates"
              >
                <Download size={14} /> Update All Now ({filteredMods.length})
              </button>
            )}
            <button 
              className="btn btn--secondary btn--sm" 
              onClick={() => setShowOnlyUpdates(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Exit updates filter and view all your installed mods"
            >
              <X size={14} /> Clear Filter (View All Mods)
            </button>
          </div>
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
                             if (folderName === 'DLC') return;
                             e.stopPropagation();
                             handleRenameFolder(folderName);
                           }}
                           title={folderName === 'DLC' ? "" : "Click to rename folder"}
                         >
                           {folderName === '' ? 'MAIN' : folderName.toUpperCase()}
                           {folderName === 'DLC' && (
                             <Lock size={12} style={{ marginLeft: 6, opacity: 0.7, color: '#3b82f6' }} title="System-Managed Official DLC Folder (Locked)" />
                           )}
                           {folderName !== 'DLC' && (
                             <Pencil size={12} className="editable-label__icon" style={{ marginLeft: 8 }} />
                           )}
                         </span>
                        {!isHidden && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
                              {(() => {
                                const totalBytes = folderData.totalSize ?? folderMods.reduce((acc, m) => acc + (m.size || 0), 0);
                                const sizeStr = formatSize(totalBytes);
                                if (folderName === 'DLC') {
                                  return `(${folderMods.length} DLC${folderMods.length === 1 ? '' : 's'} • ${sizeStr})`;
                                }
                                const hasMap = folderMods.some(m => m.isMap);
                                if (hasMap) {
                                  const depCount = folderMods.length - 1;
                                  if (depCount === 0) return `(Map only • ${sizeStr})`;
                                  return `(Map + ${depCount} mod${depCount === 1 ? '' : 's'} • ${sizeStr})`;
                                }
                                return `(${folderMods.length} mods • ${sizeStr})`;
                              })()}
                            </span>

                            {/* Drive Location Badges */}
                            {folderName !== 'DLC' && (() => {
                              const folderDrives = {};
                              for (let i = 0; i < folderMods.length; i++) {
                                const m = folderMods[i];
                                if (m && !m.isDLC && m.filePath) {
                                  const dl = getDriveLetter(m.filePath) || 'Local';
                                  folderDrives[dl] = (folderDrives[dl] || 0) + 1;
                                }
                              }
                              return Object.entries(folderDrives).map(([dl, count]) => (
                                <span 
                                  key={dl} 
                                  style={{ 
                                    fontSize: 10, 
                                    fontWeight: 800, 
                                    padding: '2px 6px', 
                                    borderRadius: 4, 
                                    background: 'rgba(59, 130, 246, 0.12)', 
                                    color: '#60a5fa', 
                                    border: '1px solid rgba(59, 130, 246, 0.25)', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: 4 
                                  }}
                                  title={`${count} mods in this folder are stored on Drive ${dl}`}
                                >
                                  <HardDrive size={10} /> {dl} ({count})
                                </span>
                              ));
                            })()}
                            
                            {/* Requirements Badge for Maps — computed lazily to keep initial render fast */}
                             <FolderRequirements
                               folderMods={folderMods}
                               allMods={mods}
                               sessionInstalled={sessionInstalled}
                               isResolving={isResolving}
                               resolvingStatus={resolvingStatus}
                               folderName={folderName}
                             />
                          </div>
                        )}
                        {isHidden && (
                           <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase' }}>• Hidden</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
                    {!isHidden && folderName !== 'DLC' && (
                      <div 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          padding: '4px 8px', 
                          borderRadius: 4, 
                          background: selectedFolders.includes(folderName) ? 'var(--accent-dim)' : 'rgba(0,0,0,0.05)',
                          cursor: 'pointer' 
                        }}
                        onClick={() => {
                          setSelectedFolders(prev => 
                            prev.includes(folderName) ? prev.filter(f => f !== folderName) : [...prev, folderName]
                          );
                        }}
                        onMouseDown={e => e.stopPropagation()}
                        onDragStart={e => e.stopPropagation()}
                        title="Select subfolder for bulk actions / migration"
                      >
                        <input 
                          type="checkbox" 
                          readOnly 
                          checked={selectedFolders.includes(folderName)}
                          style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>Folder</span>
                      </div>
                    )}

                    {!isHidden && folderName !== 'DLC' && folderMods.length > 0 && (
                      <button 
                        className="btn btn--secondary btn--sm"
                        onClick={() => setDriveMoveModal({
                          type: 'folder',
                          folderName: folderName,
                          targetRootPath: modsPaths?.[0] || '',
                          targetFolderName: folderName
                        })}
                        style={{ height: 32, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 5 }}
                        title={`Move "${folderName || 'MAIN'}" to another drive`}
                      >
                        <HardDrive size={13} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontSize: 10, fontWeight: 800 }}>MOVE TO DRIVE</span>
                      </button>
                    )}

                    {!isHidden && folderName !== 'DLC' && folderMods.length > 1 && (
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
                              <CustomSlider 
                                 
                                min="120" 
                                max="350" 
                                step="5"
                                value={folderZooms[folderName] || 180}
                                onChange={(e) => setFolderZoom(folderName, parseInt(e.target.value))}
                                
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
                                title={(installedModsViewMode === 'grid' || installedModsViewMode === 'icons') ? "Card Size" : "Icon Size"}
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
                <div style={{ padding: (installedModsViewMode === 'grid' || installedModsViewMode === 'icons') ? '16px' : '4px 0' }}>
                  {folderMods.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Empty Folder — move mods here to organize them.
                    </div>
                  ) : (
                    <LazyModList
                      folderMods={folderMods}
                      folderName={folderName}
                      folderZooms={folderZooms}
                      selectedMods={selectedMods}
                      toggleSelect={toggleSelect}
                      handleNavigate={handleNavigate}
                      handleUpdateCallback={handleUpdateCallback}
                      handleUninstallCallback={handleUninstallCallback}
                      getModStatus={getModStatus}
                      getUpdateInfo={getUpdateInfo}
                      updatingMod={updatingMod}
                      activeDownloadsKeys={activeDownloadsKeys}
                      formatSize={formatSize}
                      iconOnlyFolders={iconOnlyFolders}
                      installedModsViewMode={installedModsViewMode}
                      favModIds={favModIds}
                      favAuthorNames={favAuthorNames}
                      mustHaveIds={mustHaveIds}
                      navigate={navigate}
                      setIsInternalDragging={setIsInternalDragging}
                      handleUpdate={handleUpdate}
                      handleUninstall={handleUninstall}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(folders).length === 0 && !isLoading && !isScanning && (
        <div className="empty-state" style={{ padding: '80px 0' }}>
          <Package className="empty-state__icon" size={64} style={{ opacity: 0.3 }} />
          <div className="empty-state__title">
            {selectedDriveFilter !== 'ALL' 
              ? `No mods in this location` 
              : 'Library empty'}
          </div>
          <div className="empty-state__desc" style={{ maxWidth: 520, margin: '8px auto' }}>
            {selectedDriveFilter !== 'ALL'
              ? `"${getPathLabel(selectedDriveFilter)}" currently contains 0 mods. You can move mods or subfolders here using "MOVE TO DRIVE" or switch the location filter above to "ALL LOCATIONS".`
              : 'Install some mods from the ModHub to get started.'}
          </div>
        </div>
      )}

      {mods.length === 0 && (isLoading || isScanning) && (
        <div className="empty-state" style={{ padding: '80px 0' }}>
          <Loader2 className="empty-state__icon animate-spin text-accent" size={48} style={{ marginBottom: 16 }} />
          <div className="empty-state__title">Scanning Mod Library</div>
          <div className="empty-state__desc">Indexing installed mods from disk... Please wait</div>
        </div>
      )}

      {/* -- Drive Move Modal -- */}
      {driveMoveModal && createPortal(
        <div 
          className="modal-overlay animate-fade-in" 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 99999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'rgba(0, 0, 0, 0.75)', 
            backdropFilter: 'blur(8px)',
            padding: '20px'
          }} 
          onClick={() => setDriveMoveModal(null)}
        >
          <div 
            className="modal-content animate-zoom-in" 
            style={{ 
              maxWidth: 540, 
              width: '100%', 
              padding: '24px', 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius-lg)', 
              border: '1px solid var(--border)', 
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)' 
            }}
            onClick={e => e.stopPropagation()}
          >
            {migrationProgress?.active ? (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: migrationProgress.percent === 100 ? 'rgba(74, 222, 128, 0.15)' : 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: migrationProgress.percent === 100 ? '#4ade80' : 'var(--accent)' }}>
                  {migrationProgress.percent === 100 ? (
                    <CheckCircle size={32} />
                  ) : (
                    <Loader2 className="animate-spin" size={32} />
                  )}
                </div>
                <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, marginBottom: 6 }}>
                  {migrationProgress.percent === 100 
                    ? 'Migration Complete!' 
                    : (migrationProgress.status === 'finalizing' ? 'Finalizing Migration...' : 'Migrating Files in Progress...')}
                </h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  {migrationProgress.label || 'Transferring mods between storage drives. Please wait...'}
                </p>
                {migrationProgress.currentFile && migrationProgress.status === 'copying' && (
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 700, marginBottom: 18, wordBreak: 'break-all' }}>
                    Copying: {migrationProgress.currentFile}
                  </p>
                )}

                {/* Progress Bar */}
                <div style={{ width: '100%', height: 12, background: 'var(--bg-tertiary)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 12, position: 'relative' }}>
                  <div 
                    style={{ 
                      width: `${Math.max(migrationProgress.percent || 0, 5)}%`, 
                      height: '100%', 
                      background: migrationProgress.percent === 100 
                        ? 'linear-gradient(90deg, #10b981, #4ade80)' 
                        : 'linear-gradient(90deg, var(--accent), #10b981)', 
                      borderRadius: 6,
                      transition: 'width 0.3s ease-in-out'
                    }} 
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', fontWeight: 800, color: 'var(--text-secondary)' }}>
                  <span>{migrationProgress.percent || 0}% COMPLETE</span>
                  <span>{migrationProgress.fileIndex || migrationProgress.current || 0} / {migrationProgress.total || 0} FILES</span>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <HardDrive size={20} style={{ color: 'var(--accent)' }} />
                    <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 800 }}>
                      {driveMoveModal.type === 'bulk_folders' 
                        ? `Move ${selectedFolders.length} Folders to Storage Drive`
                        : `Move "${driveMoveModal.folderName === '' ? 'MAIN' : driveMoveModal.folderName}" to Storage Drive`}
                    </h3>
                  </div>
                  <button className="btn btn--ghost btn--icon" onClick={() => setDriveMoveModal(null)} style={{ padding: 4, cursor: 'pointer' }}>
                    <X size={18} />
                  </button>
                </div>

                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                  {driveMoveModal.type === 'bulk_folders'
                    ? `Select the target storage location / hard drive. All ${selectedFolders.length} selected folders and their mods will be transferred.`
                    : `Select the destination hard drive / root folder to migrate all mods belonging to "${driveMoveModal.folderName === '' ? 'MAIN' : driveMoveModal.folderName}".`}
                </p>

                {/* Migration Content Breakdown Card */}
                {(() => {
                  let totalPhysical = 0;
                  let totalVirtual = 0;
                  let totalSize = 0;

                  if (driveMoveModal.type === 'bulk_folders') {
                    selectedFolders.forEach(f => {
                      const fMods = folders[f]?.mods || [];
                      totalPhysical += fMods.filter(m => !m.isVirtual).length;
                      totalVirtual += fMods.filter(m => m.isVirtual).length;
                      totalSize += fMods.filter(m => !m.isVirtual).reduce((sum, m) => sum + (m.size || 0), 0);
                    });
                  } else {
                    const fMods = folders[driveMoveModal.folderName]?.mods || [];
                    totalPhysical = fMods.filter(m => !m.isVirtual).length;
                    totalVirtual = fMods.filter(m => m.isVirtual).length;
                    totalSize += fMods.filter(m => !m.isVirtual).reduce((sum, m) => sum + (m.size || 0), 0);
                  }

                  return (
                    <div style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      marginBottom: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, color: 'var(--text-secondary)' }}>
                          FILES TO TRANSFER TO TARGET DRIVE:
                        </span>
                        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, color: 'var(--accent)' }}>
                          {totalPhysical} files ({formatSize(totalSize)})
                        </span>
                      </div>

                      {totalVirtual > 0 && (
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                          paddingTop: 6,
                          marginTop: 2,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 6,
                          lineHeight: 1.4
                        }}>
                          <Info size={14} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 1 }} />
                          <span>
                            <strong>{totalVirtual} shared / linked dependencies</strong> will remain in their current location so other maps and profiles continue working without missing files.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Target Drive Selector */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8, color: 'var(--text-tertiary)' }}>
                    Target Destination Drive
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {driveStats.map((ds) => (
                      <div 
                        key={ds.rootPath}
                        onClick={() => setDriveMoveModal(prev => ({ ...prev, targetRootPath: ds.rootPath }))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: 'var(--radius-md)',
                          background: driveMoveModal.targetRootPath === ds.rootPath ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                          border: driveMoveModal.targetRootPath === ds.rootPath ? '1px solid var(--accent)' : '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <HardDrive size={18} style={{ color: driveMoveModal.targetRootPath === ds.rootPath ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{ds.shortLabel}</span>
                              {ds.isPrimary && (
                                <span style={{ fontSize: 9, background: 'var(--accent)', color: 'var(--bg-primary)', padding: '1px 5px', borderRadius: 4, fontWeight: 900 }}>
                                  PRIMARY / DOWNLOADS
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ds.rootPath}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700 }}>{ds.count} mods</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatSize(ds.size)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {driveMoveModal.type !== 'bulk_folders' && driveMoveModal.folderName !== '' && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8, color: 'var(--text-tertiary)' }}>
                      Subfolder Name on Destination Drive
                    </label>
                    <input 
                      type="text" 
                      className="search-input"
                      value={driveMoveModal.targetFolderName !== undefined ? driveMoveModal.targetFolderName : driveMoveModal.folderName}
                      onChange={(e) => setDriveMoveModal(prev => ({ ...prev, targetFolderName: e.target.value }))}
                      style={{ width: '100%', height: 38, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 12px' }}
                      placeholder="Subfolder name on target drive"
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button className="btn btn--ghost" onClick={() => setDriveMoveModal(null)}>Cancel</button>
                  <button 
                    className="btn btn--primary" 
                    onClick={() => {
                      if (driveMoveModal.type === 'bulk_folders') {
                        handleBulkMoveFoldersToDrive(selectedFolders, driveMoveModal.targetRootPath);
                      } else {
                        handleMoveFolderToDrive(
                          driveMoveModal.folderName,
                          driveMoveModal.targetRootPath,
                          driveMoveModal.targetFolderName
                        );
                      }
                    }}
                    disabled={!driveMoveModal.targetRootPath}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <ArrowRightLeft size={14} /> Start Migration
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
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
