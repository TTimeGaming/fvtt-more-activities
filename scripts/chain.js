export class ChainData {
    static async init() {
        Handlebars.registerHelper(`subtract`, function(a, b) {
            return a - b;
        });

        const originalItem5eUse = CONFIG.Item.documentClass.prototype.use;
        CONFIG.Item.documentClass.prototype.use = async function(config={}, dialog={}, message={}) {
            const activities = this.system.activities.filter(a => !ChainData.isActivityChained(this, a.id));
            if (activities.length > 1) {
                return await originalItem5eUse.call(this, config, dialog, message);
            }

            const { chooseActivity, ...activityConfig } = config;
            let usageConfig = activityConfig;
            let dialogConfig = dialog;
            let messageConfig = message;
            return activities[0].use(usageConfig, dialogConfig, messageConfig);
        }
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

        const chainedActivities = [];
        for (let i = 0; i < chainedActivityIds.length; i++) {
            const activity = this.item?.system.activities.get(chainedActivityIds[i]);

            chainedActivities.push({
                id: chainedActivityIds[i],
                name: chainedActivityNames[i],
                resolvedName: activity?.name || chainedActivityNames[i] || activity?.type,
                activityType: activity?.type || `unknown`,
                icon: activity?.img || null,
                exists: !!activity,
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

        ids.push(activityId);
        names.push(activity.name || activity.type);

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
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

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
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

        const [movedId] = ids.splice(fromIndex, 1);
        const [movedName] = names.splice(fromIndex, 1);

        ids.splice(toIndex, 0, movedId);
        names.splice(toIndex, 0, movedName);

        await this.activity.update({
            chainedActivityIds: ids,
            chainedActivityNames: names,
        });
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
     * Execute all activities in the chain
     * @param {ActivityUseConfiguration} config - Configuration data for the activity usage.
     * @param {ActivityDialogConfiguration} dialog - Configuration data for the activity dialog.
     * @param {ActivityMessageConfiguration} message - Configuration data for the activity message.
     * @returns {Promise<void>}
     * @private
     */
    async _executeChain(config, dialog, message) {
        const chainedActivityIds = this.chainedActivityIds || [];

        let shouldStop = false;
        for (let i = 0; i < chainedActivityIds.length && !shouldStop; i++) {
            const activityId = chainedActivityIds[i];

            const activity = this.item?.system.activities.get(activityId);
            if (!activity) {
                console.warn(`Chain activity: Activity ${activityId} not found, skipping`);
                continue;
            }

            try {
                const chainedConfig = foundry.utils.mergeObject(config, {
                    consumeResource: false,
                    consumeRecharge: false,
                    consumeUsage: false,
                });

                const result = await activity.use(chainedConfig, dialog, message);

                const needsInteraction = this._activityNeedsInteraction(activity);
                const isLastActivity = i === chainedActivityIds.length - 1;

                if (needsInteraction && !isLastActivity) {
                    const nextActivityId = chainedActivityIds[i + 1];
                    const nextActivity = this.item?.system.activities.get(nextActivityId);

                    const proceed = await this._waitForActivityCompletion(activity, nextActivity);
                    if (!proceed) {
                        console.log(`Chain activity: User cancelled execution after ${activity.name}`);
                        break;
                    }
                }

                if (result && result.error) {
                    console.log(`Chain activity: Activity ${activity.name} failed, stopping chain execution`);
                    shouldStop = true;
                }
            }
            catch (error) {
                console.error(`Chain activity: Error executing ${activity.name}:`, error);
                shouldStop = true;
            }
        }
    }

    /**
     * Check if an activity type typically needs user interaction
     * @param {Activity} activity - The activity to check
     * @returns {boolean}
     * @private
     */
    _activityNeedsInteraction(activity) {
        const interactiveTypes = [`attack`, `save`, `check`, `damage`];
        return interactiveTypes.includes(activity.type);
    }

    /**
     * Wait for user confirmation that the activity has completed
     * @param {Activity} activity - The activity that was executed
     * @param {Activity} nextActivity - The activity to execute next
     * @returns {Promise<boolean>} - Whether to proceed
     * @private
     */
    async _waitForActivityCompletion(activity, nextActivity) {
        return new Promise((resolve) => {
            new ActivityCompletionDialog(activity, nextActivity, {
                close: (result) => resolve(result ?? false)
            }).render(true);
        });
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null}
     */
    get actor() {
        return this.item?.actor || null;
    }
}

class ActivityCompletionDialog extends foundry.applications.api.DialogV2 {
    constructor(activity, nextActivity, options = {}) {
        super({
            window: {
                title: `Activity Completed`,
                icon: `fas fa-link`
            },
            position: {
                width: 400,
                height: `auto`
            },
            content: `
                <div class="dialog-content">
                    <div class="dialog-text">
                        <p><i class="fas fa-check-circle"></i> <strong>${activity.name}</strong> ${game.i18n.localize(`DND5E.ACTIVITY.FIELDS.chain.completed.label`)}</p>
                        <p><i class="fas fa-question-circle"></i> ${game.i18n.localize(`DND5E.ACTIVITY.FIELDS.chain.queued.label`)} <strong>${nextActivity?.name || `Unknown`}</strong>.</p>
                        <p>${game.i18n.localize(`DND5E.ACTIVITY.FIELDS.chain.nextAction.label`)}</p>
                    </div>
                </div>
            `,
            buttons: [
                {
                    action: `continue`,
                    icon: `fas fa-arrow-right`,
                    label: game.i18n.localize(`DND5E.ACTIVITY.FIELDS.chain.button.next`),
                    default: true,
                    callback: () => this.close(true),
                },
                {
                    action: `stop`,
                    icon: `fas fa-stop`,
                    label: game.i18n.localize(`DND5E.ACTIVITY.FIELDS.chain.button.stop`),
                    callback: () => this.close(false),
                }
            ],
            ...options
        });
        this.activity = activity;
        this.resolveCallback = options.close;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: [`dnd5e2`, `dialog`, `chain-completion`],
            window: {
                resizable: false
            }
        });
    }

    async close(result = false) {
        if (this.resolveCallback) {
            this.resolveCallback(result);
        }
        return super.close();
    }
}
