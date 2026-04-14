import { MessageData } from '../../utils/message.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `grant`;

export class GrantSelectionApp extends HandlebarsApplicationMixin(ApplicationV2) {
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

        const activityUses = new Map();
        const activityConsume = new Map();

        let activityBaseCost = 0;
        let activityPerLevelCost = 0;

        for (const group of this.activity.costGroups) {
            switch (group.type) {
                case `currency`:
                    activityBaseCost += FieldsData.resolveCurrency(FieldsData.resolveFormula(group.baseCurrencyAmount, this.activity.item, 0), group.baseCurrencyCoin);
                    activityPerLevelCost += FieldsData.resolveCurrency(FieldsData.resolveFormula(group.spellCurrencyAmount, this.activity.item, 0), group.spellCurrencyCoin);
                    break;
                case `itemUses`:
                case `itemConsume`:
                    const uuid = group.itemUuid || this.activity.item.id;
                    const amount = FieldsData.resolveFormula(group.itemAmount, this.activity.item, 1);
                    if (group.type === `itemUses`)
                        activityUses.set(uuid, (activityUses.get(uuid) || 0) + amount);
                    if (group.type === `itemConsume`)
                        activityConsume.set(uuid, (activityConsume.get(uuid) || 0) + amount);
                    break;
            }
        }

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
            const rootItem = await fromUuid(grant);
            if (rootItem == null) continue;
            
            const item = rootItem.toObject();

            const itemUses = new Map(activityUses);
            const itemConsume = new Map(activityConsume);

            const customization = itemCustomizations[grant.replaceAll(`.`, `-`)] ?? {};
            if (customization.maxUses)
                customization.maxUses = FieldsData.resolveFormula(customization.maxUses, this.activity.item);
            if (customization.recovery)
                customization.recovery = recoveryTable[customization.recovery];

            let itemBaseCost = 0;
            let itemPerLevelCost = 0;
            
            for (const group of (customization?.costGroups || [])) {
                switch (group.type) {
                    case `currency`:
                        itemBaseCost += FieldsData.resolveCurrency(FieldsData.resolveFormula(group.baseCurrencyAmount, this.activity.item, 0), group.baseCurrencyCoin);
                        itemPerLevelCost += FieldsData.resolveCurrency(FieldsData.resolveFormula(group.spellCurrencyAmount, this.activity.item, 0), group.spellCurrencyCoin);
                        break;
                    case `itemUses`:
                    case `itemConsume`:
                        const uuid = group.itemUuid || this.activity.item.id;
                        const amount = FieldsData.resolveFormula(group.itemAmount, this.activity.item, 1);
                        if (group.type === `itemUses`)
                            itemUses.set(uuid, (itemUses.get(uuid) || 0) + amount);
                        if (group.type === `itemConsume`)
                            itemConsume.set(uuid, (itemConsume.get(uuid) || 0) + amount);
                        break;
                }
            }

            let totalCost = 0;
            totalCost += activityBaseCost;
            totalCost += itemBaseCost;
            
            if (item.type === `spell`) {
                const spellLevel = item.system?.level || 0;
                totalCost += activityPerLevelCost * spellLevel;
                totalCost += itemPerLevelCost * spellLevel;
            }

            const canAffordCurrency = totalCost === 0 || actorFunds >= totalCost;

            let canAffordItems = true;
            let affordabilityIssue = null;

            const consumptions = [];
            for (const [uuid, usesNeeded] of itemUses) {
                const actorItem = this.actor.items.find(i => i.id === uuid || i._source?._stats.compendiumSource === uuid);
                if (!actorItem) {
                    canAffordItems = false;
                    affordabilityIssue = `Missing required item`;

                    const item = await fromUuid(uuid);
                    consumptions.push({
                        type: `itemUses`,
                        itemName: item.name,
                        canAfford: false,
                        amount: usesNeeded,
                        available: 0,
                    });
                    break;
                }

                const maxUses = actorItem.system?.uses?.max ?? Infinity;
                const usedUses = actorItem.system?.uses?.spent || 0;
                const availableUses = maxUses - usedUses;

                consumptions.push({
                    type: `itemUses`,
                    itemName: actorItem.name,
                    canAfford: availableUses >= usesNeeded,
                    amount: usesNeeded,
                    available: availableUses,
                });

                if (availableUses < usesNeeded) {
                    canAffordItems = false;
                    affordabilityIssue = `Insufficient item uses`;
                    break;
                }
            }

            for (const [uuid, quantityNeeded] of itemConsume) {
                const actorItem = this.actor.items.find(i => i.id === uuid || i._source?._stats.compendiumSource === uuid);
                if (!actorItem) {
                    canAffordItems = false;
                    affordabilityIssue = `Missing required item`;

                    const item = await fromUuid(uuid);
                    consumptions.push({
                        type: `itemConsume`,
                        itemName: item.name,
                        canAfford: false,
                        amount: quantityNeeded,
                        available: 0,
                    });
                    break;
                }

                const availableQuantity = actorItem.system?.quantity || Infinity;

                consumptions.push({
                    type: `itemConsume`,
                    itemName: actorItem.name,
                    canAfford: availableQuantity >= quantityNeeded,
                    amount: quantityNeeded,
                    available: availableQuantity,
                });

                if (availableQuantity < quantityNeeded) {
                    canAffordItems = false;
                    affordabilityIssue = `Insufficient item quantity`;
                    break;
                }
            }

            const canAfford = canAffordCurrency && canAffordItems;
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
                disabledText: !canAfford ? (affordabilityIssue || `Insufficient Funds`) : !isSelected && this.selectedItems.length >= this.maxItems ? `Selection Limit Reached` : null,
                currencyCost: cost,
                itemUses: itemUses,
                itemConsume: itemConsume,
                affordable: canAfford,
                customization: customization,
                asScroll: asScroll,
                consumptionRequirements: consumptions,
            });
        }

        return {
            count: grants.filter(item => !item.disabled && item.selected).length,
            available: this.maxItems,
            isLocked: this.selectedItems.length === this.maxItems,
            swappable: this.activity.swappable,
            items: grants,
            actorFunds: funds,
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        DomData.addSubtitle(this.element, this.activity);

        this.element.querySelectorAll(`.item-choice`).forEach(checkbox => {
            checkbox.addEventListener(`change`, () => {
                if (checkbox.checked && !this.selectedItems.includes(checkbox.dataset.uuid))
                    this.selectedItems.push(checkbox.dataset.uuid);
                else if (!checkbox.checked) {
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

            let advancementIds;
            try {
                advancementIds = JSON.parse(this.activity?.advancementIds);
            }
            catch {
                advancementIds = {};
            }

            const toCopper = (currency) => ((currency.pp ?? 0) * 1000) + ((currency.gp ?? 0) * 100) + ((currency.ep ?? 0) * 50) + ((currency.sp ?? 0) * 10) + (currency.cp ?? 0);

            let totalCost = 0;
            const itemUses = new Map();
            const itemConsume = new Map();

            const itemAdvancements = [];

            const grants = [];
            for (const grant of newItems) {
                const item = context.items.find(i => i.uuid === grant);
                if (!item || item.disabled) continue;

                const originalItem = await fromUuid(grant);
                const customization = itemCustomizations[grant.replaceAll(`.`, `-`)] || {};

                let itemData = originalItem.toObject();
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

                totalCost += toCopper(item.currencyCost);
                for (const [uuid, usesNeeded] of item.itemUses)
                    itemUses.set(uuid, (itemUses.get(uuid) || 0) + usesNeeded);
                for (const [uuid, quantityNeeded] of item.itemConsume)
                    itemConsume.set(uuid, (itemConsume.get(uuid) || 0) + quantityNeeded);

                grants.push({
                    ...itemData,
                    uuid: grant,
                });

                const itemAdvancementIds = advancementIds[grant.replaceAll(`.`, `-`)];
                if (itemAdvancementIds?.length > 0)
                    itemAdvancements.push({ originalItem, itemAdvancementIds });
            }

            const result = await FieldsData.deductActorFunds(this.actor, Math.round(totalCost) / 100);
            if (!result.success) {
                ui.notifications.error(`Insufficient funds for items!`);
                return;
            }
            await this.actor.update({ 'system.currency': result.remainingFunds });

            for (const [uuid, usesNeeded] of itemUses) {
                const actorItem = this.actor.items.find(i => i.id === uuid || i._source?._stats.compendiumSource === uuid);
                const availableUses = actorItem.system?.uses?.value || Infinity;

                if (availableUses !== Infinity) {
                    await actorItem.update({
                        'system.uses.value': actorItem.system.uses.value - usesNeeded,
                        'system.uses.spent': (actorItem.system.uses.spent ?? 0) + usesNeeded
                    });
                }
            }

            for (const [uuid, quantityNeeded] of itemConsume) {
                const actorItem = this.actor.items.find(i => i.id === uuid || i._source?._stats.compendiumSource === uuid);
                const availableQuantity = actorItem.system?.quantity || Infinity;
                if (availableQuantity !== Infinity) {
                    const remaining = actorItem.system.quantity - quantityNeeded;
                    if (remaining > 0)
                        await actorItem.update({ 'system.quantity': remaining });
                    else
                        await this.actor.deleteEmbeddedDocuments(`Item`, [actorItem.id], { isUndo: true });
                }
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

            for (const { originalItem, itemAdvancementIds } of itemAdvancements) {
                const createdItem = items.find(item =>
                    item.name === originalItem.name &&
                    item.type === originalItem.type
                );

                if (createdItem)
                    await this._triggerAdvancements(createdItem, itemAdvancementIds);
            }

            this.close();
        });
    }

    async _triggerAdvancements(sourceItem, advancementIds) {
        if (!sourceItem || !advancementIds?.length) return;

        try {
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
            for (const advancementId of advancementIds) {
                const advancement = actorItem.system.advancement?.[advancementId];
                if (!advancement) {
                    console.warn(`Advancement ${advancementId} not found on item ${actorItem.name}`);
                    continue;
                }

                const level = advancement.level || actorItem.system.details?.level || 1;
                const flow = new advancement.metadata.apps.flow(clonedItem, advancement.id, level);
                flow.item = clonedItem;
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
}
