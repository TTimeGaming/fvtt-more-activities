import { DomData } from '../../utils/dom.js';
import { MessageData } from '../../utils/message.js';

const TEMPLATE_NAME = `advancement`;

export class AdvancementActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.sourceItem = new fields.StringField({
            required: false,
            blank: true,
        });

        schema.advancementIds = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true,
        }), {
            required: false,
            initial: [],
        });

        schema.allowReselection = new fields.BooleanField({
            required: false,
            initial: true,
        });

        return schema;
    }
}
