import { DomData } from '../../utils/dom.js';
import { MessageData } from '../../utils/message.js';

const TEMPLATE_NAME = `advancement`;

export class AdvancementData {
    static applyListeners(message, html) {
        MessageData.addActivityButton(message, html, false,
            TEMPLATE_NAME, `Trigger Advancement`, async(activity) => {
                await activity._triggerAdvancements();
            }
        );
    }
}
