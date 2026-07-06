import { DomData } from '../../utils/dom.js';
import { MessageData } from '../../utils/message.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';

const TEMPLATE_NAME = `macro`;

export class MacroActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-${TEMPLATE_NAME}` ],
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/${TEMPLATE_NAME}-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        }
    }

    /** @inheritdoc */
    async _prepareContext(options) {
        ensureActivityInferredSource(this.activity);
        return super._prepareContext(options);
    }

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);
        context.version = game.version.startsWith(`12`) ? 12 : 13;
        context.macroSource = this.activity?.macroSource || `code`;
        context.worldMacroId = this.activity?.worldMacroId || ``;
        context.macroCode = this.activity?.macroCode || ``;
        context.availableMacros = this._getAvailableMacros(context.worldMacroId);
        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        const codeMirrorElement = this.element?.querySelector(`code-mirror[name="macroCode"]`);
        if (codeMirrorElement) {
            let saveTimeout;
            codeMirrorElement.addEventListener(`blur`, () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => this._saveMacroCode(), 100);
            });
            codeMirrorElement.addEventListener(`input`, () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => this._saveMacroCode(), 1000);
            });
        }

        DomData.setupSheetBehaviors(this);
    }

    /**
     * Get world macros for the selection dropdown.
     * @param {string} selectedMacroId
     * @returns {object[]}
     * @private
     */
    _getAvailableMacros(selectedMacroId) {
        const macros = game.macros?.contents ?? [];
        return macros
            .map(macro => ({
                id: macro.id,
                name: macro.name,
                type: macro.type,
                selected: macro.id === selectedMacroId,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    }

    /**
     * Manually save the macro code to the activity
     * @private
     */
    async _saveMacroCode() {
        try {
            const codeMirrorElement = this.element?.querySelector(`code-mirror[name="macroCode"]`);
            if (!codeMirrorElement) return;

            const newMacroCode = codeMirrorElement ? codeMirrorElement.value : ``;
            if (this.activity.macroCode !== newMacroCode) {
                await this.activity.update({
                    macroCode: newMacroCode
                });
            }
        } catch (error) {
            console.error(`Error saving macro code:`, error);
            ui.notifications.error(game.i18n.format(`DND5E.ACTIVITY.FIELDS.macro.macroCode.saveError`, { error: error.message }));
        }
    }
}
