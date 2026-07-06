import { DomData } from '../../utils/dom.js';
import { FieldsData } from '../../utils/fields.js';
import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `wall`;

import { WallActivityData } from './WallActivityData.js';
import { WallActivitySheet } from './WallActivitySheet.js';
import { WallPlacementApp } from './WallPlacementApp.js';

export class WallActivity extends dnd5e.documents.activity.ActivityMixin(WallActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: WallActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return WallActivityData.defineSchema();
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

        const token = CanvasData.getOriginToken(this.actor);
        if (!token) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.wall.invalidScope.label`));
            return results;
        }

        new WallPlacementApp(this).render(true);
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
