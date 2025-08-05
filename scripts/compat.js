import { ChainData } from './chain.js';

export class Compat {
    static async init() {
        await this._handleLibWrapper();
    }

    static async _handleLibWrapper() {
        if (typeof libWrapper === `function`) {
            libWrapper.register(`more-activities`, `dnd5e.documents.Item5e.prototype.use`, function(wrapped, ...args) {
                const activities = Compat._obtainSuitableActivities(this);
                if (activities.length > 1) return wrapped(...args);
                return activities[0].use(...args);
            });
            return;
        }
        
        const originalItem5eUse = CONFIG.Item.documentClass.prototype.use;
            CONFIG.Item.documentClass.prototype.use = async function(config={}, dialog={}, message={}) {
                const activities = Compat._obtainSuitableActivities(this);
                if (activities.length > 1) {
                    return await originalItem5eUse.call(this, config, dialog, message);
                }

                const { chooseActivity, ...activityConfig } = config;
                let usageConfig = activityConfig;
                return activities[0].use(usageConfig, dialog, message);
            }
    }

    static _obtainSuitableActivities(item) {
        const hookActivities = item.system.activities.filter(a => a.type === `hook` && !a.manualTrigger).map(a => a.id);
        const chainActivities = item.system.activities.filter(a => ChainData.isActivityChained(item, a.id)).map(a => a.id);
        return item.system.activities.filter(a => !hookActivities.includes(a.id) && !chainActivities.includes(a.id));
    }
}
