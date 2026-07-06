import { DomData } from '../../utils/dom.js';
import { MessageData } from '../../utils/message.js';

const TEMPLATE_NAME = `macro`;

export class MacroData {
    static applyListeners(message, html) {
        MessageData.addActivityButton(message, html, false,
            TEMPLATE_NAME, `Run Macro`, (activity) => {
                activity.executeConfiguredMacro();
            }
        );
    }
}
