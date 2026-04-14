import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `teleport`;

export class TeleportActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.maxTargets = new fields.StringField({
            required: false,
            initial: `1`,
        });

        schema.targetSelf = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.onlyTargetSelf = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.targetRadius = new fields.StringField({
            required: false,
            initial: `15`,
        });

        schema.teleportDistance = new fields.StringField({
            required: false,
            initial: `30`,
        });

        schema.manualPlacement = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.manualRadius = new fields.StringField({
            required: false,
            initial: `10`,
        });

        schema.keepArrangement = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.clusterRadius = new fields.StringField({
            required: false,
            initial: `5`,
        });

        schema.autoApply = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.appliedEffects = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true
        }), {
            required: false,
            initial: [],
        });

        return schema;
    }
}
