import { DomData } from '../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `chain`;

export class ChainData {
    static adjustActivitySheet(sheet, html) {
        if (!ChainData.isActivityChained(sheet?.activity?.item, sheet?.activity?.id))
            return;

        sheet.element.classList.add(`chained-activity`);
        sheet.element.querySelector(`.window-header .window-icon`).classList.add(`fa-link`);
        DomData.disableTab(html, `activation`, game.i18n.localize(`DND5E.ACTIVITY.FIELDS.chain.blockedActivity.label`));
    }

    static applyListeners(message, html) {
        html.querySelectorAll(`.chain-trigger-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const itemId = event.target.dataset.itemId;
                const activityIndex = parseInt(event.target.dataset.activityIndex);
                const triggerLabel = event.target.dataset.triggerLabel;

                const item = game.items.get(itemId) || game.actors.contents
                    .flatMap(a => a.items.contents)
                    .find(i => i.id === itemId);
                if (!item) return;

                const chainActivity = item.system.activities.find(a => a.type === TEMPLATE_NAME);
                if (!chainActivity) return;

                // const triggerContainer = event.target.closest(`.chain-triggers`);
                // if (triggerContainer) triggerContainer.remove();

                await chainActivity.continueChainFrom(activityIndex, triggerLabel);
            });
        });
    }

    static async removeActivities(item, html) {
        DomData.disableDialogActivities(item, html, (activity) => {
            return !ChainData.isActivityChained(item, activity.id);
        });
    }
    
    static isActivityChained(item, activityId) {
        if (!item?.system?.activities) return false;
        
        for (const activity of item.system.activities) {
            if (activity.type === TEMPLATE_NAME && activity.chainedActivityIds) {
                if (activity.chainedActivityIds.includes(activityId)) {
                    return true;
                }
            }
        }

        return false;
    }
}

export class ChainActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.chainedActivityIds = new fields.ArrayField(new fields.StringField({
            required: true,
            blank: false,
        }), {
            required: false,
            initial: [],
        });

        schema.chainedActivityNames = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: false,
        }), {
            required: false,
            initial: [],
        });

        schema.chainTriggers = new fields.ArrayField(new fields.ArrayField(
            new fields.StringField({
                required: true,
                blank: false,
            }), {
                required: false,
                initial: [],
            }),
        {
            required: false,
            initial: [],
        });

        schema.chainListeners = new fields.ArrayField(new fields.ArrayField(
            new fields.StringField({
                required: true,
                blank: false,
            }), {
                required: false,
                initial: [],
            }),
        {
            required: false,
            initial: [],
        });
        
        return schema;
    }
}

export class ChainActivitySheet extends dnd5e.applications.activity.ActivitySheet {
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
        
        const availableActivities = this.item?.system.activities
            .filter(activity => activity.id !== this.activity.id)
            .map(activity => ({
                id: activity.id,
                name: activity.name || activity.type,
                type: activity.type,
                isChained: this._isActivityChained(activity.id),
            }))
            || []
        ;

        const chainedActivityIds = this.activity?.chainedActivityIds || [];
        const chainedActivityNames = this.activity?.chainedActivityNames || [];
        const chainTriggers = this.activity?.chainTriggers || [];
        const chainListeners = this.activity?.chainListeners || [];
        const triggerConflicts = this._getTriggerConflicts();

        const chainedActivities = [];
        for (let i = 0; i < chainedActivityIds.length; i++) {
            const activity = this.item?.system.activities.get(chainedActivityIds[i]);
            const triggers = chainTriggers[i] || [];
            const listeners = chainListeners[i] || [];

            const availableListeners = [];
            for (let j = 0; j < i; j++) {
                const prevActivity = this.item?.system.activities.get(chainedActivityIds[j]);
                const prevTriggers = chainTriggers[j] || [];
                if (prevTriggers.length == 0) continue;

                const prevName = chainedActivityNames[j] || prevActivity?.name || prevActivity?.type || `Activity ${j + 1}`;
                availableListeners.push({
                    activityName: prevName,
                    activityIndex: j,
                    triggers: prevTriggers.map((trigger, triggerIndex) => ({
                        label: trigger,
                        value: `${j}:${triggerIndex}`,
                        selected: listeners.includes(`${j}:${triggerIndex}`),
                    })),
                });
            }

            const enrichedListeners = listeners.map(listenerKey => {
                const [ sourceActivityIndex, sourceTriggerIndex ] = listenerKey.split(`:`).map(Number);

                const sourceActivity = this.item?.system.activities.get(chainedActivityIds[sourceActivityIndex]);
                const sourceName = chainedActivityNames[sourceActivityIndex] || sourceActivity?.name || sourceActivity?.type || `Activity ${sourceActivityIndex + 1}`;

                const sourceTriggers = chainTriggers[sourceActivityIndex] || [];
                const triggerLabel = sourceTriggers[sourceTriggerIndex] || `Unknown Trigger`;

                return {
                    value: listenerKey,
                    label: triggerLabel,
                    sourceActivityName: sourceName,
                    sourceActivityIndex: sourceActivityIndex,
                    sourceTriggerIndex: sourceTriggerIndex,
                };
            });

            const triggerDetails = [];
            for (let j = 0; j < triggers.length; j++) {
                triggerDetails.push({
                    name: triggers[j],
                    branch: triggerConflicts[`${i}:${j}`],
                });
            }

            chainedActivities.push({
                id: chainedActivityIds[i],
                name: chainedActivityNames[i],
                resolvedName: activity?.name || chainedActivityNames[i] || activity?.type,
                activityType: activity?.type || `unknown`,
                icon: activity?.img || null,
                triggers: triggerDetails,
                listeners: listeners,
                enrichedListeners: enrichedListeners,
                availableListeners: availableListeners,
                exists: !!activity,
                index: i,
            });
        }

        context.availableActivities = availableActivities;
        context.chainedActivities = chainedActivities;

        return context;
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        this._addChainListeners();
        DomData.setupSheetBehaviors(this);
    }

    /**
     * Check if an activity is already chained
     * @param {string} activityId - The activity ID to check
     * @returns {boolean}
     * @private
     */
    _isActivityChained(activityId) {
        const currentIds = this.activity?.chainedActivityIds || [];
        return currentIds.includes(activityId);
    }

    _getTriggerConflicts() {
        const chainTriggers = this.activity?.chainTriggers || [];
        const chainListeners = this.activity?.chainListeners || [];

        const conflicts = {};
        for (let i = 0; i < chainTriggers.length; i++) {
            const triggers = chainTriggers[i];
            for (let j = 0; j < triggers.length; j++) {
                const key = `${i}:${j}`;
                const count = chainListeners.slice(i + 1).filter(listeners => listeners && listeners.includes(key)).length;
                if (count <= 1) continue;

                conflicts[key] = {
                    activityIndex: i,
                    triggerIndex: j,
                    trigger: triggers[j],
                    count,
                };
            }
        }
        return conflicts;
    }

    /**
     * Add event listeners for chain management
     * @private
     */
    _addChainListeners() {
        this.element?.querySelector(`select[name="newActivity"]`)?.addEventListener(`change`, async(event) => {
            const activityId = event.target.value;
            if (!activityId) return;

            await this._addActivityToChain(activityId);
            event.target.value = ``;
        });

        this.element?.querySelectorAll(`.remove-activity-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.dataset.index);
                await this._removeActivityFromChain(index);
            });
        });

        this.element?.querySelectorAll(`.move-up-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.dataset.index);
                await this._moveActivity(index, index - 1);
            });
        });

        this.element?.querySelectorAll(`.move-down-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.dataset.index);
                await this._moveActivity(index, index + 1);
            });
        });

        this.element?.querySelectorAll(`.add-trigger-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const activityIndex = parseInt(event.target.dataset.activityIndex);
                const activityType = event.target.dataset.activityType;
                const defaultTriggers = this._getDefaultTriggersForActivity(activityType);
                
                if (defaultTriggers.length > 0) {
                    await this._addTriggerToActivity(activityIndex, defaultTriggers[0]);
                }
            });
        });

        this.element?.querySelectorAll(`.remove-trigger-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const activityIndex = parseInt(event.target.dataset.activityIndex);
                const triggerIndex = parseInt(event.target.dataset.triggerIndex);
                await this._removeTriggerFromActivity(activityIndex, triggerIndex);
            });
        });

        this.element?.querySelectorAll(`.trigger-label-input`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const activityIndex = parseInt(event.target.dataset.activityIndex);
                const triggerIndex = parseInt(event.target.dataset.triggerIndex);
                const newLabel = event.target.value.trim();
                
                if (newLabel) {
                    await this._updateTrigger(activityIndex, triggerIndex, newLabel);
                }
            });
        });
        
        this.element?.querySelectorAll(`.add-listener-select`).forEach(select => {
            select.addEventListener(`change`, async(event) => {
                const activityIndex = parseInt(event.target.dataset.activityIndex);
                const value = event.target.value;
                if (!value) return;
                
                const [sourceActivityIndex, sourceTriggerIndex] = value.split(`:`).map(Number);
                
                await this._addListener(activityIndex, sourceActivityIndex, sourceTriggerIndex);
                event.target.value = ``;
            });
        });

        this.element?.querySelectorAll(`.remove-mapping-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const activityIndex = parseInt(event.target.dataset.activityIndex);
                const listenerKey = event.target.dataset.listenerKey;

                await this._removeListener(activityIndex, listenerKey);
            });
        });
    }

    /**
     * Add an activity to the chain
     * @param {string} activityId - The activity ID to add
     * @private
     */
    async _addActivityToChain(activityId) {
        const activity = this.item?.system.activities.get(activityId);
        if (!activity) return;
        
        const currentIds = this.activity.chainedActivityIds || [];
        if (currentIds.includes(activityId)) return;

        const ids = [...currentIds];
        const names = [...(this.activity.chainedActivityNames || [])];
        const triggers = [...(this.activity.chainTriggers || [])];
        const listeners = [...(this.activity.chainListeners || [])];

        ids.push(activityId);
        names.push(activity.name || activity.type);

        const defaultTriggers = this._getDefaultTriggersForActivity(activity.type);
        triggers.push(defaultTriggers);
        listeners.push([]);

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
            chainTriggers: triggers,
            chainListeners: listeners,
        });
    }

    /**
     * Remove an activity from the chain
     * @param {number} index - The index to remove
     * @private
     */
    async _removeActivityFromChain(index) {
        const currentIds = this.activity.chainedActivityIds || [];
        if (index < 0 || index >= currentIds.length) return;

        const ids = currentIds.filter((_, i) => i !== index);
        const names = (this.activity.chainedActivityNames || []).filter((_, i) => i !== index);
        const triggers = (this.activity.chainTriggers || []).filter((_, i) => i !== index);
        const listeners = (this.activity.chainListeners || []).filter((_, i) => i !== index);

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
            chainTriggers: triggers,
            chainListeners: listeners,
        });
    }

    /**
     * Move an activity to a new position
     * @param {number} fromIndex - Current index
     * @param {number} toIndex - Target index
     * @private
     */
    async _moveActivity(fromIndex, toIndex) {
        const currentIds = this.activity.chainedActivityIds || [];
        if (toIndex < 0 || toIndex >= currentIds.length || fromIndex < 0 || fromIndex >= currentIds.length) return;

        const ids = [...currentIds];
        const names = [...(this.activity.chainedActivityNames || [])];
        const triggers = [...(this.activity.chainTriggers || [])];
        const listeners = [...(this.activity.chainListeners || [])];

        const [movedId] = ids.splice(fromIndex, 1);
        const [movedName] = names.splice(fromIndex, 1);
        const [movedTriggers] = triggers.splice(fromIndex, 1);
        const [movedListeners] = listeners.splice(fromIndex, 1);

        ids.splice(toIndex, 0, movedId);
        names.splice(toIndex, 0, movedName);
        triggers.splice(toIndex, 0, movedTriggers || []);
        listeners.splice(toIndex, 0, movedListeners || []);

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
            chainTriggers: triggers,
            chainListeners: listeners,
        });
    }

    /**
     * Get default triggers for an activity type
     * @param {string} activityType - The activity type
     * @returns {Array} Default triggers
     * @private
     */
    _getDefaultTriggersForActivity(activityType) {
        const defaultTriggers = {
            attack: [
                `On Normal Hit`,
                `On Critical Hit`,
                `On Miss`,
            ],
            save: [
                `On Failure`,
                `On Success`,
            ],
            damage: [
                `After Damage`,
            ],
            check: [
                `On Success`,
                `On Failure`,
            ],
        };
        return defaultTriggers[activityType] || [ `On Complete` ];
    }

    /**
     * Add a trigger to an activity
     * @param {number} activityIndex - Index of the activity
     * @param {Object} trigger - Trigger data
     * @private
     */
    async _addTriggerToActivity(activityIndex, trigger) {
        const chainTriggers = [...(this.activity.chainTriggers || [])];
        while (chainTriggers.length <= activityIndex) {
            chainTriggers.push([]);
        }
        
        chainTriggers[activityIndex].push(trigger);
        await this.activity.update({ chainTriggers });
    }

    /**
     * Remove a trigger from an activity
     * @param {number} activityIndex - Index of the activity
     * @param {number} triggerIndex - Index of the trigger
     * @private
     */
    async _removeTriggerFromActivity(activityIndex, triggerIndex) {
        const chainTriggers = [...(this.activity.chainTriggers || [])];
        
        if (chainTriggers[activityIndex]) {
            chainTriggers[activityIndex].splice(triggerIndex, 1);
            await this.activity.update({ chainTriggers });
        }
    }

    /**
     * Update a trigger
     * @param {number} activityIndex - Index of the activity
     * @param {number} triggerIndex - Index of the trigger
     * @param {string} newLabel - New label to display
     * @private
     */
    async _updateTrigger(activityIndex, triggerIndex, newLabel) {
        const chainTriggers = [...(this.activity.chainTriggers || [])];
        
        if (chainTriggers[activityIndex] && chainTriggers[activityIndex][triggerIndex]) {
            chainTriggers[activityIndex][triggerIndex] = newLabel;
            await this.activity.update({ chainTriggers });
        }
    }
    
    /**
     * Add a trigger mapping for an activity
     * @param {number} activityIndex - Index of the activity
     * @param {string} sourceActivityIndex - Index of the source activity
     * @param {number} sourceTriggerIndex - Index of the trigger within the source activity
     * @private
     */
    async _addListener(activityIndex, sourceActivityIndex, sourceTriggerIndex) {
        const chainListeners = [...(this.activity.chainListeners || [])];
        while (chainListeners.length <= activityIndex) {
            chainListeners.push([]);
        }
        
        const currentListeners = chainListeners[activityIndex] || [];    
        const listenerKey = `${sourceActivityIndex}:${sourceTriggerIndex}`;
        if (currentListeners.includes(listenerKey)) return;

        currentListeners.push(listenerKey);
        chainListeners[activityIndex] = currentListeners;
        await this.activity.update({ chainListeners });
    }

    /**
     * Remove a trigger mapping for an activity
     * @param {number} activityIndex - Index of the activity
     * @param {string} listenerKey - The listener key to remove (format: "sourceActivityIndex:sourceTriggerIndex")
     * @private
     */
    async _removeListener(activityIndex, listenerKey) {
        const chainListeners = [...(this.activity.chainListeners || [])];
        if (!chainListeners[activityIndex]) return;

        const currentListeners = chainListeners[activityIndex];
        const index = currentListeners.indexOf(listenerKey);
        if (index === -1) return;

        currentListeners.splice(index, 1);
        chainListeners[activityIndex] = currentListeners;
        await this.activity.update({ chainListeners });
    }
}

export class ChainActivity extends dnd5e.documents.activity.ActivityMixin(ChainActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: ChainActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return ChainActivityData.defineSchema();
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
        await this._executeChain(config, dialog, message);
        return results;
    }

    /**
     * Continue chain execution from a specific point
     * @param {number} fromIndex - Index to continue from
     * @param {string} trigger - The trigger that was activated
     * @returns {Promise<void>}
     */
    async continueChainFrom(fromIndex, trigger) {
        const chainListeners = this.chainListeners || [];
        const chainTriggers = this.chainTriggers || [];

        const sourceTriggers = chainTriggers[fromIndex] || [];
        const sourceTriggerIndex = sourceTriggers.indexOf(trigger);

        if (sourceTriggerIndex === -1) {
            console.warn(`Chain activity: Trigger "${trigger}" not found in activity ${fromIndex}`);
            return;
        }

        const listenerKey = `${fromIndex}:${sourceTriggerIndex}`;

        const activities = [];
        for (let i = fromIndex + 1; i < chainListeners.length; i++) {
            const listeners = chainListeners[i] || [];
            if (listeners.includes(listenerKey))
                activities.push(i);
        }

        if (activities.length === 0) return;
        if (activities.length === 1) {
            await this.executeChainedActivity(activities[0]);
            return;
        }

        new ChainBranchApp(this, trigger, activities).render(true);
    }

    /**
     * Execute all activities in the chain
     * @param {ActivityUseConfiguration} config - Configuration data for the activity usage.
     * @param {ActivityDialogConfiguration} dialog - Configuration data for the activity dialog.
     * @param {ActivityMessageConfiguration} message - Configuration data for the activity message.
     * @returns {Promise<void>}
     * @private
     */
    async _executeChain(config, dialog, message) {
        await this.executeChainedActivity(0, config, dialog, message);
    }
    
    /**
     * Add trigger buttons to the last chat message
     * @param {string} activityId - The activity ID that was just executed
     * @param {number} activityIndex - Index of the activity in the chain
     * @param {Array} triggers - Enabled triggers for this activity
     * @private
     */
    async _addTriggersToLastChatMessage(activityId, activityIndex, triggers) {
        const messages = game.messages.contents.reverse();
        const lastMessage = messages.find(m =>
            m.speaker?.actor === this.actor?.id &&
            m.flags?.dnd5e?.item?.id === this.item.id
        );
        if (!lastMessage) return;

        const triggerButtonsHtml = `
            <div class="chain-triggers" data-chain-item-id="${this.item.id}" data-activity-index="${activityIndex}">
                <div class="chain-triggers-header">
                    <i class="fas fa-link"></i>
                    <span>Chain Continuation</span>
                </div>
                <div class="chain-triggers-buttons">
                    ${triggers.map(trigger => `
                        <button class="chain-trigger-btn" 
                                data-trigger-label="${trigger}"
                                data-item-id="${this.item.id}"
                                data-activity-index="${activityIndex}">
                            ${trigger}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        const content = lastMessage.content + triggerButtonsHtml;
        await lastMessage.update({ content });
    }

    async executeChainedActivity(index, config = {}, dialog = {}, message = {}) {
        const chainedActivityIds = this.chainedActivityIds || [];
        const chainTriggers = this.chainTriggers || [];

        const activityId = chainedActivityIds[index];
        const activityTriggers = chainTriggers[index] || [];

        const activity = this.item?.system.activities.get(activityId);
        if (!activity) {
            console.warn(`Chain activity: Activity ${activityId} not found, skipping`);
            return;
        }

        try {
            const chainedConfig = foundry.utils.mergeObject(config, {
                consumeResource: false,
                consumeRecharge: false,
                consumeUsage: false,
            });

            const result = await activity.use(chainedConfig, dialog, message);
            if (activityTriggers.length > 0 && index < chainedActivityIds.length - 1) {
                await this._addTriggersToLastChatMessage(activityId, index, activityTriggers);
                return;
            }

            if (result && result.error) {
                console.log(`Chain activity: Activity ${activity.name} failed, stopping chain execution`);
            }
        }
        catch (error) {
            console.error(`Chain activity: Error executing ${activity.name}:`, error);
        }
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null}
     */
    get actor() {
        return this.item?.actor || null;
    }
}

class ChainBranchApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `chain-branch-app` ],
        tag: `form`,
        position: {
            width: 400,
            height: `auto`,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/chain-branch.hbs`,
        },
    };

    constructor(activity, trigger, activities, options = {}) {
        super({
            window: {
                title: `Select Activity`,
            },
            ...options,
        });
        this.activity = activity;
        this.trigger = trigger;
        this.activities = activities;
        this.selectedId = undefined;
        this.executeAll = false;
    }

    /** @inheritdoc */
    async _prepareContext() {
        const activities = this.activities.map(activityIndex => {
            const activityId = this.activity.chainedActivityIds[activityIndex];
            const activity = this.activity.item?.system.activities.get(activityId);
            const activityName = this.activity.chainedActivityNames[activityIndex] || activity?.name || activity?.type || `Activity ${activityIndex + 1}`;
            
            return {
                index: activityIndex,
                id: activityId,
                name: activityName,
                type: activity?.type || `unknown`,
                icon: activity?.img || `icons/svg/mystery-man.svg`,
            };
        });

        return {
            activities,
            trigger: this.trigger,
            executeAll: this.executeAll,
            selectedId: this.selectedId,
            hasMultiple: false,
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        this.element.querySelectorAll(`.item-choice`).forEach(checkbox => {
            checkbox.addEventListener(`change`, () => {
                this.selectedId = checkbox.checked ? checkbox.dataset.item : undefined;
                this.render();
            });
        });

        // this.element.querySelector(`.execute-all`).addEventListener(`change`, (event) => {
        //     this.executeAll = event.currentTarget.checked;
        //     this.render();
        // });

        this.element.querySelector(`.finish-branch-btn`).addEventListener(`click`, () => {
            if (this.selectedId === undefined) return;

            const activityIndex = this.activity.chainedActivityIds.indexOf(this.selectedId);
            this.activity.executeChainedActivity(activityIndex);
            this.close();
        });

        this.element.querySelector(`.cancel-branch-btn`).addEventListener(`click`, () => {
            this.close();
        });
    }
}
