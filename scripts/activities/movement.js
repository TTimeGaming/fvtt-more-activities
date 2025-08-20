// should be the same as teleport!

import { MessageData } from '../utils/message.js';
import { CanvasData } from '../utils/canvas.js';
import { EffectsData } from '../utils/effects.js';
import { FieldsData } from '../utils/fields.js';
import { DomData } from '../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `movement`;

export class MovementData {
    static applyListeners(message, html) {
        MessageData.addActivityButton(message, html, true,
            TEMPLATE_NAME, `Force Movement`, (activity) => {
                new MovementTargetApp(activity).render(true);
            }
        );
    }

    static calculateMovementDestinations(origin, target, distance, movementType) {
        const moveDistance = game.canvas.grid.size * distance / game.canvas.grid.distance;
        const destinations = [];

        if (movementType === `push`) {
            const angle = CanvasData.getAngleBetween(origin, target);
            const newX = target.x + Math.cos(angle) * moveDistance;
            const newY = target.y + Math.sin(angle) * moveDistance;
            const snapped = game.canvas.grid.getTopLeftPoint({
                x: Math.round(newX * 10) / 10,
                y: Math.round(newY * 10) / 10,
            });
            destinations.push({ x: snapped.x, y: snapped.y, type: `automatic` });
        } else if (movementType === `pull`) {
            const angle = CanvasData.getAngleBetween(target, origin);
            const newX = target.x + Math.cos(angle) * moveDistance;
            const newY = target.y + Math.sin(angle) * moveDistance;
            const snapped = game.canvas.grid.getTopLeftPoint({
                x: Math.round(newX * 10) / 10,
                y: Math.round(newY * 10) / 10,
            });
            destinations.push({ x: snapped.x, y: snapped.y, type: `automatic` });
        }

        return destinations;
    }
}

export class MovementActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.maxTargets = new fields.StringField({
            required: false,
            initial: `1`,
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
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);
        
        context.maxTargets = this.activity?.maxTargets ?? 1;
        context.targetRange = this.activity?.targetRange ?? 30;
        context.movementDistance = this.activity?.movementDistance ?? 10;
        context.movementType = this.activity?.movementType ?? `push`;
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

export class MovementActivity extends dnd5e.documents.activity.ActivityMixin(MovementActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: MovementActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return MovementActivityData.defineSchema();
    }

    /**
     * Execute the macro activity
     * @param {ActivityUseConfiguration} config - Configuration data for the activity usage.
     * @param {ActivityDialogConfiguration} dialog - Configuration data for the activity dialog.
     * @param {ActivityMessageConfiguration} message - Configuration data for the activity message.
     * @returns {Promise<ActivityUsageResults|void>}
     */
    async use(config, dialog, message) {
        const results = await super.use(config, dialog, message);

        const token = CanvasData.getOriginToken(this.actor);
        if (!token) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.movement.invalidScope.label`));
            return results;
        }

        new MovementTargetApp(this).render(true);
        return results;
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null
     */
    get actor() {
        return this.item?.actor || null;
    }
}

class MovementTargetApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
            const destinations = MovementData.calculateMovementDestinations(
                originToken,
                target.token,
                FieldsData.resolveFormula(this.activity.movementDistance, this.activity.item),
                direction,
            );

            if (destinations.length > 0) {
                const dest = destinations[0];
                updates.push({
                    _id: target.id,
                    x: dest.x,
                    y: dest.y
                });
            }
        }

        this.selectedTargets.forEach(target => {
            target.token.setTarget(false, { releaseOthers: true, groupSelection: true });
        });

        if (updates.length === 0) return;

        await game.canvas.scene.updateEmbeddedDocuments(`Token`, updates);
        await EffectsData.apply(this.activity, this.selectedTargets.map(target => target.token.actor), this.activity.appliedEffects);
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

        const otherTokens = CanvasData.getTokensInRange(originToken, FieldsData.resolveFormula(this.activity.targetRange, this.activity.item))
            .filter(data => !selectedIds.includes(data.token.id))
            .map(data => ({
                ...data,
                name: data.token.name,
                type: 'other'
            }))
        ;

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

class MovementDestinationApp extends HandlebarsApplicationMixin(ApplicationV2) {
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

class MovementPlacementApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
        console.log(tokenToPlace);

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

        const oldPosition = await this._executeSingleTokenMovement(tokenToPlace.token.actor, snapped.x, snapped.y);
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
        
        await EffectsData.apply(this.targetApp.activity, this.placedTokens.map(target => target.token.actor), this.targetApp.activity.appliedEffects);
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
            await this._executeSingleTokenMovement(
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

    async _executeSingleTokenMovement(actor, x, y) {
        const originalToken = CanvasData.getOriginToken(actor);
        if (!originalToken) return;

        const oldPosition = {
            x: originalToken.x,
            y: originalToken.y
        };

        await game.canvas.scene.updateEmbeddedDocuments(`Token`, [{
            _id: originalToken.id,
            x: x,
            y: y
        }]);

        originalToken.setTarget(false, { releaseOthers: true, groupSelection: true });
        return oldPosition;
    }
}
