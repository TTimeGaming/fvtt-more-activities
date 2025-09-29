import { DomData } from '../utils/dom.js';
import { MessageData } from '../utils/message.js';

const TEMPLATE_NAME = `advancement`;

export class AdvancementData {
    static applyListeners(message, html) {
        MessageData.addActivityButton(message, html, false,
            TEMPLATE_NAME, `Trigger Advancement`, async(activity) => {
                console.log(activity);
                await activity._triggerAdvancements();
            }
        );
    }
}

export class AdvancementActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.sourceItem = new fields.StringField({
            required: false,
            blank: true,
        });

        schema.advancementIds = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true,
        }), {
            required: false,
            initial: [],
        });

        schema.allowReselection = new fields.BooleanField({
            required: false,
            initial: true,
        });

        return schema;
    }
}

export class AdvancementActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-${TEMPLATE_NAME}` ],
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/${TEMPLATE_NAME}-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        }
    };

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);

        context.allowReselection = this.activity?.allowReselection ?? true;
        
        let sourceItem = null;
        let availableAdvancements = [];
        
        if (this.activity?.sourceItem) {
            try {
                sourceItem = await fromUuid(this.activity.sourceItem);
                if (sourceItem?.system?.advancement) {
                    availableAdvancements = Object.entries(sourceItem.system.advancement)
                        .map(([id, advancement]) => ({
                            id,
                            type: advancement.type,
                            title: advancement.title || advancement.type,
                            level: advancement.level || 1,
                            selected: (this.activity?.advancementIds ?? []).includes(id),
                        }))
                        .sort((a, b) => a.level - b.level)
                    ;
                }
            }
            catch (error) {
                console.warn(`Could not load source item:`, error);
            }
        }
        
        context.sourceItem = this.activity?.sourceItem ?? ``;
        context.sourceItemName = sourceItem?.name || `Unknown Item`;
        context.availableAdvancements = availableAdvancements;
        context.selectedAdvancements = this.activity?.advancementIds ?? [];

        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        const sourceInput = this.element.querySelector(`input[name="sourceItem"]`);
        if (sourceInput) {
            this._addDragDropHandlers(sourceInput, async(uuid) => {
                await this.activity.update({ sourceItem: uuid });
                await this.render();
            });

            sourceInput.addEventListener(`blur`, async(event) => {
                await this.activity.update({ sourceItem: event.target.value });
                await this.render();
            });
        }

        this.element.querySelectorAll(`.advancement-checkbox`).forEach(checkbox => {
            checkbox.addEventListener(`change`, async(event) => {
                const advancementId = event.target.dataset.advancementId;
                let advancementIds = [...(this.activity?.advancementIds ?? [])];
                
                if (event.target.checked) {
                    if (!advancementIds.includes(advancementId)) {
                        advancementIds.push(advancementId);
                    }
                } else {
                    advancementIds = advancementIds.filter(id => id !== advancementId);
                }
                
                await this.activity.update({ advancementIds });
            });
        });

        DomData.setupSheetBehaviors(this);
    }

    _addDragDropHandlers(input, callback) {
        input.addEventListener('dragover', (event) => {
            event.preventDefault();
            input.classList.add('drag-over');
        });

        input.addEventListener('dragenter', (event) => {
            event.preventDefault();
            input.classList.add('drag-over');
        });

        input.addEventListener('dragleave', (event) => {
            event.preventDefault();
            if (!input.contains(event.relatedTarget)) {
                input.classList.remove('drag-over');
            }
        });

        input.addEventListener('drop', async (event) => {
            event.preventDefault();
            input.classList.remove('drag-over');

            try {
                const data = game.version.startsWith(`12`) ?
                    TextEditor.getDragEventData(event) :
                    foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
                ;
                
                if (data.type === 'Item') {
                    callback(data.uuid);
                } else {
                    ui.notifications.warn(`Only items can be dropped here!`);
                }
            } catch (error) {
                console.error(`Error handling drop:`, error);
                ui.notifications.error(`Failed to process dropped item`);
            }
        });
    }
}

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
                item._source?._stats?.compendiumSource === this.sourceItem ||
                (item.system?.identifier === sourceItem.system?.identifier && item.type === sourceItem.type)
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
