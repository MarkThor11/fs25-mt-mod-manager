const fs = require('fs-extra');
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const pathProvider = require('./pathProvider');
const cache = require('./cache');
const { app } = require('electron');

let modActionTitleMap = {};
let modActionCategoryMap = {};
try {
    modActionTitleMap = require('./modActionMap.json');
} catch (_) {}
try {
    modActionCategoryMap = require('./modActionCategories.json');
} catch (_) {}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: false,
    parseTagValue: false
});

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '    '
});

function getInputBindingPath() {
    const dataRoot = pathProvider.getFS25DataRoot();
    return path.join(dataRoot, 'inputBinding.xml');
}

function getKeybindBackupsPath() {
    const userData = app ? app.getPath('userData') : path.join(process.env.APPDATA, 'fs25-mt-mod-manager');
    const backupsDir = path.join(userData, 'keybind_backups');
    fs.ensureDirSync(backupsDir);
    return backupsDir;
}

const KNOWN_MOD_PREFIXES = {
    'UNIVERSALAUTOLOAD': 'Mod: Universal Autoload',
    'CP': 'Mod: Courseplay',
    'ASC': 'Mod: Advanced Section Control',
    'afm': 'Mod: Advanced Farm Manager',
    'AL': 'Mod: AutoLeveler',
    'AP': 'Mod: Autoload Pallet / Logistics',
    'AUTOLOADWOODEW': 'Mod: Autoload Wood EW',
    'CALC': 'Mod: Ingame Calculator',
    'DVC': 'Mod: Drive Control',
    'ECC': 'Mod: Enhanced Crop Care',
    'EVM': 'Mod: Enhanced Vehicle Management',
    'FA': 'Mod: Field Assistant / Auto Farm',
    'FOLLOW': 'Mod: Follow Me',
    'FPC': 'Mod: First Person Controls',
    'GPS': 'Mod: Guidance Steering (GPS)',
    'RGPS': 'Mod: Real GPS',
    'WPGPS': 'Mod: Waypoint GPS',
    'HK4T': 'Mod: Hakki Pilke Wood Processor',
    'HLM': 'Mod: Headland Management',
    'LOGSWINCH': 'Mod: Forestry Logs Winch',
    'ModMixer': 'Mod: ModMixer',
    'PM': 'Mod: Pumps & Hoses',
    'PSM': 'Mod: Production Supply Manager',
    'PTC23': 'Mod: PTC Controls',
    'QUICKSELECTOR': 'Mod: Quick Selector',
    'QuickCam': 'Mod: Quick Camera',
    'QUICKCAM': 'Mod: Quick Camera',
    'RL': 'Mod: Realistic Livestock',
    'RV': 'Mod: Rescue Vehicle',
    'SL': 'Mod: Steering Lock / Speed Limiter',
    'SSP': 'Mod: Simple Seat Suspension',
    'TI': 'Mod: Track Inspector',
    'TOWINGCHAIN': 'Mod: Towing Chain',
    'USEDPLUS': 'Mod: Used Plus Vehicles',
    'VAS': 'Mod: Vehicle Automation System',
    'VD': 'Mod: Vehicle Dashboard',
    'VI': 'Mod: Vehicle Inspector',
    'VTP': 'Mod: Variable Tire Pressure',
    'WAWI': 'Mod: Water & Fill Indicator',
    'WCAM': 'Mod: Work Camera',
    'WFP': 'Mod: Wood Firewood Processor',
    'POWERTOOLS': 'Mod: Power Tools',
    'POWERTOOLSMENU': 'Mod: Power Tools',
    'PARKVEHICLE': 'Mod: Park Vehicle',
    'PRODUCTION_ADVISOR': 'Mod: Production Advisor',
    'PRODUCTIONWATCHER': 'Mod: Production Watcher',
    'PRICETICKER': 'Mod: Price Ticker',
    'MAP_OBJECT_HIDER': 'Mod: Map Object Hider',
    'EXTENDED_WINDROWER': 'Mod: Extended Windrower',
    'EDC': 'Mod: Easy Dev Controls',
    'RP': 'Mod: Emergency / Rescue Pack',
    'MMAPPLUS': 'Mod: MiniMap Plus',
    'LMBF': 'Mod: Lombardini / Frontloader',
    'BSU': 'Mod: Bale Storage Utility',
    'HUDPLUS': 'Mod: HUD Plus',
    'UCR': 'Mod: Universal Cruise / Cultivator',
    'TPAB': 'Mod: Pasture Animal Belt',
    'TPS': 'Mod: Tool Position Saver',
    // Mapped mod titles from modDesc definitions
    'HL': 'Mod: Additional Contracts',
    'AM': 'Mod: Adjustable Mirrors',
    'APP': 'Mod: Adjust Production Points',
    'AI': 'Mod: AI Worker Dynamic Speed',
    'AR': 'Mod: AutoRepairs',
    'ASZ': 'Mod: Avatar Switcher',
    'BCM': 'Mod: Bale Capacity Multiplier',
    'BF': 'Mod: BaleFinder',
    'BANK': 'Mod: Investment System',
    'BC': 'Mod: Better Contracts',
    'CH': 'Mod: Camera Hotkeys',
    'CU': 'Mod: Construction Utilities',
    'CCO': 'Mod: Crop Control Override',
    'CVT': 'Mod: CVT Addon',
    'DBL': 'Mod: Dashboard Live',
    'DHS': 'Mod: Dynamic Headerspeed',
    'DMR': 'Mod: Dynamic Mission Rewards',
    'EHM': 'Mod: Enhanced Help Menu',
    'WSP': 'Mod: Extended Weigh Station Pack',
    'SKF': 'Mod: F1 Filter Menu',
    'FLP': 'Mod: Fair Leasing Plus',
    'FWA': 'Mod: Farmer Working Assistant',
    'FR': 'Mod: Farm Reputation',
    'FC': 'Mod: Farms Cleanup',
    'FPH': 'Mod: Fence Placement Helper',
    'FF': 'Mod: Field Finder',
    'FPL': 'Mod: Field Profitability Ledger',
    'ERA': 'Mod: FilterYears (Vintage Progression)',
    'BHH': 'Mod: Grass Collection',
    'HPS': 'Mod: Hand Plant Saplings',
    'HMC': 'Mod: Harvestmission Creator',
    'VMC': 'Mod: Headtracking IC Extension',
    'HSC': 'Mod: Helper Silage Compacting',
    'RM': 'Mod: Hide Help Texts',
    'HT': 'Mod: Hubtex MAXX 45',
    'HF': 'Mod: Human Factors',
    'HU': 'Mod: Vehicle Inspection (HU)',
    'IBB': 'Mod: Input Binding Backup',
    'IC': 'Mod: Interactive Control',
    'TP': 'Mod: SYN TRAC (Pro Edition)',
    'JQ': 'Mod: Job Queue',
    'LL': 'Mod: Lease Livestock',
    'CAM': 'Mod: Camera Tool',
    'LTT': 'Mod: Litres To Tonnes Converter',
    'LV': 'Mod: Livestock Visibility',
    'MA': 'Mod: Manual Attach',
    'MHC': 'Mod: Manual Hydraulic Control',
    'MIFC': 'Mod: Manual Machine Hydraulics Control',
    'MST': 'Mod: Multiple Silage Types',
    'NSC': 'Mod: Non-Stop Crop',
    'PING': 'Mod: Ping System',
    'PIH': 'Mod: Production Info HUD',
    'PS': 'Mod: Production Schedule',
    'PTH': 'Mod: PTH ABR 600',
    'PTO': 'Mod: PTO Load System',
    'RC': 'Mod: Radio Enhancements',
    'RS': 'Mod: Realistic Shopping',
    'RCC': 'Mod: Regional Crop Calendar',
    'RYD': 'Mod: Rename Your Dog',
    'MTS': 'Mod: Ropa Keiler RK22',
    'RPM': 'Mod: RPM Responsive Speeds',
    'STBB': 'Mod: Sell To The Best Bidder',
    'SVA': 'Mod: Shop Vehicle Actions',
    'SCC': 'Mod: Sync Cruise Control',
    'TL': 'Mod: Task List',
    'DFFC': 'Mod: Toggle Fertilizer On/Off',
    'TTD': 'Mod: Tractor Terrain Dynamics',
    'UTC': 'Mod: Universal Two-Rotor Rake Control',
    'ARE': 'Mod: ARE Super Strength',
    'AIM': 'Mod: Auto Attach Implement',
    'BUY': 'Mod: Buy Used Vehicles',
    'BULK': 'Mod: Bulk Fill System',
    'CABVIEW': 'Mod: Cab View Control',
    'COMPASS': 'Mod: On-Screen Compass',
    'DISTREDUX': 'Mod: View Distance Redux',
    'FASTDISCHARGE': 'Mod: Fast Discharge',
    'FILLTYPEALERT': 'Mod: FillType Alert',
    'FORESTER': 'Mod: Forester Tools',
    'MOW': 'Mod: Realistic Mower',
    'REALSILO': 'Mod: Real Silo Capacity',
    'REALMOWER': 'Mod: Real Mower'
};

function getModActionContext(name) {
    if (!name) return 'Mod Controls: Other';
    const trimmed = name.trim();

    // 1. Direct match from installed mods' modDesc.xml definitions
    if (modActionTitleMap && modActionTitleMap[trimmed]) {
        return `Mod: ${modActionTitleMap[trimmed]}`;
    }

    const upper = trimmed.toUpperCase();

    // 2. Direct pattern recognition for known compound mod actions
    if (upper.includes('INDOOR_CAM')) {
        return 'Mod: Indoor Camera';
    }

    // 3. Direct match in known mod prefixes
    for (const [prefix, label] of Object.entries(KNOWN_MOD_PREFIXES)) {
        if (
            upper.startsWith(prefix.toUpperCase() + '_') ||
            upper === prefix.toUpperCase()
        ) {
            return label;
        }
    }

    // 4. Custom mod prefix before the first underscore (e.g. FS25_..., AM_..., CY_...)
    const firstUnderscore = trimmed.indexOf('_');
    if (firstUnderscore > 1) {
        const token = trimmed.slice(0, firstUnderscore);
        const genericWords = new Set([
            'TOGGLE', 'SWITCH', 'AXIS', 'CHANGE', 'RESET', 'SHOW', 'SAVE', 'SET',
            'MENU', 'ROTATE', 'ZOOM', 'INCREASE', 'DECREASE', 'OPEN', 'CLOSE', 'CYCLE'
        ]);
        if (!genericWords.has(token.toUpperCase()) && firstUnderscore < 18) {
            return `Mod: ${token}`;
        } else if (genericWords.has(token.toUpperCase())) {
            // For actions like TOGGLE_MOUSE_STEERING_..., extract the subject after the generic word
            const rest = trimmed.slice(firstUnderscore + 1);
            const secondUnderscore = rest.indexOf('_');
            const subToken = secondUnderscore > 1 ? rest.slice(0, secondUnderscore) : rest;
            if (subToken && subToken.length > 2) {
                return `Mod Controls: ${subToken}`;
            }
        }
    }

    // 5. PascalCase or CamelCase prefix before camel transition (e.g. CutBaleAction, SortInput, ShowAnimalFoodDlg)
    const camelMatch = trimmed.match(/^([A-Z][a-z0-9]+)/);
    if (camelMatch && camelMatch[1] && camelMatch[1].length >= 3) {
        return `Mod: ${camelMatch[1]}`;
    }

    return 'Mod Controls: Other';
}

function getActionOperationalDomain(name) {
    const raw = (name || '').trim();
    const a = raw.toUpperCase();

    // 0. Official category declared in modDesc.xml for MENU
    const declaredCat = modActionCategoryMap[raw] || modActionCategoryMap[a];
    if (declaredCat === 'MENU') {
        return 'GUI_MENU';
    }

    // 1. GUI / Menus / Dialogs / Tablet / Shop / Overlays / HUD setup / Screens / Photo mode
    if (
        a.includes('SHOP') || a.includes('MENU') || a.includes('GUI') || a.includes('DIALOG') ||
        a.includes('DLG') || a.includes('CONFIG') || a.includes('CALC') || a.includes('SETTINGS') ||
        a.includes('SEARCH') || a.includes('PAGE') || a.includes('TABLET') || a.includes('BROWSE') ||
        a.includes('LIST') || a.includes('SCREEN') || a.includes('OVERLAY') || a.includes('EDITOR') ||
        a.includes('STORE') || a.includes('CONSTRUCTION') || a.includes('HELP') || a.includes('PAUSE') ||
        a.includes('INGAMEMAP') || a.includes('FINANCE') || a.includes('OBD') || a.includes('HUD') ||
        a.includes('CONVERSATION') || a.includes('CHAT') || a.startsWith('FR_') || a.startsWith('BANK_') ||
        a.startsWith('TL_') || a.includes('TASKS') || a.startsWith('RS_') || a.includes('SORT') ||
        a.includes('PRICETICKER') || a.includes('PRODUCTIONWATCHER') || a.startsWith('VMC_') ||
        a.includes('POPUP') || a.includes('ALERT') || a.startsWith('FORESTER_OPEN') ||
        a.includes('PIE') || a.includes('FAVORITE') || a.includes('LEDGER') || a.includes('STATUS') ||
        a.includes('RENAME') || a.startsWith('CAM_TOOL_') || a.startsWith('CU_') ||
        a === 'TRAMLINE_FILTER' || a === 'WATERPLANE_DIFFICULTY'
    ) {
        return 'GUI_MENU';
    }

    // 2. Specific Vehicle Implement / Sub-system Domains (mutually exclusive equipment)
    // Mower / Tedder / Windrower / Grass collector
    if (a.includes('WINDROWER') || a.includes('TEDDER') || a.includes('MOWER') || a.includes('REALMOWER') || a.includes('GRASS') || a.startsWith('BHH_') || a.includes('CHOP_MODE')) return 'VEHICLE_MOWER';
    // AUTOLOAD trailer / wagon
    if (a.includes('AUTOLOAD')) return 'VEHICLE_AUTOLOAD';
    // AutoLeveler Implement (AL_ prefix)
    if (a.startsWith('AL_')) return 'VEHICLE_LEVELER';
    // FORESTRY Crane / Yarder / Wood processor (excluding on-foot forester editor)
    if (a.includes('CRANE') || a.startsWith('SH_') || a.includes('YARDER') || a.startsWith('WFP_')) return 'VEHICLE_CRANE';
    // Winch / Towing Chains / Towing Cables
    if (a.includes('LOGSWINCH') || a.includes('WINCH') || a.includes('TOWINGCHAIN')) return 'VEHICLE_WINCH';
    // Firewood Processor
    if (a.includes('FIREWOODPROCESSOR')) return 'VEHICLE_FIREWOOD';
    // Baler / Bale Wrapper
    if (a.includes('BALE') || a.includes('BALER')) return 'VEHICLE_BALER';
    // Pipe / Tip / Trailer Discharge / Bunker
    if (a.includes('PIPE') || a.includes('MANUAL_TIPPING') || a.includes('LEVELER') || a.includes('SILO')) return 'VEHICLE_DISCHARGE';
    // Front Weight / Ballast Lowerlink (e.g. Traktorsafe, PTH ABR 600)
    if (a.includes('TS_LOWERLINK') || a.includes('FRONTWEIGHT') || a.startsWith('PTH_')) return 'VEHICLE_FRONTWEIGHT';
    // Loader Arm / Work Tool Positioner
    if (a.startsWith('WORK_TOOL_POSITION')) return 'VEHICLE_LOADER_TOOL';
    // Slurry / Hose / Pump / Reel system
    if (a.startsWith('PM_') || a.includes('PUMP') || a.includes('REEL') || a.startsWith('AIM_')) return 'VEHICLE_SLURRY_HOSE';
    // Root Crop Harvester (e.g. Ropa Keiler MTS_)
    if (a.startsWith('MTS_')) return 'VEHICLE_ROOT_HARVESTER';
    // Field Guidance / GPS / Headland / Tramline
    if (a.includes('GPS') || a.includes('HLM_') || a.includes('TRAMLINE') || a.includes('ASC_') || a.includes('COURSEPLAY') || a.startsWith('CP_') || a.includes('SECTIONCONTROL')) {
        return 'VEHICLE_GUIDANCE';
    }
    // Harvester Combine Header / Cutter control
    if (a.includes('CUTTER') || a.includes('HEADER')) return 'VEHICLE_CUTTER';

    // 3. Official category declared in modDesc.xml for ONFOOT / PLAYER
    if (declaredCat === 'ONFOOT' || declaredCat === 'PLAYER') {
        return 'ON_FOOT';
    }

    // 3. On-Foot / Character / Hand tools / Animal interaction / Physical Objects
    if (
        a.includes('HANDTOOL') || a.includes('ON_FOOT') || a.includes('PLAYER') || a.includes('CHAINSAW') ||
        a.includes('DRINK') || a.includes('EAT') || a.includes('CUT_BALE') || a.includes('JUMP') ||
        a.includes('CROUCH') || a.includes('RUN') || a.includes('WALK') || a.includes('FLASHLIGHT') ||
        a.includes('THROW') || a.includes('TAKE_OBJECT') || a.includes('ADD_OBJECT') ||
        a.includes('DROP_OBJECT') || a.includes('INTERACT') || a.startsWith('HPS_') || a.includes('STRENGTH') ||
        a.includes('PING_SYSTEM') || a.includes('MANUAL_ATTACH') || a.includes('SUPER_STRENGTH') ||
        a.startsWith('FORESTER_')
    ) {
        return 'ON_FOOT';
    }

    // 4. Vehicle General Driving / Universal In-Cab
    if (
        a.includes('STEER') || a.includes('GEAR') || a.includes('MOTOR') || a.includes('BRAKE') ||
        a.includes('ACCELERATE') || a.includes('CRUISE') || a.includes('LIGHT') || a.includes('HONK') ||
        a.includes('BEACON') || a.includes('TURNLIGHT') || a.includes('WIPER') || a.includes('CRAB') ||
        a.includes('SEAT') || a.includes('ENTER') || a.includes('SWITCH_VEHICLE') || a.includes('MIRROR') ||
        a.includes('CABIN') || a.includes('TYRE') || a.includes('TIRE') || a.includes('DIFF') ||
        a.includes('CVT') || a.includes('DBL') || a.includes('SPEED') || a.includes('PTO') ||
        a.includes('ATTACH') || a.includes('LOWER') || a.includes('LIFT') || a.includes('TOOL') ||
        a.includes('SEED') || a.includes('SPRAY') || a.includes('WORKMODE') ||
        a.includes('CAM_') || a.includes('CAMERA') || a.includes('ZOOM') || a.includes('PARK') ||
        a.includes('THROTTLE') || a.includes('RPM') || a.includes('SUSPENSION') ||
        a.includes('RETARDER') || a.includes('ADBLUE') || a.includes('MILEAGE')
    ) {
        return 'VEHICLE_DRIVING';
    }

    return 'GENERAL';
}

function areDomainsConflicting(domA, domB) {
    // Under Option A (Strict Simultaneous Only):
    // Only flag a genuine conflict if both actions share the exact same gameplay operational situation.
    // Different situations (Menu vs In-Vehicle, On-Foot vs Driving, Autoload vs Baler vs Mower, etc.)
    // never execute at the same moment in-game and are completely safe.
    if (domA !== domB) return false;
    // Separate menus/dialogs or general non-interactive hotkeys don't conflict
    if (domA === 'GUI_MENU' || domA === 'GENERAL') return false;
    return true;
}

function categorizeAction(actionName) {
    const a = (actionName || '').toUpperCase();
    if (a.includes('CAMERA') || a.includes('LOOK') || a.includes('ROTATE_OBJECT') || a.includes('ZOOM')) return 'Camera & View';
    if (a.includes('STEER') || a.includes('GEAR') || a.includes('MOTOR') || a.includes('BRAKE') || a.includes('ACCELERATE') || a.includes('CRUISE') || a.includes('LIGHTS') || a.includes('HONK') || a.includes('BEACON') || a.includes('TURNLIGHT') || a.includes('WIPER') || a.includes('CRAB') || a.includes('SEAT') || a.includes('ENTER') || a.includes('SWITCH_VEHICLE')) return 'Vehicle Driving';
    if (a.includes('IMPLEMENT') || a.includes('ATTACH') || a.includes('DETACH') || a.includes('LOWER') || a.includes('LIFT') || a.includes('PIPE') || a.includes('COVER') || a.includes('TIP') || a.includes('SEEDS') || a.includes('SPRAY') || a.includes('WORKMODE') || a.includes('BALE') || a.includes('CHOPPER') || a.includes('CRANE') || a.includes('ARM') || a.includes('WOOD') || a.includes('TREE') || a.includes('YARDER') || a.includes('WINCH') || a.includes('BELT')) return 'Implements & Tools';
    if (a.includes('MENU') || a.includes('PAUSE') || a.includes('STORE') || a.includes('MAP') || a.includes('HELP') || a.includes('CONSTRUCTION') || a.includes('SKIP') || a.includes('CHARACTER') || a.includes('RADIO')) return 'Interface & Menus';
    if (a.includes('JUMP') || a.includes('CROUCH') || a.includes('HANDTOOL') || a.includes('INTERACT') || a.includes('THROW') || a.includes('PET') || a.includes('RUN') || a.includes('WALK') || a.includes('FLASHLIGHT')) return 'Character & Hand Tools';
    return 'General & Other';
}

function formatKeyName(rawInput) {
    if (!rawInput) return '';
    return rawInput
        .replace(/KEY_lshift/gi, 'Left Shift')
        .replace(/KEY_rshift/gi, 'Right Shift')
        .replace(/KEY_lctrl/gi, 'Left Ctrl')
        .replace(/KEY_rctrl/gi, 'Right Ctrl')
        .replace(/KEY_lalt/gi, 'Left Alt')
        .replace(/KEY_ralt/gi, 'Right Alt')
        .replace(/KEY_space/gi, 'Space')
        .replace(/KEY_return/gi, 'Enter')
        .replace(/KEY_backspace/gi, 'Backspace')
        .replace(/KEY_tab/gi, 'Tab')
        .replace(/KEY_escape/gi, 'Esc')
        .replace(/MOUSE_BUTTON_LEFT/gi, 'Left Click')
        .replace(/MOUSE_BUTTON_RIGHT/gi, 'Right Click')
        .replace(/MOUSE_BUTTON_MIDDLE/gi, 'Middle Click')
        .replace(/KEY_/gi, '')
        .toUpperCase();
}

async function getInputBindings() {
    const filePath = getInputBindingPath();
    if (!fs.existsSync(filePath)) {
        return {
            success: false,
            error: 'inputBinding.xml not found. Please run FS25 at least once.',
            actions: [],
            devices: [],
            conflicts: []
        };
    }

    try {
        const xml = await fs.readFile(filePath, 'utf8');
        const data = parser.parse(xml);
        const root = data.inputBinding || {};

        const rawActions = root.actionBinding 
            ? (Array.isArray(root.actionBinding) ? root.actionBinding : [root.actionBinding])
            : [];

        const rawDevices = root.devices?.device
            ? (Array.isArray(root.devices.device) ? root.devices.device : [root.devices.device])
            : [];
        
        const devices = [
            { id: 'KB_MOUSE_DEFAULT', name: 'Keyboard & Mouse', isDefault: true },
            ...rawDevices.map(d => ({
                id: d['@_id'],
                name: d['@_name'] || 'Gamepad / Wheel',
                category: d['@_category']
            }))
        ];

        // Context mapping for action states
        function getActionContext(name, isMod = false) {
            if (isMod) {
                return getModActionContext(name);
            }
            const a = (name || '').toUpperCase();
            if (a.startsWith('MENU') || a.includes('MAP_') || a.includes('INGAMEMAP') || a.includes('HELP') || a.includes('STORE') || a.includes('CONSTRUCTION') || a.includes('CHARACTER_CREATION') || a.includes('MESSAGE_BOX') || a.includes('CONVERSATION') || a.includes('SCREENSHOT') || a.includes('CHAT') || a.includes('PAUSE') || a.includes('TIMESCALE') || a.includes('PICK_COLOR') || a.includes('NOTE')) {
                return 'Menu & Interface';
            }
            if (a.includes('PLAYER') || a.includes('HANDTOOL') || a.includes('INTERACT') || a.includes('THROW') || a.includes('CROUCH') || a.includes('JUMP') || a.includes('ANIMAL_PET') || a.includes('HANDS_LEVEL') || a.includes('SPRAYCAN') || a.includes('ACTIVATE_OBJECT')) {
                return 'On Foot (Character)';
            }
            if (a.includes('WINCH') || a.includes('YARDER')) {
                return 'Forestry, Winch & Yarder';
            }
            if (a.startsWith('CRANE_') || a.startsWith('AXIS_CRANE') || a.startsWith('SH_')) {
                return 'Crane Controls';
            }
            if (a.includes('FRONTLOADER')) {
                return 'Front Loader Controls';
            }
            if (a.includes('WOOD_HARVESTER') || a.includes('TREE_AUTOMATIC')) {
                return 'Wood Harvester & Forestry';
            }
            if (a.includes('BALE_') || a.includes('PALLET_FILLER') || a.includes('FOLDABLESTEPS')) {
                return 'Specialized Implement Attachment';
            }
            if (a.includes('UNIVERSALAUTOLOAD')) {
                return 'Universal Autoload (Mod)';
            }
            if (a.includes('DEBUG') || a.includes('CONSOLE') || a.includes('RELOAD_GAME')) {
                return 'Developer / Debug Tools';
            }
            return 'Vehicle Driving & Base Implements';
        }

        // Intentionally shared bindings designed by GIANTS or mod contexts that are safe
        const safeSharedActions = new Set([
            'ACTIVATE_HANDTOOL', 'ACTIVATE_HANDTOOL_SECONDARY', 'INTERACT', 'THROW_OBJECT', 'ACTIVATE_OBJECT', 'ANIMAL_PET',
            'TOGGLE_LIGHTS_FPS', 'TOGGLE_LIGHTS', 'SKIP_MESSAGE_BOX', 'INTRODUCTION_HELP_SKIP', 'CONVERSATION_SKIP',
            'MENU_ACCEPT', 'MENU_ACTIVATE', 'MENU_BACK', 'MENU_CANCEL', 'INGAMEMAP_ACCEPT', 'SWITCH_SEAT', 'BALE_COUNTER_RESET',
            'MENU_EXTRA_1', 'MENU_EXTRA_2', 'MENU_LIST_PAGE_START', 'MENU_LIST_PAGE_END', 'MENU_MAP_ACTION_1',
            'AXIS_CONSTRUCTION_CAMERA_ZOOM', 'AXIS_CONSTRUCTION_CAMERA_ROTATE', 'AXIS_CONSTRUCTION_CAMERA_TILT',
            'MENU_AXIS_UP_DOWN', 'AXIS_CONSTRUCTION_MENU_UP_DOWN', 'MENU_AXIS_LEFT_RIGHT', 'AXIS_CONSTRUCTION_MENU_LEFT_RIGHT',
            'AXIS_MAP_ZOOM_IN', 'AXIS_MAP_ZOOM_OUT', 'AXIS_RUN', 'AXIS_CLUTCH_VEHICLE', 'AXIS_ACCELERATE_VEHICLE',
            'AXIS_HYDRAULICATTACHER1', 'AXIS_HYDRAULICATTACHER2', 'AXIS_DOOR', 'AXIS_DOOR_2', 'AXIS_DOOR_3', 'AXIS_WHEEL_BASE',
            'AXIS_LOOK_UPDOWN_DRAG', 'AXIS_LOOK_LEFTRIGHT_DRAG', 'AXIS_FRONTLOADER_ARM', 'AXIS_FRONTLOADER_ARM2',
            'AXIS_FRONTLOADER_TOOL', 'AXIS_FRONTLOADER_TOOL2', 'AXIS_FRONTLOADER_TOOL3', 'AXIS_FRONTLOADER_TOOL4', 'AXIS_FRONTLOADER_TOOL5',
            'AXIS_CRANE_ARM', 'AXIS_CRANE_ARM2', 'AXIS_CRANE_ARM3', 'AXIS_CRANE_ARM4', 'AXIS_CRANE_TOOL', 'AXIS_CRANE_TOOL2',
            'AXIS_CRANE_TOOL3', 'AXIS_CRANE_SUPPORT', 'AXIS_CUTTER_REEL', 'AXIS_CUTTER_REEL2', 'AXIS_SPRAYER_ARM',
            'AXIS_DRAWBAR', 'AXIS_DRAWBAR2', 'SH_MOVE_CRANE_TOOL', 'SH_ROTATE_CRANE_TOOL', 'SH_OPEN_CRANE_TOOL',
            'AXIS_PIPE', 'AXIS_PIPE2', 'MOUSE_ALT_COMMAND3_BUTTON',
            'CRABSTEERING_ALLWHEEL', 'WORKMODE_MIDDLE', 'CRABSTEERING_CRABLEFT', 'WORKMODE_LEFT', 'CRABSTEERING_CRABRIGHT', 'WORKMODE_RIGHT',
            'YARDER_CONTROL_LEFTRIGHT', 'WINCH_CONTROL', 'YARDER_FOLLOW_ME', 'WINCH_ATTACH_MODE', 'YARDER_FOLLOW_PICKUP', 'WINCH_DETACH',
            'YARDER_ATTACH', 'WINCH_ATTACH',
            'CAMERA_ZOOM_IN_OUT', 'AXIS_MTO_SCROLL', 'MENU', 'HONK', 'TOGGLE_LIGHTS_EXTERNAL',
            'TOGGLE_TIPSTATE', 'UNLOAD', 'TOGGLE_BEACON_LIGHTS', 'EDC_SUPER_STRENGTH',
            'TOGGLE_CRABSTEERING', 'TOGGLE_WORKMODE', 'VEHICLE_ACTION_CONTROL', 'IMPLEMENT_EXTRA',
            'IMPLEMENT_EXTRA3', 'TOGGLE_SEEDS', 'IMPLEMENT_EXTRA4', 'LIFTABLE_AXLE',
            'DOUBLED_SPRAY_AMOUNT', 'TOGGLE_CHOPPER', 'TOGGLE_SEEDS_BACK', 'TOGGLE_CUT_LENGTH_BACK',
            'TOGGLE_PIPE', 'MODULE_ATTACH_ASSIST', 'TOGGLE_COVER',
            'CONSTRUCTION_ACTION_PRIMARY'
        ]);

        const actions = [];
        const bindingsMap = {};

        // Build default/factory bindings map to prevent false conflict alerts for intentional default key sharing
        const defaultSharedBindingsMap = {};
        const officialDefaultActions = new Set();
        try {
            const dataRoot = pathProvider.getFS25DataRoot();
            const nativeBackupPath = path.join(dataRoot, 'InputBackUp', 'inputBinding.xml');
            const defaultPaths = [nativeBackupPath];

            // Also check Steam / default install profileTemplate if available
            const possibleTemplateDirs = [
                'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Farming Simulator 25\\profileTemplate',
                'C:\\Program Files\\Steam\\steamapps\\common\\Farming Simulator 25\\profileTemplate',
                'D:\\SteamLibrary\\steamapps\\common\\Farming Simulator 25\\profileTemplate'
            ];
            for (const tDir of possibleTemplateDirs) {
                if (fs.existsSync(tDir)) {
                    defaultPaths.push(path.join(tDir, 'inputBindingDefault_KeyboardMouse.xml'));
                    defaultPaths.push(path.join(tDir, 'inputBindingDefault_Gamepad.xml'));
                }
            }

            for (const dPath of defaultPaths) {
                if (fs.existsSync(dPath)) {
                    const dXml = fs.readFileSync(dPath, 'utf8');
                    const dParsed = parser.parse(dXml);
                    const dRoot = dParsed?.inputBinding || {};
                    const dActions = dRoot.actionBinding
                        ? (Array.isArray(dRoot.actionBinding) ? dRoot.actionBinding : [dRoot.actionBinding])
                        : [];

                    for (const dAct of dActions) {
                        const dActName = dAct['@_action'] || '';
                        if (dActName) officialDefaultActions.add(dActName);
                        const dBindings = dAct.binding
                            ? (Array.isArray(dAct.binding) ? dAct.binding : [dAct.binding])
                            : [];

                        for (const dB of dBindings) {
                            const dDev = dB['@_device'] || 'KB_MOUSE_DEFAULT';
                            const dInp = (dB['@_input'] || '').trim();
                            if (dInp) {
                                const dKey = `${dDev}::${dInp}`;
                                if (!defaultSharedBindingsMap[dKey]) defaultSharedBindingsMap[dKey] = new Set();
                                defaultSharedBindingsMap[dKey].add(dActName);
                            }
                        }
                    }
                }
            }
        } catch (dErr) {
            console.warn('[INPUT-BINDINGS] Could not load default bindings for conflict filtering:', dErr.message);
        }

        for (const act of rawActions) {
            const actionName = act['@_action'] || '';
            const isModAction = officialDefaultActions.size > 0 && !officialDefaultActions.has(actionName);
            const actionContext = getActionContext(actionName, isModAction);
            const rawBindings = act.binding 
                ? (Array.isArray(act.binding) ? act.binding : [act.binding])
                : [];

            const bindings = rawBindings.map((b, idx) => {
                const device = b['@_device'] || 'KB_MOUSE_DEFAULT';
                const input = b['@_input'] || '';
                const index = b['@_index'] || idx + 1;
                const axisComponent = b['@_axisComponent'] || '+';

                if (input && input.trim()) {
                    const conflictKey = `${device}::${input.trim()}`;
                    if (!bindingsMap[conflictKey]) bindingsMap[conflictKey] = [];
                    bindingsMap[conflictKey].push({ action: actionName, input, device, context: actionContext });
                }

                return {
                    device,
                    input,
                    formattedInput: formatKeyName(input),
                    index: parseInt(index, 10) || 1,
                    axisComponent
                };
            });

            actions.push({
                action: actionName,
                category: categorizeAction(actionName),
                context: actionContext,
                bindings
            });
        }

        const conflicts = [];
        for (const [key, list] of Object.entries(bindingsMap)) {
            if (list.length > 1) {
                const [device, input] = key.split('::');
                // Only consider it a genuine clash if not all participating actions are known safe design shares
                const allSafe = list.every(item => safeSharedActions.has(item.action));
                if (allSafe) continue;

                // Check if this exact combination of actions is an intended default in GIANTS factory profiles
                const defaultKey = `${device}::${input.trim()}`;
                const defaultSet = defaultSharedBindingsMap[defaultKey];
                const isAllDefaultIntended = defaultSet && list.every(item => defaultSet.has(item.action));
                if (isAllDefaultIntended) continue;

                // Rule 1: Basegame default actions are standard game controls.
                // Mods can coexist alongside basegame defaults on the same key without conflict.
                const modItemsOnly = list.filter(item => !officialDefaultActions.has(item.action));
                const distinctModActions = [...new Set(modItemsOnly.map(item => item.action))];
                if (distinctModActions.length <= 1) continue;

                // Rule 2: If actions belong to the same mod/context, they are intended sub-states / mutually exclusive
                const distinctContexts = new Set(distinctModActions.map(actName => getActionContext(actName, true)));
                if (distinctContexts.size <= 1) continue;

                // Rule 3: Gameplay Situation / Operational Domain Cross-check.
                // If two mod actions share a key but operate in mutually exclusive gameplay situations
                // (e.g. Menu/Shop GUI vs In-Vehicle driving, or On-Foot player tools vs In-Vehicle implement,
                // or mutually exclusive vehicle implement types like Autoload trailer vs Forestry crane),
                // they can never execute simultaneously in-game and are NOT genuine conflicts.
                const clashingActions = new Set();
                const clashingContexts = new Set();

                for (let i = 0; i < modItemsOnly.length; i++) {
                    for (let j = i + 1; j < modItemsOnly.length; j++) {
                        const itemA = modItemsOnly[i];
                        const itemB = modItemsOnly[j];
                        if (itemA.action === itemB.action) continue;

                        const ctxA = getActionContext(itemA.action, true);
                        const ctxB = getActionContext(itemB.action, true);
                        if (ctxA === ctxB) continue; // Same mod is safe

                        const domA = getActionOperationalDomain(itemA.action);
                        const domB = getActionOperationalDomain(itemB.action);

                        if (areDomainsConflicting(domA, domB)) {
                            clashingActions.add(itemA.action);
                            clashingActions.add(itemB.action);
                            clashingContexts.add(ctxA);
                            clashingContexts.add(ctxB);
                        }
                    }
                }

                if (clashingActions.size > 1) {
                    conflicts.push({
                        context: Array.from(clashingContexts).join(', '),
                        device,
                        input,
                        formattedInput: formatKeyName(input),
                        actions: Array.from(clashingActions)
                    });
                }
            }
        }

        return {
            success: true,
            filePath,
            actions,
            devices,
            conflicts,
            mouseSensitivityScaleX: root['@_mouseSensitivityScaleX'] || '1.000000',
            mouseSensitivityScaleY: root['@_mouseSensitivityScaleY'] || '1.000000'
        };
    } catch (err) {
        console.error('[INPUT-BINDINGS] Parse error:', err);
        return { success: false, error: err.message, actions: [], devices: [], conflicts: [] };
    }
}

async function updateBinding(actionName, deviceId, oldInput, newInput) {
    const filePath = getInputBindingPath();
    if (!fs.existsSync(filePath)) return { success: false, error: 'inputBinding.xml not found' };

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const autoBakPath = path.join(getKeybindBackupsPath(), `auto_backup_before_edit_${timestamp}.xml`);
        await fs.copy(filePath, autoBakPath);

        const xml = await fs.readFile(filePath, 'utf8');
        const data = parser.parse(xml);
        const root = data.inputBinding || {};

        const rawActions = root.actionBinding 
            ? (Array.isArray(root.actionBinding) ? root.actionBinding : [root.actionBinding])
            : [];

        let targetAction = rawActions.find(a => a['@_action'] === actionName);

        if (!targetAction) {
            targetAction = {
                '@_action': actionName,
                binding: []
            };
            rawActions.push(targetAction);
            root.actionBinding = rawActions;
        }

        let bindings = targetAction.binding
            ? (Array.isArray(targetAction.binding) ? targetAction.binding : [targetAction.binding])
            : [];

        if (!newInput || !newInput.trim()) {
            bindings = bindings.filter(b => !(b['@_device'] === deviceId && b['@_input'] === oldInput));
        } else {
            const existingIdx = bindings.findIndex(b => b['@_device'] === deviceId && (oldInput ? b['@_input'] === oldInput : true));
            if (existingIdx >= 0) {
                bindings[existingIdx]['@_input'] = newInput.trim();
            } else {
                bindings.push({
                    '@_device': deviceId,
                    '@_input': newInput.trim(),
                    '@_axisComponent': '+',
                    '@_neutralInput': '0',
                    '@_index': '1'
                });
            }
        }

        targetAction.binding = bindings;

        const newXml = builder.build(data);
        await fs.writeFile(filePath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml);
        return { success: true };
    } catch (err) {
        console.error('[INPUT-BINDINGS] Update error:', err);
        return { success: false, error: err.message };
    }
}

async function getBackups() {
    const backupsDir = getKeybindBackupsPath();
    try {
        const files = await fs.readdir(backupsDir);
        const xmlFiles = files.filter(f => f.endsWith('.xml'));
        const backups = [];

        for (const file of xmlFiles) {
            const fullPath = path.join(backupsDir, file);
            const stats = await fs.stat(fullPath);
            backups.push({
                fileName: file,
                filePath: fullPath,
                name: file.replace(/\.xml$/i, '').replace(/^profile_/i, '').replace(/_/g, ' '),
                createdAt: stats.mtime.toISOString(),
                sizeBytes: stats.size
            });
        }

        return {
            success: true,
            backups: backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        };
    } catch (err) {
        return { success: false, error: err.message, backups: [] };
    }
}

async function createBackup(name) {
    const filePath = getInputBindingPath();
    if (!fs.existsSync(filePath)) return { success: false, error: 'inputBinding.xml not found' };

    try {
        const backupsDir = getKeybindBackupsPath();
        const safeName = (name || 'backup').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const targetFileName = `profile_${safeName}_${timestamp}.xml`;
        const destPath = path.join(backupsDir, targetFileName);

        await fs.copy(filePath, destPath);
        return { success: true, fileName: targetFileName };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function restoreBackup(fileName) {
    const backupsDir = getKeybindBackupsPath();
    const sourcePath = path.join(backupsDir, fileName);
    const destPath = getInputBindingPath();

    if (!fs.existsSync(sourcePath)) return { success: false, error: 'Backup file not found' };

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const preRestorePath = path.join(backupsDir, `auto_pre_restore_${timestamp}.xml`);
        if (fs.existsSync(destPath)) {
            await fs.copy(destPath, preRestorePath);
        }

        await fs.copy(sourcePath, destPath);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function updateBackup(fileName) {
    const backupsDir = getKeybindBackupsPath();
    const destPath = path.join(backupsDir, fileName);
    const sourcePath = getInputBindingPath();

    if (!fs.existsSync(sourcePath)) return { success: false, error: 'inputBinding.xml not found' };
    if (!fs.existsSync(destPath)) return { success: false, error: 'Target backup not found' };

    try {
        await fs.copy(sourcePath, destPath);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function deleteBackup(fileName) {
    const backupsDir = getKeybindBackupsPath();
    const filePath = path.join(backupsDir, fileName);
    if (fs.existsSync(filePath)) {
        await fs.remove(filePath);
        return { success: true };
    }
    return { success: false, error: 'File not found' };
}

async function resetToDefaults() {
    const destPath = getInputBindingPath();
    const backupsDir = getKeybindBackupsPath();

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (fs.existsSync(destPath)) {
            const safetyBackup = path.join(backupsDir, `safety_before_factory_reset_${timestamp}.xml`);
            await fs.copy(destPath, safetyBackup);
        }

        const dataRoot = pathProvider.getFS25DataRoot();
        const nativeBackup = path.join(dataRoot, 'InputBackUp', 'inputBinding.xml');
        
        if (fs.existsSync(nativeBackup)) {
            await fs.copy(nativeBackup, destPath);
            return { success: true, message: 'Reset to factory defaults using native clean backup.' };
        } else {
            if (fs.existsSync(destPath)) {
                await fs.remove(destPath);
            }
            return { success: true, message: 'Existing bindings cleared. FS25 will generate fresh default bindings on next launch.' };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Extract actionBindings and actions from a mod's modDesc.xml content
 */
function extractModKeybindsFromXml(xmlContent) {
    if (!xmlContent) return { actions: [], actionBindings: [] };

    const actions = [];
    const actionBindings = [];

    // 1. Parse <actions>...</actions>
    const actionsMatch = xmlContent.match(/<actions>([\s\S]*?)<\/actions>/i);
    if (actionsMatch && actionsMatch[1]) {
        try {
            const parsedActions = parser.parse('<actions>' + actionsMatch[1] + '</actions>');
            const rawAct = parsedActions?.actions?.action;
            const actList = Array.isArray(rawAct) ? rawAct : (rawAct ? [rawAct] : []);
            for (const a of actList) {
                const name = a['@_name'];
                if (name && typeof name === 'string' && name.trim()) {
                    actions.push({
                        name: name.trim(),
                        category: a['@_category'] || 'General & Other',
                        axisType: a['@_axisType']
                    });
                }
            }
        } catch (e) {
            console.warn('[KEYBIND-COMPILER] Error parsing mod actions block:', e.message);
        }
    }

    // 2. Parse <inputBinding>...</inputBinding>
    const inputMatch = xmlContent.match(/<inputBinding>([\s\S]*?)<\/inputBinding>/i);
    if (inputMatch && inputMatch[1]) {
        try {
            const parsedInp = parser.parse('<inputBinding>' + inputMatch[1] + '</inputBinding>');
            const rawBindings = parsedInp?.inputBinding?.actionBinding;
            const bindList = Array.isArray(rawBindings) ? rawBindings : (rawBindings ? [rawBindings] : []);
            for (const ab of bindList) {
                const action = ab['@_action'];
                if (!action || typeof action !== 'string' || !action.trim()) continue;

                const rawB = ab.binding;
                const bList = Array.isArray(rawB) ? rawB : (rawB ? [rawB] : []);
                const normalizedBindings = [];

                for (const b of bList) {
                    if (b && b['@_input']) {
                        normalizedBindings.push({
                            '@_device': b['@_device'] || 'KB_MOUSE_DEFAULT',
                            '@_input': b['@_input'].trim(),
                            '@_axisComponent': b['@_axisComponent'] || '+',
                            '@_neutralInput': b['@_neutralInput'] || '0',
                            '@_index': String(b['@_index'] || '1')
                        });
                    }
                }

                actionBindings.push({
                    action: action.trim(),
                    bindings: normalizedBindings
                });
            }
        } catch (e) {
            console.warn('[KEYBIND-COMPILER] Error parsing mod inputBinding block:', e.message);
        }
    }

    return { actions, actionBindings };
}

/**
 * Extract keybind definitions from a specific mod (ZIP file or unpacked directory)
 */
function extractKeybindsFromMod(modPath) {
    if (!fs.existsSync(modPath)) return null;

    let modDescText = null;
    try {
        const stats = fs.statSync(modPath);
        if (stats.isDirectory()) {
            const descPath = path.join(modPath, 'modDesc.xml');
            if (fs.existsSync(descPath)) {
                modDescText = fs.readFileSync(descPath, 'utf8');
            }
        } else if (modPath.toLowerCase().endsWith('.zip')) {
            const modManager = require('./modManager');
            const buf = modManager.readEntryFromZip(modPath, 'modDesc.xml');
            if (buf) {
                modDescText = buf.toString('utf8');
            }
        }
    } catch (err) {
        return null;
    }

    if (!modDescText) return null;
    if (!modDescText.includes('<actions') && !modDescText.includes('<inputBinding')) return null;

    return extractModKeybindsFromXml(modDescText);
}

/**
 * Compiles keybindings from mods and adds any missing actions and default bindings into inputBinding.xml.
 * If specificModPaths is provided, it only processes those specific mods; otherwise it scans all active mod paths.
 * Existing player bindings are preserved and never overwritten.
 */
async function compileModKeybinds(specificModPaths = null) {
    const inputBindingPath = getInputBindingPath();
    if (!fs.existsSync(inputBindingPath)) {
        return { success: false, error: 'inputBinding.xml not found. Please launch FS25 at least once.' };
    }

    try {
        // Collect target files
        let targetModPaths = [];
        if (Array.isArray(specificModPaths) && specificModPaths.length > 0) {
            targetModPaths = specificModPaths;
        } else {
            // Find all mods across configured paths
            const modManager = require('./modManager');
            const candidateDirs = modManager.getModsPaths ? modManager.getModsPaths() : [];
            const seenFiles = new Set();

            for (const cDir of candidateDirs) {
                if (!fs.existsSync(cDir)) continue;
                try {
                    const entries = fs.readdirSync(cDir);
                    for (const entry of entries) {
                        if (entry.startsWith('.') || entry.toLowerCase() === 'backups') continue;
                        const fullPath = path.join(cDir, entry);
                        const lower = entry.toLowerCase();

                        let isDir = false;
                        try {
                            isDir = fs.statSync(fullPath).isDirectory();
                        } catch (_) {}

                        if (lower.endsWith('.zip')) {
                            if (!seenFiles.has(lower)) {
                                seenFiles.add(lower);
                                targetModPaths.push(fullPath);
                            }
                        } else if (isDir) {
                            // Check if this folder is an unpacked mod itself
                            if (fs.existsSync(path.join(fullPath, 'modDesc.xml'))) {
                                if (!seenFiles.has(lower)) {
                                    seenFiles.add(lower);
                                    targetModPaths.push(fullPath);
                                }
                            } else {
                                // It's a subfolder containing mods (e.g. Map subfolders, Map Dependencies, etc.)
                                try {
                                    const subEntries = fs.readdirSync(fullPath);
                                    for (const sub of subEntries) {
                                        const subLower = sub.toLowerCase();
                                        if (subLower.endsWith('.zip')) {
                                            if (!seenFiles.has(subLower)) {
                                                seenFiles.add(subLower);
                                                targetModPaths.push(path.join(fullPath, sub));
                                            }
                                        }
                                    }
                                } catch (_) {}
                            }
                        }
                    }
                } catch (dirErr) {
                    console.warn(`[KEYBIND-COMPILER] Error reading directory ${cDir}:`, dirErr.message);
                }
            }
        }

        if (targetModPaths.length === 0) {
            return { success: true, addedCount: 0, message: 'No mods found to compile keybindings from.' };
        }

        // Parse current inputBinding.xml
        const xml = await fs.readFile(inputBindingPath, 'utf8');
        const data = parser.parse(xml);
        const root = data.inputBinding || {};

        const rawActions = root.actionBinding
            ? (Array.isArray(root.actionBinding) ? root.actionBinding : [root.actionBinding])
            : [];

        // Build a map of existing action bindings in inputBinding.xml
        const existingActionsMap = new Map();
        for (const act of rawActions) {
            const name = act['@_action'];
            if (name) existingActionsMap.set(name, act);
        }

        let addedCount = 0;
        let modifiedActionsCount = 0;

        for (const modPath of targetModPaths) {
            const extracted = extractKeybindsFromMod(modPath);
            if (!extracted) continue;

            const { actions, actionBindings } = extracted;
            const allActionNames = new Set([
                ...actions.map(a => a.name),
                ...actionBindings.map(b => b.action)
            ]);

            for (const actionName of allActionNames) {
                const modBindingDef = actionBindings.find(b => b.action === actionName);

                if (!existingActionsMap.has(actionName)) {
                    // Action is completely new to inputBinding.xml - compile it in!
                    const newActionEntry = {
                        '@_action': actionName
                    };

                    if (modBindingDef && modBindingDef.bindings.length > 0) {
                        newActionEntry.binding = modBindingDef.bindings.length === 1 
                            ? modBindingDef.bindings[0] 
                            : modBindingDef.bindings;
                    }

                    rawActions.push(newActionEntry);
                    existingActionsMap.set(actionName, newActionEntry);
                    addedCount++;
                } else {
                    // Action already exists. If it has no bindings at all, but the mod provides default bindings, add them!
                    const existingEntry = existingActionsMap.get(actionName);
                    const currentBindings = existingEntry.binding
                        ? (Array.isArray(existingEntry.binding) ? existingEntry.binding : [existingEntry.binding])
                        : [];

                    if (currentBindings.length === 0 && modBindingDef && modBindingDef.bindings.length > 0) {
                        existingEntry.binding = modBindingDef.bindings.length === 1
                            ? modBindingDef.bindings[0]
                            : modBindingDef.bindings;
                        modifiedActionsCount++;
                    }
                }
            }
        }

        if (addedCount > 0 || modifiedActionsCount > 0) {
            root.actionBinding = rawActions;
            data.inputBinding = root;

            // Save backup before writing compiled bindings
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const autoBakPath = path.join(getKeybindBackupsPath(), `auto_backup_before_compile_${timestamp}.xml`);
            await fs.copy(inputBindingPath, autoBakPath);

            const newXml = builder.build(data);
            await fs.writeFile(inputBindingPath, '<?xml version="1.0" encoding="utf-8" standalone="no" ?>\n' + newXml, 'utf8');
            console.log(`[KEYBIND-COMPILER] Compiled mod keybinds into inputBinding.xml: ${addedCount} new action(s) added, ${modifiedActionsCount} bound.`);
        }

        return {
            success: true,
            addedCount,
            modifiedActionsCount,
            message: `Compiled mod keybinds: ${addedCount} new action(s) added, ${modifiedActionsCount} default binding(s) populated.`
        };
    } catch (err) {
        console.error('[KEYBIND-COMPILER] Compilation error:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    getInputBindings,
    updateBinding,
    getBackups,
    createBackup,
    restoreBackup,
    updateBackup,
    deleteBackup,
    resetToDefaults,
    compileModKeybinds,
    extractKeybindsFromMod
};

