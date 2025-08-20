export class CanvasData {
    static getAngleBetween(origin, target) {
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        return Math.atan2(dy, dx);
    }

    static calculateTokenDistance(token1, token2) {
        if (!token1 || !token2) return Infinity;
        if (token1._destroyed || token2._destroyed) return Infinity;

        return game.canvas.grid.measurePath([
            { x: token1.x + (token1.w / 2), y: token1.y + (token1.h / 2) },
            { x: token2.x + (token2.w / 2), y: token2.y + (token2.h / 2) }
        ]).cost;
    }

    static calculateCoordDistance(xPos1, yPos1, xPos2, yPos2) {
        return game.canvas.grid.measurePath([
            { x: xPos1, y: yPos1 },
            { x: xPos2, y: yPos2 }
        ]).cost;
    }

    static getOriginToken(actor) {
        return actor != null ? game.canvas.tokens.placeables.find(token => token.actor?.id === actor.id) : null;
    }

    static getTokensInRange(originToken, range) {
        if (!originToken) return [];

        return game.canvas.tokens.placeables
            .filter(token => token !== originToken)
            .map(token => {
                const distance = this.calculateTokenDistance(originToken, token);
                return {
                    token: token,
                    actor: token.actor,
                    distance: distance,
                    inRange: distance <= range,
                };
            })
            .filter(token => token.inRange)
            .sort((a, b) => a.distance - b.distance)
        ;
    }

    static async updateCombatants(oldTokens, newTokens) {
        for (var i = 0; i < oldTokens.length; i++) {
            const combatant = game.combat?.combatants?.find(c => c.tokenId === oldTokens[i]);
            if (!combatant) continue;
            
            await combatant.update({
                _id: combatant.id,
                tokenId: newTokens[i]
            });
        }
    }

    static async createMeasuredTemplate({ x, y, distance, w = 0, h = 0, direction = 0, t = `circle`, borderColor = `#ffffff`, fillColor = `#ffffff` }) {
        const maxDim = Math.max(w / game.canvas.grid.sizeX, h / game.canvas.grid.sizeY) * game.canvas.grid.distance;
        const data = {
            t: t,
            user: game.user.id,
            x: x,
            y: y,
            borderColor: borderColor,
            fillColor: fillColor,
        };

        switch (data.t) {
            case `circle`:
                data.distance = distance + (maxDim / 2);
            case `ray`:
                data.distance = distance + (maxDim / 2);
                data.direction = direction;
                data.width = w;
                break;
            default:
                data.width = w;
                data.distance = distance + (maxDim / 2);
                break;
        }

        const [template] = await game.canvas.scene.createEmbeddedDocuments(`MeasuredTemplate`, [data]);
        const object = game.canvas.templates.get(template.id);
        object.controlIcon.visible = false;
        return object;
    }

    static async removeMeasuredTemplate(measuredTemplate) {
        if (!measuredTemplate || measuredTemplate.destroyed) return;

        if (measuredTemplate.document) {
            await game.canvas.scene.deleteEmbeddedDocuments(`MeasuredTemplate`, [measuredTemplate.document.id]);
        }
        else {
            game.canvas.templates.removeChild(measuredTemplate);
            measuredTemplate.clear();
            measuredTemplate.destroy();
        }
    }
}
