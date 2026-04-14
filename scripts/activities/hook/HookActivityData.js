import { DomData } from '../../utils/dom.js';

const TEMPLATE_NAME = `hook`;

export class HookActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.manualTrigger = new fields.BooleanField({
            required: false,
            initial: false,
        });

        schema.activeHook = new fields.StringField({
            required: false,
            blank: true,
            initial: ``
        });

        schema.customHook = new fields.StringField({
            required: false,
            blank: true,
            initial: ``,
        });

        schema.executionType = new fields.StringField({
            required: false,
            initial: `macro`,
            choices: [ `macro`, `activity` ],
        });

        schema.targetActivityId = new fields.StringField({
            required: false,
            blank: true,
            initial: ``,
        });

        schema.sanityCode = new fields.StringField({
            required: false,
            blank: true,
            initial: `// Return true to execute the hook, false to skip\n// Available variables: activity, item, actor, hook, args\nreturn true;`
        });

        schema.macroCode = new fields.StringField({
            required: false,
            blank: true,
            initial: `// Write your macro code here\n// Available variables: activity, item, actor, hook, args\nconsole.log("Hook activity executed!", { activity, item, actor, hook, args });`
        });

        return schema;
    }
}
