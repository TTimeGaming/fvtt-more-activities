import { MacroActivityData, MacroActivitySheet, MacroActivity, MacroData } from './macro.js';
import { HookActivityData, HookActivitySheet, HookActivity, HookData } from './hook.js';
import { ContestedActivityData, ContestedActivitySheet, ContestedActivity, ContestedData } from './contested.js';
import { ChainActivityData, ChainActivitySheet, ChainActivity, ChainData } from './chain.js';
import { TeleportActivityData, TeleportActivitySheet, TeleportActivity, TeleportData } from './teleport.js';
import { MovementActivityData, MovementActivitySheet, MovementActivity, MovementData } from './movement.js';
import { Compat } from './compat.js';

Hooks.once(`init`, async() => {
    console.log(`More Activities | Initializing`);

    await Compat.init();
    await HookData.init();
    await ContestedData.init();
    await ChainData.init();

    CONFIG.DND5E.activityTypes.macro = {
        documentClass: MacroActivity,
        dataModel: MacroActivityData,
        sheetClass: MacroActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.macro`,
    };

    CONFIG.DND5E.activityTypes.hook = {
        documentClass: HookActivity,
        dataModel: HookActivityData,
        sheetClass: HookActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.hook`,
    };

    CONFIG.DND5E.activityTypes.contested = {
        documentClass: ContestedActivity,
        dataModel: ContestedActivityData,
        sheetClass: ContestedActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.contested`,
    };

    CONFIG.DND5E.activityTypes.chain = {
        documentClass: ChainActivity,
        dataModel: ChainActivityData,
        sheetClass: ChainActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.chain`,
    };

    CONFIG.DND5E.activityTypes.teleport = {
        documentClass: TeleportActivity,
        dataModel: TeleportActivityData,
        sheetClass: TeleportActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.teleport`,
    };

    CONFIG.DND5E.activityTypes.movement = {
        documentClass: MovementActivity,
        dataModel: MovementActivityData,
        sheetClass: MovementActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.movement`,
    };

    console.log(`More Activities | Registered (6) Activity Types`);
});

Hooks.on(`renderChatMessageHTML`, (message, html) => {
    MacroData.applyListeners(message, html);
    ContestedData.applyListeners(message, html);
    ChainData.applyListeners(message, html);
    TeleportData.applyListeners(message, html);
    MovementData.applyListeners(message, html);
});

Hooks.on(`renderActivitySheet`, (sheet, html) => {
    ChainData.adjustActivitySheet(sheet, html);
    TeleportData.adjustActivitySheet(sheet, html);
});

Hooks.on(`renderActivityChoiceDialog`, (dialog, html) => {
    HookData.removeActivities(dialog.item, html);
    ChainData.removeActivities(dialog.item, html);
});
