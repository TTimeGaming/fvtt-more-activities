import { DomData } from '../../utils/dom.js';
import { FieldsData } from '../../utils/fields.js';
import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `wall`;

export class WallActivitySheet extends dnd5e.applications.activity.ActivitySheet {
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

        context.maxWalls = this.activity?.maxWalls ?? `1`;
        context.wallType = this.activity?.wallType ?? `continuous`;
        context.facing = this.activity?.facing ?? `both`;
        context.panelSize = this.activity?.panelSize ?? `5`;
        context.panelSpacing = this.activity?.panelSpacing ?? `0`;
        context.maxPanels = this.activity?.maxPanels ?? ``;
        context.referenceRange = this.activity?.referenceRange ?? `0`;
        context.maxLength = this.activity?.maxLength ?? `60`;

        context.blocksMovement = this.activity?.blocksMovement ?? true;
        context.blocksSight = this.activity?.blocksSight ?? true;
        context.blocksSound = this.activity?.blocksSound ?? false;

        context.wallTypeOptions = [
            { value: `continuous`, label: `Contiguous`, selected: context.wallType === `continuous` },
            { value: `circular`, label: `Circular`, selected: context.wallType === `circular` },
            { value: `panels`, label: `Panels`, selected: context.wallType === `panels` },
        ];

        context.facingOptions = [
            { value: `both`, label: `Bidirectional`, selected: context.facing === `both` },
            { value: `towards`, label: `Towards Reference`, selected: context.facing === `towards` },
            { value: `away`, label: `Away from Reference`, selected: context.facing === `away` },
            { value: `any`, label: `Either Direction`, selected: context.facing === `any` },
        ];

        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        DomData.setupSheetBehaviors(this);
    }
}
