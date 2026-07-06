import { DomData } from '../../utils/dom.js';

const TEMPLATE_NAME = `sound`;

export class SoundActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.soundFile = new fields.FilePathField({
            required: false,
            blank: true,
            initial: ``,
            categories: [ `AUDIO` ],
        });

        schema.playForAll = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.volume = new fields.NumberField({
            required: false,
            initial: 0.8,
            min: 0,
            max: 1,
        });

        return schema;
    }
}
