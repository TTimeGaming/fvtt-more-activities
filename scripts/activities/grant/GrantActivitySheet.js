import { MessageData } from '../../utils/message.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `grant`;

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

    constructor(options = {}) {
        super(options);
        // this.openCustomization = null;
    }

    /** @inheritdoc */
    async _prepareContext(options) {
        ensureActivityInferredSource(this.activity);
        return super._prepareContext(options);
    }

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);

        let itemCustomizations;
        try {
            itemCustomizations = JSON.parse(this.activity?.itemCustomizations);
        }
        catch {
            itemCustomizations = {};
        }

        let advancementIds;
        try {
            advancementIds = JSON.parse(this.activity?.advancementIds);
        }
        catch {
            advancementIds = {};
        }

        const grants = [];
        for (const itemId of (this.activity?.grants ?? [])) {
            let item = await fromUuid(itemId);
            let itemData = {
                name: `Unknown Item`,
                img: `icons/svg/hazard.svg`,
                type: `missing`,
            };

            if (item != null) {
                itemData = {
                    name: item.name,
                    img: item.img,
                    type: item.type,
                    item: item,
                };
            }

            const customization = itemCustomizations[itemId.replaceAll(`.`, `-`)] ?? {};

            customization.costGroups = (customization.costGroups ?? []).map((element, index) => ({
                ...element,
                index: index,
            }));

            let isCustomized = Object.keys(customization).length > 0;
            if (!customization.individualCostCurrency) customization.individualCostCurrency = `gp`;
            if (!customization.spellCostPerLevelCurrency) customization.spellCostPerLevelCurrency = `gp`;

            const recoveryOptions = [
                { key: `default`, label: `Default`, selected: !customization.recovery || customization.recovery === `default`, },
                { key: `sr`, label: `Short Rest`, selected: customization.recovery === `sr`, },
                { key: `lr`, label: `Long Rest`, selected: customization.recovery === `lr`, },
                { key: `day`, label: `Day`, selected: customization.recovery === `day`, },
            ];

            const scrollStates = [
                { value: 'disable', label: 'Force Spell', icon: 'fas fa-times', selected: (customization.asScroll ?? null) === false },
                { value: 'ignore', label: `Use Global`, icon: 'fas fa-minus', selected: (customization.asScroll ?? null) === null },
                { value: 'enable', label: 'Force Scroll', icon: 'fas fa-check', selected: (customization.asScroll ?? null) === true },
            ];

            grants.push({
                ...itemData,
                type: game.i18n.localize(`TYPES.Item.${itemData.type}`),
                uuid: itemId,
                isCustomized: isCustomized,
                isSpell: itemData.type === `spell`,
                maxUses: item?.system?.uses?.max,
                hasUses: item?.system?.uses?.max !== undefined && item?.system?.uses?.max != null,
                customization: customization,
                recoveryOptions: recoveryOptions,
                scrollStates: scrollStates,
            });
        }

        context.grantAll = this.activity?.grantAll ?? true;
        context.count = this.activity?.count ?? `1`;
        context.swappable = this.activity?.swappable ?? false;
        context.current = this.activity?.current ?? ``;
        context.spellsAsScrolls = this.activity?.spellsAsScrolls ?? false;
        context.currencyOptions = [ `pp`, `gp`, `ep`, `sp`, `cp` ];

        context.grants = grants.map((element, index) => {
            const grant = {
                ...element,
                index: index,
                isOpen: this.openCustomization === index,
            };
            if (!element.item || !element.item.system?.advancement) return grant;

            const itemAdvancementIds = advancementIds[element.uuid.replaceAll(`.`, `-`)] || [];
            grant.availableAdvancements = Object.entries(element.item.system.advancement)
                .map(([id, advancement]) => ({
                    id,
                    type: advancement.type,
                    title: advancement.title || advancement.type,
                    level: advancement.level || 1,
                    selected: itemAdvancementIds.includes(id),
                }))
                .sort((a, b) => a.level - b.level)
            ;
            return grant;
        });

        context.costGroups = (this.activity?.costGroups || []).map((element, index) => ({
            ...element,
            index: index,
        }));

        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        const input = this.element.querySelector(`input[name="current"]`);
        this.element.querySelector(`.add-item-btn`)?.addEventListener(`click`, async() => {
            await this._addItemFromInput(input);
        });

        this.element.querySelectorAll(`.item-delete-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.currentTarget.dataset.index);

                if (this.openCustomization === index)
                    this.openCustomization = null;
                else if (this.openCustomization > index)
                    this.openCustomization--;

                let itemCustomizations;
                try {
                    itemCustomizations = JSON.parse(this.activity?.itemCustomizations);
                }
                catch {
                    itemCustomizations = {};
                }

                let grants = this.activity?.grants ?? [];
                grants = grants.filter((_, i) => i !== index);

                let customizations = {};
                if (itemCustomizations) {
                    const uuid = event.currentTarget.dataset.uuid.replaceAll(`.`, `-`);
                    for (const itemId of Object.keys(itemCustomizations)) {
                        if (uuid !== itemId)
                            customizations[itemId] = itemCustomizations[itemId];
                    }
                }

                await this.activity.update({
                    grants: grants,
                    itemCustomizations: JSON.stringify(customizations),
                });
            });
        });

        this.element.querySelectorAll(`.item-customize-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.closest('[data-index]').dataset.index);
                this._toggleCustomizationPanel(index);
            });
        });

        this._addCostGroupListeners();
        this._addCustomizationListeners();
        DomData.setupSheetBehaviors(this);
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);
        this.activity.current = ``;
        this.openCustomization = null;
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

    _toggleCustomizationPanel(index) {
        this.openCustomization = this.openCustomization === index ? null : index;
        this.element?.querySelectorAll(`.grant-customization`).forEach(panel => {
            if (panel.dataset.index !== index.toString()) {
                panel.style.display = `none`;
                return;
            }

            panel.style.display = panel.style.display === `none` ? `flex` : `none`;
        });
    }

    _addCostGroupListeners() {
        this.element?.querySelector(`.add-cost-group`)?.addEventListener(`click`, async() => {
            const costGroups = this.activity?.costGroups || [];
            costGroups.push({
                id: foundry.utils.randomID(),
                name: `Cost Group ${costGroups.length + 1}`,
                type: `currency`,
                baseCurrencyAmount: ``,
                baseCurrencyCoin: `gp`,
                spellCurrencyAmount: ``,
                spellCurrencyCoin: `gp`,
                itemUuid: ``,
                itemUses: ``,
            });
            await this.activity.update({ costGroups: costGroups });
        });

        this.element?.querySelectorAll(`.remove-cost-group`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.closest(`[data-index]`).dataset.index);
                const costGroups = [...(this.activity?.costGroups || [])];
                costGroups.splice(index, 1);
                await this.activity.update({ costGroups: costGroups });
            });
        });

        this.element?.querySelectorAll(`input[name="costGroupName"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].name = event.target.value;
                await this.activity.update({ costGroups: costGroups });
            });
        });

        this.element?.querySelectorAll(`select[name="costType"]`).forEach(input => {
            input.addEventListener(`change`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].type = event.target.value;
                await this.activity.update({ costGroups: costGroups });
            });
        });

        this.element?.querySelectorAll(`input[name="baseCurrencyAmount"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].baseCurrencyAmount = event.target.value;
                await this.activity.update({ costGroups: costGroups });
            });
        });

        this.element?.querySelectorAll(`select[name="baseCurrencyCoin"]`).forEach(input => {
            input.addEventListener(`change`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].baseCurrencyCoin = event.target.value;
                await this.activity.update({ costGroups: costGroups });
            });
        });

        this.element?.querySelectorAll(`input[name="spellCurrencyAmount"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].spellCurrencyAmount = event.target.value;
                await this.activity.update({ costGroups: costGroups });
            });
        });

        this.element?.querySelectorAll(`select[name="spellCurrencyCoin"]`).forEach(input => {
            input.addEventListener(`change`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].spellCurrencyCoin = event.target.value;
                await this.activity.update({ costGroups: costGroups });
            });
        });

        this.element?.querySelectorAll(`input[name="itemAmount"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].itemAmount = event.target.value;
                await this.activity.update({ costGroups: costGroups });
            });
        });

        this.element.querySelectorAll(`input[name="itemUuid"]`).forEach(input => {
            this._addDragDropHandlers(input, async(uuid) => {
                const index = parseInt(input.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].itemUuid = uuid;
                await this.activity.update({ costGroups: costGroups})
            });

            input.addEventListener(`blur`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const costGroups = [...(this.activity?.costGroups || [])];
                if (!costGroups[index]) return;

                costGroups[index].itemUuid = event.target.value;
                await this.activity.update({ costGroups: costGroups });
            });
        });
    }

    _addCustomizationListeners() {
        let itemCustomizations;
        try {
            itemCustomizations = JSON.parse(this.activity?.itemCustomizations);
        }
        catch {
            itemCustomizations = {};
        }

        let advancementIds;
        try {
            advancementIds = JSON.parse(this.activity?.advancementIds);
        }
        catch {
            advancementIds = {};
        }

        const input = this.element.querySelector(`input[name="current"]`);
        this._addDragDropHandlers(input, async(uuid) => {
            input.value = uuid;
            await this._addItemFromInput(input);
        });

        this.element?.querySelectorAll(`.add-item-cost-group`).forEach(btn => {
            btn.addEventListener(`click`, async() => {
                const item = parseInt(btn.dataset.item);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                costGroups.push({
                    id: foundry.utils.randomID(),
                    name: `Cost Group ${costGroups.length + 1}`,
                    type: `currency`,
                    baseCurrencyAmount: ``,
                    baseCurrencyCoin: `gp`,
                    spellCurrencyAmount: ``,
                    spellCurrencyCoin: `gp`,
                    itemUuid: ``,
                    itemUses: ``,
                });
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`.remove-item-cost-group`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const item = parseInt(btn.dataset.item);
                const index = parseInt(btn.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = [...(itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [])];
                costGroups.splice(index, 1);
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`input[name="itemCostGroupName"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const index = parseInt(event.target.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].name = event.target.value;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`select[name="itemCostType"]`).forEach(input => {
            input.addEventListener(`change`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const index = parseInt(event.target.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].type = event.target.value;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`input[name="itemBaseCurrencyAmount"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const index = parseInt(event.target.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].baseCurrencyAmount = event.target.value;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`select[name="itemBaseCurrencyCoin"]`).forEach(input => {
            input.addEventListener(`change`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const index = parseInt(event.target.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].baseCurrencyCoin = event.target.value;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`input[name="itemSpellCurrencyAmount"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const index = parseInt(event.target.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].spellCurrencyAmount = event.target.value;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`select[name="itemSpellCurrencyCoin"]`).forEach(input => {
            input.addEventListener(`change`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const index = parseInt(event.target.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].spellCurrencyCoin = event.target.value;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`input[name="itemItemAmount"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const index = parseInt(event.target.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].itemAmount = event.target.value;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element.querySelectorAll(`input[name="itemItemUuid"]`).forEach(input => {
            this._addDragDropHandlers(input, async(uuid) => {
                const item = parseInt(input.dataset.item);
                const index = parseInt(input.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].itemUuid = uuid;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });

            input.addEventListener(`blur`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const index = parseInt(event.target.dataset.index);
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];

                const costGroups = itemCustomizations[itemId.replaceAll(`.`, `-`)]?.costGroups || [];
                if (!costGroups[index]) return;

                costGroups[index].itemUuid = event.target.value;
                await this._updateItemCustomization(item, `costGroups`, costGroups);
            });
        });

        this.element?.querySelectorAll(`input[name="itemMaxUses"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                await this._updateItemCustomization(event.target.dataset.index, `maxUses`, event.target.value || null);
            });
        });

        this.element?.querySelectorAll(`select[name="itemRecovery"]`).forEach(select => {
            select.addEventListener(`change`, async(event) => {
                await this._updateItemCustomization(event.target.dataset.index, `recovery`, event.target.value === `default` ? null : event.target.value);
            });
        });

        this.element?.querySelectorAll(`.scroll-state-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = event.target.dataset.index;
                const newState = event.target.dataset.state;
                
                let asScrollValue;
                switch(newState) {
                    case `ignore`:
                        asScrollValue = null;
                        break;
                    case `disable`:
                        asScrollValue = false;
                        break;
                    case `enable`:
                        asScrollValue = true;
                        break;
                }
                
                await this._updateItemCustomization(index, `asScroll`, asScrollValue);
                
                this.element?.querySelectorAll(`.scroll-state-btn[data-index="${index}"]`).forEach(b => {
                    b.classList.remove(`active`);
                });
                event.target.classList.add(`active`);
            });
        });

        this.element?.querySelectorAll(`.advancement-checkbox`).forEach(checkbox => {
            checkbox.addEventListener(`change`, async(event) => {
                const item = parseInt(event.target.dataset.item);
                const advancementId = event.target.dataset.advancementId;
                const grants = this.activity?.grants ?? [];
                const itemId = grants[parseInt(item)];
                
                const itemUuid = itemId.replaceAll(`.`, `-`);

                if (!advancementIds[itemUuid])
                    advancementIds[itemUuid] = [];
                
                if (event.target.checked) {
                    if (!advancementIds[itemUuid].includes(advancementId)) {
                        advancementIds[itemUuid].push(advancementId);
                    }
                } else {
                    advancementIds[itemUuid] = advancementIds[itemUuid].filter(id => id !== advancementId);
                }

                if (advancementIds[itemUuid].length === 0)
                    delete advancementIds[itemUuid];
                
                await this.activity.update({ advancementIds: JSON.stringify(advancementIds) });
            });
        });
    }

    async _updateItemCustomization(index, property, value) {
        const grants = this.activity?.grants ?? [];
        const itemId = grants[parseInt(index)];
        if (!itemId) return;

        let itemCustomizations;
        try {
            itemCustomizations = JSON.parse(this.activity?.itemCustomizations || '{}');
        }
        catch {
            itemCustomizations = {};
        }

        const stored = itemId.replaceAll(`.`, `-`);
        if (!itemCustomizations[stored]) {
            itemCustomizations[stored] = {};
        }

        if (value === null || value === '' || (property.endsWith('Currency') && value === 'gp')) {
            delete itemCustomizations[stored][property];
            if (Object.keys(itemCustomizations[stored]).length === 0) {
                delete itemCustomizations[stored];
            }
        } else {
            itemCustomizations[stored][property] = value;
        }

        await this.activity.update({ 
            itemCustomizations: JSON.stringify(itemCustomizations) 
        });
    }
}
