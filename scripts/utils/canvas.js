export class CanvasData {
    static getAngleBetween(origin, target) {
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        return Math.atan2(dy, dx);
    }

    static calculateTokenDistanceSqr(token1, token2) {
        if (!token1 || !token2) return Infinity;
        if (token1._destroyed || token2._destroyed) return Infinity;

        return game.canvas.grid.measurePath([
            { x: token1.x + (token1.w / 2), y: token1.y + (token1.h / 2) },
            { x: token2.x + (token2.w / 2), y: token2.y + (token2.h / 2) }
        ]).cost;
    }

    static calculateCoordDistanceSqr(xPos1, yPos1, xPos2, yPos2) {
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
                const distance = this.calculateTokenDistanceSqr(originToken, token);
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

    static createMeasuredTemplate({ x, y, w, h, distance, t = `circle`, borderColor = `#ffffff`, fillColor = `#ffffff` }) {
        const maxDim = Math.max(w / game.canvas.grid.sizeX, h / game.canvas.grid.sizeY) * game.canvas.grid.distance;
        const data = {
            t: t,
            user: game.user.id,
            x: x,
            y: y,
            distance: distance + (maxDim / 2),
            borderColor: borderColor,
            fillColor: fillColor,
        };
        const document = new CONFIG.MeasuredTemplate.documentClass(data, { parent: game.canvas.scene });

        const object = new CONFIG.MeasuredTemplate.objectClass(document);
        object.draw();
        game.canvas.templates.addChild(object);
        return object;
    }

    static removeMeasuredTemplate(measuredTemplate) {
        game.canvas.templates.removeChild(measuredTemplate);
        measuredTemplate.clear();
        measuredTemplate.destroy();
    }
}
