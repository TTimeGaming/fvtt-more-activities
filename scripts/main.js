import { MacroActivityData, MacroActivitySheet, MacroActivity } from './macro.js';
import { HookActivityData, HookActivitySheet, HookActivity, HookData } from './hook.js';
import { ContestedActivityData, ContestedActivitySheet, ContestedActivity, ContestedData } from './contested.js';

Hooks.once(`init`, async() => {
    console.log(`More Activities | Initializing`);

    await HookData.init();
    await ContestedData.init();

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

    console.log(`More Activities | Registered (3) Activity Types`);
});

Hooks.on(`renderActivityChoiceDialog`, (dialog, html, config, options) => {
    HookData.removeActivities(dialog.item, html);
});

Hooks.on(`renderChatMessageHTML`, (message, html) => {
    ContestedData.applyListeners(message, html);
});
