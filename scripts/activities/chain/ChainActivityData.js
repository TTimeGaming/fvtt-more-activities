import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `chain`;

export class ChainActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.chainedActivityIds = new fields.ArrayField(new fields.StringField({
            required: true,
            blank: false,
        }), {
            required: false,
            initial: [],
        });

        schema.chainedActivityNames = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: false,
        }), {
            required: false,
            initial: [],
        });

        schema.chainTriggers = new fields.ArrayField(new fields.ArrayField(
            new fields.StringField({
                required: true,
                blank: false,
            }), {
                required: false,
                initial: [],
            }),
        {
            required: false,
            initial: [],
        });

        schema.chainListeners = new fields.ArrayField(new fields.ArrayField(
            new fields.StringField({
                required: true,
                blank: false,
            }), {
                required: false,
                initial: [],
            }),
        {
            required: false,
            initial: [],
        });
        
        return schema;
    }
}
