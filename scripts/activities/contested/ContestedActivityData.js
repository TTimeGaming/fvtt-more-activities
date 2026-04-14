import { MessageData } from '../../utils/message.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `contested`;

export class ContestedActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.attackerLabel = new fields.StringField({
            required: false,
            blank: true,
            initial: `Attacker`,
        });

        schema.attackerRollType = new fields.StringField({
            required: false,
            initial: `ability`,
            choices: [ `ability`, `skill`, `spellcasting`, `custom` ],
        });

        schema.attackerOptions = new fields.ArrayField(new fields.StringField({
            required: true,
            blank: false,
        }), {
            required: false,
            initial: [ `str` ],
        });

        schema.attackerCustom = new fields.StringField({
            required: false,
            blank: true,
        })

        schema.defenderLabel = new fields.StringField({
            required: false,
            blank: true,
            initial: `Defender`,
        });

        schema.defenderRollType = new fields.StringField({
            required: false,
            initial: `ability`,
            choices: [ `ability`, `skill`, `spellcasting`, `custom` ],
        });

        schema.defenderOptions = new fields.ArrayField(new fields.StringField({
            required: true,
            blank: false,
        }), {
            required: false,
            initial: [ `str` ],
        });

        schema.tieCondition = new fields.StringField({
            required: false,
            initial: `defender`,
            choices: [ `attacker`, `defender`, `tie`, ],
        });

        schema.allowPlayerTargeting = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.allowMinorSuccess = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.thresholdMinorSuccess = new fields.NumberField({
            required: false,
            initial: 5,
            min: 1,
            max: 20,
        });

        schema.allowMajorSuccess = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.thresholdMajorSuccess = new fields.NumberField({
            required: false,
            initial: 10,
            min: 1,
            max: 20,
        });

        schema.effectGroups = new fields.ArrayField(new fields.SchemaField({
            id: new fields.StringField({
                required: true,
                initial: () => foundry.utils.randomID(),
            }),
            name: new fields.StringField({
                required: false,
                blank: true,
                initial: `Effect Group`,
            }),
            autoApply: new fields.BooleanField({
                required: false,
                initial: true,
            }),
            applyTo: new fields.StringField({
                required: false,
                initial: `loserDefender`,
                choices: [ `loserAttacker`, `loserDefender`, `loserAny`, `winnerAttacker`, `winnerDefender`, `winnerAny`, ],
            }),
            appliedEffects: new fields.ArrayField(new fields.StringField({
                required: false,
                blank: true
            }), {
                required: false,
                initial: [],
            }),
            appliedEffectsMinor: new fields.ArrayField(new fields.StringField({
                required: false,
                blank: true
            }), {
                required: false,
                initial: [],
            }),
            appliedEffectsMajor: new fields.ArrayField(new fields.StringField({
                required: false,
                blank: true
            }), {
                required: false,
                initial: [],
            }),
        }), {
            required: false,
            initial: [],
        });

        // Deprecated in v1.8.0
        // {
        schema.applyEffectsTo = new fields.StringField({
            required: false,
            initial: `loserDefender`,
            choices: [ `loserAttacker`, `loserDefender`, `loserAny`, `winnerAttacker`, `winnerDefender`, `winnerAny`, ],
        });
        
        schema.appliedEffects = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true
        }), {
            required: false,
            initial: [],
        });

        schema.appliedEffectsMinor = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true
        }), {
            required: false,
            initial: [],
        });

        schema.appliedEffectsMajor = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true
        }), {
            required: false,
            initial: [],
        });
        // }

        return schema;
    }
}
