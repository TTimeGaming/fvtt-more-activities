import { DomData } from '../../utils/dom.js';

const TEMPLATE_NAME = `hook`;

export class HookData {
    static _registeredCustomHooks = new Set();
    static _activityCache = new Map();
    static _defaultHookName = null;

    static async init() {
        const supportedHooks = this.getSupportedHooks();
        const defaultHook = supportedHooks.find(h => h !== `custom`) || supportedHooks[0];
        this._defaultHookName = defaultHook;

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
            Hooks.on(hookName, callback);
        };

        for (const listener of hookListeners) {
            registerHook(listener.internal, (...args) => {
                HookData._handleHook(listener.external, defaultHook, args);
            });
        }

        this._rebuildActivityCache(defaultHook);

        registerHook(`updateItem`, (...args) => {
            const changes = args[1];
            if (changes.system?.activities) {
                this._registerNewCustomHooks();
                this._rebuildActivityCache();
            }
        });

        registerHook(`createItem`, (...args) => {
            const item = args[0];
            if (item.system?.activities) {
                this._registerNewCustomHooks();
                this._rebuildActivityCache();
            }
        });

        registerHook(`deleteItem`, () => {
            this._rebuildActivityCache();
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
            Hooks.on(hookName, callback);
        };

        for (const customHook of currentCustomHooks) {
            if (alreadyRegistered.has(customHook)) continue;

            console.log(`Registering new custom hook: ${customHook}`);
            registerHook(customHook, (...args) => {
                HookData._handleHook(customHook, this._defaultHookName, args);
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

    static _rebuildActivityCache(defaultHookName = this._defaultHookName) {
        const activityCache = new Map();
        for (const actor of game.actors) {
            for (const item of actor.items) {
                for (const activity of (item.system?.activities || [])) {
                    if (activity.type !== TEMPLATE_NAME) continue;

                    const hookName = this._getActivityHookName(activity, defaultHookName);
                    if (!hookName) continue;

                    const activities = activityCache.get(hookName) ?? [];
                    activities.push({ activity, item, actor });
                    activityCache.set(hookName, activities);
                }
            }
        }

        this._activityCache = activityCache;
    }

    static _getActivityHookName(activity, defaultHookName) {
        const isCustom = activity.activeHook === `custom` || (activity.activeHook === `` && activity.customHook !== ``);
        if (isCustom) return activity.customHook?.trim() || null;
        return activity.activeHook === `` ? defaultHookName : activity.activeHook;
    }

    static _handleHook(hookName, defaultHookName, args) {
        if (hookName === `deleteItem`)
            HookData._checkForHook(args[0], hookName, defaultHookName, args);

        const localArgs = args.flat(Infinity);
        const candidates = this._activityCache.get(hookName) ?? [];
        for (const { activity, item, actor } of candidates) {
            if (hookName === `deleteItem` && item === args[0]) continue;

            const user = this._getUserForActor(actor.id);
            if (!user) {
                console.warn(`Could not execute hook for ${actor.name} as no permitted user is present`);
                continue;
            }

            if (game.user != user) continue;
            this._checkActivityForHook(activity, item, hookName, defaultHookName, localArgs, args);
        }
    }

    static _checkForHook(item, hookName, defaultHookName, ...args) {
        if (!item?.system?.activities) return;

        const localArgs = args.flat(Infinity);

        for (const activity of (item.system?.activities || [])) {
            if (activity.type != TEMPLATE_NAME) continue;

            this._checkActivityForHook(activity, item, hookName, defaultHookName, localArgs, args);
        }
    }

    static _checkActivityForHook(activity, item, hookName, defaultHookName, localArgs, executionArgs) {
        const shouldRespond = this._shouldRespondToHook(activity, hookName, defaultHookName);
        if (!shouldRespond) return;

        const builtInCheck = this._performBuiltInSanity(activity, item, hookName, localArgs);
        if (!builtInCheck) return;

        const customCheck = this._performCustomSanity(activity, item, hookName, localArgs);
        if (!customCheck) return;
        
        let combatRoundTurnDuplicate = false;
        if (hookName === `combatRound` && this._isBuiltInHook(activity)) {
            const combatant = localArgs[0].combatants.get(localArgs[0].current.combatantId);
            if (combatant.actorId === item.parent.id)
                combatRoundTurnDuplicate = true;
        }

        if (activity.executionType === `activity`)
            this._executeTargetActivity(activity, hookName, executionArgs);
        else
            activity.use(undefined, undefined, undefined, hookName, executionArgs);

        // A hacky override as `combatTurn` doesn't trigger for the last player when `combatRound` fires
        if (!combatRoundTurnDuplicate) return;

        if (activity.executionType === `activity`)
            this._executeTargetActivity(activity, `combatTurn`, executionArgs);
        else
            activity.use(undefined, undefined, undefined, `combatTurn`, executionArgs);
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
            return true;

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
                return this._isRollSubjectForItem(localArgs[1]?.subject, item);
            default:
                return true;
        }
    }

    static _isRollSubjectForItem(subject, item) {
        if (!subject) return false;
        if (subject === item || subject === item.parent) return true;
        if (subject.item === item || subject.actor === item.parent) return true;
        if (subject.parent === item || subject.parent === item.parent) return true;
        if (subject.parent?.parent === item) return true;
        if (subject.parent?.parent?.parent === item.parent) return true;
        return false;
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
                consume: false,
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
        if (!actor) return null;
        const validUsers = game.users.filter(u => actor.testUserPermission(u, `OWNER`) && u.active);
        const validUser = validUsers.find(u => !u.isGM);
        const gmUser = validUsers.find(u => u.isGM);
        return validUser ? validUser : gmUser;
    }
}
