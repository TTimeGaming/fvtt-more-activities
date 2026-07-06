import { DomData } from '../../utils/dom.js';
import { FieldsData } from '../../utils/fields.js';
import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `wall`;

export class WallActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.maxWalls = new fields.StringField({
            required: false,
            initial: `1`,
        });

        schema.wallType = new fields.StringField({
            required: false,
            initial: `continuous`,
            options: [ `continuous`, `circular`, ],
        });

        schema.facing = new fields.StringField({
            required: false,
            initial: `both`,
            options: [ `both`, `towards`, `away`, `any`, ],
        });

        schema.panelSize = new fields.StringField({
            required: false,
            initial: `5`,
        });

        schema.panelSpacing = new fields.StringField({
            required: false,
            initial: `0`,
        });

        schema.maxPanels = new fields.StringField({
            required: false,
            initial: ``,
        });

        schema.referenceRange = new fields.StringField({
            required: false,
            initial: `0`,
        });

        schema.maxLength = new fields.StringField({
            required: false,
            initial: `60`,
        });

        schema.blocksMovement = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.blocksSight = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.blocksSound = new fields.BooleanField({
            required: false,
            initial: false,
        });

        return schema;
    }
}
