// should be the same as teleport!

import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `movement`;

export class MovementActivityData extends dnd5e.dataModels.activity.BaseActivityData {
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

        schema.targetRange = new fields.StringField({
            required: false,
            initial: `30`,
        });

        schema.movementDistance = new fields.StringField({
            required: false,
            initial: `10`,
        });

        schema.movementType = new fields.StringField({
            required: false,
            initial: `push`,
            options: [ `push`, `pull`, `either`, `free` ],
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
