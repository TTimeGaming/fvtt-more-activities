import { DomData } from '../../utils/dom.js';
import { MessageData } from '../../utils/message.js';

const TEMPLATE_NAME = `advancement`;

import { AdvancementActivityData } from './AdvancementActivityData.js';
import { AdvancementActivitySheet } from './AdvancementActivitySheet.js';

export class AdvancementActivity extends dnd5e.documents.activity.ActivityMixin(AdvancementActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: AdvancementActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return AdvancementActivityData.defineSchema();
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

        await this._triggerAdvancements();
        return results;
    }

    async _triggerAdvancements() {
        if (!this.sourceItem || !this.advancementIds?.length) {
            ui.notifications.warn(`No source item or advancements selected!`);
            return;
        }

        try {
            const sourceItem = await fromUuid(this.sourceItem);
            if (!sourceItem) {
                ui.notifications.error('Could not find source item!');
                return;
            }

            const actorItem = this.actor.items.find(item => 
                item.id === sourceItem.id ||
                item._source?._stats?.compendiumSource === sourceItem.uuid
            );

            if (!actorItem) {
                ui.notifications.error(`Actor does not have the required item: ${sourceItem.name}`);
                return;
            }

            const manager = new dnd5e.applications.advancement.AdvancementManager(this.actor, {});
            const clonedItem = manager.clone.items.get(actorItem.id);

            if (!clonedItem) {
                ui.notifications.error(`Actor does not have the required item: ${sourceItem.name}`);
                return;
            }

            const flows = [];            
            for (const advancementId of this.advancementIds) {
                const advancement = actorItem.system.advancement?.[advancementId];
                if (!advancement) {
                    console.warn(`Advancement ${advancementId} not found on item ${actorItem.name}`);
                    continue;
                }

                const locatedLevel = Object.entries(actorItem.advancement.byLevel).find(([level, advancements]) => advancements.map(x => x.id).includes(advancement.id));
                const level = locatedLevel?.length === 2 ? parseInt(locatedLevel[0]) : advancement.level || actorItem.system.details?.level || 1;
                const flow = new advancement.metadata.apps.flow(clonedItem, advancement.id, level);

                flows.push(flow);
            }

            flows.reverse().forEach(flow => manager.steps.push({ type: `reverse`, flow, automatic: true }));
            flows.reverse().forEach(flow => manager.steps.push({ type: `forward`, flow }));

            manager.render(true);
        }
        catch (error) {
            console.error(`Error triggering advancements:`, error);
            ui.notifications.error(`Failed to trigger advancements`);
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
