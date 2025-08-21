import { MacroActivityData, MacroActivitySheet, MacroActivity, MacroData } from './activities/macro.js';
import { HookActivityData, HookActivitySheet, HookActivity, HookData } from './activities/hook.js';
import { ContestedActivityData, ContestedActivitySheet, ContestedActivity, ContestedData } from './activities/contested.js';
import { ChainActivityData, ChainActivitySheet, ChainActivity, ChainData } from './activities/chain.js';
import { TeleportActivityData, TeleportActivitySheet, TeleportActivity, TeleportData } from './activities/teleport.js';
import { MovementActivityData, MovementActivitySheet, MovementActivity, MovementData } from './activities/movement.js';
import { SoundActivityData, SoundActivitySheet, SoundActivity, SoundData } from './activities/sound.js';
import { GrantActivityData, GrantActivitySheet, GrantActivity, GrantData } from './activities/grant.js';
import { WallActivityData, WallActivitySheet, WallActivity, WallData } from './activities/wall.js';
import { Compat } from './compat.js';
import { HandlebarsData } from './utils/handlebars.js';
import { ContestedMigrations } from './migrations/contested.js';

Hooks.once(`init`, async() => {
    console.log(`More Activities | Initializing`);

    await HandlebarsData.init();
    await Compat.init();
    await ContestedData.init();
    await SoundData.init();

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

    CONFIG.DND5E.activityTypes.sound = {
        documentClass: SoundActivity,
        dataModel: SoundActivityData,
        sheetClass: SoundActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.sound`,
    };

    CONFIG.DND5E.activityTypes.grant = {
        documentClass: GrantActivity,
        dataModel: GrantActivityData,
        sheetClass: GrantActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.grant`,
    };

    CONFIG.DND5E.activityTypes.wall = {
        documentClass: WallActivity,
        dataModel: WallActivityData,
        sheetClass: WallActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.wall`,
    };

    console.log(`More Activities | Registered (9) Activity Types`);

    if (game.version.startsWith(`12`)) {
        Hooks.on(`renderChatMessage`, (message, html) => {
            MacroData.applyListeners(message, html[0]);
            ContestedData.applyListeners(message, html[0]);
            ChainData.applyListeners(message, html[0]);
            TeleportData.applyListeners(message, html[0]);
            MovementData.applyListeners(message, html[0]);
            GrantData.applyListeners(message, html[0]);
            WallData.applyListeners(message, html[0]);
        });
    }
    else {
        Hooks.on(`renderChatMessageHTML`, (message, html) => {
            MacroData.applyListeners(message, html);
            ContestedData.applyListeners(message, html);
            ChainData.applyListeners(message, html);
            TeleportData.applyListeners(message, html);
            MovementData.applyListeners(message, html);
            GrantData.applyListeners(message, html);
            WallData.applyListeners(message, html);
        });
    }

    Hooks.on(`renderActivitySheet`, (sheet, html) => {
        ChainData.adjustActivitySheet(sheet, html);
        TeleportData.adjustActivitySheet(sheet, html);
    });

    Hooks.on(`renderActivityChoiceDialog`, (dialog, html) => {
        HookData.removeActivities(dialog.item, html);
        ChainData.removeActivities(dialog.item, html);
    });

    const moreActivities = [ `macro`, `hook`, `contested`, `chain`, `teleport`, `movement`, `sound`, `grant`, `wall` ];
    Hooks.on(`renderDialog`, (dialog, html) => {
        if (!html.hasClass(`create-document`)) return;

        const createElement = html.find(`#document-create`);
        const macroRadio = createElement.find(`input[value="macro"]`);
        if (macroRadio.length === 0) return;

        html.css(`height`, `auto`);
        const list = createElement.find(`ol.unlist`);

        const baseTab = $(`
            <a data-action="tab" data-group="sheet" data-tab="base" class="active">
                <i class="fa-solid fa-database" inert=""></i>
                <span>Base</span>
            </a>
        `);

        const extraTab = $(`
            <a data-action="tab" data-group="sheet" data-tab="extra">
                <i class="fa-solid fa-cookie-bite" inert=""></i>
                <span>More</span>
            </a>
        `);

        const navbar = $(`<nav class="sheet-tabs tabs" aria-roledescription="Form Tab Navigation" data-application-part="tabs"></nav>`);
        navbar.append(baseTab);
        navbar.append(extraTab);

        const header = createElement.find(`header`);
        header.after(navbar);

        const baseContent = $(`<section class="tab activity-base active" data-tab="base" data-group="sheet" data-application-part="base"></section>`);
        const baseList = $(`<ol class="unlist card"></ol>`);
        baseContent.append(baseList);
        navbar.after(baseContent);

        const extraContent = $(`<section class="tab activity-extra" data-tab="extra" data-group="sheet" data-application-part="extra"></section>`);
        const extraList = $(`<ol class="unlist card"></ol>`);
        extraContent.append(extraList);
        baseContent.after(extraContent);

        baseTab.on(`click`, () => {
            baseTab.addClass(`active`);
            baseContent.addClass(`active`);
            extraTab.removeClass(`active`);
            extraContent.removeClass(`active`);
        });

        extraTab.on(`click`, () => {
            extraTab.addClass(`active`);
            extraContent.addClass(`active`);
            baseTab.removeClass(`active`);
            baseContent.removeClass(`active`);
        });

        let targetList = null;
        for (const element of list.find(`li`)) {
            const type = $(element).find(`input`).attr(`value`);
            targetList = moreActivities.includes(type) ? extraList : baseList;
            targetList.append($(element));
        }
        list.remove();
    });
});

Hooks.once(`ready`, async() => {
    await HookData.init();

    game.settings.register(`more-activities`, `version`, {
        name: `Module Version`,
        scope: `world`,
        config: false,
        type: String,
        default: `1.7.3`,
    });

    const storedVersion = game.settings.get(`more-activities`, `version`);
    const currentVersion = game.modules.get(`more-activities`).version;
    if (storedVersion === currentVersion) return;

    await ContestedMigrations.migrate(storedVersion);

    await game.settings.set(`more-activities`, `version`, currentVersion);
    ui.notifications.info(`More Activities: Migrated to version ${currentVersion}`);
});
