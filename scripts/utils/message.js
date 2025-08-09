import { CanvasData } from './canvas.js';

export class MessageData {
    static addActivityButton(message, html, requiresToken, activityType, buttonText, clickCallback) {
        if (message.flags?.dnd5e?.activity?.type !== activityType) return;

        const button = $(`
            <button type="button">
                <dnd5e-icon src="modules/more-activities/icons/${activityType}.svg" style="--icon-fill: var(--button-text-color)"></dnd5e-icon>
                <span>${buttonText}</span>
            </button>`
        );

        let buttons = $(html).find(`.card-buttons`);
        if (buttons.length === 0) {
            buttons = $(`<div class="card-buttons"></div>`);
            $(html).find(`.card-header`).after(buttons);
        }

        button.on(`click`, () => {
            const actor = game.actors.get(message.speaker.actor);
            if (!actor.testUserPermission(game.user, `OWNER`)) return;

            const item = actor.items.get(message.flags.dnd5e.item.id);
            if (!item) return;

            const activity = item.system.activities.get(message.flags.dnd5e.activity.id);
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
