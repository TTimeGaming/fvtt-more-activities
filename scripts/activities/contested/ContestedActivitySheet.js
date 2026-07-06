import { MessageData } from '../../utils/message.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
import { ensureActivityInferredSource } from '../../utils/activity.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `contested`;

export class ContestedActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-${TEMPLATE_NAME}` ]
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/${TEMPLATE_NAME}-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        },
    };
    
    /** @inheritdoc */
    async _prepareContext(options) {
        ensureActivityInferredSource(this.activity);
        return super._prepareContext(options);
    }

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);

        const abilities = Object.keys(CONFIG.DND5E.abilities).map((key) => {
            const value = CONFIG.DND5E.abilities[key];
            return {
                value: key,
                label: value.label,
            };
        });

        const skills = Object.keys(CONFIG.DND5E.skills).map((key) => {
            const value = CONFIG.DND5E.skills[key];
            return {
                value: key,
                label: value.label,
            };
        });

        context.rollTypeOptions = {
            ability: abilities,
            skill: skills,
        };

        context.tieConditionOptions = [
            { value: `attacker`, label: `Attacker Wins` },
            { value: `defender`, label: `Defender Wins` },
            { value: `tie`, label: `Tie` },
        ];

        context.applyEffectsToOptions = [
            { value: `loserAttacker`, label: `Loser if Attacker` },
            { value: `loserDefender`, label: `Loser if Defender` },
            { value: `loserAny`, label: `Loser` },
            { value: `winnerAttacker`, label: `Winner if Attacker` },
            { value: `winnerDefender`, label: `Winner if Defender` },
            { value: `winnerAny`, label: `Winner` },
        ];

        context.availableEffects = this.item?.effects?.map(effect => ({
            id: effect.id,
            name: effect.name,
            icon: effect.img
        })) || [];

        context.attackerLabel = this.activity?.attackerLabel || `Attacker`;
        context.attackerRollType = this.activity?.attackerRollType || `ability`;
        context.attackerOptions = this.activity?.attackerOptions || [ `str` ];
        context.attackerCustom = this.activity?.attackerCustom || ``;
        context.defenderLabel = this.activity?.defenderLabel || `Defender`;
        context.defenderRollType = this.activity?.defenderRollType || `ability`;
        context.defenderOptions = this.activity?.defenderOptions || [ `str` ];
        context.tieCondition = this.activity?.tieCondition || `defender`;
        context.allowPlayerTargeting = this.activity?.allowPlayerTargeting || false;
        context.allowMinorSuccess = this.activity?.allowMinorSuccess || false;
        context.thresholdMinorSuccess = this.activity?.thresholdMinorSuccess || 5;
        context.allowMajorSuccess = this.activity?.allowMajorSuccess || false;
        context.thresholdMajorSuccess = this.activity?.thresholdMajorSuccess || 10;
        
        context.effectGroups = (this.activity?.effectGroups || []).map((element, index) => ({
            ...element,
            index: index,
        }));
        context.hasEffectGroups = context.effectGroups.length > 0;

        return context;
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        const attackerRollTypeSelect = this.element?.querySelector(`select[name="attackerRollType"]`);
        const defenderRollTypeSelect = this.element?.querySelector(`select[name="defenderRollType"]`);
        
        if (attackerRollTypeSelect)
            attackerRollTypeSelect.addEventListener(`change`, () => this._updateRollOptions(`attacker`));
        if (defenderRollTypeSelect)
            defenderRollTypeSelect.addEventListener(`change`, () => this._updateRollOptions(`defender`));

        this.element?.querySelector(`.add-effect-group`)?.addEventListener(`click`, async() => {
            const effectGroups = this.activity?.effectGroups || [];
            effectGroups.push({
                id: foundry.utils.randomID(),
                name: `Effect Group ${effectGroups.length + 1}`,
                applyTo: `loserDefender`,
                appliedEffects: [],
                appliedEffectsMinor: [],
                appliedEffectsMajor: [],
            });
            await this.activity.update({ effectGroups: effectGroups });
        });

        this.element?.querySelectorAll(`.remove-effect-group`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.closest(`[data-index]`).dataset.index);
                const effectGroups = [...(this.activity?.effectGroups || [])];
                effectGroups.splice(index, 1);
                await this.activity.update({ effectGroups: effectGroups });
            });
        });

        this.element?.querySelectorAll(`input[name="effectGroupName"]`).forEach(input => {
            input.addEventListener(`blur`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const effectGroups = [...(this.activity?.effectGroups || [])];
                if (!effectGroups[index]) return;

                effectGroups[index].name = event.target.value;
                await this.activity.update({ effectGroups: effectGroups });
            });
        });

        this.element?.querySelectorAll(`dnd5e-checkbox[name="autoApply"]`).forEach(checkbox => {
            checkbox.addEventListener(`change`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const effectGroups = [...(this.activity?.effectGroups || [])];
                if (!effectGroups[index]) return;

                effectGroups[index].autoApply = event.target.value;
                await this.activity.update({ effectGroups: effectGroups });
            });
        });

        this.element?.querySelectorAll(`select[name="applyEffectsTo"]`).forEach(input => {
            input.addEventListener(`change`, async(event) => {
                const index = parseInt(event.target.dataset.index);

                const effectGroups = [...(this.activity?.effectGroups || [])];
                if (!effectGroups[index]) return;

                effectGroups[index].applyTo = event.target.value;
                await this.activity.update({ effectGroups: effectGroups });
            });
        });

        this.element?.querySelectorAll(`multi-select[name="appliedEffects"]`).forEach(input => {
            input.addEventListener(`change`, async(event) => {
                const index = parseInt(event.target.dataset.index);
                const type = event.target.dataset.type;

                const effectGroups = [...(this.activity?.effectGroups || [])];
                if (!effectGroups[index]) return;

                switch (type) {
                    case `normal`:
                        effectGroups[index].appliedEffects = [...event.target.value];
                        break;
                    case `minor`:
                        effectGroups[index].appliedEffectsMinor = [...event.target.value];
                        break;
                    case `major`:
                        effectGroups[index].appliedEffectsMajor = [...event.target.value];
                        break;
                }

                await this.activity.update({ effectGroups: effectGroups });
            });
        });

        DomData.setupSheetBehaviors(this);
    }

    /**
     * Update the available roll options when roll type changes
     * @param {any} context -
     * @param {string} side - "attacker" or "defender"
     * @private
     */
    _updateRollOptions(side) {
        const rollTypeSelect = this.element?.querySelector(`select[name="${side}RollType"]`);
        const optionsMultiSelect = this.element?.querySelector(`multi-select[name="${side}Options"]`);
        if (!rollTypeSelect || !optionsMultiSelect) return;

        const rollType = rollTypeSelect.value;
        let options = [];
        
        switch (rollType) {
            case `ability`:
                options = Object.keys(CONFIG.DND5E.abilities).map((key) => {
                    const value = CONFIG.DND5E.abilities[key];
                    return {
                        value: key,
                        label: value.label,
                    };
                });
                break;
            case `skill`:
                options = Object.keys(CONFIG.DND5E.skills).map((key) => {
                    const value = CONFIG.DND5E.skills[key];
                    return {
                        value: key,
                        label: value.label,
                    };
                });
                break;
        }
    }
}
