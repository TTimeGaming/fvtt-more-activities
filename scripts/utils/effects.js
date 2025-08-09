export class EffectsData {
    static async apply(activity, actors) {
        if (activity?.appliedEffects?.length === 0) return;

        for (const actor of actors) {
            const item = activity?.item;
            for (const effectId of activity.appliedEffects) {
                const effect = item?.effects?.get(effectId);
                if (!effect) {
                    console.warn(`Effect ${effectId} not found on item ${item?.name}`);
                    continue;
                }
                
                try {
                    const effectData = effect.toObject();
                    effectData.origin = item?.uuid;
                    await actor.createEmbeddedDocuments(`ActiveEffect`, [ effectData ]);
                    ui.notifications.info(`Applied ${effect.name} to ${actor.name}`);
                }
                catch (error) {
                    console.error(`Failed to apply effect ${effect.name} to ${actor.name}:`, error);
                    ui.notifications.error(`Failed to apply effect ${effect.name} to ${actor.name}`);
                }
            }
        }
    }
}
