import { DomData } from '../utils/dom.js';
import { FieldsData } from '../utils/fields.js';
import { MessageData } from '../utils/message.js';
import { CanvasData } from '../utils/canvas.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `wall`;

export class WallData {
    static applyListeners(message, html) {
        MessageData.addActivityButton(message, html, true,
            TEMPLATE_NAME, `Create Wall`, (activity) => {
                new WallPlacementApp(activity).render(true);
            }
        );
    }

    static calculateWallDirection(segment, referencePoint, facing) {
        const segmentVector = {
            x: segment.x2 - segment.x1,
            y: segment.y2 - segment.y1,
        };
        
        const segmentMid = {
            x: (segment.x1 + segment.x2) / 2,
            y: (segment.y1 + segment.y2) / 2,
        };

        const toReference = {
            x: referencePoint.x - segmentMid.x,
            y: referencePoint.y - segmentMid.y,
        };

        const cross = segmentVector.x * toReference.y - segmentVector.y * toReference.x;
        switch (facing) {
            case `towards`: return cross > 0 ? CONST.WALL_DIRECTIONS.LEFT : CONST.WALL_DIRECTIONS.RIGHT;
            case `away`: return cross > 0 ? CONST.WALL_DIRECTIONS.RIGHT : CONST.WALL_DIRECTIONS.LEFT;
            default: return CONST.WALL_DIRECTIONS.BOTH;
        }
    }

    static calculateWallSegments(points, wallType) {
        const segments = [];
        
        switch (wallType) {
            case `circular`:
                if (points.length < 2) break;
                const center = points[0];
                const edge = points[1];
                const radius = CanvasData.calculateCoordDistance(center.x, center.y, edge.x, edge.y) * game.canvas.grid.size / game.canvas.grid.distance;
                const circumference = 2 * Math.PI * radius;
                const numSegments = Math.max(32, Math.floor(circumference / (game.canvas.grid.size * 2)));
                
                for (let i = 0; i < numSegments; i++) {
                    const angle1 = (i / numSegments) * 2 * Math.PI;
                    const angle2 = ((i + 1) / numSegments) * 2 * Math.PI;
                    const x1 = center.x + Math.cos(angle1) * radius;
                    const y1 = center.y + Math.sin(angle1) * radius;
                    const x2 = center.x + Math.cos(angle2) * radius;
                    const y2 = center.y + Math.sin(angle2) * radius;
                    
                    segments.push({
                        x1: x1, y1: y1, x2: x2, y2: y2,
                        type: 'wall_segment'
                    });
                }
                break;
            case `continuous`:
                for (let i = 0; i < points.length - 1; i++) {
                    segments.push({
                        x1: points[i].x, y1: points[i].y,
                        x2: points[i + 1].x, y2: points[i + 1].y,
                        type: 'wall_segment'
                    });
                }
                break;
        }
        
        return segments;
    }

    static async createWallDocuments(segments, wallConfig) {
        const walls = [];
        
        for (const segment of segments) {
            const wallData = {
                c: [segment.x1, segment.y1, segment.x2, segment.y2],
                move: wallConfig.blocksMovement ? CONST.WALL_MOVEMENT_TYPES.NORMAL : CONST.WALL_MOVEMENT_TYPES.NONE,
                sight: wallConfig.blocksSight ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
                sound: wallConfig.blocksSound ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE,
                dir: wallConfig.referencePoint && wallConfig.facing !== `both` ? this.calculateWallDirection(segment, wallConfig.referencePoint, wallConfig.facing) : CONST.WALL_DIRECTIONS.BOTH,
                door: CONST.WALL_DOOR_TYPES.NONE,
                ds: CONST.WALL_DOOR_STATES.CLOSED,
            };
            
            walls.push(wallData);
        }
        
        return await game.canvas.scene.createEmbeddedDocuments('Wall', walls);
    }
}

export class WallActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.wallType = new fields.StringField({
            required: false,
            initial: `continuous`,
            options: [ `continuous`, `circular`, `panels`, ],
        });

        schema.facing = new fields.StringField({
            required: false,
            initial: `both`,
            options: [ `both`, `towards`, `away`, `any`, ],
        });

        schema.referenceRange = new fields.StringField({
            required: false,
            initial: `0`,
        });

        schema.maxLength = new fields.StringField({
            required: false,
            initial: `60`,
        });

        schema.blocksMovement = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.blocksSight = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.blocksSound = new fields.BooleanField({
            required: false,
            initial: false,
        });

        return schema;
    }
}

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
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);

        context.wallType = this.activity?.wallType ?? `continuous`;
        context.facing = this.activity?.facing ?? `both`;
        context.referenceRange = this.activity?.referenceRange ?? `0`;
        context.maxLength = this.activity?.maxLength ?? `60`;
        context.blocksMovement = this.activity?.blocksMovement ?? true;
        context.blocksSight = this.activity?.blocksSight ?? true;
        context.blocksSound = this.activity?.blocksSound ?? false;

        context.wallTypeOptions = [
            { value: `continuous`, label: `Contiguous`, selected: context.wallType === `continuous` },
            { value: `circular`, label: `Circular`, selected: context.wallType === `circular` },
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

export class WallActivity extends dnd5e.documents.activity.ActivityMixin(WallActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: WallActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return WallActivityData.defineSchema();
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
            ui.notifications.warn(game.i18n.localize(`DND5E.ACTIVITY.FIELDS.wall.invalidScope.label`));
            return results;
        }

        new WallPlacementApp(this).render(true);
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

class WallPlacementApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [`dnd5e2`, `wall-placement-app`],
        tag: `form`,
        position: {
            width: 400,
            height: `auto`,
        }
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/wall-placement.hbs`,
        },
    };

    constructor(activity, options = {}) {
        super({
            window: {
                title: `Wall Placement`
            },
            ...options,
        });

        this.activity = activity;
        this.actor = activity?.actor;
        this.placementPoints = [];
        this.previewSegments = [];
        this.previewTemplates = [];
        this.selectedFacing = activity.facing;
        this.isPlacing = false;
        this.isPlacingReference = false;
        this.needsReferencePoint = false;
        this.currentLength = 0;
        this.referencePoint = null;
        this.referenceTemplate = null;
        this.canvasClickHandler = null;
        this.maxLength = FieldsData.resolveFormula(activity.maxLength, activity.item);
        this.referenceRange = FieldsData.resolveFormula(activity.referenceRange, activity.item);
        this._determineReferencePoint();
    }

    /** @inheritdoc */
    async _prepareContext() {
        return {
            wallType: this.activity.wallType,
            facing: this.selectedFacing,
            maxLength: this.maxLength,
            currentLength: Math.round(this.currentLength),
            placedPoints: this.placementPoints.length,
            isPlacing: this.isPlacing,
            needsReferencePoint: this.needsReferencePoint,
            hasReferencePoint: !!this.referencePoint,
            isPlacingReference: this.isPlacingReference,
            referenceRange: this.referenceRange,
            canChooseFacing: this.activity.facing === `any`,
            canFinish: this.placementPoints.length >= (this.activity.wallType === `circular` ? 2 : 2) && (!this.needsReferencePoint || this.referencePoint),
            wallTypeLabel: this._getWallTypeLabel(),
            facingOptions: [
                { value: `towards`, label: `Towards Reference`, selected: this.selectedFacing === `towards` },
                { value: `away`, label: `Away from Reference`, selected: this.selectedFacing === `away` },
            ],
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        DomData.addSubtitle(this.element, this.activity);

        this.element.querySelector(`.start-placement-btn`)?.addEventListener(`click`, this._onStartPlacement.bind(this));
        this.element.querySelector(`.start-reference-btn`)?.addEventListener(`click`, this._onStartReferencePlace.bind(this));
        this.element.querySelector(`.facing-select`)?.addEventListener(`change`, this._onFacingChange.bind(this));
        this.element.querySelector(`.finish-wall-btn`)?.addEventListener(`click`, this._onFinishWall.bind(this));    
        this.element.querySelector(`.clear-points-btn`)?.addEventListener(`click`, this._onClearPoints.bind(this));
        this.element.querySelector(`.cancel-wall-btn`)?.addEventListener(`click`, this._onCancelWall.bind(this));

        if (this.referencePoint)
            await this._createReferenceMarker();
    }

    /** @inheritdoc */
    async close(options = {}) {
        await super.close(options);

        if (this.canvasClickHandler) {
            game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
            this.canvasClickHandler = null;
        }

        await this._clearPreviewTemplates();
        await this._clearReferenceMarker();
    }

    _determineReferencePoint() {
        if (this.referenceRange > 0)
            this.needsReferencePoint = true;
        else {
            const originToken = CanvasData.getOriginToken(this.actor);
            if (originToken) {
                this.referencePoint = {
                    x: originToken.x + (originToken.w / 2),
                    y: originToken.y + (originToken.h / 2),
                };
            }
        }

        if (this.activity.facing === `any`)
            this.selectedFacing = `away`;
    }

    async _createReferenceMarker() {
        if (!this.referencePoint || this.referenceTemplate) return;
        this.referenceTemplate = await CanvasData.createMeasuredTemplate({
            t: `circle`,
            x: this.referencePoint.x,
            y: this.referencePoint.y,
            distance: game.canvas.grid.distance / 2,
            fillColor: `#ff9500`,
            borderColor: `#ff6b00`,
        });
    }

    async _clearReferenceMarker() {
        if (!this.referenceTemplate) return;

        await CanvasData.removeMeasuredTemplate(this.referenceTemplate);
        this.referenceTemplate = null;
    }

    _onStartReferencePlace() {
        if (this.canvasClickHandler) {
            game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
            this.canvasClickHandler = null;
            this.isPlacingReference = false;
            this.render();
            return;
        }

        this.canvasClickHandler = this._onReferenceClick.bind(this);
        game.canvas.stage.on(`mouseup`, this.canvasClickHandler);
        this.isPlacingReference = true;
        this.render();
    }

    _onFacingChange(event) {
        this.selectedFacing = event.target.value;
        this.render();
    }

    _onStartPlacement() {
        if (this.canvasClickHandler) {
            game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
            this.canvasClickHandler = null;
            this.isPlacing = false;
            this.render();
            return;
        }

        this._startCanvasPlacement();
        this.isPlacing = true;
        this.render();
    }

    async _onFinishWall() {
        if (this.placementPoints.length < 2) {
            ui.notifications.warn(`Need at least 2 points to create a wall.`);
            return;
        }

        const minPoints = this.activity.wallType === 'circular' ? 2 : 2;
        if (this.placementPoints.length < minPoints) {
            ui.notifications.warn(`${this._getWallTypeLabel()} walls require at least ${minPoints} points.`);
            return;
        }

        const segments = WallData.calculateWallSegments(
            this.placementPoints,
            this.activity.wallType
        );

        if (segments.length === 0) {
            ui.notifications.warn(`No valid wall segments could be created.`);
            return;
        }

        const wallConfig = {
            blocksMovement: this.activity.blocksMovement,
            blocksSight: this.activity.blocksSight,
            blocksSound: this.activity.blocksSound,
            activityId: this.activity.id,
            facing: this.selectedFacing,
            referencePoint: this.referencePoint,
        };

        try {
            const walls = await WallData.createWallDocuments(segments, wallConfig);

            ui.notifications.info(`Created ${walls.length} wall segments (${Math.round(this.currentLength)} ft total).`);
            this.close();
        } catch (error) {
            console.error('Failed to create wall:', error);
            ui.notifications.error(`Failed to create wall: ${error.message}`);
        }
    }

    async _onClearPoints() {
        this.placementPoints = [];
        this.currentLength = 0;
        await this._clearPreviewTemplates();
        this.render();
    }

    _onCancelWall() {
        this.close();
    }

    _startCanvasPlacement() {
        if (this.canvasClickHandler) {
            game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
        }

        this.canvasClickHandler = this._onCanvasClick.bind(this);
        game.canvas.stage.on(`mouseup`, this.canvasClickHandler);
    }

    async _onCanvasClick(event) {
        const pos = game.canvas.canvasCoordinatesFromClient(event.data.originalEvent);
        const snappedPos = game.canvas.grid.getCenterPoint({
            x: Math.round(pos.x * 10) / 10,
            y: Math.round(pos.y * 10) / 10
        });

        const newLength = this._calculateTotalLength([...this.placementPoints, snappedPos]);
        if (newLength > this.maxLength) {
            ui.notifications.warn(`Adding this point would exceed maximum wall length of ${this.maxLength} feet.`);
            return;
        }

        this.placementPoints.push(snappedPos);
        this.currentLength = newLength;

        if (this.activity.wallType === 'circular' && this.placementPoints.length >= 2) {
            game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
            this.canvasClickHandler = null;
            this.isPlacing = false;
        }

        await this._updatePreview();
        this.render();
    }

    async _onReferenceClick(event) {
        const pos = game.canvas.canvasCoordinatesFromClient(event.data.originalEvent);
        const snappedPos = game.canvas.grid.getCenterPoint({
            x: Math.round(pos.x * 10) / 10,
            y: Math.round(pos.y * 10) / 10
        });

        if (this.referenceRange > 0) {
            const originToken = CanvasData.getOriginToken(this.actor);
            if (originToken) {
                const distance = CanvasData.calculateCoordDistance(
                    snappedPos.x, snappedPos.y,
                    originToken.x + (originToken.w / 2),
                    originToken.y + (originToken.h / 2),
                );

                if (distance > this.referenceRange) {
                    ui.notifications.warn(`Reference point must be within ${this.referenceRange} feet.`);
                    return;
                }
            }
        }

        this.referencePoint = snappedPos;
        await this._createReferenceMarker();

        game.canvas.stage.off(`mouseup`, this.canvasClickHandler);
        this.canvasClickHandler = null;
        this.isPlacingReference = false;
        this.render();
    }

    _calculateTotalLength(points) {
        if (points.length < 2) return 0;

        let totalLength = 0;

        if (this.activity.wallType === 'circular' && points.length >= 2) {
            const radius = CanvasData.calculateCoordDistance(points[0].x, points[0].y, points[1].x, points[1].y);
            totalLength = radius;
        } else {
            for (let i = 0; i < points.length - 1; i++) {
                const distance = CanvasData.calculateCoordDistance(
                    points[i].x, points[i].y,
                    points[i + 1].x, points[i + 1].y
                );
                totalLength += distance;
            }
        }

        return totalLength;
    }

    async _updatePreview() {
        await this._clearPreviewTemplates();

        for (const point of this.placementPoints) {
            const pointTemplate = await this._createPointMarker(point);
            this.previewTemplates.push(pointTemplate);
        }

        if (this.placementPoints.length < 2) return;

        const segments = WallData.calculateWallSegments(
            this.placementPoints,
            this.activity.wallType,
        );
        
        for (const segment of segments) {
            const lineTemplate = await this._createLineSegment(segment);
            this.previewTemplates.push(lineTemplate);
        }
    }

    async _createPointMarker(point) {
        return await CanvasData.createMeasuredTemplate({
            t: `circle`,
            x: point.x,
            y: point.y,
            distance: 0,
            fillColor: `#4ecdc4`,
            borderColor: `#26a69a`,
        });
    }

    async _createLineSegment(segment) {
        const length = Math.sqrt(
            Math.pow(segment.x2 - segment.x1, 2) + 
            Math.pow(segment.y2 - segment.y1, 2)
        );
        const angle = Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1);

        return await CanvasData.createMeasuredTemplate({
            t: `ray`,
            x: segment.x1,
            y: segment.y1,
            direction: Math.toDegrees(angle),
            distance: length / game.canvas.grid.size * game.canvas.grid.distance,
            fillColor: `#ff6b6b`,
            borderColor: `#ff4757`,
        });
    }
    
    async _clearPreviewTemplates() {
        for (const template of this.previewTemplates) {
            await CanvasData.removeMeasuredTemplate(template);
        }
        this.previewTemplates = [];
    }

    _getWallTypeLabel() {
        switch (this.activity.wallType) {
            case 'circular': return 'Circular';
            default: return 'Contiguous';
        }
    }
}
