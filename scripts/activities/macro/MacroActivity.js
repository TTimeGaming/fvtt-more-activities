import { DomData } from '../../utils/dom.js';
import { MessageData } from '../../utils/message.js';

const TEMPLATE_NAME = `macro`;

import { MacroActivityData } from './MacroActivityData.js';
import { MacroActivitySheet } from './MacroActivitySheet.js';

export class MacroActivity extends dnd5e.documents.activity.ActivityMixin(MacroActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: MacroActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return MacroActivityData.defineSchema();
    }

    /**
     * Execute the macro activity
     * @param {ActivityUseConfiguration} config - Configuration data for the activity usage.
     * @param {ActivityDialogConfiguration} dialog - Configuration data for the activity dialog.
     * @param {ActivityMessageConfiguration} message - Configuration data for the activity message.
     * @returns {Promise<ActivityUsageResults|void>}
     */
    async use(config, dialog, message) {
        const results = await super.use(config, dialog, message);
        if (results === undefined) return results;
        
        await this.executeConfiguredMacro();
        return results;
    }

    /**
     * Execute whichever macro source is configured for this activity.
     * @returns {Promise<void>}
     */
    async executeConfiguredMacro() {
        if (this.macroSource === `world`) {
            await this.executeWorldMacro();
        }
        else {
            await this.executeMacro();
        }
    }

    /**
     * Execute the macro code stored in this activity.
     * @returns {Promise<void>}
     * @private
     */
    async executeMacro() {
        const macroCode = this.macroCode;
        if (!macroCode || macroCode.trim() == ``) {
            ui.notifications.error(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.macro.macroCode.emptyError`));
            return;
        }

        try {
            const activity = this;
            const item = this.item;
            const actor = this.actor;

            const fn = new Function(`activity`, `item`, `actor`, `
                return (async () => { ${macroCode} })();
            `);

            await fn(activity, item, actor);
        }
        catch (error) {
            console.error(`Error executing macro activity:`, error);
            ui.notifications.error(game.i18n.format(`DND5E.ACTIVITY.FIELDS.macro.macroCode.execError`, { error: error.message }));
        }
    }

    /**
     * Execute a world macro selected by this activity.
     * @returns {Promise<void>}
     */
    async executeWorldMacro() {
        const macroId = this.worldMacroId;
        const macro = macroId ? game.macros?.get(macroId) : null;

        if (!macro) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.macro.worldMacroId.emptyError`));
            return;
        }

        if (macro.canExecute === false) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.macro.worldMacroId.permissionError`));
            return;
        }

        try {
            const activity = this;
            const item = this.item;
            const actor = this.actor;

            await macro.execute({ activity, item, actor });
        }
        catch (error) {
            console.error(`Error executing selected world macro:`, error);
            ui.notifications.error(game.i18n.format(`DND5E.ACTIVITY.FIELDS.macro.worldMacroId.execError`, { error: error.message }));
        }
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null
     */
    get actor() {
        return this.item?.actor || null;
    }
}
