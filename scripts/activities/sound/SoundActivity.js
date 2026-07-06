import { DomData } from '../../utils/dom.js';

const TEMPLATE_NAME = `sound`;

import { SoundActivityData } from './SoundActivityData.js';
import { SoundActivitySheet } from './SoundActivitySheet.js';
import { SoundData } from './SoundData.js';

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
