import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `teleport`;

import { TeleportDestinationApp } from './TeleportDestinationApp.js';

export class TeleportTargetApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
        const tokensData = this._getAvailableTokens();
        return {
            activity: this.activity,
            tokensData: tokensData,
            selectedTargets: this.selectedTargets.map((element, index) => ({
                ...element,
                index: index
            })),
            canTargetSelf: this.activity.targetSelf,
            maxTargets: FieldsData.resolveFormula(this.activity.maxTargets, this.activity.item),
            targetRange: FieldsData.resolveFormula(this.activity.targetRadius, this.activity.item),
            originToken: CanvasData.getOriginToken(this.actor),
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        this.isSelecting = false;

        const originToken = CanvasData.getOriginToken(this.actor);

        if (FieldsData.resolveFormula(this.activity?.maxTargets, this.activity.item) === 1 && this.activity?.onlyTargetSelf) {
            this._skipToDestination();
            return;
        }

        if (!this.selectionTarget) {
            this.selectionTarget = await CanvasData.createMeasuredTemplate({
                x: originToken.x + (originToken.w / 2),
                y: originToken.y + (originToken.h / 2),
                w: originToken.w,
                h: originToken.h,
                distance: FieldsData.resolveFormula(this.activity.targetRadius, this.activity.item),
                fillColor: `#6192B1`,
            });
        }

        DomData.addSubtitle(this.element, this.activity);
        this._updateCanvasSelection();

        this.element.querySelector(`select[name="targetId"]`)?.addEventListener(`change`, async(event) => {
            const selectElement = event.currentTarget;
            const tokenId = selectElement.value;
            if (!tokenId || this.selectedTargets.find(t => t.id === tokenId)) return;

            const token = game.canvas.tokens.get(tokenId);
            if (!token) return;

            if (this.selectedTargets.length >= FieldsData.resolveFormula(this.activity.maxTargets, this.activity.item)) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.maximumTargets.label`));
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

        this.element.querySelector(`.start-teleport-btn`)?.addEventListener(`click`, async(event) => {
            if (this.selectedTargets.length === 0) {
                ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.teleport.moreTargets.label`));
                return;
            }

            if (this.selectedTargets.length > FieldsData.resolveFormula(this.activity.maxTargets, this.activity.item)) {
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
                type: 'self'
            });
        }

        const otherTokens = CanvasData.getTokensInRange(originToken, FieldsData.resolveFormula(this.activity.targetRadius, this.activity.item))
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
        const targetRadius = FieldsData.resolveFormula(this.activity.targetRadius, this.activity.item);
        for (const token of Array.from(game.user.targets)) {
            let distance = Infinity;
            if (targetRadius > 0) {
                const originToken = CanvasData.getOriginToken(this.actor);
                distance = originToken ? CanvasData.calculateTokenDistance(originToken, token) : 0;
                if (distance > targetRadius) continue;
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
