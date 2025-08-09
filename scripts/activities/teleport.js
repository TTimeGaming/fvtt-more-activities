import { MessageData } from '../utils/message.js';
import { CanvasData } from '../utils/canvas.js';
import { DomData } from '../utils/dom.js';
import { EffectsData } from '../utils/effects.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `teleport`;

export class TeleportData {
    static adjustActivitySheet(sheet, html) {
        if (!sheet?.activity?.item || sheet?.activity?.type !== TEMPLATE_NAME) return;

        sheet.element.classList.add(`teleport-activity`);
        DomData.disableTab(html, `activation-targeting`, game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.blockedTargeting.label`));
        DomData.disableInputElement(html, `.tab[data-tab="identity"] dnd5e-checkbox[name="target.prompt"]`, game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.blockedPrompt.label`));
    }

    static applyListeners(message, html) {
        MessageData.addActivityButton(message, html, true,
            TEMPLATE_NAME, `Teleport`, (activity) => {
                new TeleportTargetApp(activity).render(true);
            }
        );
    }
}

export class TeleportActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.maxTargets = new fields.NumberField({
            required: false,
            initial: 1,
            min: 1,
        });

        schema.targetSelf = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.onlyTargetSelf = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.targetRadius = new fields.NumberField({
            required: false,
            initial: 15,
            min: 0,
        });

        schema.teleportDistance = new fields.NumberField({
            required: false,
            initial: 30,
            min: 0,
        });

        schema.manualPlacement = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.manualRadius = new fields.NumberField({
            required: false,
            initial: 10,
            min: 0,
        });

        schema.keepArrangement = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.clusterRadius = new fields.NumberField({
            required: false,
            initial: 5,
            min: 0,
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
        context.appliedEffects = this.activity?.appliedEffects || [];

        context.availableEffects = this.item?.effects?.map(effect => ({
            id: effect.id,
            name: effect.name,
            icon: effect.img
        })) || [];

        return context;
    }
}

export class TeleportActivity extends dnd5e.documents.activity.ActivityMixin(TeleportActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: TeleportActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return TeleportActivityData.defineSchema();
    }

    /**
     * Execute the teleport activity
     * @param {ActivityUseConfiguration} config - Configuration data for the activity usage.
     * @param {ActivityDialogConfiguration} dialog - Configuration data for the activity dialog.
     * @param {ActivityMessageConfiguration} message - Configuration data for the activity message.
     * @returns {Promise<ActivityUsageResults|void>}
     */
    async use(config, dialog, message) {
        const results = await super.use(config, dialog, message);
        
        const token = CanvasData.getOriginToken(this.actor);
        if (!token) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.invalidScope.label`));
            return results;
        }

        new TeleportTargetApp(this).render(true);
        return results;
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null}
     */
    get actor() {
        return this.item?.actor || null;
    }
}

class TeleportTargetApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `teleport-target-app` ],
        tag: `form`,
        position: {
            width: 300,
            height: `auto`,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/teleport-target.hbs`,
        },
    };

    constructor(activity, options = {}) {
        super({
            window: {
                title: `Teleport Targets`
            },
            ...options,
        });
        this.activity = activity;
        this.actor = activity?.actor;
        this.selectedTargets = [];
        this.selectionTarget = null;
        this.destinationClose = null;
        this.isSelecting = false;
        this._prepopulateTargets();
    }

    /** @inheritdoc */
    async _prepareContext() {
        const tokensData = await this._getAvailableTokens();
        return {
            activity: this.activity,
            tokensData: tokensData,
            selectedTargets: this.selectedTargets.map((element, index) => ({
                ...element,
                index: index
            })),
            canTargetSelf: this.activity.targetSelf,
            maxTargets: this.activity.maxTargets,
            targetRange: this.activity.targetRadius,
            originToken: CanvasData.getOriginToken(this.actor),
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        this.isSelecting = false;

        const originToken = CanvasData.getOriginToken(this.actor);

        if (this.activity?.maxTargets === 1 && this.activity?.onlyTargetSelf) {
            this._skipToDestination();
            return;
        }

        if (!this.selectionTarget)
        {
            this.selectionTarget = CanvasData.createMeasuredTemplate({
                x: originToken.x + (originToken.w / 2),
                y: originToken.y + (originToken.h / 2),
                distance: this.activity.targetRadius,
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

            if (this.selectedTargets.length >= this.activity.maxTargets) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.maximumTargets.label`, { count: this.activity.maxTargets }));
                selectElement.value = ``;
                return;
            }

            const distance = originToken ? CanvasData.calculateDistanceSqr(originToken, token) : 0;
            this.selectedTargets.push({
                id: tokenId,
                name: token.name,
                distance: game.canvas.grid.distance * Math.round(Math.sqrt(distance) * 10) / 10,
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

        this.element.querySelector(`.start-teleport-btn`)?.addEventListener(`click`, async(event) => {
            if (this.selectedTargets.length === 0) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.moreTargets.label`));
                return;
            }

            if (this.selectedTargets.length > this.activity.maxTargets) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.lessTargets.label`));
                return;
            }

            this.destinationClose = new TeleportDestinationApp(this, this.activity, this.actor, this.selectedTargets);
            this.destinationClose.render(true);
            this.isSelecting = true;
            this.close();
        });
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);
        
        if (this.selectionTarget)
        {
            CanvasData.removeMeasuredTemplate(this.selectionTarget);
            this.selectionTarget = null;
        }

        if (!this.isSelecting)
        {
            this.selectedTargets.forEach(target => {
                target.token.setTarget(false, { releaseOthers: true, groupSelection: true });
            });
        }
    }

    /**
     * Skip target selection and go straight to destination
     * @private
     */
    async _skipToDestination() {
        const originToken = CanvasData.getOriginToken(this.actor);

        this.selectedTargets = [];
        this.selectedTargets.push({
            id: originToken.id,
            name: originToken.name,
            distance: 0,
            token: originToken
        });

        originToken.setTarget(true, { releaseOthers: true, groupSelection: true });

        this.destinationClose = new TeleportDestinationApp(this, this.activity, this.actor, this.selectedTargets);
        this.destinationClose.openTarget = false;
        this.destinationClose.render(true);
        this.close();
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
     * Get available tokens for teleportation
     * @returns {Array}
     * @private
     */
    async _getAvailableTokens() {
        const originToken = CanvasData.getOriginToken(this.actor);

        const tokens = [];
        const selectedIds = this.selectedTargets.map(t => t.id);

        if (this.activity.targetSelf && originToken && !selectedIds.includes(originToken.id)) {
            tokens.push({
                token: originToken,
                name: originToken.name,
                distance: 0,
                inRange: true,
                type: 'self'
            });
        }

        const otherTokens = CanvasData.getTokensInRange(originToken, this.activity.targetRadius)
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
        for (const token of Array.from(game.user.targets)) {
            let distance = Infinity;
            if (this.activity.targetRadius > 0) {
                const originToken = CanvasData.getOriginToken(this.actor);
                distance = originToken ? CanvasData.calculateDistanceSqr(originToken, token) : 0;
                if (distance > this.activity.targetRadius * this.activity.targetRadius) continue;
            }
            
            this.selectedTargets.push({
                id: token.id,
                name: token.name,
                distance: game.canvas.grid.distance * Math.round(Math.sqrt(distance) * 10) / 10,
                token: token
            });
        }
    }
}

class TeleportDestinationApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `teleport-destination-app` ],
        tag: `form`,
        position: {
            width: 350,
            height: 200,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/teleport-cancel.hbs`,
        },
    };

    constructor(targetApp, activity, actor, selectedTargets, options = {}) {
        super({
            window: {
                title: `Cancel Teleport`
            },
            ...options,
        });
        this.targetApp = targetApp;
        this.activity = activity;
        this.actor = actor;
        this.selectedTargets = selectedTargets;
        this.openTarget = true;
        this.destinationTarget = null;
        this._selectDestination();
    }

    /** @inheritdoc */
    async _prepareContext() {
        return {};
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        if (!this.element.querySelector(`.window-subtitle`)) {
            const subtitle = document.createElement(`h2`);
            subtitle.classList.add(`window-subtitle`);
            subtitle.innerText = this.activity?.item?.name || this.activity?.name || ``,
            this.element.querySelector(`.window-header .window-title`).insertAdjacentElement(`afterend`, subtitle);
        }

        this.element.querySelector(`.cancel-teleport-btn`)?.addEventListener(`click`, async(event) => {
            this.close();
        });
    }
    
    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);

        this.selectedTargets.forEach(target => {
            target.token.setTarget(false, { releaseOthers: false, groupSelection: true });
        });

        if (this.destinationTarget)
        {
            CanvasData.removeMeasuredTemplate(this.destinationTarget);
            this.destinationTarget = null;
        }

        if (this.openTarget)
            this.targetApp.render(true);
    }

    /**
     * Start destination selection on canvas
     * @private
     */
    async _selectDestination() {
        if (this.destinationTarget) return;
        
        const handler = async (event) => {
            if (!this.destinationTarget) return;

            const pos = game.canvas.canvasCoordinatesFromClient(event.data.originalEvent);
            if (!this.destinationTarget.testPoint(pos)) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.outOfBounds.label`));
                return;
            }

            await this._executeTeleport(pos.x, pos.y);
            game.canvas.stage.off('mousedown', handler);
            this.close();
        };
        game.canvas.stage.on('mousedown', handler);

        
        const originToken = CanvasData.getOriginToken(this.actor);
        this.destinationTarget = CanvasData.createMeasuredTemplate({
            x: originToken.x + (originToken.w / 2),
            y: originToken.y + (originToken.h / 2),
            distance: this.activity.teleportDistance,
            fillColor: `#50B849`,
        });
    }

    /**
     * Execute the teleport to the specified destination
     * @param {number} destX 
     * @param {number} destY 
     * @private
     */
    async _executeTeleport(destX, destY) {
        const updates = [];

        if (this.selectedTargets.length === 1) {
            const snapped = game.canvas.grid.getTopLeftPoint({
                x: Math.round(destX * 10) / 10,
                y: Math.round(destY * 10) / 10,
            });

            updates.push({
                _id: this.selectedTargets[0].id,
                x: snapped.x,
                y: snapped.y,
            });
        }
        else
        {
            if (this.activity.manualPlacement) {
                await this._manualTeleport(destX, destY);
                return;
            }

            if (this.activity.keepArrangement && this.selectedTargets.length > 1) {
                await this._arrangedTeleport(destX, destY, updates);
            } else {
                await this._clusterTeleport(destX, destY, updates);
            }
        }

        if (updates.length == 0) return;

        const selectedTokensData = foundry.utils.duplicate(game.canvas.scene.tokens.filter((token) => this.selectedTargets.map(t => t.id).indexOf(token.id) >= 0));
        for (var i = 0; i < selectedTokensData.length; i++) {
            const update = updates.find(u => u._id === selectedTokensData[i]._id);
            if (!update) continue;
            
            selectedTokensData[i].x = update.x;
            selectedTokensData[i].y = update.y;
        }
        await this._executeTokenMove(selectedTokensData);

        CanvasData.removeMeasuredTemplate(this.destinationTarget);
        this.destinationTarget = null;

        this.openTarget = false;
        this.close();

        await EffectsData.apply(this.activity, this.selectedTargets.map(target => target.token.actor));
        ui.notifications.info(`${updates.length} ${game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.success.label`)}`);
    }
    
    /**
     * Execute manual placement teleport
     * @param {number} destX 
     * @param {number} destY 
     * @private
     */
    async _manualTeleport(destX, destY) {
        new TeleportPlacementApp(this.targetApp, destX, destY).render(true);

        this.openTarget = false;
        this.close();
    }

    /**
     * Maintain arrangement of targets around destination point
     * @param {number} destX 
     * @param {number} destY 
     * @param {Array} updates 
     * @private
     */
    async _arrangedTeleport(destX, destY, updates) {
        const centerX = this.selectedTargets.reduce((sum, t) => sum + t.token.x, 0) / this.selectedTargets.length;
        const centerY = this.selectedTargets.reduce((sum, t) => sum + t.token.y, 0) / this.selectedTargets.length;

        for (const target of this.selectedTargets) {
            const relativeX = target.token.x - centerX;
            const relativeY = target.token.y - centerY;

            const snapped = game.canvas.grid.getTopLeftPoint({
                x: Math.round((destX + relativeX) * 10) / 10,
                y: Math.round((destY + relativeY) * 10) / 10,
            });
            
            updates.push({
                _id: target.id,
                x: snapped.x,
                y: snapped.y,
            });
        }
    }

    /**
     * Cluster targets around destination point
     * @param {number} destX 
     * @param {number} destY 
     * @param {Array} updates 
     * @private
     */
    async _clusterTeleport(destX, destY, updates) {
        const gridSize = game.canvas.grid.size;
        const clusterRadius = this.activity.clusterRadius * gridSize;
        const clusterRadiusPixels = clusterRadius / game.canvas.grid.distance;

        const originToken = CanvasData.getOriginToken(this.actor);
        const originIndex = this.selectedTargets.findIndex(t => t.id === originToken?.id);
        const otherTargets = this.selectedTargets.filter((_, i) => i !== originIndex);

        if (originIndex > -1) {
            const snapped = game.canvas.grid.getTopLeftPoint({
                x: Math.round(destX * 10) / 10,
                y: Math.round(destY * 10) / 10,
            });

            updates.push({
                _id: this.selectedTargets[originIndex].id,
                x: snapped.x,
                y: snapped.y,
            });
        }

        const originSnapped = game.canvas.grid.getCenterPoint({
            x: Math.round(destX * 10) / 10,
            y: Math.round(destY * 10) / 10,
        });

        for (let i = 0; i < otherTargets.length; i++) {
            const angle = (i / otherTargets.length) * 2 * Math.PI;
            const offsetX = Math.cos(angle) * clusterRadiusPixels;
            const offsetY = Math.sin(angle) * clusterRadiusPixels;

            const snapped = game.canvas.grid.getTopLeftPoint({
                x: Math.round((originSnapped.x + offsetX) * 10) / 10,
                y: Math.round((originSnapped.y + offsetY) * 10) / 10,
            });
            
            updates.push({
                _id: otherTargets[i].id,
                x: snapped.x,
                y: snapped.y,
            });
        }
    }

    async _executeTokenMove(tokenData) {
        const tokenIds = tokenData.map(t => t._id);
        await game.canvas.scene.deleteEmbeddedDocuments(foundry.canvas.placeables.Token.embeddedName, tokenIds, { isUndo: true });
        await game.canvas.scene.createEmbeddedDocuments(foundry.canvas.placeables.Token.embeddedName, tokenData, { isUndo: true });
    }
}

class TeleportPlacementApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [`dnd5e2`, `teleport-manual-placement-app`],
        tag: `form`,
        position: {
            width: 400,
            height: `auto`,
        }
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/teleport-placement.hbs`,
        },
    };

    constructor(targetApp, destX, destY, options = {}) {
        super({
            window: {
                title: `Teleport Placement`
            },
            ...options,
        });

        const snapped = game.canvas.grid.getCenterPoint({
            x: Math.round(destX * 10) / 10,
            y: Math.round(destY * 10) / 10,
        });

        this.targetApp = targetApp;
        this.destX = snapped.x;
        this.destY = snapped.y;
        this.placementRadius = targetApp.activity.manualRadius;
        this.tokensToPlace = [...targetApp.selectedTargets];
        this.placedTokens = [];
        this.currentDragData = null;
        this.destinationTarget = null;
        this.isFinished = false;
        this.isHardClose = false;

        this._renderDestination();
    }

    /** @inheritdoc */
    async _prepareContext() {
        return {
            tokensToPlace: this.tokensToPlace.map((token, index) => ({
                ...token,
                index: index,
                imgSrc: token.token.document.texture.src
            })),
            placedCount: this.placedTokens.length,
            totalCount: this.tokensToPlace.length + this.placedTokens.length,
            canFinish: this.tokensToPlace.length === 0
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        if (!this.element.querySelector(`.window-subtitle`)) {
            const subtitle = document.createElement(`h2`);
            subtitle.classList.add(`window-subtitle`);
            subtitle.innerText = this.targetApp.activity?.item?.name || this.targetApp.activity?.name || ``,
            this.element.querySelector(`.window-header .window-title`).insertAdjacentElement(`afterend`, subtitle);
        }

        this.element.querySelectorAll('.token-drag-item').forEach(tokenEl => {
            tokenEl.addEventListener('dragstart', this._onDragStart.bind(this));
            tokenEl.addEventListener('dragend', this._onDragEnd.bind(this));
        });

        this.element.querySelector('.finish-placement-btn')?.addEventListener('click', this._onFinishPlacement.bind(this));
        this.element.querySelector('.cancel-placement-btn')?.addEventListener('click', this._onCancelPlacement.bind(this));
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);
        if (!this.isFinished && !this.isHardClose)
            this._onCancelPlacement();
    }

    _renderDestination() {
        this.destinationTarget = CanvasData.createMeasuredTemplate({
            x: this.destX,
            y: this.destY,
            distance: this.placementRadius,
            fillColor: `#D2D3D5`,
        });
    }

    /**
     * Handle drag start
     * @param {DragEvent} event 
     * @private
     */
    _onDragStart(event) {
        const index = parseInt(event.target.dataset.index);
        const token = this.tokensToPlace[index];
        
        this.currentDragData = { index, token };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'teleport-token', index }));

        event.target.style.opacity = '0.5';
    }

    /**
     * Handle drag end
     * @param {DragEvent} event 
     * @private
     */
    async _onDragEnd(event) {
        if (!this.currentDragData) return;
        
        const pos = game.canvas.canvasCoordinatesFromClient(event);
        
        const distance = Math.sqrt(Math.pow(pos.x - this.destX, 2) + Math.pow(pos.y - this.destY, 2));

        if (distance > (this.placementRadius * game.canvas.grid.size) / game.canvas.grid.distance) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.outOfBounds.label`));
            event.target.style.opacity = '1';
            this.currentDragData = null;
            return;
        }

        const snapped = game.canvas.grid.getTopLeftPoint({
            x: Math.round(pos.x * 10) / 10,
            y: Math.round(pos.y * 10) / 10,
        });

        const oldPosition = await this._executeSingleTokenTeleport(this.currentDragData.token.token.actor, snapped.x, snapped.y);
        const placedToken = this.tokensToPlace.splice(this.currentDragData.index, 1)[0];
        this.placedTokens.push({
            actor: placedToken.token.actor,
            position: oldPosition,
        });

        this.render();
        this.currentDragData = null;
    }
    /**
     * Handle finish placement
     * @private
     */
    async _onFinishPlacement() {
        if (this.tokensToPlace.length > 0) {
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.manualRemaining.label`));
            return;
        }
        
        if (this.destinationTarget)
        {
            CanvasData.removeMeasuredTemplate(this.destinationTarget);
            this.destinationTarget = null;
        }
        
        await EffectsData.apply(this.targetApp.activity, this.placedTokens.map(target => target.token.actor));
        ui.notifications.info(`${this.placedTokens.length} ${game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.success.label`)}`);

        this.isFinished = true;
        this.close();
    }

    /**
     * Handle cancel placement
     * @private
     */
    async _onCancelPlacement() {
        for (const placedToken of this.placedTokens) {
            await this._executeSingleTokenTeleport(
                placedToken.actor,
                placedToken.position.x,
                placedToken.position.y
            );
        }

        if (this.destinationTarget)
        {
            CanvasData.removeMeasuredTemplate(this.destinationTarget);
            this.destinationTarget = null;
        }
        
        this.targetApp.render(true);
        this.isHardClose = true;
        this.close();
    }

    async _executeSingleTokenTeleport(actor, x, y) {
        const originalToken = CanvasData.getOriginToken(actor);
        if (!originalToken) return;

        const tokenData = foundry.utils.duplicate(game.canvas.scene.tokens.find((token) => token.id === originalToken.id));
        const oldPosition = {
            x: tokenData.x,
            y: tokenData.y
        };
        tokenData.x = x;
        tokenData.y = y;

        await game.canvas.scene.deleteEmbeddedDocuments(foundry.canvas.placeables.Token.embeddedName, [originalToken.id], { isUndo: true });
        await game.canvas.scene.createEmbeddedDocuments(foundry.canvas.placeables.Token.embeddedName, [tokenData], { isUndo: true });

        return oldPosition;
    }
}
