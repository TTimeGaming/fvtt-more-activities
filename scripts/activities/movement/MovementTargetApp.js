// should be the same as teleport!

import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `movement`;

import { MovementData } from './MovementData.js';
import { MovementDestinationApp } from './MovementDestinationApp.js';
import { MovementPlacementApp } from './MovementPlacementApp.js';
import { MovementSelfTargetApp } from './MovementSelfTargetApp.js';

export class MovementTargetApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `movement-target-app` ],
        tag: `form`,
        position: {
            width: 300,
            height: `auto`,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/movement-target.hbs`,
        },
    };

    constructor(activity, options = {}) {
        super({
            window: {
                title: `Move Targets`
            },
            ...options,
        });
        this.activity = activity;
        this.actor = activity?.actor;
        this.selectedTargets = [];
        this.selectionTarget = null;
        this.isSelecting = false;
        this._prepopulateTargets();
    }

    /** @inheritdoc */
    async _prepareContext() {
        const tokensData = this._getAvailableTokens();

        return {
            activity: this.activity,
            tokensData: tokensData,
            selectedTargets: this.selectedTargets.map((element, index) => ({
                ...element,
                index: index
            })),
            maxTargets: FieldsData.resolveFormula(this.activity.maxTargets, this.activity.item),
            targetRange: FieldsData.resolveFormula(this.activity.targetRange, this.activity.item),
            movementDistance: FieldsData.resolveFormula(this.activity.movementDistance, this.activity.item),
            movementType: this.activity.movementType,
            originToken: CanvasData.getOriginToken(this.actor),
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        this.isSelecting = false;

        const originToken = CanvasData.getOriginToken(this.actor);

        if (!this.selectionTarget)
        {
            this.selectionTarget = await CanvasData.createMeasuredTemplate({
                x: originToken.x + (originToken.w / 2),
                y: originToken.y + (originToken.h / 2),
                w: originToken.w,
                h: originToken.h,
                distance: FieldsData.resolveFormula(this.activity.targetRange, this.activity.item),
                fillColor: `#6192B1`,
            });
        }

        this._updateCanvasSelection();

        if (!this.element.querySelector(`.window-subtitle`)) {
            const subtitle = document.createElement(`h2`);
            subtitle.classList.add(`window-subtitle`);
            subtitle.innerText = this.activity?.item?.name || this.activity?.name || ``,
            this.element.querySelector(`.window-header .window-title`).insertAdjacentElement(`afterend`, subtitle);
        }

        this.element.querySelector(`select[name="targetId"]`)?.addEventListener(`change`, async(event) => {
            const selectElement = event.currentTarget;
            const tokenId = selectElement.value;
            if (!tokenId || this.selectedTargets.find(t => t.id === tokenId)) return;

            const token = game.canvas.tokens.get(tokenId);
            if (!token) return;

            if (this.selectedTargets.length >= FieldsData.resolveFormula(this.activity.maxTargets, this.activity.item)) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.maximumTargets.label`));
                selectElement.value = ``;
                return;
            }

            const distance = originToken ? CanvasData.calculateTokenDistance(originToken, token) : 0;
            this.selectedTargets.push({
                id: tokenId,
                name: token.name,
                distance: distance,
                token: token
            });

            this._updateCanvasSelection();
            this.render();
        });

        this.element.querySelectorAll(`.target-delete-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.dataset.index);
                let removedTarget = null;
                this.selectedTargets = this.selectedTargets.filter((target, i) => {
                    if (i === index) { removedTarget = target; return false; }
                    return true;
                });
                this._updateCanvasSelection(removedTarget);
                this.render();
            });
        });

        this.element.querySelector(`.start-movement-btn`)?.addEventListener(`click`, async(event) => {
            if (this.selectedTargets.length === 0) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.moreTargets.label`));
                return;
            }

            if (this.selectedTargets.length > FieldsData.resolveFormula(this.activity.maxTargets, this.activity.item)) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.lessTargets.label`));
                return;
            }

            await this._startMovement();
            this.isSelecting = true;
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

        if (!this.isSelecting) {
            this.selectedTargets.forEach(target => {
                target.token.setTarget(false, { releaseOthers: true, groupSelection: true });
            });
        }
    }

    shouldBypassTargeting() {
        if (FieldsData.resolveFormula(this.activity?.maxTargets, this.activity.item) !== 1 || !this.activity?.onlyTargetSelf) return false;

        this._skipToSelfMovement();
        return true;
    }

    /**
     * Skip directly to movement with self as target
     * @private
     */
    async _skipToSelfMovement() {
        const originToken = CanvasData.getOriginToken(this.actor);

        this.selectedTargets = [];
        this.selectedTargets.push({
            id: originToken.id,
            name: originToken.name,
            distance: 0,
            token: originToken
        });

        originToken.setTarget(true, { releaseOthers: true, groupSelection: true });

        new MovementSelfTargetApp(this, this.activity, this.actor, this.selectedTargets).render(true);
        this.isSelecting = true;
        this.close();
    }

    /**
     * Start the movement process
     * @private
     */
    async _startMovement() {
        switch (this.activity.movementType) {
            case `push`:
            case `pull`:
                await this._executeMovement(this.activity.movementType);
                break;
            case `either`:
                const destination = new MovementDestinationApp(this, this.activity, this.actor, this.selectedTargets);
                destination.awaitDirection(async(direction) => {
                    await this._executeMovement(direction);
                });
                destination.render(true);
                break;
            default:
                new MovementPlacementApp(this, this.actor).render(true);
                break;
        }
    }

    /**
     * Execute automatic push/pull movement
     * @private
     */
    async _executeMovement(direction) {
        const updates = [];

        const originToken = CanvasData.getOriginToken(this.actor);
        for (const target of this.selectedTargets) {
            const destination = MovementData.calculateMovementDestination(
                originToken,
                target.token,
                FieldsData.resolveFormula(this.activity.movementDistance, this.activity.item),
                direction,
            );

            updates.push({
                _id: target.id,
                x: destination.x,
                y: destination.y
            });
        }

        this.selectedTargets.forEach(target => {
            target.token.setTarget(false, { releaseOthers: true, groupSelection: true });
        });

        if (updates.length === 0) return;

        await game.canvas.scene.updateEmbeddedDocuments(`Token`, updates);

        if (this.activity.autoApply) {
            await EffectsData.apply(this.activity, this.selectedTargets.map(target => target.token.actor), this.activity.appliedEffects);
        }

        ui.notifications.info(`${updates.length} ${game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.success.label`)}`);
    }

    /**
     * Update canvas token selection to match selected targets
     * @private
     */
    _updateCanvasSelection(removedTarget) {
        game.canvas.tokens.releaseAll();

        if (removedTarget)
            removedTarget.token.setTarget(false, { releaseOthers: false, groupSelection: true });

        this.selectedTargets.forEach(target => {
            target.token.setTarget(true, { releaseOthers: false, groupSelection: true });
        });
    }

    /**
     * Get available tokens for movement
     * @returns {Array}
     * @private
     */
    _getAvailableTokens() {
        const originToken = CanvasData.getOriginToken(this.actor);

        const tokens = [];
        const selectedIds = this.selectedTargets.map(t => t.id);

        if (this.activity.targetSelf && originToken && !selectedIds.includes(originToken.id)) {
            tokens.push({
                token: originToken,
                name: originToken.name,
                distance: 0,
                inRange: true,
                type: `self`,
            });
        }

        let otherTokens = [];
        if (!this.activity.onlyTargetSelf || !this.activity.targetSelf || this.activity.maxTargets !== `1`) {
            otherTokens = CanvasData.getTokensInRange(originToken, FieldsData.resolveFormula(this.activity.targetRange, this.activity.item))
                .filter(data => !selectedIds.includes(data.token.id))
                .map(data => ({
                    ...data,
                    name: data.token.name,
                    type: 'other'
                }))
            ;
        }

        return {
            selfTokens: tokens.filter(t => t.type === 'self'),
            otherTokens: otherTokens.filter(t => t.type === 'other'),
            hasMultipleGroups: tokens.length > 0 && otherTokens.length > 0
        };
    }

    _prepopulateTargets() {
        const targetRange = FieldsData.resolveFormula(this.activity.targetRange, this.activity.item);
        for (const token of Array.from(game.user.targets)) {
            let distance = Infinity;
            if (targetRange > 0) {
                const originToken = CanvasData.getOriginToken(this.actor);
                distance = originToken ? CanvasData.calculateTokenDistance(originToken, token) : 0;
                if (distance > targetRange) continue;
            }
            
            this.selectedTargets.push({
                id: token.id,
                name: token.name,
                distance: distance,
                token: token
            });
        }
    }
}
