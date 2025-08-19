export class EffectsData {
    static async apply(activity, actors, appliedEffects) {
        if (appliedEffects?.length === 0) return;

        const item = activity?.item;
        for (const effectId of appliedEffects) {
            const effect = item?.effects?.get(effectId);
            if (!effect) {
                console.warn(`Effect ${effectId} not found on item ${item?.name}`);
                continue;
            }
            
            let effectData = undefined;
            try {
                effectData = {
                    ...effect.toObject(),
                    disabled: false,
                    transfer: false,
                    origin: effect.uuid,
                };
            }
            catch (error) {
                console.error(`Failed to identify effect ${effect.name}:`, error);
                continue;
            }

            for (const actor of actors) {
                await (actor.isToken ? game.actors.get(actor.parent.actorId) : actor).createEmbeddedDocuments(`ActiveEffect`, [ effectData ]);
                ui.notifications.info(`Applied ${effect.name} to ${actor.name}`);
            }
        }
    }
}
