export class MacroActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.macroCode = new fields.StringField({
            required: false,
            blank: true,
            initial: `// Write your macro code here\n// Available variables: activity, item, macro\nconsole.log("Macro activity executed!", { activity, item, actor });`
        });

        return schema;
    }
}

export class MacroActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-macro` ],
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/macro-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        }
    }

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);
        context.macroCode = this.activity?.macroCode || ``;
        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        const codeMirrorElement = this.element?.querySelector(`code-mirror[name="macroCode"]`);
        if (!codeMirrorElement) return;

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
            ui.notifications.error(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.macro.macroCode.saveError`, { error: error.message }));
        }
    }
}

export class MacroActivity extends dnd5e.documents.activity.ActivityMixin(MacroActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.MACRO`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: `macro`,
            img: `modules/more-activities/icons/macro.svg`,
            title: `DND5E.ACTIVITY.Type.macro`,
            hint: `DND5E.ACTIVITY.Hint.macro`,
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
        await this._executeMacro();
        return results;
    }

    /**
     * Execute the macro code stored in this activity.
     * @returns {Promise<void>}
     * @private
     */
    async _executeMacro() {
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
            ui.notifications.error(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.macro.macroCode.execError`, { error: error.message }));
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
