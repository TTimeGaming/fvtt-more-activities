import { DomData } from '../../utils/dom.js';
import { MessageData } from '../../utils/message.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';

const TEMPLATE_NAME = `advancement`;

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
    async _prepareContext(options) {
        ensureActivityInferredSource(this.activity);
        return super._prepareContext(options);
    }

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
