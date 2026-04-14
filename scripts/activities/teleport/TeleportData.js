import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `teleport`;

import { TeleportTargetApp } from './TeleportTargetApp.js';

export class TeleportData {
    static adjustActivitySheet(sheet, html) {
        if (!sheet?.activity?.item || sheet?.activity?.type !== TEMPLATE_NAME) return;

        sheet.element.classList.add(`teleport-activity`);
        DomData.disableTab(html, `activation-targeting`, game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.blockedTargeting.label`));
        DomData.disableInputElement(html, `.tab[data-tab="identity"] dnd5e-checkbox[name="target.prompt"]`, game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.blockedPrompt.label`));
    }

    static applyListeners(message, html) {
        MessageData.addActivityButton(message, html, true,
            TEMPLATE_NAME, `Teleport`, (activity) => {
                new TeleportTargetApp(activity).render(true);
            }
        );
    }
}
