import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `teleport`;

import { TeleportPlacementApp } from './TeleportPlacementApp.js';

export class TeleportDestinationApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
        DomData.addSubtitle(this.element, this.activity);

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

        if (this.destinationTarget) {
            await CanvasData.removeMeasuredTemplate(this.destinationTarget);
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

        const originToken = CanvasData.getOriginToken(this.actor);
        const originX = originToken.x + (originToken.w / 2);
        const originY = originToken.y + (originToken.h / 2);
        const radius = FieldsData.resolveFormula(this.activity.teleportDistance, this.activity.item);

        this.destinationTarget = await CanvasData.createMeasuredTemplate({
            x: originX,
            y: originY,
            w: originToken.w,
            h: originToken.h,
            distance: radius,
            fillColor: `#50B849`,
        });
        
        const handler = async (event) => {
            if (!this.destinationTarget) return;

            const pos = game.canvas.canvasCoordinatesFromClient(event.data.originalEvent);
            const snappedPos = game.canvas.grid.getCenterPoint({
                x: Math.round(pos.x * 10) / 10,
                y: Math.round(pos.y * 10) / 10,
            });

            const distance = CanvasData.calculateCoordDistance(snappedPos.x, snappedPos.y, originX, originY);
            if (distance > radius) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.outOfBounds.label`));
                return;
            }

            game.canvas.stage.off('mousedown', handler);
            await this._executeTeleport(snappedPos.x, snappedPos.y);
            this.close();
        };
        game.canvas.stage.on('mousedown', handler);
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

        if (this.destinationTarget) {
            await CanvasData.removeMeasuredTemplate(this.destinationTarget);
            this.destinationTarget = null;
        }

        this.openTarget = false;
        this.close();

        if (this.activity.autoApply) {
            await EffectsData.apply(this.activity, this.selectedTargets.map(target => target.token.actor), this.activity.appliedEffects);
        }

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

        if (this.destinationTarget) {
            await CanvasData.removeMeasuredTemplate(this.destinationTarget);
            this.destinationTarget = null;
        }

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
        const clusterRadius = FieldsData.resolveFormula(this.activity.clusterRadius, this.activity.item) * gridSize;
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
        const embeddedName = game.version.startsWith(`12`) ?
            Token.embeddedName :
            foundry.canvas.placeables.Token.embeddedName
        ;

        const tokenIds = tokenData.map(t => t._id);
        const newTokens = await game.canvas.scene.createEmbeddedDocuments(embeddedName, tokenData, { isUndo: true });
        await CanvasData.updateCombatants(tokenIds, newTokens.map(token => token.id));
        await game.canvas.scene.deleteEmbeddedDocuments(embeddedName, tokenIds, { isUndo: true });
    }
}
