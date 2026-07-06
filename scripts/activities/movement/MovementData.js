// should be the same as teleport!

import { MessageData } from '../../utils/message.js';
import { CanvasData } from '../../utils/canvas.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `movement`;

import { MovementTargetApp } from './MovementTargetApp.js';

export class MovementData {
    static applyListeners(message, html) {
        MessageData.addActivityButton(message, html, true,
            TEMPLATE_NAME, `Force Movement`, (activity) => {
                const app = new MovementTargetApp(activity);
                if (!app.shouldBypassTargeting())
                    app.render(true);
            }
        );
    }

    static calculateMovementDestination(origin, target, distance, movementType) {
        const originCenter = {
            x: origin.x + (origin.w / 2),
            y: origin.y + (origin.h / 2)
        };
        
        const targetCenter = {
            x: target.x + (target.w / 2),
            y: target.y + (target.h / 2)
        };

        let path = null;
        if (movementType === `push`) {
            const vector = {
                x: targetCenter.x - originCenter.x,
                y: targetCenter.y - originCenter.y,
            };
            const length = Math.hypot(vector.x, vector.y);
            if (length === 0) return game.canvas.grid.getTopLeftPoint(targetCenter);

            const gridDistance = game.canvas.grid.distance || 5;
            const pixelDistance = (Number(distance) || 0) * game.canvas.grid.size / gridDistance;
            const destinationCenter = {
                x: targetCenter.x + (vector.x / length) * pixelDistance * 2,
                y: targetCenter.y + (vector.y / length) * pixelDistance * 2,
            };

            path = game.canvas.grid.getDirectPath([targetCenter, destinationCenter]);
        } else if (movementType === `pull`) {
            path = game.canvas.grid.getDirectPath([targetCenter, originCenter]);
        }
        if (!path?.length) return game.canvas.grid.getTopLeftPoint(targetCenter);

        let movementDistance = 0;
        let destination = path[0];
        for (let i = 1; i < path.length; i++) {
            const currentPoint = path[i];
            movementDistance += game.canvas.grid.measurePath([destination, currentPoint]).cost;
            if (movementDistance > distance) break;

            destination = currentPoint;
        }
        return game.canvas.grid.getTopLeftPoint(destination);
    }

    static async executeSingleTokenMovement(actor, x, y) {
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
