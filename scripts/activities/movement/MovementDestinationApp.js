// should be the same as teleport!

import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `movement`;

export class MovementDestinationApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `movement-destination-app` ],
        tag: `form`,
        position: {
            width: 350,
            height: 250,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/movement-cancel.hbs`,
        },
    };

    constructor(targetApp, activity, actor, selectedTargets, options = {}) {
        super({
            window: {
                title: `Cancel Movement`
            },
            ...options,
        });
        this.targetApp = targetApp;
        this.activity = activity;
        this.actor = actor;
        this.selectedTargets = selectedTargets;
        this.openTarget = true;
    }

    async awaitDirection(callback) {
        this.directionCallback = callback;
    }

    /** @inheritdoc */
    async _prepareContext() {
        return {};
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        DomData.addSubtitle(this.element, this.activity);

        this.element.querySelector(`.pull-movement-btn`)?.addEventListener(`click`, async(event) => {
            this.directionCallback?.(`pull`);
            this.openTarget = false;
            this.close();
        });

        this.element.querySelector(`.push-movement-btn`)?.addEventListener(`click`, async(event) => {
            this.directionCallback?.(`push`);
            this.openTarget = false;
            this.close();
        });

        this.element.querySelector(`.cancel-movement-btn`)?.addEventListener(`click`, async(event) => {
            this.close();
        });
    }
    
    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);

        if (this.openTarget)
            this.targetApp.render(true);
    }
}
