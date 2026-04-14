import { MessageData } from '../../utils/message.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `contested`;

import { ContestedData } from './ContestedData.js';
import { ContestedManager } from './ContestedManager.js';

export class ContestedDefenderApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `contested-defender-app` ],
        tag: `form`,
        position: {
            width: 300,
            height: `auto`,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/contested-defender.hbs`,
        },
    };

    constructor(contestId, actor, side, options = {}) {
        super({
            window: {
                title: `Contest Roll`,
            },
            ...options,
        });
        this.contestId = contestId;
        this.actor = actor;
        this.side = side;
        this.contest = ContestedManager.contests.get(contestId);
    }

    /** @inheritdoc */
    async _prepareContext() {
        const rollType = this.side === `attacker` ?
            this.contest.activityData.attackerRollType :
            this.contest.activityData.defenderRollType
        ;
        const options = this.side === `attacker` ?
            this.contest.activityData.attackerOptions :
            this.contest.activityData.defenderOptions
        ;

        return {
            contest: this.contest,
            actor: this.actor,
            side: `${this.side[0].toUpperCase()}${this.side.substring(1)}`,
            rollOptions: ContestedData.getOptionLabels(rollType, options, this.contest.activityData, this.actor)
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        if (!this.element.querySelector(`.window-subtitle`)) {
            const subtitle = document.createElement(`h2`);
            subtitle.classList.add(`window-subtitle`);
            subtitle.innerText = this.contest.activityData.itemName || this.contest.activityData.name || ``,
            this.element.querySelector(`.window-header .window-title`).insertAdjacentElement(`afterend`, subtitle);
        }

        this.element.querySelectorAll(`.roll-option-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const option = event.target.dataset.option;
                await this._performRoll(option);
            });
        });
    }

    async _performRoll(option) {
        const rollType = this.side === 'attacker' ? 
            this.contest.activityData.attackerRollType : 
            this.contest.activityData.defenderRollType
        ;
            
        let roll;
        switch (rollType) {
            case 'ability':
                roll = await this.actor.rollAbilityCheck({ ability: option });
                break;
            case 'skill':
                roll = await this.actor.rollSkill({ skill: option });
                break;
            case 'spellcasting':
                roll = await this.actor.rollAbilityCheck({ ability: this.actor.system.attributes.spellcasting });
                break;
            case 'custom':
                const custom = new Roll(`1d20 + ${this.contest.activityData.attackerCustom}`, this.actor.getRollData());
                await custom.toMessage({ flavor: `Custom Contested Roll` });
                roll = [custom];
                break;
        }
        
        if (!roll || !roll[0]) return;

        await ContestedManager.recordRoll(this.contestId, this.actor.id, {
            total: roll[0].total,
            formula: roll[0].formula,
            option: option,
            rollType: rollType,
            roll: roll[0],
        });
        this.close();
    }
}
