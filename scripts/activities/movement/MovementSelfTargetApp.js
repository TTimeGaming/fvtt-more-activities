// should be the same as teleport!

import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `movement`;

import { MovementData } from './MovementData.js';

export class MovementSelfTargetApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [`dnd5e2`, `movement-self-target-app`],
        tag: `form`,
        position: {
            width: 300,
            height: `auto`,
        }
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/movement-target-self.hbs`,
        },
    };

    constructor(targetApp, activity, actor, selectedTargets, options = {}) {
        super({
            window: {
                title: `Select Target`
            },
            ...options,
        });
        
        this.targetApp = targetApp;
        this.activity = activity;
        this.actor = actor;
        this.selectedTargets = [...selectedTargets].map(target => target.token);
        this.selectionTarget = null;
        this.movementTarget = null;
    }

    /** @inheritdoc */
    async _prepareContext() {
        const tokensData = this._getAvailableTokens();

        return {
            tokensData: tokensData,
            movementType: this.activity.movementType,
            movementDistance: FieldsData.resolveFormula(this.activity.movementDistance, this.activity.item),
            originToken: CanvasData.getOriginToken(this.actor),
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        DomData.addSubtitle(this.element, this.targetApp.activity);

        const originToken = CanvasData.getOriginToken(this.actor);
        if (!this.selectionTarget) {
            this.selectionTarget = await CanvasData.createMeasuredTemplate({
                x: originToken.x + (originToken.w / 2),
                y: originToken.y + (originToken.h / 2),
                w: originToken.w,
                h: originToken.h,
                distance: FieldsData.resolveFormula(this.activity.targetRange, this.activity.item),
                fillColor: `#B16192`,
            });
        }

        this.element.querySelector(`select[name="movementTargetId"]`)?.addEventListener(`change`, async(event) => {
            const tokenId = event.currentTarget.value;
            if (!tokenId) return;

            const token = game.canvas.tokens.get(tokenId);
            if (!token) return;

            if (this.movementTarget != null) {
                this.movementTarget.setTarget(false, { releaseOthers: true, groupSelection: true });
                this.selectedTargets = this.selectedTargets.filter(t => t.id !== this.movementTarget.id);
            }

            this.movementTarget = token;
            this.selectedTargets.push(token);
            
            game.canvas.tokens.releaseAll();
            this.selectedTargets.forEach(target => {
                target.setTarget(true, { releaseOthers: false, groupSelection: true });
            });
        });

        this.element.querySelector(`.start-self-movement-btn`)?.addEventListener(`click`, async(event) => {
            if (!this.movementTarget) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.selectTarget.label`));
                return;
            }

            await this._executeSelfMovement();
            this.close();
        });

        this.element.querySelector(`.cancel-self-movement-btn`)?.addEventListener(`click`, async(event) => {
            this.close();
        });
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);

        if (this.selectionTarget) {
            await CanvasData.removeMeasuredTemplate(this.selectionTarget);
            this.selectionTarget = null;
        }

        this.selectedTargets.forEach(target => {
            target.setTarget(false, { releaseOthers: true, groupSelection: true });
        });
    }

    async _executeSelfMovement() {
        const originToken = CanvasData.getOriginToken(this.actor);
        const destination = MovementData.calculateMovementDestination(
            this.movementTarget,
            originToken,
            FieldsData.resolveFormula(this.activity.movementDistance, this.activity.item),
            `pull`,
        );

        await MovementData.executeSingleTokenMovement(this.actor, destination.x, destination.y);

        if (this.activity.autoApply) {
            await EffectsData.apply(this.activity, [this.actor], this.activity.appliedEffects);
        }
        
        ui.notifications.info(`1 ${game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.success.label`)}`);
    }

    /**
     * Get available tokens for self-movement
     * @returns {Array}
     * @private
     */
    _getAvailableTokens() {
        const originToken = CanvasData.getOriginToken(this.actor);

        const otherTokens = CanvasData.getTokensInRange(originToken, FieldsData.resolveFormula(this.activity.targetRange, this.activity.item))
            .filter(data => data.token.id !== originToken.id)
            .map(data => ({
                ...data,
                name: data.token.name,
                type: 'other'
            }))
        ;

        return {
            selfTokens: [],
            otherTokens: otherTokens.filter(t => t.type === 'other'),
            hasMultipleGroups: false,
        };
    }
}
