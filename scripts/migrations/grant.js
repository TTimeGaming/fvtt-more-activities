export class GrantMigrations {
    static async migrate(currentVersion) {
        if (foundry.utils.isNewerVersion(`1.8.2`, currentVersion))
            await this.migrateToV182();
    }

    static async migrateToV182() {
        console.log(`More Activities: Migrating grant activities to cost groups format...`);

        const items = game.items.filter(item => item.system?.activities?.some(activity => activity.type === `grant`));
        const actors = game.actors.filter(actor => actor.items?.some(item => item.system?.activities?.some(activity => activity.type === `grant`)));

        let migrationCount = 0;

        for (const item of items) {
            let itemUpdated = false;
            const updates = {};

            for (const [activityId, activity] of item.system.activities.entries()) {
                if (activity.type !== `grant`) continue;

                const migrationData = this._migrateCostGroups(activity);
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
                    if (activity.type !== `grant`) continue;

                    const migrationData = this._migrateCostGroups(activity);
                    if (migrationData) {
                        console.log(migrationData);
                        
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

        console.log(`More Activities: Migrated ${migrationCount} grant activities to cost groups format`);
    }

    static _migrateCostGroups(activity) {
        const changes = {};

        const hasOldCosts = (activity.baseCost != `` && activity.baseCost != `0`) || (activity.spellCostPerLevel != `` && activity.spellCostPerLevel != `0`);
        if (hasOldCosts) {
            const costGroups = [];
            costGroups.push({
                id: foundry.utils.randomID(),
                name: `Migrated Costs`,
                type: `currency`,
                baseCurrencyAmount: activity.baseCost ?? ``,
                baseCurrencyCoin: activity.baseCostCurrency ?? `gp`,
                spellCurrencyAmount: activity.spellCostPerLevel ?? ``,
                spellCurrencyCoin: activity.spellCostPerLevelCurrency ?? `gp`,
                itemUuid: ``,
                itemUses: ``,
            });

            changes[`costGroups`] = costGroups;
            changes[`-=baseCost`] = null;
            changes[`-=baseCostCurrency`] = null;
            changes[`-=spellCostPerLevel`] = null;
            changes[`-=spellCostPerLevelCurrency`] = null;
        }

        let itemCustomizations;
        try {
            itemCustomizations = JSON.parse(activity.itemCustomizations ?? `{}`);
        }
        catch {
            itemCustomizations = {};
        }

        const hasOldCustomizations = Object.values(itemCustomizations).some(customization => (customization.individualCost != `` && customization.individualCost != `0`) || (customization.itemSpellCostPerLevel != `` && customization.itemSpellCostPerLevel != `0`));
        if (hasOldCustomizations) {
            const newCustomizations = {};

            let hasChanged = false;
            for (const key of Object.keys(itemCustomizations)) {
                const customization = itemCustomizations[key];

                const hasOld = (customization.individualCost != `` && customization.individualCost != `0`) || (customization.spellCostPerLevel != `` && customization.spellCostPerLevel != `0`);
                if (!hasOld) {
                    newCustomizations[key] = customization;
                    continue;
                }

                if (customization.costGroups !== undefined) {
                    newCustomizations[key] = customization;
                    continue;
                }

                const costGroups = [{
                    id: foundry.utils.randomID(),
                    name: `Migrated Costs`,
                    type: `currency`,
                    baseCurrencyAmount: customization.individualCost ?? ``,
                    baseCurrencyCoin: customization.individualCostCurrency ?? `gp`,
                    spellCurrencyAmount: customization.spellCostPerLevel ?? ``,
                    spellCurrencyCoin: customization.spellCostPerLevelCurrency ?? `gp`,
                    itemUuid: ``,
                    itemUses: ``,
                }];
                
                newCustomizations[key] = {
                    maxUses: customization.maxUses,
                    recovery: customization.recovery,
                    asScroll: customization.asScroll,
                    costGroups: costGroups,
                };
                hasChanged = true;
            }

            if (hasChanged) {
                changes[`itemCustomizations`] = JSON.stringify(newCustomizations);
            }
        }

        return Object.keys(changes).length > 0 ? changes : null;
    }
}
