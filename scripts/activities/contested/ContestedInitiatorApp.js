import { MessageData } from '../../utils/message.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `contested`;

import { ContestedData } from './ContestedData.js';
import { ContestedManager } from './ContestedManager.js';
import { ContestedDefenderApp } from './ContestedDefenderApp.js';

export class ContestedInitiatorApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `contested-initiator-app` ],
        tag: `form`,
        position: {
            width: 400,
            height: `auto`,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/contested-initiator.hbs`,
        },
    };

    constructor(activity, options = {}) {
        super({
            window: {
                title: `Select Targets`,
            },
            ...options,
        });
        this.activity = activity;
        this.actor = activity?.actor;
        this.contest = ContestedManager.createContest(activity);
        this.selectedDefenders = [];
        this._prepopulateDefenders();
    }

    /** @inheritdoc */
    async _prepareContext() {
        const defendersData = await this._getPotentialDefenders();
        return {
            isGM: game.user.isGM,
            activity: this.activity,
            defendersData: defendersData,
            selectedDefenders: this.selectedDefenders.map((element, index) => ({
                ...element,
                index: index,
            })),
            attackerOptions: ContestedData.getOptionLabels(
                this.activity.attackerRollType, 
                this.activity.attackerOptions, 
                this.activity,
                this.activity.actor
            )
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        DomData.addSubtitle(this.element, this.activity);

        this.element.querySelector(`select[name="defenderId"]`).addEventListener(`change`, async(event) => {
            const selectElement = event.currentTarget;
            const actorId = selectElement.value;
            if (!actorId || this.selectedDefenders.find(d => d.id === actorId)) return;

            const actor = game.actors.get(actorId);
            if (!actor) return;

            const optionElement = selectElement.querySelector(`option[value="${actorId}"]`);
            this.selectedDefenders.push({
                ...actor,
                id: actorId,
                defenderType: optionElement.parentElement.getAttribute(`data-type`),
            });
            this.render();
        });

        this.element.querySelectorAll(`.defender-delete-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.dataset.index);
                const selectedDefenders = this.selectedDefenders.filter((_, i) => i !== index);
                this.selectedDefenders = selectedDefenders;
                this.render();
            });
        });

        this.element.querySelector(`.start-contest-btn`).addEventListener(`click`, async(event) => {
            if (this.selectedDefenders.length === 0) {
                ui.notifications.warn(`Select at least one defender`);
                return;
            }

            for (const defender of this.selectedDefenders) {
                await ContestedManager.promptDefender(this.contest.id, defender);
            }

            new ContestedDefenderApp(this.contest.id, this.actor, `attacker`).render(true);
            this.close();
        });
    }

    /**
     * Get potential defender actors
     * @returns {Promise<Object>}
     * @private
     */
    async _getPotentialDefenders() {
        const isGM = game.user.isGM;
        const targets = Array.from(game.user.targets).map(token => token.actor).filter(actor => actor && actor !== this.actor);

        let playerCharacters = [];
        let nonPlayerCharacters = [];
        let allTokens = [];

        if (this.activity.allowPlayerTargeting || isGM) {
            const selectedActorsIds = this.selectedDefenders.map(actor => actor.id);

            if (isGM) {
                playerCharacters = game.actors.filter(actor => actor.type === `character` && actor !== this.actor && !selectedActorsIds.includes(actor.id));
                nonPlayerCharacters = game.actors.filter(actor => actor.type !== `character` && actor !== this.actor && !selectedActorsIds.includes(actor.id));

                const scene = game.scenes.current;
                if (scene) {
                    allTokens = scene.tokens
                        .map(token => token.actor)
                        .filter(actor => actor && actor !== this.actor && actor.type !== `character` && !selectedActorsIds.includes(actor.id))
                    ;
                }
            }
            else {
                playerCharacters = game.actors.filter(actor => actor.type === `character` && actor.isOwner && actor !== this.actor && !selectedActorsIds.includes(actor.id));
                nonPlayerCharacters = game.actors.filter(actor => actor.type !== `character` && actor.isOwner && actor !== this.actor && !selectedActorsIds.includes(actor.id));
            }
        }
        
        return {
            targets: targets.filter(t => !this.selectedDefenders.find(d => d.id === t.id)),
            playerCharacters: playerCharacters.filter(t => !this.selectedDefenders.find(d => d.id === t.id)),
            nonPlayerCharacters: nonPlayerCharacters.filter(t => !this.selectedDefenders.find(d => d.id === t.id)),
            allTokens: allTokens.filter(t => !this.selectedDefenders.find(d => d.id === t.id)),
            hasMultipleGroups: [ targets, playerCharacters, nonPlayerCharacters, allTokens ].filter(group => group.length > 0).length > 1,
        };
    }

    async _prepopulateDefenders() {
        for (const target of Array.from(game.user.targets).map(token => token.actor).filter(actor => actor && actor !== this.actor)) {
            this.selectedDefenders.push({
                ...target,
                id: target.id,
                defenderType: `Target`
            });
        }
    }
}
