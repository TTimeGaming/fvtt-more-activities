import { MacroActivityData, MacroActivitySheet, MacroActivity } from './macro.js';
import { HookActivityData, HookActivitySheet, HookActivity, HookData } from './hook.js';
import { ContestedActivityData, ContestedActivitySheet, ContestedActivity, ContestedData } from './contested.js';
import { ChainActivityData, ChainActivitySheet, ChainActivity, ChainData } from './chain.js';
import { TeleportActivityData, TeleportActivitySheet, TeleportActivity, TeleportData } from './teleport.js';
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

    console.log(`More Activities | Registered (5) Activity Types`);
});

Hooks.on(`renderActivityChoiceDialog`, (dialog, html) => {
    HookData.removeActivities(dialog.item, html);
    ChainData.removeActivities(dialog.item, html);
});

Hooks.on(`renderChatMessageHTML`, (message, html) => {
    ContestedData.applyListeners(message, html);
    ChainData.applyListeners(message, html);
    TeleportData.disableMTMessagePrompt(message, html);
});

Hooks.on(`renderActivitySheet`, (sheet, html) => {
    ChainData.disableChained(sheet, html);
    TeleportData.disableMTActivityPrompt(sheet, html);
});
