import { DomData } from '../../utils/dom.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `chain`;

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
    async _prepareContext(options) {
        ensureActivityInferredSource(this.activity);
        return super._prepareContext(options);
    }

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
                const index = parseInt(event.currentTarget.dataset.index);
                await this._removeActivityFromChain(index);
            });
        });

        this.element?.querySelectorAll(`.move-up-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.currentTarget.dataset.index);
                await this._moveActivity(index, index - 1);
            });
        });

        this.element?.querySelectorAll(`.move-down-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.currentTarget.dataset.index);
                await this._moveActivity(index, index + 1);
            });
        });

        this.element?.querySelectorAll(`.add-trigger-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const activityIndex = parseInt(event.currentTarget.dataset.activityIndex);
                const activityType = event.currentTarget.dataset.activityType;
                const defaultTriggers = this._getDefaultTriggersForActivity(activityType);
                
                if (defaultTriggers.length > 0) {
                    await this._addTriggerToActivity(activityIndex, defaultTriggers[0]);
                }
            });
        });

        this.element?.querySelectorAll(`.remove-trigger-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const activityIndex = parseInt(event.currentTarget.dataset.activityIndex);
                const triggerIndex = parseInt(event.currentTarget.dataset.triggerIndex);
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
                const activityIndex = parseInt(event.currentTarget.dataset.activityIndex);
                const listenerKey = event.currentTarget.dataset.listenerKey;

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
