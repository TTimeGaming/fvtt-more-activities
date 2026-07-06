import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `teleport`;

export class TeleportActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-${TEMPLATE_NAME}` ]
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/${TEMPLATE_NAME}-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        },
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
        context.targetRadius = this.activity?.targetRadius ?? 15;
        context.teleportDistance = this.activity?.teleportDistance ?? 30;
        context.manualPlacement = this.activity?.manualPlacement ?? false;
        context.manualRadius = this.activity?.manualRadius ?? 10;
        context.keepArrangement = this.activity?.keepArrangement ?? true;
        context.clusterRadius = this.activity?.clusterRadius ?? 5;
        context.autoApply = this.activity?.autoApply ?? false;
        context.appliedEffects = this.activity?.appliedEffects || [];

        context.availableEffects = this.item?.effects?.map(effect => ({
            id: effect.id,
            name: effect.name,
            icon: effect.img
        })) || [];

        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        DomData.setupSheetBehaviors(this);
    }
}
