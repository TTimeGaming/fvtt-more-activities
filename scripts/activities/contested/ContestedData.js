import { MessageData } from '../../utils/message.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `contested`;

import { ContestedManager } from './ContestedManager.js';
import { ContestedInitiatorApp } from './ContestedInitiatorApp.js';

export class ContestedData {
    static async init() {
        await ContestedManager.init();
    }

    static applyListeners(message, html) {
        html.querySelectorAll(`.contested-results .result-summary`).forEach(btn => {
            btn.addEventListener(`click`, () => {
                DomData.toggleClass(btn.parentElement, `expanded`);
            });
        });

        MessageData.addActivityButton(message, html, false,
            TEMPLATE_NAME, `Start Contest`, (activity) => {
                new ContestedInitiatorApp(activity).render(true);
            }
        );
    }

    /**
     * Get human-readable labels for roll options with bonuses
     * @param {string} rollType - The type of roll (ability, skill, spellcasting, custom)
     * @param {string[]} options - Array of option keys
     * @param {Activity} activity - Activity to get bonuses for
     * @param {Actor5e} actor - Actor to get bonuses for (optional)
     * @returns {Object[]}
     * @private
     */
    static getOptionLabels(rollType, options, activity, actor = null) {
        switch (rollType) {
            case `spellcasting`:
                const spellcasting = actor?.system?.attributes?.spell?.mod ?? 0;
                return [{
                    key: `spellcasting`,
                    label: `Spellcasting (${spellcasting >= 0 ? `+${spellcasting}` : `${spellcasting}`})`
                }];
            case `custom`:
                const calculated = FieldsData.resolveFormula(activity.attackerCustom, activity.item);
                return [{
                    key: `custom`,
                    label: `Custom (${calculated >= 0 ? `+${calculated}` : `${calculated}`})`,
                }];
            default:
                const config = {
                    ability: CONFIG.DND5E.abilities,
                    skill: CONFIG.DND5E.skills,
                };

                return options.map(option => {
                    const optionConfig = config[rollType][option];
                    let label = optionConfig?.label || optionConfig || option;

                    if (!actor) {
                        return {
                            key: option,
                            label: label
                        };
                    }

                    try {
                        let bonus = null;
                        switch (rollType) {
                            case `ability`:
                                bonus = actor.system.abilities[option]?.mod;
                                break;
                            case `skill`:
                                bonus = actor.system.skills[option]?.total;
                                break;
                        }

                        if (bonus !== undefined && bonus != null) {
                            const formatted = bonus >= 0 ? `+${bonus}` : `${bonus}`;
                            label += ` (${formatted})`;
                        }
                    }
                    catch(error) {
                    }

                    return {
                        key: option,
                        label: label
                    };
                });
        }
    }

    /**
     * Determine the degree of victory/defeat
     * @param {Activity} activity
     * @param {number} winnerTotal - Winner's roll total
     * @param {number} loserTotal - Loser's roll total
     * @returns {string} 'normal', 'minor', or 'major'
     */
    static determineVictoryDegree(activity, winnerTotal, loserTotal) {
        if (!activity.allowMinorSuccess && !activity.allowMajorSuccess) return `normal`;

        const minorMargin = activity.allowMinorSuccess ? activity.thresholdMinorSuccess ?? 5 : Infinity;
        const majorMargin = activity.allowMajorSuccess ? activity.thresholdMajorSuccess ?? 10 : Infinity;

        const margin = winnerTotal - loserTotal;
        if (margin >= majorMargin) return `major`;
        if (margin >= minorMargin) return `minor`;
        return `normal`;
    }
}
