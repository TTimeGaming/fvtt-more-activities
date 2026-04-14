import { ChainData } from './activities/chain.js';

export class Compat {
    static async init() {
        await this._handleLibWrapper();
    }

    static async _handleLibWrapper() {
        const originalItem5eUse = CONFIG.Item.documentClass.prototype.use;
        if (globalThis.libWrapper?.register) {
            try {
                globalThis.libWrapper.register(`more-activities`, `dnd5e.documents.Item5e.prototype.use`, function(wrapped, ...args) {
                    return Compat._useSuitableActivity(this, () => wrapped(...args), args);
                }, `MIXED`);
                return;
            }
            catch(error) {
                console.warn(`More Activities | libWrapper registration failed, using direct Item#use patch`, error);
            }
        }
        
        CONFIG.Item.documentClass.prototype.use = async function(...args) {
            return Compat._useSuitableActivity(this, () => originalItem5eUse.apply(this, args), args);
        }
    }

    static async _useSuitableActivity(item, wrappedUse, args) {
        const usableActivities = item.system.activities?.filter(activity => activity.canUse) ?? [];
        if (usableActivities.length === 0) return wrappedUse();

        const activities = Compat._obtainSuitableActivities(item);
        if (activities.length === 0) return;
        if (activities.length > 1) return wrappedUse();

        const [config = {}, dialog = {}, message = {}] = args;
        const { chooseActivity, ...activityConfig } = config ?? {};
        return activities[0].use(activityConfig, dialog ?? {}, message ?? {});
    }

    static _obtainSuitableActivities(item) {
        const activities = item.system.activities?.filter(activity => activity.canUse) ?? [];
        const hookActivities = activities.filter(a => a.type === `hook` && !a.manualTrigger).map(a => a.id);
        const chainActivities = activities.filter(a => ChainData.isActivityChained(item, a.id)).map(a => a.id);
        return activities.filter(a => !hookActivities.includes(a.id) && !chainActivities.includes(a.id));
    }
}
