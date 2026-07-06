import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `chain`;

export class ChainData {
    static adjustActivitySheet(sheet, html) {
        if (!ChainData.isActivityChained(sheet?.activity?.item, sheet?.activity?.id))
            return;

        sheet.element?.classList.add(`chained-activity`);
        sheet.element?.querySelector(`.window-header .window-icon`)?.classList.add(`fa-link`);
        DomData.disableTab(html, `activation`, game.i18n.localize(`DND5E.ACTIVITY.FIELDS.chain.blockedActivity.label`));
    }

    static applyListeners(message, html) {
        html.querySelectorAll(`.chain-trigger-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const itemId = event.currentTarget.dataset.itemId;
                const activityIndex = parseInt(event.currentTarget.dataset.activityIndex);
                const triggerLabel = event.currentTarget.dataset.triggerLabel;

                const item = game.items.get(itemId) || game.actors.contents
                    .flatMap(a => a.items.contents)
                    .find(i => i.id === itemId);
                if (!item) return;

                const chainActivity = item.system.activities.find(a => a.type === TEMPLATE_NAME);
                if (!chainActivity) return;

                await chainActivity.continueChainFrom(activityIndex, triggerLabel);
            });
        });
    }

    static async removeActivities(item, html) {
        DomData.disableDialogActivities(item, html, (activity) => {
            return !ChainData.isActivityChained(item, activity.id);
        });
    }
    
    static isActivityChained(item, activityId) {
        if (!item?.system?.activities) return false;
        
        for (const activity of item.system.activities) {
            if (activity.type === TEMPLATE_NAME && activity.chainedActivityIds) {
                if (activity.chainedActivityIds.includes(activityId)) {
                    return true;
                }
            }
        }

        return false;
    }
}
