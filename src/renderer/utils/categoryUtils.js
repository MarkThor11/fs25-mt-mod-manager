// --- GIANTS MODHUB CATEGORY DIRECTORY & UTILITIES ---

export const MODHUB_CATEGORY_MAP = {
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

// Set of all canonical ModHub Main Category names (lowercased)
export const MAIN_CATEGORY_NAMES = new Set(
  Object.values(MODHUB_CATEGORY_MAP).map(e => e.main.toLowerCase()).concat(['maps'])
);

// Populate reverse lookup keys: Main category labels first so they have absolute priority
Object.values(MODHUB_CATEGORY_MAP).forEach(entry => {
  if (entry.main) {
    const mainKey = entry.main.toLowerCase().replace(/[\s_\-]+/g, '');
    if (!MODHUB_CATEGORY_MAP[mainKey]) {
      MODHUB_CATEGORY_MAP[mainKey] = { main: entry.main, sub: null };
    }
  }
});

// Then populate Subcategory labels without overwriting existing Main category keys
Object.values(MODHUB_CATEGORY_MAP).forEach(entry => {
  if (entry.sub) {
    const subKey = entry.sub.toLowerCase().replace(/[\s_\-]+/g, '');
    if (!MODHUB_CATEGORY_MAP[subKey]) {
      MODHUB_CATEGORY_MAP[subKey] = entry;
    }
  }
});

/**
 * Accurately determines if a category string belongs to a map category.
 * Non-map categories like Gameplay, Prefab, Package, Objects, etc. are strictly false.
 */
export const isMapCategory = (category) => {
  if (!category || typeof category !== 'string') return false;
  const c = category.trim().toLowerCase();
  if (
    c.includes('gameplay') ||
    c.includes('prefab') ||
    c.includes('package') ||
    c.includes('object') ||
    c.includes('placeable') ||
    c.includes('drivable') ||
    c.includes('trailer') ||
    c.includes('tool') ||
    c.includes('animal') ||
    c.includes('baling') ||
    c.includes('harvest') ||
    c.includes('forestry') ||
    c.includes('grassland') ||
    c.includes('grape') ||
    c.includes('loader') ||
    c.includes('rootcrop') ||
    c.includes('seeding') ||
    c.includes('cultivation') ||
    c.includes('crop') ||
    c.includes('vegetable') ||
    c.includes('yield') ||
    c.includes('misc')
  ) {
    return false;
  }
  return /\bmaps?\b/i.test(c);
};

/**
 * Checks if a mod is considered a map.
 */
export const isMapMod = (mod, effCat = null) => {
  if (!mod) return false;
  if (mod.isMap) return true;
  if (effCat && isMapCategory(effCat)) return true;
  if (mod.category && isMapCategory(mod.category)) return true;
  if (mod.extraContent && isMapCategory(mod.extraContent)) return true;
  return false;
};

/**
 * Parses raw category strings into { main, sub } matching official ModHub hierarchy.
 */
export const parseModCategory = (cat, isMap) => {
  if (isMap || (cat && isMapCategory(cat))) return { main: 'Maps', sub: null };
  if (!cat) return { main: null, sub: null };
  let s = String(cat).trim();
  if (s.startsWith('CATEGORY:')) s = s.substring(9).trim();
  if (!s || s.length > 50 || s.includes('<') || s.includes('\n') || s.includes('\r')) return { main: null, sub: null };
  
  const lower = s.toLowerCase().replace(/[\s_\-]+/g, '');
  if (['generic', 'skipped', 'dlc', 'unknown', 'latest'].includes(lower)) return { main: null, sub: null };
  if (isMapCategory(s) || lower.includes('map')) return { main: 'Maps', sub: null };

  if (MODHUB_CATEGORY_MAP[lower]) {
    return MODHUB_CATEGORY_MAP[lower];
  }

  if (['other', 'others', 'script', 'scripts'].includes(lower)) {
    return { main: 'Gameplay', sub: null };
  }

  if (s.includes(' - ')) {
    const parts = s.split(' - ').map(p => p.trim());
    let mParsed = parseModCategory(parts[0], false);
    let sParsed = parseModCategory(parts[1], false);
    let mainName = mParsed.main || parts[0];
    let subName = sParsed.sub || parts[1];
    return { main: mainName, sub: mainName !== subName ? subName : null };
  }

  const titleCase = s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  return { main: 'Objects', sub: titleCase };
};

/**
 * Resolves effective ModHub category for a mod using modCache, extraContent, or file metadata.
 */
export const getEffectiveModCategory = (m, modCache = {}) => {
  if (!m) return null;
  if (m.isMap) return 'Maps';
  if (m.category) return m.category;
  if (m.extraContent) return m.extraContent;

  if (m.modId) {
    const cleanId = String(m.modId).replace(/^0+/, '');
    if (modCache[cleanId]?.category) return modCache[cleanId].category;
    if (modCache[m.modId]?.category) return modCache[m.modId].category;
  }

  if (m.fileName && modCache[m.fileName]?.category) {
    return modCache[m.fileName].category;
  }

  return null;
};
