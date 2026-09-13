const fs = require('fs-extra');
const path = require('path');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const pathProvider = require('./pathProvider');
const { app } = require('electron');

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
        function getActionContext(name) {
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

        for (const act of rawActions) {
            const actionName = act['@_action'] || '';
            const actionContext = getActionContext(actionName);
            const rawBindings = act.binding 
                ? (Array.isArray(act.binding) ? act.binding : [act.binding])
                : [];

            const bindings = rawBindings.map((b, idx) => {
                const device = b['@_device'] || 'KB_MOUSE_DEFAULT';
                const input = b['@_input'] || '';
                const index = b['@_index'] || idx + 1;
                const axisComponent = b['@_axisComponent'] || '+';

                if (input && input.trim()) {
                    const conflictKey = `${actionContext}::${device}::${input.trim()}`;
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
                const [context, device, input] = key.split('::');
                // Only consider it a genuine clash if not all participating actions are known safe design shares
                const allSafe = list.every(item => safeSharedActions.has(item.action));
                if (!allSafe) {
                    conflicts.push({
                        context,
                        device,
                        input,
                        formattedInput: formatKeyName(input),
                        actions: list.map(item => item.action)
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

module.exports = {
    getInputBindings,
    updateBinding,
    getBackups,
    createBackup,
    restoreBackup,
    deleteBackup,
    resetToDefaults
};
