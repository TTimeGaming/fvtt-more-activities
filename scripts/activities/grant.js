import { MessageData } from '../utils/message.js';
import { FieldsData } from '../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `grant`;

export class GrantData {
    static async applyListeners(message, html) {
        MessageData.addActivityButton(message, html, false,
            TEMPLATE_NAME, `Grant Item(s)`, (activity) => {
                new GrantSelectionApp(activity).render(true);
            }
        );
    }
}

export class GrantActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.grantAll = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.count = new fields.StringField({
            required: false,
            initial: `1`,
        });

        schema.swappable = new fields.BooleanField({
            required: false,
            initial: false,
        })

        schema.current = new fields.StringField({
            required: false,
            blank: true,
        });

        schema.grants = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true,
        }), {
            required: false,
            initial: [],
        });

        return schema;
    }
}

export class GrantActivitySheet extends dnd5e.applications.activity.ActivitySheet {
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

        const grants = [];
        for (const itemId of (this.activity?.grants ?? [])) {
            const item = await fromUuid(itemId);
            grants.push({
                name: item.name,
                img: item.img,
                type: game.i18n.localize(`TYPES.Item.${item.type}`),
                uuid: itemId,
            });
        }

        context.grantAll = this.activity?.grantAll ?? true;
        context.count = this.activity?.count ?? `1`;
        context.swappable = this.activity?.swappable ?? false;
        context.current = this.activity?.current ?? ``;
        context.grants = grants.map((element, index) => ({
            ...element,
            index: index,
        }));
        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        const input = this.element.querySelector(`input[name="current"]`);

        this.element.querySelector(`.add-item-btn`).addEventListener(`click`, async() => {
            await this._addItemFromInput(input);
        });

        this.element.querySelectorAll(`.item-delete-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                let grants = this.activity?.grants ?? [];
                grants = grants.filter((_, i) => i !== index);

                await this.activity.update({
                    grants: grants,
                });

                this.render();
            });
        });

        this._addDragDropHandlers(input);
    }

    _addDragDropHandlers(input) {
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
                    input.value = data.uuid;
                    await this._addItemFromInput(input);
                } else {
                    ui.notifications.warn(`Only items can be dropped here!`);
                }
            } catch (error) {
                console.error(`Error handling drop:`, error);
                ui.notifications.error(`Failed to process dropped item`);
            }
        });
    }

    async _addItemFromInput(input) {
        const itemValue = input.value.trim();
        if (!itemValue) {
            ui.notifications.warn('Please enter an item ID or drag an item here!');
            return;
        }

        try {
            let item;
            if (itemValue.includes('.')) {
                item = await fromUuid(itemValue);
            } else {
                const parsed = foundry.utils.parseUuid(itemValue);
                if (parsed && parsed.id) {
                    item = await fromUuid(itemValue);
                }
            }

            if (!item) {
                ui.notifications.warn('Unable to find item with that ID!');
                return;
            }

            const grants = this.activity?.grants ?? [];
            if (grants.includes(itemValue)) {
                ui.notifications.warn('Item is already in the granted items list!');
                return;
            }

            grants.push(itemValue);
            await this.activity.update({
                grants: grants,
                current: ``,
            });

            input.value = '';
            this.render();            
        } catch (error) {
            console.error('Error adding item:', error);
            ui.notifications.error('Unable to add item - please check the ID/UUID!');
        }
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);
        this.activity.current = ``;
    }
}

export class GrantActivity extends dnd5e.documents.activity.ActivityMixin(GrantActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: GrantActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return GrantActivityData.defineSchema();
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
        new GrantSelectionApp(this).render(true);
        return results;
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null
     */
    get actor() {
        return this.item?.actor || null;
    }
}

class GrantSelectionApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `grant-selection-app` ],
        tag: `form`,
        position: {
            width: 400,
            height: `auto`,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/grant-selection.hbs`,
        },
    };

    constructor(activity, options = {}) {
        super({
            window: {
                title: `Select Items`,
            },
            ...options,
        });
        this.activity = activity;
        this.actor = activity?.actor;

        if (activity.grantAll) {
            this.selectedItems = activity.grants;
            this.maxItems = activity.grants.length;
            return;
        }

        this.selectedItems = [];
        this.maxItems = FieldsData.resolveFormula(activity.count, activity.item);
        if (!activity.swappable) return;

        this.startingItems = [];
        for (const item of activity.actor.items) {
            const flags = item.flags?.[`more-activities`];
            if (!flags || !flags.grantId) continue;

            if (flags.grantId === activity.id) {
                this.selectedItems.push(flags.itemId);
                this.startingItems.push(flags.itemId);
            }
        }
    }

    /** @inheritdoc */
    async _prepareContext() {
        const grants = [];
        for (const grant of (this.activity.grants ?? [])) {
            const item = (await fromUuid(grant)).toObject();
            grants.push({
                ...item,
                type: game.i18n.localize(`TYPES.Item.${item.type}`),
                uuid: grant,
                selected: this.selectedItems.includes(grant),
            });
        }

        return {
            count: this.selectedItems.length,
            available: this.maxItems,
            isLocked: this.selectedItems.length === this.maxItems,
            swappable: this.activity.swappable,
            items: grants,
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        if (!this.element.querySelector(`.window-subtitle`)) {
            const subtitle = document.createElement(`h2`);
            subtitle.classList.add(`window-subtitle`);
            subtitle.innerText = this.activity?.item?.name || this.activity?.name || ``,
            this.element.querySelector(`.window-header .window-title`).insertAdjacentElement(`afterend`, subtitle);
        }

        this.element.querySelectorAll(`.item-choice`).forEach(checkbox => {
            checkbox.addEventListener(`change`, () => {
                if (checkbox.value)
                    this.selectedItems.push(checkbox.dataset.uuid);
                else {
                    this.selectedItems = this.selectedItems.filter(x => x !== checkbox.dataset.uuid);
                }
                this.render();
            });
        });

        this.element.querySelector(`.cancel-grant-btn`)?.addEventListener(`click`, () => {
            this.close();
        });

        this.element.querySelector(`.finish-grant-btn`)?.addEventListener(`click`, async() => {
            let newItems = this.selectedItems;

            if (this.activity.swappable && !this.activity.grantAll) {
                newItems = this.selectedItems.filter(id => !this.startingItems.includes(id));

                const removedItems = [];
                for (const itemId of (this.activity.grants ?? [])) {
                    if (newItems.includes(itemId)) continue; // This is a new item
                    if (!this.startingItems.includes(itemId)) continue; // This is an unrelated item
                    if (this.selectedItems.includes(itemId)) continue; // This item hasn't changed

                    const item = this.actor.items.find(item => item.flags?.[`more-activities`]?.grantId == this.activity.id && item.flags?.[`more-activities`]?.itemId === itemId);
                    if (item) removedItems.push(item.id);
                }
                
                await this.actor.deleteEmbeddedDocuments(`Item`, removedItems, { isUndo: true });
            }

            const grants = [];
            for (const grant of newItems) {
                const item = (await fromUuid(grant)).toObject();
                grants.push({
                    ...item,
                    uuid: grant,
                });
            }
            
            const items = await this.actor.createEmbeddedDocuments(`Item`, grants);
            for (let i = 0; i < items.length; i++) {
                const flags = items[i].flags;
                if (flags[`more-activities`] === undefined)
                    flags[`more-activities`] = {};
                flags[`more-activities`].grantId = this.activity.id;
                flags[`more-activities`].itemId = grants[i].uuid;
                await items[i].update({ flags });
            }

            this.close();
        });
    }
}
