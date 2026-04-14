// should be the same as teleport!

import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `movement`;

export class MovementActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-${TEMPLATE_NAME}` ],
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/${TEMPLATE_NAME}-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        }
    };

    /** @inheritdoc */
    async _prepareContext(options) {
        ensureActivityInferredSource(this.activity);
        return super._prepareContext(options);
    }

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);
        
        context.maxTargets = this.activity?.maxTargets ?? 1;
        context.targetSelf = this.activity?.targetSelf ?? false;
        context.onlyTargetSelf = this.activity?.onlyTargetSelf ?? false;
        context.targetRange = this.activity?.targetRange ?? 30;
        context.movementDistance = this.activity?.movementDistance ?? 10;
        context.movementType = this.activity?.movementType ?? `push`;
        context.autoApply = this.activity?.autoApply ?? false;
        context.appliedEffects = this.activity?.appliedEffects || [];

        context.availableEffects = this.item?.effects?.map(effect => ({
            id: effect.id,
            name: effect.name,
            icon: effect.img
        })) || [];

        context.movementTypeOptions = [
            { value: `push`, label: `Push (Away)`, selected: context.movementType === `push` },
            { value: `pull`, label: `Pull (Toward)`, selected: context.movementType === `pull` },
            { value: `either`, label: `Either (Choose)`, selected: context.movementType === `either` },
            { value: `free`, label: `Free Movement`, selected: context.movementType === `free` },
        ];

        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        DomData.setupSheetBehaviors(this);
    }
}
