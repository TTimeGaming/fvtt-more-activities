import { MessageData } from '../../utils/message.js';
import { FieldsData } from '../../utils/fields.js';
import { DomData } from '../../utils/dom.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `grant`;

export class GrantActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.grantAll = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.count = new fields.StringField({
            required: false,
            initial: `1`,
        });

        schema.swappable = new fields.BooleanField({
            required: false,
            initial: false,
        })

        schema.current = new fields.StringField({
            required: false,
            blank: true,
        });

        schema.grants = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true,
        }), {
            required: false,
            initial: [],
        });

        schema.itemCustomizations = new fields.StringField({
            required: false,
            blank: false,
            initial: `{}`,
        });

        schema.spellsAsScrolls = new fields.BooleanField({
            required: false,
            initial: false,
        });
        
        schema.advancementIds = new fields.StringField({
            required: false,
            initial: `{}`,
        });

        schema.costGroups = new fields.ArrayField(new fields.SchemaField({
            id: new fields.StringField({
                required: true,
                initial: () => foundry.utils.randomID(),
            }),
            name: new fields.StringField({
                required: false,
                blank: true,
                initial: `Consumption`,
            }),
            type: new fields.StringField({
                required: false,
                initial: `currency`,
                options: [ `currency`, `itemUses`, `itemConsume` ],
            }),

            baseCurrencyAmount: new fields.StringField({
                required: false,
                initial: `0`,
            }),
            baseCurrencyCoin: new fields.StringField({
                required: false,
                initial: `gp`,
                options: [ `pp`, `gp`, `ep`, `sp`, `cp` ],
            }),

            spellCurrencyAmount: new fields.StringField({
                required: false,
                initial: `0`,
            }),
            spellCurrencyCoin: new fields.StringField({
                required: false,
                initial: `gp`,
                options: [ `pp`, `gp`, `ep`, `sp`, `cp` ],
            }),

            itemUuid: new fields.StringField({
                required: false,
                blank: true,
            }),
            itemAmount: new fields.StringField({
                required: false,
                initial: `1`,
            }),
        }), {
            required: false,
            initial: [],
        });

        // Deprecated in v1.8.2
        // {
        schema.baseCost = new fields.StringField({
            required: false,
            initial: `0`,
        });

        schema.baseCostCurrency = new fields.StringField({
            required: false,
            initial: `gp`,
            options: [ `pp`, `gp`, `ep`, `sp`, `cp` ]
        });

        schema.spellCostPerLevel = new fields.StringField({
            required: false,
            initial: `0`,
        });

        schema.spellCostPerLevelCurrency = new fields.StringField({
            required: false,
            initial: `gp`,
            options: [ `pp`, `gp`, `ep`, `sp`, `cp` ]
        });
        // }

        return schema;
    }
}
