import { MacroActivityData, MacroActivitySheet, MacroActivity, MacroData } from './activities/macro.js';
import { HookActivityData, HookActivitySheet, HookActivity, HookData } from './activities/hook.js';
import { ContestedActivityData, ContestedActivitySheet, ContestedActivity, ContestedData } from './activities/contested.js';
import { ChainActivityData, ChainActivitySheet, ChainActivity, ChainData } from './activities/chain.js';
import { TeleportActivityData, TeleportActivitySheet, TeleportActivity, TeleportData } from './activities/teleport.js';
import { MovementActivityData, MovementActivitySheet, MovementActivity, MovementData } from './activities/movement.js';
import { SoundActivityData, SoundActivitySheet, SoundActivity, SoundData } from './activities/sound.js';
import { GrantActivityData, GrantActivitySheet, GrantActivity, GrantData } from './activities/grant.js';
import { WallActivityData, WallActivitySheet, WallActivity, WallData } from './activities/wall.js';
import { AdvancementActivityData, AdvancementActivitySheet, AdvancementActivity, AdvancementData } from './activities/advancement.js';
import { Compat } from './compat.js';
import { HandlebarsData } from './utils/handlebars.js';
import { DomData } from './utils/dom.js';
import { ContestedMigrations } from './migrations/contested.js';
import { GrantMigrations } from './migrations/grant.js';

const moreActivities = [ `macro`, `hook`, `contested`, `chain`, `teleport`, `movement`, `sound`, `grant`, `wall`, `advancement` ];

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

    CONFIG.DND5E.activityTypes.advancement = {
        documentClass: AdvancementActivity,
        dataModel: AdvancementActivityData,
        sheetClass: AdvancementActivitySheet,
        typeLabel: `DND5E.ACTIVITY.Type.advancement`,
    };

    console.log(`More Activities | Registered (10) Activity Types`);

    if (game.version.startsWith(`12`)) {
        Hooks.on(`renderChatMessage`, (message, html) => {
            MacroData.applyListeners(message, html[0]);
            ContestedData.applyListeners(message, html[0]);
            ChainData.applyListeners(message, html[0]);
            TeleportData.applyListeners(message, html[0]);
            MovementData.applyListeners(message, html[0]);
            GrantData.applyListeners(message, html[0]);
            WallData.applyListeners(message, html[0]);
            AdvancementData.applyListeners(message, html[0]);
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
            AdvancementData.applyListeners(message, html);
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

    const adjustCreateDocumentDialog = (dialog, html) => {
        html = DomData.toElement(html);
        const isCreateDialog = html?.classList.contains(`create-document`)
            || dialog?.constructor?.name === `CreateDocumentDialog`
            || dialog?.options?.classes?.includes(`create-document`);
        if (!html || !isCreateDialog || html.dataset.moreActivitiesTabbed === `true`) return;

        const createElement = html.querySelector(`#document-create`) ?? html;
        if (!createElement.querySelector(`input[value="macro"]`)) return;

        const list = createElement.querySelector(`ol.unlist`);
        const header = createElement.querySelector(`header`);
        if (!list || !header) return;

        html.style.height = `auto`;
        html.dataset.moreActivitiesTabbed = `true`;

        const baseTab = document.createElement(`a`);
        baseTab.dataset.group = `sheet`;
        baseTab.dataset.tab = `base`;
        baseTab.classList.add(`active`);
        baseTab.innerHTML = `
            <i class="fa-solid fa-database" inert=""></i>
            <span>Base</span>
        `;

        const extraTab = document.createElement(`a`);
        extraTab.dataset.group = `sheet`;
        extraTab.dataset.tab = `extra`;
        extraTab.innerHTML = `
            <i class="fa-solid fa-cookie-bite" inert=""></i>
            <span>More</span>
        `;

        const navbar = document.createElement(`nav`);
        navbar.classList.add(`sheet-tabs`, `tabs`);
        navbar.setAttribute(`aria-roledescription`, `Form Tab Navigation`);
        navbar.dataset.applicationPart = `tabs`;
        navbar.append(baseTab, extraTab);

        const baseContent = document.createElement(`section`);
        baseContent.classList.add(`tab`, `activity-base`, `active`);
        baseContent.dataset.tab = `base`;
        baseContent.dataset.group = `sheet`;
        baseContent.dataset.applicationPart = `base`;
        const baseList = document.createElement(`ol`);
        baseList.classList.add(`unlist`, `card`);
        baseContent.append(baseList);

        const extraContent = document.createElement(`section`);
        extraContent.classList.add(`tab`, `activity-extra`);
        extraContent.dataset.tab = `extra`;
        extraContent.dataset.group = `sheet`;
        extraContent.dataset.applicationPart = `extra`;
        const extraList = document.createElement(`ol`);
        extraList.classList.add(`unlist`, `card`);
        extraContent.append(extraList);

        header.after(navbar, baseContent, extraContent);

        const activateTab = (activeTab, activeContent, inactiveTab, inactiveContent) => {
            activeTab.classList.add(`active`);
            activeContent.classList.add(`active`);
            inactiveTab.classList.remove(`active`);
            inactiveContent.classList.remove(`active`);
        };
        const setDialogCreateType = (type) => {
            dialog.options ??= {};
            dialog.options.createData ??= {};
            dialog.options.createData.type = type;
        };
        baseTab.addEventListener(`click`, () => activateTab(baseTab, baseContent, extraTab, extraContent));
        extraTab.addEventListener(`click`, () => activateTab(extraTab, extraContent, baseTab, baseContent));

        let firstRadio = null;
        for (const element of Array.from(list.querySelectorAll(`li`))) {
            const radio = element.querySelector(`input[name="type"]`);
            firstRadio ??= radio;
            radio?.addEventListener(`change`, event => {
                setDialogCreateType(event.currentTarget.value);
            });

            const type = radio?.value;
            const targetList = moreActivities.includes(type) ? extraList : baseList;
            targetList.append(element);
        }
        list.remove();

        const checkedRadio = createElement.querySelector(`input[name="type"]:checked`) ?? firstRadio;
        if (checkedRadio) {
            checkedRadio.checked = true;
            setDialogCreateType(checkedRadio.value);
        }
    };

    Hooks.on(`renderCreateDocumentDialog`, adjustCreateDocumentDialog);
    Hooks.on(`renderDialog`, adjustCreateDocumentDialog);
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
    await GrantMigrations.migrate(storedVersion);

    await game.settings.set(`more-activities`, `version`, currentVersion);
    ui.notifications.info(`More Activities: Migrated to version ${currentVersion}`);
});
