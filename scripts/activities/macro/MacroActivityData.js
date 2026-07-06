import { DomData } from '../../utils/dom.js';
import { MessageData } from '../../utils/message.js';

const TEMPLATE_NAME = `macro`;

export class MacroActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.macroSource = new fields.StringField({
            required: false,
            initial: `code`,
            choices: [ `code`, `world` ],
        });

        schema.worldMacroId = new fields.StringField({
            required: false,
            blank: true,
            initial: ``,
        });

        schema.macroCode = new fields.StringField({
            required: false,
            blank: true,
            initial: `// Write your macro code here\n// Available variables: activity, item, macro\nconsole.log("Macro activity executed!", { activity, item, actor });`
        });

        return schema;
    }
}
