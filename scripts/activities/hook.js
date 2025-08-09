import { DomData } from '../utils/dom.js';

const TEMPLATE_NAME = `hook`;

export class HookData {
    static async init() {
        for (const hookName of this.getSupportedHooks()) {
            foundry.helpers.Hooks.on(hookName, (...args) => {
                if (hookName === `deleteItem`) {
                    HookData._checkForHook(args[0], hookName, args);
                }

                for (const actor of game.actors) {
                    for (const item of actor.items) {
                        HookData._checkForHook(item, hookName, args);
                    }
                }
            });
        }
    }
    
    static async removeActivities(item, html) {
        DomData.disableDialogActivities(item, html, (activity) => {
            return activity.type !== TEMPLATE_NAME || activity.manualTrigger;
        });
    }
    
    /**
     * Get list of supported hooks
     * @returns {string[]}
     * @private
     */
    static getSupportedHooks(activeHook) {
        const hooks = [
            /* Document Hooks */
            `createItem`,
            `deleteItem`,

            /* Combat Hooks */
            `combatStart`,
            `combatRound`,
            `combatTurn`,
            `deleteCombat`,

            /* D&D 5E Hooks */
            `dnd5e.rollAbilityCheck`,
            `dnd5e.rollSavingThrow`,
            `dnd5e.rollSkill`,
            `dnd5e.rollAttack`,
            `dnd5e.rollDamage`,
            `dnd5e.rollConcentration`,
            `dnd5e.rollInitiative`,
            `dnd5e.shortRest`,
            `dnd5e.longRest`
        ].sort();
        if (activeHook === undefined) return hooks;

        const options = [];
        for (const hook of hooks) {
            options.push({
                name: hook,
                selected: activeHook === hook
            });
        }
        return options;
    }

    static _checkForHook(item, hookName, ...args) {
        const localArgs = args.flat(Infinity);

        for (const activity of (item.system?.activities || [])) {
            if (activity.type != TEMPLATE_NAME) continue;
            if (hookName != activity.activeHook) continue;
            
            switch (hookName) {
                case `createItem`:
                case `deleteItem`:
                    if (item !== localArgs[0]) continue;
                    break;
                case `dnd5e.shortRest`:
                case `dnd5e.longRest`:
                case `dnd5e.rollInitiative`:
                    if (item.parent !== localArgs[0]) continue;
                    break;
                case `dnd5e.rollAbilityCheck`:
                case `dnd5e.rollSavingThrow`:
                case `dnd5e.rollSkill`:
                case `dnd5e.rollConcentration`:
                    if (item.parent !== localArgs[1].subject) continue;
                    break;
                case `dnd5e.rollAttack`:
                case `dnd5e.rollDamage`:
                    if (item.parent != localArgs[1].subject.parent.parent.parent) continue;
                    break;
                default:
                    console.log(...localArgs);
                    break;
            }
            
            activity.use(undefined, undefined, undefined, hookName, args);
        }
    }
}

export class HookActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.manualTrigger = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.activeHook = new fields.StringField({
            required: false,
            blank: true,
            initial: ``
        });

        schema.macroCode = new fields.StringField({
            required: false,
            blank: true,
            initial: `// Write your macro code here\n// Available variables: activity, item, actor, hook, args\nconsole.log("Hook activity executed!", { activity, item, actor, hook, args });`
        });

        return schema;
    }
}

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
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);
        context.manualTrigger = this.activity?.manualTrigger || false;
        context.availableHooks = HookData.getSupportedHooks(this.activity?.activeHook || ``);
        context.macroCode = this.activity?.macroCode || ``;
        return context;
    }

    /** @inheritdoc */
    async _onRender(context, options) {
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
}

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
        await this._executeMacro(hookName, ...args);
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
