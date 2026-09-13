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

        const actions = [];
        const bindingsMap = {};

        for (const act of rawActions) {
            const actionName = act['@_action'] || '';
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
                    bindingsMap[conflictKey].push({ action: actionName, input, device });
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
                bindings
            });
        }

        const conflicts = [];
        for (const [key, list] of Object.entries(bindingsMap)) {
            if (list.length > 1) {
                const [device, input] = key.split('::');
                conflicts.push({
                    device,
                    input,
                    formattedInput: formatKeyName(input),
                    actions: list.map(item => item.action)
                });
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
