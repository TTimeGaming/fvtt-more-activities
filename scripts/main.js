import { MacroActivityData, MacroActivitySheet, MacroActivity } from './macro.js';

Hooks.once(`init`, () => {
    console.log(`More Activities | Initializing`);

    CONFIG.DND5E.activityTypes.macro = {
        documentClass: MacroActivity,
        dataModel: MacroActivityData,
        sheetClass: MacroActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.macro`
    };

    console.log(`More Activities | Registered (1) Activity Type`);
});
