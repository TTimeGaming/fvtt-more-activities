import { DomData } from '../utils/dom.js';
import { FieldsData } from '../utils/fields.js';

const TEMPLATE_NAME = `restore`;

export class RestoreActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.targetItemName = new fields.StringField({
            required: false,
            blank: true,
            initial: ``,
        });

        schema.matchContains = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.restoreAmount = new fields.StringField({
            required: false,
            initial: `1`,
        });

        schema.restoreToMax = new fields.BooleanField({
            required: false,
            initial: false,
        });

        return schema;
    }
}

export class RestoreActivitySheet extends dnd5e.applications.activity.ActivitySheet {
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
        context.targetItemName = this.activity?.targetItemName ?? ``;
        context.matchContains = this.activity?.matchContains ?? false;
        context.restoreAmount = this.activity?.restoreAmount ?? `1`;
        context.restoreToMax = this.activity?.restoreToMax ?? false;
        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        DomData.setupSheetBehaviors(this);
    }
}

export class RestoreActivity extends dnd5e.documents.activity.ActivityMixin(RestoreActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: RestoreActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return RestoreActivityData.defineSchema();
    }

    /**
     * Execute the restore activity.
     * @param {ActivityUseConfiguration} config - Configuration data for the activity usage.
     * @param {ActivityDialogConfiguration} dialog - Configuration data for the activity dialog.
     * @param {ActivityMessageConfiguration} message - Configuration data for the activity message.
     * @returns {Promise<ActivityUsageResults|void>}
     */
    async use(config, dialog, message) {
        const results = await super.use(config, dialog, message);
        if (results === undefined) return results;

        if (!this.actor) {
            ui.notifications.error(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.restore.errors.noActor`));
            return results;
        }

        const targetItemName = (this.targetItemName ?? ``).trim();
        if (targetItemName === ``) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.restore.errors.noItemName`));
            return results;
        }

        const normalizedTargetName = targetItemName.toLowerCase();
        const matches = this.actor.items.filter((actorItem) => {
            const itemName = actorItem?.name?.trim()?.toLowerCase();
            if (!itemName) return false;
            return this.matchContains ? itemName.includes(normalizedTargetName) : itemName === normalizedTargetName;
        });

        if (matches.length === 0) {
            ui.notifications.warn(game.i18n.format(`DND5E.ACTIVITY.FIELDS.restore.errors.noMatch`, { itemName: targetItemName }));
            return results;
        }

        if (matches.length > 1) {
            ui.notifications.info(game.i18n.format(`DND5E.ACTIVITY.FIELDS.restore.multipleMatches.label`, { count: matches.length }));
        }

        const targetItem = matches[0];
        const uses = targetItem.system?.uses ?? {};

        const maxUses = this._parseUsesNumber(uses.max);
        const hasMaxUses = maxUses !== null;

        const valueUses = this._parseUsesNumber(uses.value);
        const hasValueUses = valueUses !== null;

        const spentUses = this._parseUsesNumber(uses.spent);
        const hasSpentUses = spentUses !== null;

        const hasTrackableUses =
            (hasMaxUses && maxUses > 0) ||
            (hasValueUses && valueUses > 0) ||
            (hasSpentUses && spentUses > 0)
        ;

        if (!hasTrackableUses) {
            ui.notifications.warn(game.i18n.format(`DND5E.ACTIVITY.FIELDS.restore.errors.noUses`, { itemName: targetItem.name }));
            return results;
        }

        let currentUses = hasValueUses ? valueUses : 0;
        if (!hasValueUses && hasMaxUses) {
            currentUses = Math.max(0, maxUses - (hasSpentUses ? spentUses : 0));
        }

        let nextUses = currentUses;
        let restoreResolution = null;
        if (this.restoreToMax) {
            if (!hasMaxUses) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.restore.errors.maxRequired`));
                return results;
            }
            nextUses = maxUses;
        }
        else {
            restoreResolution = await this._resolveRestoreAmount(this.restoreAmount, targetItem);

            if (restoreResolution.amount === 0) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.restore.errors.invalidAmount`));
                return results;
            }
            nextUses = currentUses + restoreResolution.amount;
        }

        if (hasMaxUses) {
            nextUses = Math.max(0, Math.min(maxUses, nextUses));
        }
        else {
            nextUses = Math.max(0, nextUses);
        }

        const changeAmount = nextUses - currentUses;
        if (changeAmount === 0) {
            const alreadyKey = restoreResolution?.amount < 0 ?
                `DND5E.ACTIVITY.FIELDS.restore.alreadyEmpty.label` :
                `DND5E.ACTIVITY.FIELDS.restore.alreadyFull.label`
            ;
            ui.notifications.info(game.i18n.format(alreadyKey, { itemName: targetItem.name }));
            return results;
        }

        if (restoreResolution?.roll) {
            await this._postRestoreRoll(restoreResolution.roll, targetItem.name, restoreResolution.formula, changeAmount);
        }

        const updates = {
            'system.uses.value': nextUses,
        };

        if (hasMaxUses) {
            updates['system.uses.spent'] = Math.max(0, maxUses - nextUses);
        }
        else if (hasSpentUses) {
            updates['system.uses.spent'] = Math.max(0, spentUses - changeAmount);
        }

        await targetItem.update(updates);

        await this._postRestoreSummary({
            targetItem: targetItem,
            changeAmount: changeAmount,
            previousUses: currentUses,
            nextUses: nextUses,
            maxUses: hasMaxUses ? maxUses : null,
        });

        const successKey = changeAmount < 0 ?
            `DND5E.ACTIVITY.FIELDS.restore.spent.label` :
            `DND5E.ACTIVITY.FIELDS.restore.success.label`
        ;
        ui.notifications.info(game.i18n.format(successKey, {
            itemName: targetItem.name,
            amount: Math.abs(changeAmount),
        }));

        return results;
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null
     */
    get actor() {
        return this.item?.actor || null;
    }

    /**
     * Parse uses-related values from dnd5e data, treating empty values as missing.
     * @param {*} value
     * @returns {number|null}
     * @private
     */
    _parseUsesNumber(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === `string` && value.trim() === ``) return null;

        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        return parsed;
    }

    /**
     * Resolve a restore formula or fixed number to a signed integer.
     * @param {string} formula
     * @param {Item5e} targetItem
     * @returns {Promise<{amount: number, roll: Roll|null, formula: string}>}
     * @private
     */
    async _resolveRestoreAmount(formula, targetItem) {
        return FieldsData.resolveFormulaWithRoll(
            formula,
            [this.item, targetItem, targetItem?.actor],
            0,
            { allowNegative: true }
        );
    }

    /**
     * Post the restore roll to chat.
     * @param {Roll} roll
     * @param {string} itemName
     * @param {string} formula
     * @param {number} changeAmount
     * @returns {Promise<void>}
     * @private
     */
    async _postRestoreRoll(roll, itemName, formula, changeAmount) {
        if (!roll || typeof roll.toMessage !== `function`) return;

        const flavorKey = changeAmount < 0 ?
            `DND5E.ACTIVITY.FIELDS.restore.chat.rollFlavorSpent` :
            `DND5E.ACTIVITY.FIELDS.restore.chat.rollFlavorRestore`
        ;
        const flavor = game.i18n.format(flavorKey, {
            itemName: itemName,
            formula: formula,
        });

        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: flavor,
        });
    }

    /**
     * Post restore results summary to chat.
     * @param {Object} params
     * @param {Item5e} params.targetItem
     * @param {number} params.changeAmount
     * @param {number} params.previousUses
     * @param {number} params.nextUses
     * @param {number|null} params.maxUses
     * @returns {Promise<void>}
     * @private
     */
    async _postRestoreSummary({ targetItem, changeAmount, previousUses, nextUses, maxUses }) {
        const templateData = {
            targetItemName: targetItem?.name ?? ``,
            changeLabel: game.i18n.localize(
                changeAmount < 0 ?
                    `DND5E.ACTIVITY.FIELDS.restore.chat.summary.spent.label` :
                    `DND5E.ACTIVITY.FIELDS.restore.chat.summary.restored.label`
            ),
            changeAmount: changeAmount > 0 ? `+${changeAmount}` : `${changeAmount}`,
            previousUsesLabel: Number.isFinite(maxUses) ? `${previousUses}/${maxUses}` : `${previousUses}`,
            nextUsesLabel: Number.isFinite(maxUses) ? `${nextUses}/${maxUses}` : `${nextUses}`,
        };

        const templatePath = `modules/more-activities/templates/restore-result.hbs`;
        const content = game.version.startsWith(`12`) ?
            await renderTemplate(templatePath, templateData) :
            await foundry.applications.handlebars.renderTemplate(templatePath, templateData)
        ;

        await ChatMessage.create({
            content: content,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        });
    }
}
