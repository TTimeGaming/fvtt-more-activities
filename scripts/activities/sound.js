import { DomData } from '../utils/dom.js';

const TEMPLATE_NAME = `sound`;

export class SoundData {
    static async init() {
        game.socket.on(`module.more-activities`, (data) => {
            switch (data.type) {
                case `playSound`:
                    this._playSound(data);
                    break;
            }
        });
    }

    static playSound(soundData) {
        this._playSound(soundData);
        if (soundData.isGlobal)
            game.socket.emit(`module.more-activities`, soundData);
    }

    static _playSound(soundData) {
        foundry.audio.AudioHelper.play(soundData);
    }
}

export class SoundActivityData extends dnd5e.dataModels.activity.BaseActivityData {
    static defineSchema() {
        const fields = foundry.data.fields;
        const schema = super.defineSchema();

        schema.soundFile = new fields.FilePathField({
            required: false,
            blank: true,
            initial: ``,
            categories: [ `AUDIO` ],
        });

        schema.playForAll = new fields.BooleanField({
            required: false,
            initial: true,
        });

        schema.volume = new fields.NumberField({
            required: false,
            initial: 0.8,
            min: 0,
            max: 1,
        });

        return schema;
    }
}

export class SoundActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-${TEMPLATE_NAME}` ],
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/${TEMPLATE_NAME}-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        }
    };

    /** @inheritdoc */
    async _prepareEffectContext(context) {
        context = await super._prepareEffectContext(context);
        context.soundFile = this.activity?.soundFile ?? ``;
        context.playForAll = this.activity?.playForAll ?? true;
        context.volume = this.activity?.volume ?? 0.8;
        return context;
    }

    /** @inheritdoc */
    _onRender(context, options) {
        DomData.setupSheetBehaviors(this);
    }
}

export class SoundActivity extends dnd5e.documents.activity.ActivityMixin(SoundActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, `DND5E.${TEMPLATE_NAME.toUpperCase()}`];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: TEMPLATE_NAME,
            img: `modules/more-activities/icons/${TEMPLATE_NAME}.svg`,
            title: `DND5E.ACTIVITY.Type.${TEMPLATE_NAME}`,
            hint: `DND5E.ACTIVITY.Hint.${TEMPLATE_NAME}`,
            sheetClass: SoundActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return SoundActivityData.defineSchema();
    }

    /**
     * Execute the macro activity
     * @param {ActivityUseConfiguration} config - Configuration data for the activity usage.
     * @param {ActivityDialogConfiguration} dialog - Configuration data for the activity dialog.
     * @param {ActivityMessageConfiguration} message - Configuration data for the activity message.
     * @returns {Promise<ActivityUsageResults|void>}
     */
    async use(config, dialog, message) {
        const results = await super.use(config, dialog, message);
        if (results === undefined) return results;
        
        SoundData.playSound({
            type: `playSound`,
            isGlobal: this.playForAll,
            src: this.soundFile !== `` ? this.soundFile : `modules/more-activities/sounds/demo.mp3`,
            volume: this.volume,
            loop: false,
        });
        return results;
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null
     */
    get actor() {
        return this.item?.actor || null;
    }
}
