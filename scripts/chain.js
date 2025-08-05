export class ChainData {
    static async init() {
        Handlebars.registerHelper(`subtract`, function(a, b) {
            return a - b;
        });
    }

    static disableChained(sheet, html) {
        const activity = sheet.activity;
        const item = activity?.item;
        if (!item || !activity) return;

        const isChained = ChainData.isActivityChained(item, activity.id);
        if (!isChained) return;

        sheet.element.classList.add(`chained-activity`);
        sheet.element.querySelector(`.window-header .window-icon`).classList.add(`fa-link`);

        const activationTab = html.querySelector(`.sheet-tabs a[data-tab="activation"]`);
        if (activationTab) {
            activationTab.classList.add(`activation-tab`);

            const warning = document.createElement(`abbr`);
            warning.setAttribute(`title`, game.i18n.localize(`DND5E.ACTIVITY.FIELDS.chain.blockedActivity.label`));
            warning.innerHTML = `<i class="fa-solid fa-warning" style="pointer-events: all;"></i>`;
            activationTab.appendChild(warning);
        }
    }

    static applyListeners(message, html) {
        html.querySelectorAll('.chain-trigger-btn').forEach(btn => {
            btn.addEventListener('click', async(event) => {
                const itemId = event.target.dataset.itemId;
                const activityIndex = parseInt(event.target.dataset.activityIndex);
                const triggerLabel = event.target.dataset.triggerLabel;

                const item = game.items.get(itemId) || game.actors.contents
                    .flatMap(a => a.items.contents)
                    .find(i => i.id === itemId);
                if (!item) return;

                const chainActivity = item.system.activities.find(a => a.type === `chain`);
                if (!chainActivity) return;

                const triggerContainer = event.target.closest('.chain-triggers');
                if (triggerContainer) triggerContainer.remove();

                await chainActivity.continueChainFrom(activityIndex, triggerLabel);
            });
        });
    }

    static async removeActivities(item, html) {
        const removedActivities = [];
        for (const activity of item.system.activities) {
            if (ChainData.isActivityChained(item, activity.id))
                removedActivities.push(activity.id);
        }

        for (const activity of removedActivities) {
            const button = html.querySelector(`button[data-activity-id="${activity}"]`);
            const li = button?.parentElement;
            if (li) li.remove();
        }
    }
    
    static isActivityChained(item, activityId) {
        if (!item?.system?.activities) return false;
        
        for (const activity of item.system.activities) {
            if (activity.type === `chain` && activity.chainedActivityIds) {
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
        
        return schema;
    }
}

export class ChainActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-chain` ]
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/chain-effect.hbs`,
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

        const chainedActivities = [];
        for (let i = 0; i < chainedActivityIds.length; i++) {
            const activity = this.item?.system.activities.get(chainedActivityIds[i]);
            const triggers = chainTriggers[i] || [];

            chainedActivities.push({
                id: chainedActivityIds[i],
                name: chainedActivityNames[i],
                resolvedName: activity?.name || chainedActivityNames[i] || activity?.type,
                activityType: activity?.type || `unknown`,
                icon: activity?.img || null,
                triggers: triggers,
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

        ids.push(activityId);
        names.push(activity.name || activity.type);

        const defaultTriggers = this._getDefaultTriggersForActivity(activity.type);
        triggers.push(defaultTriggers);

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
            chainTriggers: triggers
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

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
            chainTriggers: triggers,
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

        const [movedId] = ids.splice(fromIndex, 1);
        const [movedName] = names.splice(fromIndex, 1);
        const [movedTriggers] = triggers.splice(fromIndex, 1);

        ids.splice(toIndex, 0, movedId);
        names.splice(toIndex, 0, movedName);
        triggers.splice(toIndex, 0, movedTriggers || []);

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
            chainTriggers: triggers,
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
}

export class ChainActivity extends dnd5e.documents.activity.ActivityMixin(ChainActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.CHAIN`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: `hook`,
            img: `modules/more-activities/icons/chain.svg`,
            title: `DND5E.ACTIVITY.Type.chain`,
            hint: `DND5E.ACTIVITY.Hint.chain`,
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
        await this._executeChainedActivity(fromIndex + 1, {}, {}, {});
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
        await this._executeChainedActivity(0, config, dialog, message);
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

    async _executeChainedActivity(index, config, dialog, message) {
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
