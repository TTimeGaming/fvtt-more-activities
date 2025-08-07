const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TeleportData {
    static disableMTActivityPrompt(sheet, html) {
        const activity = sheet.activity;
        const item = activity?.item;
        if (!item || !activity) return;
        if (activity.type !== `teleport`) return;

        const measuredTemplatePrompt = html.querySelector(`.tab[data-tab="identity"] dnd5e-checkbox[name="target.prompt"]`);
        measuredTemplatePrompt.setAttribute(`disabled`, `disabled`);

        const warning = document.createElement(`abbr`);
        warning.setAttribute(`title`, `Measured Template is disabled for Teleport activities.`);
        warning.setAttribute(`style`, `max-width: 15px;`);
        warning.innerHTML = `<i class="fa-solid fa-warning"></i>`;
        measuredTemplatePrompt.insertAdjacentElement(`afterend`, warning);
    }

    static disableMTMessagePrompt(message, html) {
        if (message.flags?.dnd5e?.activity?.type !== `teleport`) return;

        const placeTemplate = html.querySelector(`.card-buttons button[data-action="placeTemplate"]`);
        if (placeTemplate)
            placeTemplate.remove();
    }

    static calculateDistanceSqr(token1, token2) {
        if (!token1 || !token2) return Infinity;

        const dx = (token1.x + (token1.w / 2)) - (token2.x + (token2.w / 2));
        const dy = (token1.y + (token1.w / 2)) - (token2.y + (token2.w / 2));
        const distance = dx * dx + dy * dy;
        return distance / (game.canvas.grid.size * game.canvas.grid.size);
    }

    static getTokensInRange(originToken, range) {
        if (!originToken) return [];

        return game.canvas.tokens.placeables
            .filter(token => token !== originToken)
            .map(token => {
                const distance = this.calculateDistanceSqr(originToken, token);
                return {
                    token: token,
                    actor: token.actor,
                    distance: game.canvas.grid.distance * Math.round(Math.sqrt(distance) * 10) / 10,
                    inRange: distance <= range
                };
            })
            .filter(token => token.inRange)
            .sort((a, b) => a.distance - b.distance)
        ;
    }
}

export class TeleportActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.targetSelf = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.manualPlacement = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.keepArrangement = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.clusterRadius = new fields.NumberField({
            required: false,
            initial: 5,
            min: 0,
        });

        return schema;
    }
}

export class TeleportActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-teleport` ]
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/teleport-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        },
    };

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);

        context.targetSelf = this.activity?.targetSelf ?? false;
        context.manualPlacement = this.activity?.manualPlacement ?? false;
        context.keepArrangement = this.activity?.keepArrangement ?? true;
        context.clusterRadius = this.activity?.clusterRadius ?? 5;

        return context;
    }
}

export class TeleportActivity extends dnd5e.documents.activity.ActivityMixin(TeleportActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.TELEPORT`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: `teleport`,
            img: `modules/more-activities/icons/teleport.svg`,
            title: `DND5E.ACTIVITY.Type.teleport`,
            hint: `DND5E.ACTIVITY.Hint.teleport`,
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
        this.originToken = this._getOriginToken();
        this.selectedTargets = [];
        this.maxTargets = 2;
        this.targetRange = 15;
        this.teleportRange = 15;
        this.destinationTarget = null;
        this.destinationClose = null;
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
            maxTargets: this.maxTargets,
            targetRange: this.targetRange,
            originToken: this.originToken,
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        if (!this.element.querySelector(`.window-subtitle`)) {
            const subtitle = document.createElement(`h2`);
            subtitle.classList.add(`window-subtitle`);
            subtitle.innerText = this.activity?.item?.name || this.activity?.name || ``,
            this.element.querySelector(`.window-header .window-title`).insertAdjacentElement(`afterend`, subtitle);
        }

        if (this.destinationTarget)
        {
            game.canvas.templates.removeChild(this.destinationTarget);
            this.destinationTarget.destroy();
            this.destinationTarget = null;
        }

        this.element.querySelector(`select[name="targetId"]`)?.addEventListener(`change`, async(event) => {
            const selectElement = event.currentTarget;
            const tokenId = selectElement.value;
            if (!tokenId || this.selectedTargets.find(t => t.id === tokenId)) return;

            const token = canvas.tokens.get(tokenId);
            if (!token) return;

            if (this.selectedTargets.length >= this.maxTargets) {
                ui.notifications.warn(`Maximum number of targets (${this.maxTargets}) already selected`);
                return;
            }

            const distance = this.originToken ? TeleportData.calculateDistanceSqr(this.originToken, token) : 0;
            this.selectedTargets.push({
                id: tokenId,
                name: token.name,
                distance: game.canvas.grid.distance * Math.round(Math.sqrt(distance) * 10) / 10,
                token: token
            });
            this.render();
        });

        this.element.querySelectorAll(`.target-delete-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.dataset.index);
                this.selectedTargets = this.selectedTargets.filter((_, i) => i !== index);
                this.render();
            });
        });

        this.element.querySelector(`.start-teleport-btn`)?.addEventListener(`click`, async(event) => {
            if (this.selectedTargets.length === 0) {
                ui.notifications.warn(`Select at least one target to teleport`);
                return;
            }

            if (this.selectedTargets.length > this.maxTargets) {
                ui.notifications.warn(`Select fewer targets to teleport`);
                return;
            }

            this.destinationClose = new TeleportDestinationApp(this);
            this.destinationClose.render(true);

            await this._selectDestination();
            this.close();
        });
    }

    /**
     * Get the origin token for the activity
     * @returns {Token|null}
     * @private
     */
    _getOriginToken() {
        if (!this.actor) return null;
        return game.canvas.tokens.placeables.find(token => token.actor?.id === this.actor.id);
    }

    /**
     * Get available tokens for teleportation
     * @returns {Array}
     * @private
     */
    async _getAvailableTokens() {
        const tokens = [];
        const selectedIds = this.selectedTargets.map(t => t.id);

        if (this.activity.targetSelf && this.originToken && !selectedIds.includes(this.originToken.id)) {
            tokens.push({
                token: this.originToken,
                name: this.originToken.name,
                distance: 0,
                inRange: true,
                type: 'self'
            });
        }

        const otherTokens = TeleportData.getTokensInRange(this.originToken, this.targetRange)
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
            if (this.targetRange > 0) {
                distance = this.originToken ? TeleportData.calculateDistanceSqr(this.originToken, token) : 0;
                if (distance > this.targetRange * this.targetRange) continue;
            }
            
            this.selectedTargets.push({
                id: token.id,
                name: token.name,
                distance: game.canvas.grid.distance * Math.round(Math.sqrt(distance) * 10) / 10,
                token: token
            });
        }
    }

    /**
     * Start destination selection on canvas
     * @private
     */
    async _selectDestination() {
        if (this.destinationTarget) return;
        
        ui.notifications.info(`Click on the canvas to select teleport destination`);
        
        const templateData = {
            t: `circle`,
            user: game.user.id,
            x: this.originToken.x + (this.originToken.w / 2),
            y: this.originToken.y + (this.originToken.h / 2),
            distance: this.teleportRange,
            borderColor: `#ffffff`,
            fillColor: `#ffffff`
        };
        const templateDoc = new CONFIG.MeasuredTemplate.documentClass(templateData, { parent: game.canvas.scene });
        this.destinationTarget = new CONFIG.MeasuredTemplate.objectClass(templateDoc);
        this.destinationTarget.draw();
        game.canvas.templates.addChild(this.destinationTarget);

        const handler = async (event) => {
            if (!this.destinationTarget) return;

            const pos = game.canvas.canvasCoordinatesFromClient(event.data.originalEvent);
            if (!this.destinationTarget.testPoint(pos)) {
                ui.notifications.info(`Must teleport within configured radius`);
                return;
            }

            await this._executeTeleport(pos.x, pos.y);
            game.canvas.stage.off('mousedown', handler);
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

        if (this.activity.keepArrangement && this.selectedTargets.length > 1) {
            await this._arrangedTeleport(destX, destY, updates);
        } else if (this.activity.manualPlacement) {
            // TODO: Implement manual placement mode
            await this._clusterTeleport(destX, destY, updates);
        } else {
            await this._clusterTeleport(destX, destY, updates);
        }

        if (updates.length == 0) return;

        const selectedTokensData = foundry.utils.duplicate(game.canvas.scene.tokens.filter((token) => this.selectedTargets.map(t => t.id).indexOf(token.id) >= 0));
        for (var i = 0; i < updates.length; i++) {
            selectedTokensData[i].x = updates[i].x;
            selectedTokensData[i].y = updates[i].y;
        }

        await game.canvas.scene.deleteEmbeddedDocuments(foundry.canvas.placeables.Token.embeddedName, this.selectedTargets.map(t => t.id), { isUndo: true });
        await game.canvas.scene.createEmbeddedDocuments(foundry.canvas.placeables.Token.embeddedName, selectedTokensData, { isUndo: true });

        game.canvas.templates.removeChild(this.destinationTarget);
        this.destinationTarget.destroy();
        this.destinationTarget = null;

        this.destinationClose.success();
        this.destinationClose = null;
        
        ui.notifications.info(`Successfully teleported ${updates.length} target${updates.length > 1 ? 's' : ''}`);
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
            return;
        }

        for (let i = 0; i < this.selectedTargets.length; i++) {
            const angle = (i / this.selectedTargets.length) * 2 * Math.PI;
            const distance = Math.min(clusterRadius, (i + 1) * gridSize * 0.7);
            
            const offsetX = Math.cos(angle) * distance;
            const offsetY = Math.sin(angle) * distance;

            const snapped = game.canvas.grid.getTopLeftPoint({
                x: Math.round((destX + offsetX) * 10) / 10,
                y: Math.round((destY + offsetY) * 10) / 10,
            });
            
            updates.push({
                _id: this.selectedTargets[i].id,
                x: snapped.x,
                y: snapped.y,
            });
        }
    }
}

class TeleportDestinationApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `teleport-destination-app` ],
        tag: `form`,
        position: {
            width: 300,
            height: 150,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/teleport-cancel.hbs`,
        },
    };

    constructor(targetApp, options = {}) {
        super({
            window: {
                title: `Cancel Teleport`
            },
            ...options,
        });
        this.targetApp = targetApp;
        this.openTarget = true;
    }

    success() {
        this.openTarget = false;
        this.close();
    }

    /** @inheritdoc */
    async _prepareContext() {
        return {};
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        this.element.querySelector(`.cancel-teleport-btn`)?.addEventListener(`click`, async(event) => {
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
