import { MacroActivityData, MacroActivitySheet, MacroActivity } from './macro.js';
import { HookActivityData, HookActivitySheet, HookActivity, HookData } from './hook.js';

Hooks.once(`init`, async() => {
    console.log(`More Activities | Initializing`);

    await HookData.init();

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

    console.log(`More Activities | Registered (2) Activity Types`);
});

Hooks.on(`renderActivityChoiceDialog`, (dialog, html, config, options) => {
    HookData.removeActivities(dialog.item, html);
});
