import { MessageData } from '../utils/message.js';
import { FieldsData } from '../utils/fields.js';
import { DomData } from '../utils/dom.js';
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

        schema.itemCustomizations = new fields.StringField({
            required: false,
            blank: false,
            initial: `{}`,
        });

        schema.baseCost = new fields.StringField({
            required: false,
            initial: `0`,
        });

        schema.baseCostCurrency = new fields.StringField({
            required: false,
            initial: `gp`,
            options: [ `pp`, `gp`, `ep`, `sp`, `cp` ]
        });

        schema.spellCostPerLevel = new fields.StringField({
            required: false,
            initial: `0`,
        });

        schema.spellCostPerLevelCurrency = new fields.StringField({
            required: false,
            initial: `gp`,
            options: [ `pp`, `gp`, `ep`, `sp`, `cp` ]
        });

        schema.limitedDuration = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.spellsAsScrolls = new fields.BooleanField({
            required: false,
            initial: false,
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

    constructor(options = {}) {
        super(options);
        // this.openCustomization = null;
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

        const grants = [];
        for (const itemId of (this.activity?.grants ?? [])) {
            const item = await fromUuid(itemId);
            const customization = itemCustomizations[itemId.replace(`.`, `-`)] ?? {};

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
                name: item.name,
                img: item.img,
                type: game.i18n.localize(`TYPES.Item.${item.type}`),
                uuid: itemId,
                isCustomized: isCustomized,
                isSpell: item.type === `spell`,
                maxUses: item.system?.uses?.max,
                hasUses: item.system?.uses?.max !== undefined && item.system?.uses?.max != null,
                customization: customization,
                recoveryOptions: recoveryOptions,
                scrollStates: scrollStates,
            });
        }

        context.grantAll = this.activity?.grantAll ?? true;
        context.count = this.activity?.count ?? `1`;
        context.swappable = this.activity?.swappable ?? false;
        context.current = this.activity?.current ?? ``;
        context.baseCost = this.activity?.baseCost ?? `0`;
        context.baseCostCurrency = this.activity?.baseCostCurrency ?? `gp`;
        context.spellCostPerLevel = this.activity?.spellCostPerLevel ?? `0`;
        context.spellCostPerLevelCurrency = this.activity?.spellCostPerLevelCurrency ?? `gp`;
        context.limitedDuration = this.activity?.limitedDuration ?? false;
        context.spellsAsScrolls = this.activity?.spellsAsScrolls ?? false;
        context.currencyOptions = [ `pp`, `gp`, `ep`, `sp`, `cp` ];

        context.grants = grants.map((element, index) => ({
            ...element,
            index: index,
            isOpen: this.openCustomization === index,
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
                    const uuid = event.target.dataset.uuid.replace(`.`, `-`);
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

        this._addDragDropHandlers(input);
        this._addCustomizationListeners();
        DomData.setupSheetBehaviors(this);
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);
        this.activity.current = ``;
        this.openCustomization = null;
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

    _addCustomizationListeners() {
        this.element?.querySelectorAll(`input[name="itemIndividualCost"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                await this._updateItemCustomization(event.target.dataset.index, `individualCost`, event.target.value || null);
            });
        });

        this.element?.querySelectorAll(`select[name="itemIndividualCostCurrency"]`).forEach(select => {
            select.addEventListener(`change`, async(event) => {
                await this._updateItemCustomization(event.target.dataset.index, `individualCostCurrency`, event.target.value);
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

        this.element?.querySelectorAll(`input[name="itemSpellCostPerLevel"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                await this._updateItemCustomization(event.target.dataset.index, `spellCostPerLevel`, event.target.value || null);
            });
        });

        this.element?.querySelectorAll(`select[name="itemSpellCostPerLevelCurrency"]`).forEach(select => {
            select.addEventListener(`change`, async(event) => {
                await this._updateItemCustomization(event.target.dataset.index, `spellCostPerLevelCurrency`, event.target.value);
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

        const stored = itemId.replace(`.`, `-`);
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
        classes: [ `dnd5e2`, `standard-form`, `grant-selection-app` ],
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
            this.startingItems = [...activity.grants];
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
        let actorFunds = 0;
        let funds = {};
        if (this.actor?.system?.currency) {
            funds = this.actor.system.currency;
            actorFunds += FieldsData.resolveCurrency(this.actor.system.currency.pp, `pp`);
            actorFunds += FieldsData.resolveCurrency(this.actor.system.currency.gp, `gp`);
            actorFunds += FieldsData.resolveCurrency(this.actor.system.currency.ep, `ep`);
            actorFunds += FieldsData.resolveCurrency(this.actor.system.currency.sp, `sp`);
            actorFunds += FieldsData.resolveCurrency(this.actor.system.currency.cp, `cp`);
        }

        const activityBaseCost = FieldsData.resolveFormula(this.activity.baseCost, this.activity.item, 0);
        const activityPerLevelCost = FieldsData.resolveFormula(this.activity.spellCostPerLevel, this.activity.item, 0);

        let itemCustomizations;
        try {
            itemCustomizations = JSON.parse(this.activity?.itemCustomizations);
        }
        catch {
            itemCustomizations = {};
        }

        const recoveryTable = {
            'default': null,
            'sr': `Short Rest`,
            'lr': `Long Rest`,
            'day': `Day`,
        };
        
        const grants = [];
        for (const grant of (this.activity.grants ?? [])) {
            const item = (await fromUuid(grant)).toObject();

            const customization = itemCustomizations[grant.replace(`.`, `-`)] ?? {};
            if (customization.maxUses)
                customization.maxUses = FieldsData.resolveFormula(customization.maxUses, this.activity.item);
            if (customization.recovery)
                customization.recovery = recoveryTable[customization.recovery];

            const itemBaseCost = FieldsData.resolveFormula(customization.individualCost, this.activity.item, 0);
            const itemPerLevelCost = FieldsData.resolveFormula(customization.spellCostPerLevel, this.activity.item, 0);

            let totalCost = 0;
            totalCost += FieldsData.resolveCurrency(activityBaseCost, this.activity.baseCostCurrency);
            totalCost += FieldsData.resolveCurrency(itemBaseCost, customization.individualCostCurrency);
            
            if (item.type === `spell`) {
                const spellLevel = item.system?.level || 0;
                totalCost += FieldsData.resolveCurrency(activityPerLevelCost * spellLevel, this.activity.spellCostPerLevelCurrency);
                totalCost += FieldsData.resolveCurrency(itemPerLevelCost * spellLevel, customization.spellCostPerLevelCurrency);
            }

            const canAfford = totalCost === 0 || actorFunds >= totalCost;
            const isSelected = canAfford && this.selectedItems.includes(grant);
            const isDisabled = (!canAfford && !isSelected) || (this.selectedItems.length >= this.maxItems && !isSelected);
            const localAsScroll = customization.asScroll ?? null;

            let asScroll = localAsScroll ?? false;
            if (localAsScroll == null) {
                asScroll = this.activity.spellsAsScrolls;
            }

            totalCost = Math.round(totalCost * 100) / 100;
            let cost = {
                pp: 0,
                gp: 0,
                sp: 0,
                cp: 0,
            };

            if (totalCost > 10) {
                cost.pp = Math.floor(totalCost / 10);
                totalCost -= cost.pp * 10;
                totalCost = Math.round(totalCost * 100) / 100;
            }

            if (totalCost > 1) {
                cost.gp = Math.floor(totalCost / 1);
                totalCost -= cost.gp * 1;
                totalCost = Math.round(totalCost * 100) / 100;
            }

            if (totalCost > 0.1) {
                cost.sp = Math.floor(totalCost * 10);
                totalCost -= cost.sp / 10;
                totalCost = Math.round(totalCost * 100) / 100;
            }

            if (totalCost > 0.01) {
                cost.cp = Math.floor(totalCost * 100);
                totalCost -= cost.cp / 100;
                totalCost = Math.round(totalCost * 100) / 100;
            }

            grants.push({
                ...item,
                isSpell: item.type === `spell`,
                type: game.i18n.localize(`TYPES.Item.${item.type}`),
                uuid: grant,
                selected: isSelected,
                disabled: isDisabled,
                disabledText: !canAfford ? `Insufficient Funds` : !isSelected && this.selectedItems.length >= this.maxItems ? `Selection Limit Reached` : null,
                cost: cost,
                affordable: canAfford,
                customization: customization,
                asScroll: asScroll,
            });
        }

        return {
            count: grants.filter(item => !item.disabled).length,
            available: this.maxItems,
            isLocked: this.selectedItems.length === this.maxItems,
            swappable: this.activity.swappable,
            items: grants,
            actorFunds: funds,
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

            let itemCustomizations;
            try {
                itemCustomizations = JSON.parse(this.activity?.itemCustomizations);
            }
            catch {
                itemCustomizations = {};
            }

            const activityBaseCost = FieldsData.resolveFormula(this.activity.baseCost, this.activity.item, 0);
            const activityPerLevelCost = FieldsData.resolveFormula(this.activity.spellCostPerLevel, this.activity.item, 0);

            let totalCost = 0;
            const grants = [];
            for (const grant of newItems) {
                const originalItem = await fromUuid(grant);
                const customization = itemCustomizations[grant.replace(`.`, `-`)] || {};

                let itemData = originalItem.toObject();
                const spellLevel = itemData.type === `spell` ? itemData.system?.level ?? 0 : 0;

                if (itemData.type === `spell`) {
                    const localAsScroll = customization.asScroll ?? null;

                    let asScroll = localAsScroll ?? false;
                    if (localAsScroll == null) {
                        asScroll = this.activity.spellsAsScrolls;
                    }

                    if (asScroll) {
                        const scrollItem = await dnd5e.documents.Item5e.createScrollFromSpell(itemData, {}, { dialog: false });
                        itemData = scrollItem.toObject();
                    }
                }

                const itemBaseCost = FieldsData.resolveFormula(customization.individualCost, this.activity.item, 0);
                const itemPerLevelCost = FieldsData.resolveFormula(customization.spellCostPerLevel, this.activity.item, 0);

                let itemCost = 0;
                itemCost += FieldsData.resolveCurrency(activityBaseCost, this.activity.baseCostCurrency);
                itemCost += FieldsData.resolveCurrency(itemBaseCost, customization.individualCostCurrency);

                if (spellLevel > 0) {
                    itemCost += FieldsData.resolveCurrency(activityPerLevelCost * spellLevel, this.activity.spellCostPerLevelCurrency);
                    itemCost += FieldsData.resolveCurrency(itemPerLevelCost * spellLevel, customization.spellCostPerLevelCurrency);
                }

                totalCost += itemCost;

                if (customization.maxUses) {
                    const maxUses = FieldsData.resolveFormula(customization.maxUses, this.activity.item);
                    itemData.system.uses.max = maxUses;
                    itemData.system.uses.value = maxUses;
                }

                if (customization.recovery) {
                    itemData.system.uses.recovery.push({
                        period: customization.recovery,
                        type: `recoverAll`,
                    });
                }

                grants.push({
                    ...itemData,
                    uuid: grant,
                });
            }

            const result = await FieldsData.deductActorFunds(this.actor, Math.round(totalCost * 100) / 100);
            if (!result.success) {
                ui.notifications.error(`Insufficient funds for items!`);
                return;
            }
            await this.actor.update({ 'system.currency': result.remainingFunds });

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
