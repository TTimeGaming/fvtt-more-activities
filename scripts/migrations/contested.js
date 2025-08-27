export class ContestedMigrations {
    static async migrate(currentVersion) {
        if (foundry.utils.isNewerVersion(`1.8.0`, currentVersion))
            await this.migrateToV180();
    }

    static async migrateToV180() {
        console.log(`More Activities: Migrating contested activities to effect groups format...`);

        const items = game.items.filter(item => item.system?.activities?.some(activity => activity.type === `contested`));
        const actors = game.actors.filter(actor => actor.items?.some(item => item.system?.activities?.some(activity => activity.type === `contested`)));

        let migrationCount = 0;

        for (const item of items) {
            let itemUpdated = false;
            const updates = {};

            for (const [activityId, activity] of item.system.activities.entries()) {
                if (activity.type !== `contested`) continue;

                const migrationData = this._migrateEffectGroups(activity);
                if (migrationData) {
                    updates[`system.activities.${activityId}`] = migrationData;
                    itemUpdated = true;
                }
            }

            if (itemUpdated) {
                await item.update(updates);
                migrationCount++;
            }
        }

        for (const actor of actors) {
            for (const item of actor.items) {
                let itemUpdated = false;
                const updates = {};

                for (const [activityId, activity] of item.system.activities.entries()) {
                    if (activity.type !== `contested`) continue;

                    const migrationData = this._migrateEffectGroups(activity);
                    if (migrationData) {
                        updates[`system.activities.${activityId}`] = migrationData;
                        itemUpdated = true;
                    }
                }

                if (itemUpdated) {
                    await item.update(updates);
                    migrationCount++;
                }
            }
        }

        console.log(`More Activities: Migrated ${migrationCount} contested activities to effect groups format`);
    }

    static _migrateEffectGroups(activity) {
        const hasOldEffects = (activity.appliedEffects?.length ?? 0) > 0 || (activity.appliedEffectsMinor?.length ?? 0) > 0 || (activity.appliedEffectsMajor?.length ?? 0) > 0;
        if (!hasOldEffects) return null;

        const effectGroups = [];
        const oldEffects = activity.appliedEffects || [];
        const oldEffectsMinor = activity.appliedEffectsMinor || [];
        const oldEffectsMajor = activity.appliedEffectsMajor || [];

        effectGroups.push({
            id: foundry.utils.randomID(),
            name: `Migrated Effects`,
            applyTo: activity.applyEffectsTo || `loserDefender`,
            appliedEffects: oldEffects,
            appliedEffectsMinor: oldEffectsMinor,
            appliedEffectsMajor: oldEffectsMajor,
        });
        
        return {
            effectGroups: effectGroups,
            '-=applyEffectsTo': null,
            '-=appliedEffects': null,
            '-=appliedEffectsMinor': null,
            '-=appliedEffectsMajor': null,
        };
    }
}
