import { DomData } from '../utils/dom.js';

const TEMPLATE_NAME = `hook`;

export class HookData {
    static _registeredCustomHooks = new Set();

    static async init() {
        const supportedHooks = this.getSupportedHooks();
        const defaultHook = supportedHooks.find(h => h !== `custom`) || supportedHooks[0];

        const hookListeners = [];
        for (const hook of supportedHooks) {
            hookListeners.push({ external: hook, internal: hook });
        }
        
        if (game.version.startsWith(`12`)) {
            const internalRemapping = {
                'dnd5e.rollSkill': `dnd5e.rollSkillV2`,
            };
            for (const key of Object.keys(internalRemapping)) {
                hookListeners.push({ external: key, internal: internalRemapping[key] });
            }
        }

        const customHooks = this._collectCustomHooks();
        for (const customHook of customHooks) {
            hookListeners.push({ external: customHook, internal: customHook });
        }

        const registerHook = (hookName, callback) => {
            if (game.version.startsWith(`12`))
                Hooks.on(hookName, callback);
            else
                foundry.helpers.Hooks.on(hookName, callback); 
        };

        for (const listener of hookListeners) {
            registerHook(listener.internal, (...args) => {
                if (listener.external === `deleteItem`) {
                    HookData._checkForHook(args[0], listener.external, defaultHook, args);
                }

                for (const actor of game.actors) {
                    const user = this._getUserForActor(actor.id);
                    if (!user) {
                        console.warn(`Could not execute hook for ${actor.name} as no permitted user is present`);
                        continue;
                    }

                    if (game.user != user) continue;
                    for (const item of actor.items) {
                        HookData._checkForHook(item, listener.external, defaultHook, args);
                    }
                }
            });
        }

        registerHook(`updateItem`, (...args) => {
            const changes = args[1];
            if (changes.system?.activities)
                this._registerNewCustomHooks();
        });

        registerHook(`createItem`, (...args) => {
            const item = args[0];
            if (item.system?.activities)
                this._registerNewCustomHooks();
        });
    }
    
    static async removeActivities(item, html) {
        DomData.disableDialogActivities(item, html, (activity) => {
            return activity.type !== TEMPLATE_NAME || activity.manualTrigger;
        });
    }

    /**
     * Collect all custom hooks from existing activities
     * @returns {string[]} Array of custom hook names
     * @private
     */
    static _collectCustomHooks() {
        const customHooks = new Set();
        
        for (const actor of game.actors) {
            for (const item of actor.items) {
                for (const activity of (item.system?.activities || [])) {
                    if (activity.type !== TEMPLATE_NAME) continue;

                    const isCustomHook = activity.activeHook === `custom` || (activity.activeHook === `` && activity.customHook !== ``);
                    if (!isCustomHook) continue;
                    
                    if (activity.customHook && activity.customHook.trim() !== ``) {
                        customHooks.add(activity.customHook.trim());
                    }
                }
            }
        }

        for (const item of game.items) {
            for (const activity of (item.system?.activities || [])) {
                if (activity.type !== TEMPLATE_NAME) continue;

                const isCustomHook = activity.activeHook === `custom` || (activity.activeHook === `` && activity.customHook !== ``);
                if (!isCustomHook) continue;
                
                if (activity.customHook && activity.customHook.trim() !== ``) {
                    customHooks.add(activity.customHook.trim());
                }
            }
        }
        
        return Array.from(customHooks);
    }

    /**
     * Register any new custom hooks that haven't been registered yet
     * @private
     */
    static _registerNewCustomHooks() {
        const currentCustomHooks = this._collectCustomHooks();
        const alreadyRegistered = this._registeredCustomHooks || new Set();
        
        const registerHook = (hookName, callback) => {
            if (game.version.startsWith(`12`))
                Hooks.on(hookName, callback);
            else
                foundry.helpers.Hooks.on(hookName, callback); 
        };

        for (const customHook of currentCustomHooks) {
            if (alreadyRegistered.has(customHook)) continue;

            console.log(`Registering new custom hook: ${customHook}`);
            registerHook(customHook, (...args) => {
                const defaultHook = this.getSupportedHooks().find(h => h !== 'custom') || this.getSupportedHooks()[0];
                
                for (const actor of game.actors) {
                    const user = this._getUserForActor(actor.id);
                    if (!user) {
                        console.warn(`Could not execute hook for ${actor.name} as no permitted user is present`);
                        continue;
                    }

                    if (game.user != user) continue;
                    for (const item of actor.items) {
                        HookData._checkForHook(item, customHook, defaultHook, args);
                    }
                }
            });
            
            alreadyRegistered.add(customHook);
        }
        
        this._registeredCustomHooks = alreadyRegistered;
    }
    
    /**
     * Get list of supported hooks
     * @returns {string[]}
     * @private
     */
    static getSupportedHooks(activeHook, customHook) {
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

        const allHooks = [...hooks, `custom`];
        if (activeHook === undefined && customHook === undefined) return allHooks;

        const options = [];
        for (const hook of allHooks) {
            options.push({
                name: hook,
                custom: hook === `custom`,
                selected: hook === `custom` ? activeHook === `custom` || (activeHook === `` && customHook !== ``) : activeHook === hook,
            });
        }
        return options;
    }

    static _checkForHook(item, hookName, defaultHookName, ...args) {
        const localArgs = args.flat(Infinity);

        for (const activity of (item.system?.activities || [])) {
            if (activity.type != TEMPLATE_NAME) continue;

            const shouldRespond = this._shouldRespondToHook(activity, hookName, defaultHookName);
            if (!shouldRespond) continue;

            const builtInCheck = this._performBuiltInSanity(activity, item, hookName, localArgs);
            if (!builtInCheck) continue;

            const customCheck = this._performCustomSanity(activity, item, hookName, localArgs);
            if (!customCheck) continue;
            
            let combatRoundTurnDuplicate = false;
            if (hookName === `combatRound` && this._isBuiltInHook(activity)) {
                const combatant = localArgs[0].combatants.get(localArgs[0].current.combatantId);
                if (combatant.actorId === item.parent.id)
                    combatRoundTurnDuplicate = true;
            }

            if (activity.executionType === `activity`)
                this._executeTargetActivity(activity, hookName, args);
            else
                activity.use(undefined, undefined, undefined, hookName, args);

            // A hacky override as `combatTurn` doesn't trigger for the last player when `combatRound` fires
            if (!combatRoundTurnDuplicate) continue;

            if (activity.executionType === `activity`)
                this._executeTargetActivity(activity, `combatTurn`, args);
            else
                activity.use(undefined, undefined, undefined, `combatTurn`, args);
        }
    }

    static _shouldRespondToHook(activity, hookName, defaultHookName) {
        const isCustom = activity.activeHook === `custom` || (activity.activeHook === `` && activity.customHook !== ``);
        if (isCustom) {
            const targetHook = activity.customHook || ``;
            return hookName == targetHook;
        }

        return activity.activeHook === `` ? hookName === defaultHookName : hookName === activity.activeHook;
    }

    static _isBuiltInHook(activity) {
        return !(activity.activeHook === `custom` || (activity.activeHook === `` && activity.customHook !== ``));
    }

    static _performBuiltInSanity(activity, item, hookName, localArgs) {
        if (!this._isBuiltInHook(activity))
            return this._performBasicCustomHookCheck(item, localArgs);

        switch (hookName) {
            case `createItem`:
            case `deleteItem`:
                return item === localArgs[0];
            case `combatStart`:
            case `combatRound`:
            case `deleteCombat`:
                let isCombatant = false;
                for (const combatant of localArgs[0].combatants) {
                    if (combatant.actorId !== item.parent.id) continue;
                    isCombatant = true; break;
                }
                return isCombatant;
            case `combatTurn`:
                const currentCombatant = localArgs[0].combatants.get(localArgs[0].current.combatantId);
                return currentCombatant.actorId === item.parent.id;
            case `dnd5e.shortRest`:
            case `dnd5e.longRest`:
            case `dnd5e.rollInitiative`:
                return item.parent === localArgs[0];
            case `dnd5e.rollAbilityCheck`:
            case `dnd5e.rollSavingThrow`:
            case `dnd5e.rollSkill`:
            case `dnd5e.rollConcentration`:
                return item.parent === localArgs[1].subject;
            case `dnd5e.rollAttack`:
            case `dnd5e.rollDamage`:
                if (game.version.startsWith(`12`)) {
                    return item.parent == localArgs[0].parent;
                }
                else {
                    return item.parent == localArgs[1].subject.parent.parent.parent;
                }
            default:
                return true;
        }
    }

    static _performCustomSanity(activity, item, hookName, localArgs) {
        const sanityCode = activity.sanityCode;
        if (!sanityCode || sanityCode.trim() === ``)
            return true;

        try {
            const actor = item.parent;
            const fn = new Function(`activity`, `item`, `actor`, `hook`, `args`, `
                return (function() { ${sanityCode} })();
            `);
            const result = fn(activity, item, actor, hookName, localArgs);
            return Boolean(result);
        }
        catch (error) {
            console.error(`Error executing sanity check for hook activity:`, error);
            return false;
        }
    }

    // TODO: IS THIS REDUNDANT!?
    static _performBasicCustomHookCheck(item, localArgs) {
        const actor = item.parent;
        if (!actor) return true;

        for (const arg of localArgs) {
            if (arg === actor || arg === item) return true;
            if (arg?.actor === actor || arg?.item === item) return true;
            if (arg?.parent === actor || arg?.parent === item) return true;
            if (arg?.subject === actor) return true;
        }

        return true;
    }

    static async _executeTargetActivity(hookActivity, hookName, args) {
        const targetActivityId = hookActivity.targetActivityId;
        if (!targetActivityId) {
            console.warn(`Hook activity configured for activity execution but no target activity specified`);
            return;
        }

        const targetActivity = hookActivity.item?.system.activities.get(targetActivityId);
        if (!targetActivity) {
            console.warn(`Hook activity target activity ${targetActivityId} not found`);
            return;
        }

        try {
            await targetActivity.use({
                consumeResource: false,
                consumeRecharge: false,
                consumeUsage: false,
            });
        }
        catch (error) {
            console.error(`Error executing target activity from hook:`, error);
        }
    }

    static _getUserForActor(actorId) {
        const actor = game.actors.find(a => a.id === actorId);
        const validUsers = game.users.filter(u => actor.testUserPermission(u, `OWNER`) && u.active);
        const validUser = validUsers.find(u => !u.isGM);
        const gmUser = validUsers.find(u => u.isGM);
        return validUser ? validUser : gmUser;
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

        schema.customHook = new fields.StringField({
            required: false,
            blank: true,
            initial: ``,
        });

        schema.executionType = new fields.StringField({
            required: false,
            initial: `macro`,
            choices: [ `macro`, `activity` ],
        });

        schema.targetActivityId = new fields.StringField({
            required: false,
            blank: true,
            initial: ``,
        });

        schema.sanityCode = new fields.StringField({
            required: false,
            blank: true,
            initial: `// Return true to execute the hook, false to skip\n// Available variables: activity, item, actor, hook, args\nreturn true;`
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
