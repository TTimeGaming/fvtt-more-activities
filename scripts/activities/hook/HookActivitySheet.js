import { DomData } from '../../utils/dom.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';

const TEMPLATE_NAME = `hook`;

export class HookActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-${TEMPLATE_NAME}` ]
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/${TEMPLATE_NAME}-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        },
    };

    /** @inheritdoc */
    async _prepareContext(options) {
        ensureActivityInferredSource(this.activity);
        return super._prepareContext(options);
    }

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);
        context.version = game.version.startsWith(`12`) ? 12 : 13;
        context.manualTrigger = this.activity?.manualTrigger || false;
        context.availableHooks = HookData.getSupportedHooks(this.activity?.activeHook || ``, this.activity?.customHook || ``);
        context.macroCode = this.activity?.macroCode || ``;
        context.customHook = this.activity?.customHook || ``;
        context.executionType = this.activity?.executionType || `macro`;
        context.targetActivityId = this.activity?.targetActivityId || ``;
        context.sanityCode = this.activity?.sanityCode || ``;

        const availableActivities = this.item?.system.activities
            .filter(activity => activity.id !== this.activity.id && activity.type !== TEMPLATE_NAME)
            .map(activity => ({
                id: activity.id,
                name: activity.name || activity.type,
                type: activity.type,
                selected: activity.id === context.targetActivityId,
            })) || []
        ;

        context.availableActivities = availableActivities;
        context.isCustomHook = context.availableHooks.find(h => h.name === `custom`)?.selected || false;
        return context;
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        const macroElement = this.element?.querySelector(`code-mirror[name="macroCode"]`);
        if (macroElement) {
            let saveTimeout;
            macroElement.addEventListener(`blur`, () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => this._saveMacroCode(), 100);
            });
            macroElement.addEventListener(`input`, () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => this._saveMacroCode(), 1000);
            });
        }

        const sanityElement = this.element?.querySelector(`code-mirror[name="sanityCode"]`);
        if (sanityElement) {
            let saveTimeout;
            sanityElement.addEventListener(`blur`, () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => this._saveSanityCode(), 100);
            });
            sanityElement.addEventListener(`input`, () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => this._saveSanityCode(), 1000);
            });
        }

        DomData.setupSheetBehaviors(this);
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);
        HookData._registerNewCustomHooks();
    }

    /**
     * Manually save the macro code to the activity
     * @private
     */
    async _saveMacroCode() {
        try {
            const codeMirrorElement = this.element?.querySelector(`code-mirror[name="macroCode"]`);
            if (!codeMirrorElement) return;

            const newMacroCode = codeMirrorElement.value || ``;
            if (this.activity.macroCode !== newMacroCode) {
                await this.activity.update({
                    macroCode: newMacroCode
                });
            }
        } catch (error) {
            console.error(`Error saving macro code:`, error);
            ui.notifications.error(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.hook.macroCode.saveError`, { error: error }));
        }
    }

    /**
     * Manually save the sanity code to the activity
     * @private
     */
    async _saveSanityCode() {
        try {
            const codeMirrorElement = this.element?.querySelector(`code-mirror[name="sanityCode"]`);
            if (!codeMirrorElement) return;

            const newSanityCode = codeMirrorElement.value || ``;
            if (this.activity.sanityCode !== newSanityCode) {
                await this.activity.update({
                    sanityCode: newSanityCode
                });
            }
        } catch (error) {
            console.error(`Error saving sanity code:`, error);
            ui.notifications.error(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.hook.sanityCheckCode.saveError`, { error: error }));
        }
    }
}
