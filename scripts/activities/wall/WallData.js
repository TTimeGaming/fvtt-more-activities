import { DomData } from '../../utils/dom.js';
import { FieldsData } from '../../utils/fields.js';
import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `wall`;

export class WallData {
    static get wallDirections() {
        return CONST.EDGE_DIRECTIONS ?? CONST.WALL_DIRECTIONS;
    }

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
        const directions = this.wallDirections;
        switch (facing) {
            case `towards`: return cross > 0 ? directions.LEFT : directions.RIGHT;
            case `away`: return cross > 0 ? directions.RIGHT : directions.LEFT;
            default: return directions.BOTH;
        }
    }

    static calculateWallSegments(points, wallType, panelSize = 5, panelSpacing = 0, maxPanels = `unlimited`) {
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
            case `panels`:
                if (points.length < 2) break;

                const continuousSegments = [];
                for (let i = 0; i < points.length - 1; i++) {
                    continuousSegments.push({
                        x1: points[i].x, y1: points[i].y,
                        x2: points[i + 1].x, y2: points[i + 1].y,
                    });
                }

                const panelSizeCanvas = (panelSize * game.canvas.grid.size) / game.canvas.grid.distance;
                const spacingCanvas = (panelSpacing * game.canvas.grid.size) / game.canvas.grid.distance;

                let panelCount = 0;
                const maxPanelsNum = maxPanels === `unlimited` ? Infinity : parseInt(maxPanels);

                for (const baseSegment of continuousSegments) {
                    const segmentLength = Math.sqrt(
                        Math.pow(baseSegment.x2 - baseSegment.x1, 2) +
                        Math.pow(baseSegment.y2 - baseSegment.y1, 2)
                    );
                    if (segmentLength === 0) continue;

                    const unitX = (baseSegment.x2 - baseSegment.x1) / segmentLength;
                    const unitY = (baseSegment.y2 - baseSegment.y1) / segmentLength;

                    const panelSpacing = panelSizeCanvas + spacingCanvas;
                    let currentPos = 0;

                    while (currentPos + panelSizeCanvas <= segmentLength && panelCount < maxPanelsNum) {
                        const startX = baseSegment.x1 + unitX * currentPos;
                        const startY = baseSegment.y1 + unitY * currentPos;
                        const endX = baseSegment.x1 + unitX * (currentPos + panelSizeCanvas);
                        const endY = baseSegment.y1 + unitY * (currentPos + panelSizeCanvas);

                        segments.push({
                            x1: startX, y1: startY,
                            x2: endX, y2: endY,
                            type: `wall_segment`,
                        });

                        currentPos += panelSpacing;
                        panelCount++;
                    }

                    if (panelCount >= maxPanelsNum) break;
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
                dir: wallConfig.referencePoint && wallConfig.facing !== `both` ? this.calculateWallDirection(segment, wallConfig.referencePoint, wallConfig.facing) : this.wallDirections.BOTH,
                door: CONST.WALL_DOOR_TYPES.NONE,
                ds: CONST.WALL_DOOR_STATES.CLOSED,
            };
            
            walls.push(wallData);
        }
        
        return await game.canvas.scene.createEmbeddedDocuments('Wall', walls);
    }
}
