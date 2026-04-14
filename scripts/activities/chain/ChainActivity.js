import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `chain`;

import { ChainActivityData } from './ChainActivityData.js';
import { ChainActivitySheet } from './ChainActivitySheet.js';
import { ChainBranchApp } from './ChainBranchApp.js';

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
        if (results === undefined) return results;

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
        const messages = [...game.messages.contents].reverse();
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
                consume: false,
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
