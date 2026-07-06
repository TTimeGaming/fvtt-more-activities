// should be the same as teleport!

import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `movement`;

import { MovementData } from './MovementData.js';

export class MovementPlacementApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [`dnd5e2`, `movement-manual-placement-app`],
        tag: `form`,
        position: {
            width: 400,
            height: `auto`,
        }
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/movement-placement.hbs`,
        },
    };

    constructor(targetApp, actor, options = {}) {
        super({
            window: {
                title: `Movement Placement`
            },
            ...options,
        });
        
        this.targetApp = targetApp;
        this.tokensToPlace = [...targetApp.selectedTargets];
        this.destinationTargets = [];
        this.placementRadius = FieldsData.resolveFormula(targetApp.activity.movementDistance, targetApp.activity.item);
        this.placedTokens = [];
        this.currentTokenIndex = 0;
        this.canvasClickHandler = null;
        this.isFinished = false;
        this.isHardClose = false;

        for (let i = 0; i < this.tokensToPlace.length; i++)
            this.destinationTargets[i] = null;

        this._renderDestination();
    }

    /** @inheritdoc */
    async _prepareContext() {
        const currentToken = this.tokensToPlace[this.currentTokenIndex];

        return {
            currentToken: currentToken ? {
                ...currentToken,
                imgSrc: currentToken.token.document.texture.src,
            } : null,
            currentIndex: this.currentTokenIndex,
            tokensRemaining: this.tokensToPlace.length,
            placedCount: this.placedTokens.length,
            totalCount: this.tokensToPlace.length + this.placedTokens.length,
            canNavigate: this.tokensToPlace.length > 1,
            canFinish: this.tokensToPlace.length === 0,
            isPlacing: this.canvasClickHandler !== null,
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        DomData.addSubtitle(this.element, this.targetApp.activity);

        this.element.querySelector('.prev-token-btn')?.addEventListener('click', this._onPrevToken.bind(this));
        this.element.querySelector('.next-token-btn')?.addEventListener('click', this._onNextToken.bind(this));
        this.element.querySelector('.place-token-btn')?.addEventListener('click', this._onStartPlacement.bind(this));
        this.element.querySelector('.finish-placement-btn')?.addEventListener('click', this._onFinishPlacement.bind(this));
        this.element.querySelector('.cancel-placement-btn')?.addEventListener('click', this._onCancelPlacement.bind(this));
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);

        if (this.canvasClickHandler) {
            game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
            this.canvasClickHandler = null;
        }

        if (!this.isFinished && !this.isHardClose)
            this._onCancelPlacement();
    }

    async _renderDestination() {
        for (let i = 0; i < this.tokensToPlace.length; i++) {
            this.destinationTargets[i] = await CanvasData.createMeasuredTemplate({
                x: this.tokensToPlace[i].token.x + (this.tokensToPlace[i].token.w / 2),
                y: this.tokensToPlace[i].token.y + (this.tokensToPlace[i].token.h / 2),
                w: this.tokensToPlace[i].token.w,
                h: this.tokensToPlace[i].token.h,
                distance: this.placementRadius,
                fillColor: `#D2D3D5`,
            });
        }
    }

    _onPrevToken() {
        this.currentTokenIndex -= 1;
        if (this.currentTokenIndex < 0)
            this.currentTokenIndex = this.tokensToPlace.length - 1;
        this.render();
    }

    _onNextToken() {
        this.currentTokenIndex += 1;
        if (this.currentTokenIndex >= this.tokensToPlace.length)
            this.currentTokenIndex = 0;
        this.render();
    }

    _startCanvasPlacement() {
        if (this.canvasClickHandler)
            game.canvas.stage.off(`mouseup`, this.canvasClickHandler);

        this.canvasClickHandler = this._onCanvasClick.bind(this);
        game.canvas.stage.on(`mouseup`, this.canvasClickHandler);
    }

    async _onCanvasClick(event) {
        if (!this.tokensToPlace[this.currentTokenIndex]) return;

        const tokenToPlace = this.tokensToPlace[this.currentTokenIndex];

        const pos = game.canvas.canvasCoordinatesFromClient(event.data.originalEvent);
        const snappedPos = game.canvas.grid.getCenterPoint({
            x: Math.round(pos.x * 10) / 10,
            y: Math.round(pos.y * 10) / 10,
        });
        const distance = CanvasData.calculateCoordDistance(snappedPos.x, snappedPos.y, tokenToPlace.token.x, tokenToPlace.token.y);
        if (distance > this.placementRadius) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.outOfBounds.label`));
            return;
        }

        const snapped = game.canvas.grid.getTopLeftPoint({
            x: Math.round(snappedPos.x * 10) / 10,
            y: Math.round(snappedPos.y * 10) / 10,
        });

        const oldPosition = await MovementData.executeSingleTokenMovement(tokenToPlace.token.actor, snapped.x, snapped.y);
        const placedToken = this.tokensToPlace.splice(this.currentTokenIndex, 1)[0];
        this.placedTokens.push({
            token: placedToken.token,
            position: oldPosition,
        });

        if (this.destinationTargets[this.currentTokenIndex]) {
            const destination = this.destinationTargets.splice(this.currentTokenIndex, 1)[0];
            await CanvasData.removeMeasuredTemplate(destination);
        }

        if (this.currentTokenIndex >= this.tokensToPlace.length && this.tokensToPlace.length > 0) {
            this.currentTokenIndex = this.tokensToPlace.length - 1;
        }
        
        game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
        this.canvasClickHandler = null;
        this.render();
    }

    _onStartPlacement() {
        if (this.canvasClickHandler) {
            game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
            this.canvasClickHandler = null;
            this.render();
            return;
        }

        this._startCanvasPlacement();
        this.render();
    }

    /**
     * Handle finish placement
     * @private
     */
    async _onFinishPlacement() {
        if (this.tokensToPlace.length > 0) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.manualRemaining.label`));
            return;
        }
        
        for (let i = 0; i < this.destinationTargets.length; i++) {
            if (!this.destinationTargets[i]) continue;
            await CanvasData.removeMeasuredTemplate(this.destinationTargets[i]);
            this.destinationTargets[i] = null;
        }
        
        if (this.targetApp.activity.autoApply) {
            await EffectsData.apply(this.targetApp.activity, this.placedTokens.map(target => target.token.actor), this.targetApp.activity.appliedEffects);
        }

        ui.notifications.info(`${this.placedTokens.length} ${game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.success.label`)}`);

        this.isFinished = true;
        this.close();
    }

    /**
     * Handle cancel placement
     * @private
     */
    async _onCancelPlacement() {
        for (const placedToken of this.placedTokens) {
            await MovementData.executeSingleTokenMovement(
                placedToken.token.actor,
                placedToken.position.x,
                placedToken.position.y
            );
        }

        for (let i = 0; i < this.destinationTargets.length; i++) {
            if (!this.destinationTargets[i]) continue;
            await CanvasData.removeMeasuredTemplate(this.destinationTargets[i]);
            this.destinationTargets[i] = null;
        }
        
        this.targetApp.render(true);
        this.isHardClose = true;
        this.close();
    }
}
