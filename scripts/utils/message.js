import { CanvasData } from './canvas.js';
import { DomData } from './dom.js';

export class MessageData {
    static addActivityButton(message, html, requiresToken, activityType, buttonText, clickCallback) {
        if (message.flags?.dnd5e?.activity?.type !== activityType) return;

        html = DomData.toElement(html);
        if (!html) return;

        const button = document.createElement(`button`);
        button.type = `button`;
        button.innerHTML = `
            <dnd5e-icon src="modules/more-activities/icons/${activityType}.svg" style="--icon-fill: var(--button-text-color)"></dnd5e-icon>
            <span>${buttonText}</span>
        `;

        let buttons = html.querySelector(`.card-buttons`);
        if (!buttons) {
            buttons = document.createElement(`div`);
            buttons.classList.add(`card-buttons`);
            html.querySelector(`.card-header`)?.insertAdjacentElement(`afterend`, buttons);
        }
        if (!buttons) return;

        button.addEventListener(`click`, () => {
            const actor = game.actors.get(message.speaker?.actor);
            if (!actor) return;
            if (!actor.testUserPermission(game.user, `OWNER`)) return;

            const item = actor.items.get(message.flags?.dnd5e?.item?.id);
            if (!item) return;

            const activity = item.system.activities.get(message.flags?.dnd5e?.activity?.id);
            if (!activity) return;

            if (requiresToken) {
                const token = CanvasData.getOriginToken(actor);
                if (!token) return;
            }

            clickCallback?.(activity);
        });

        buttons.prepend(button);
    }
}
