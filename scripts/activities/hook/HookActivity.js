import { DomData } from '../../utils/dom.js';

const TEMPLATE_NAME = `hook`;

import { HookActivityData } from './HookActivityData.js';
import { HookActivitySheet } from './HookActivitySheet.js';

export class HookActivity extends dnd5e.documents.activity.ActivityMixin(HookActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];
    
    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: HookActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return HookActivityData.defineSchema();
    }

    /**
     * Execute the macro activity
     * @param {ActivityUseConfiguration} config - Configuration data for the activity usage.
     * @param {ActivityDialogConfiguration} dialog - Configuration data for the activity dialog.
     * @param {ActivityMessageConfiguration} message - Configuration data for the activity message.
     * @returns {Promise<ActivityUsageResults|void>}
     */
    async use(config, dialog, message, hookName, ...args) {
        const results = await super.use(config, dialog, message);
        if (results === undefined) return results;

        if (this.executionType === `macro`) {
            await this._executeMacro(hookName, ...args);
        }

        return results;
    }

    /**
     * Execute the macro code stored in this activity.
     * @returns {Promise<void>}
     * @private
     */
    async _executeMacro(hookName, ...args) {
        const macroCode = this.macroCode;
        if (!macroCode || macroCode.trim() == ``) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.hook.macroCode.emptyError`));
            return;
        }

        try {
            const activity = this;
            const item = this.item;
            const actor = this.actor;

            const fn = new Function(`activity`, `item`, `actor`, `hook`, `args`, `
                return (async () => { ${macroCode} })();
            `);

            await fn(activity, item, actor, hookName, args.flat(Infinity));
        }
        catch (error) {
            console.error(`Error executing macro activity:`, error);
            ui.notifications.error(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.hook.macroCode.execError`, { error: error.message }));
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
