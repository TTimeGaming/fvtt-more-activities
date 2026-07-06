import { MessageData } from '../../utils/message.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `grant`;

import { GrantSelectionApp } from './GrantSelectionApp.js';

export class GrantData {
    static async applyListeners(message, html) {
        MessageData.addActivityButton(message, html, false,
            TEMPLATE_NAME, `Grant Item(s)`, (activity) => {
                new GrantSelectionApp(activity).render(true);
            }
        );
    }
}
