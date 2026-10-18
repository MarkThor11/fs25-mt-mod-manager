const fs = require('fs-extra');
const path = require('path');
const modManager = require('./modManager');

const checkActions = [
  'FORESTER_BRUSH_RADIUS_UP',
  'FORESTER_ZONE_FINISH',
  'WFP_NUDGE_SAVE',
  'WFP_NUDGE_AXIS_Z',
  'AUTOOPENSTATE',
  'TOGGLE_HeadFLASHLIGHT',
  'BF_TOGGLE',
  'FARMLAND_AUCTION_BID',
  'SPEEDPLUS',
  'SSP_MOTOR',
  'AUTO_RUN_TOGGLE',
  'SPEEDMINUS',
  'SSP_PREVIEW',
  'SSP_RPM_DOWN',
  'TOGGLE_LOCK_STEERING_AXLE_BUTTON',
  'UNIVERSALAUTOLOAD_TOGGLE_FILTER',
  'AUTOLOADWOODEW_TOGGLE_SIDE',
  'RESET_INDOOR_CAM_BUTTON',
  'PTH_RETARDER_INCREASE',
  'WORK_TOOL_POSITION',
  'SSP_TIRE',
  'USEDPLUS_TIRES',
  'toggleSectionControl',
  'TRAMLINE_FILTER',
  'AXIS_CUTTER_ATTACHER_TRANS',
  'AXIS_TS_LOWERLINK',
  'WATERPLANE_DIFFICULTY',
  'TOGGLE_24H_GROWTH',
  'STBB_OVERVIEW',
  'ACTION_HONK',
  'SSP_VOL_DOWN',
  'AM_SwitchMirror',
  'MIRROR_ROTATION_X',
  'CRABSTEERING_STREETMODE',
  'RESET_CAM_POSITION_BACK',
  'REMOTECONTROL',
  'EVM_LIMP_HOME',
  'EASYLOGGING_CYCLE_LENGTH',
  'TOGGLE_MountFLASHLIGHT',
  'ENTER_CLOSEST_VEHICLE',
  'VEHICLE_KEY_INTERACT',
  'SAVE_PLAYER_POSITION',
  'TOGGLE_SUPER_STRENGTH'
];

const found = {};
const files = fs.readdirSync('F:\\mods4');
for (const f of files) {
    if (!f.endsWith('.zip')) continue;
    const buf = modManager.readEntryFromZip(path.join('F:\\mods4', f), 'modDesc.xml');
    if (!buf) continue;
    const text = buf.toString('utf8');
    for (const a of checkActions) {
        if (!found[a] && text.includes(a)) {
            const re = new RegExp('<action\\s+[^>]*name=["\']' + a + '["\'][^>]*>', 'i');
            const m = text.match(re);
            found[a] = { file: f, xml: m ? m[0] : 'in binding only' };
        }
    }
}
for (const [k, v] of Object.entries(found)) {
    console.log(k.padEnd(32), '->', v.file.padEnd(35), v.xml);
}
