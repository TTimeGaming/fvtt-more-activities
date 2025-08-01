export class ContestedData {
    static async init() {
        Handlebars.registerHelper(`includes`, function(array, value) {
            return Array.isArray(array) && array.includes(value);
        });
    }

    static applyListeners(message, html) {
        if (!message.flags[`more-activities`]?.type === `contested`) return;

        $(html).find(`.contested-roll-button`).click(async(event) => {
            event.preventDefault();

            const button = event.currentTarget;
            const side = button.dataset.side;
            const rollOption = button.dataset.option;
            const activityId = message.flags[`more-activities`].activityId;
            const itemId = message.flags[`more-activities`].itemId;
            const actorId = message.flags[`more-activities`].actorId;

            const actor = game.actors.get(actorId);
            const item = actor?.items.get(itemId);
            const activity = item?.system.activities.get(activityId);

            if (!activity) {
                ui.notifications.error(`Could not find the contested check activity.`);
                return;
            }

            await activity.handleRoll(actor, side, rollOption, message);
        });

        $(html).find(`.contested-reroll-button`).click(async(event) => {
            event.preventDefault();

            const activityId = message.flags[`more-activities`].activityId;
            const itemId = message.flags[`more-activities`].itemId;
            const actorId = message.flags[`more-activities`].actorId;

            const actor = game.actors.get(actorId);
            const item = actor?.items.get(itemId);
            const activity = item?.system.activities.get(activityId);

            if (!activity) {
                ui.notifications.error(`Could not find the contested check activity.`);
                return;
            }

            await activity.resetContestedCheck(message);
        });
    }
}

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
            choices: [ `ability`, `skill` ],
        });

        schema.attackerOptions = new fields.ArrayField(new fields.StringField({
            required: true,
            blank: false,
        }), {
            required: false,
            initial: [ `str` ],
        });

        schema.defenderLabel = new fields.StringField({
            required: false,
            blank: true,
            initial: `Defender`,
        });

        schema.defenderRollType = new fields.StringField({
            required: false,
            initial: `ability`,
            choices: [ `ability`, `skill` ],
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
            choices: [ `attacker`, `defender`, `tie`, `reroll` ],
        });

        schema.allowPlayerTargeting = new fields.BooleanField({
            required: false,
            initial: false,
        });

        return schema;
    }
}

export class ContestedActivitySheet extends dnd5e.applications.activity.ActivitySheet {
    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `sheet`, `activity-sheet`, `activity-contested` ]
    };

    /** @inheritdoc */
    static PARTS = {
        ...super.PARTS,
        effect: {
            template: `modules/more-activities/templates/contested-effect.hbs`,
            templates: [
                ...super.PARTS.effect.templates,
            ],
        },
    };
    
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
            { value: `reroll`, label: `Reroll` },
        ];

        context.attackerLabel = this.activity?.attackerLabel || `Attacker`;
        context.attackerRollType = this.activity?.attackerRollType || `ability`;
        context.attackerOptions = this.activity?.attackerOptions || [ `str` ];
        context.defenderLabel = this.activity?.defenderLabel || `Defender`;
        context.defenderRollType = this.activity?.defenderRollType || `ability`;
        context.defenderOptions = this.activity?.defenderOptions || [ `str` ];
        context.tieCondition = this.activity?.tieCondition || `defender`;
        context.allowPlayerTargeting = this.activity?.allowPlayerTargeting || false;

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

export class ContestedActivity extends dnd5e.documents.activity.ActivityMixin(ContestedActivityData) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "DND5E.CONTESTED"];

    static metadata = Object.freeze(
        foundry.utils.mergeObject(super.metadata, {
            type: `hook`,
            img: `modules/more-activities/icons/contested.svg`,
            title: `DND5E.ACTIVITY.Type.contested`,
            hint: `DND5E.ACTIVITY.Hint.contested`,
            sheetClass: ContestedActivitySheet
        }, { inplace: false })
    );

    static defineSchema() {
        return ContestedActivityData.defineSchema();
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
        await this._createContestedMessage();
        return results;
    }

    /**
     * Handle a roll for one side of the contest
     * @param {Actor5e} fallbackActor - The actor that authored the chat message
     * @param {string} side - "attacker" or "defender"
     * @param {string} rollOption - The specific ability/skill/tool to roll
     * @param {ChatMessage} message - The chat message to update
     * @returns {Promise<void>}
     */
    // TODO: fallbackActor not needed?
    async handleRoll(fallbackActor, side, rollOption, message) {
        const rollType = side === `attacker` ? this.attackerRollType : this.defenderRollType;

        let actor;
        if (side === `attacker`) {
            actor = this.actor;
            if (!actor) {
                ui.notifications.warn(`No actor found for the attacker.`);
                return;
            }
        }
        else {
            actor = await this._selectDefenderActor();
            if (!actor) {
                return;
            }
        }

        try {
            let roll;
            switch (rollType) {
                case `ability`:
                    roll = await actor.rollAbilityCheck({ ability: rollOption });
                    break;
                case `skill`:
                    roll = await actor.rollSkill({ skill: rollOption });
                    break;
                default:
                    throw new Error(`Unknown roll type: ${rollType}`);
            }

            if (roll === undefined || roll == null || roll.length === 0) return;
            await this._updateContestedMessage(message, side, roll[0]);
        } catch (error) {
            console.error(`Error performing contested roll:`, error);
            ui.notifications.error(`Error performing roll: ${error.message}`);
        }
    }

    /**
     * Reset the contested check for a reroll
     * @param {ChatMessage} message - The chat message to reset
     * @returns {Promise<void>}
     */
    async resetContestedCheck(message) {
        const flags = {
            'more-activities': {
                type: `contested`,
                activityId: this.id,
                itemId: this.item.id,
                actorId: this.actor?.id,
                attackerRoll: null,
                defenderRoll: null,
                result: null
            }
        };

        const templateData = {
            activity: this,
            item: this.item,
            actor: this.actor,
            attackerLabel: this.attackerLabel,
            defenderLabel: this.defenderLabel,
            attackerOptions: this._getOptionLabels(this.attackerRollType, this.attackerOptions),
            defenderOptions: this._getOptionLabels(this.defenderRollType, this.defenderOptions),
            attackerRoll: null,
            defenderRoll: null,
            result: null
        };

        const content = await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-chat.hbs`, templateData);
        await message.update({
            content: content,
            flags: flags
        });
    }

    /**
     * Select the defender actor based on targeting settings
     * @returns {Promise<Actor5e|null>}
     * @private
     */
    async _selectDefenderActor() {
        const isGM = game.user.isGM;
        const targets = Array.from(game.user.targets).map(token => token.actor);

        let playerCharacters = [];
        let nonPlayerCharacters = [];
        let allTokens = [];

        if (this.allowPlayerTargeting || isGM) {
            if (isGM) {
                playerCharacters = game.actors.filter(actor => 
                    actor.type === `character` && actor !== this.actor
                );
                nonPlayerCharacters = game.actors.filter(actor =>
                    actor.type !== `character` && actor !== this.actor
                );

                const scene = game.scenes.current;
                if (scene) {
                    allTokens = scene.tokens
                        .map(token => token.actor)
                        .filter(actor => actor && actor !== this.actor && actor.type !== `character`)
                    ;
                }
            }
            else {
                playerCharacters = game.actors.filter(actor => 
                    actor.type === `character` && actor.isOwner && actor !== this.actor
                );
                nonPlayerCharacters = game.actors.filter(actor => 
                    actor.type !== `character` && actor.isOwner && actor !== this.actor
                );
            }
        }

        if (targets.length === 1 && !this.allowPlayerTargeting && !isGM) {
            return targets[0];
        }
        
        const totalOptions = targets.length + playerCharacters.length + nonPlayerCharacters.length + allTokens.length;
        if (totalOptions === 0) {
            if (isGM)
                ui.notifications.warn('No valid targets available. Please target actors on the canvas or add characters to the scene.');
            else
                ui.notifications.warn(`No valid targets available. Please target an actor on the canvas.`);

            return null;
        }

        if (totalOptions === 1) {
            return targets.length === 1 ? targets[0] : playerCharacters.length === 1 ? playerCharacters[0] : nonPlayerCharacters.length === 1 ? nonPlayerCharacters[0] : allTokens[0];
        }

        try {
            return await TargetSelectionDialog.show(targets, playerCharacters, nonPlayerCharacters, allTokens, this.allowPlayerTargeting, isGM);
        } catch (error) {
            return null;
        }
    }

    async _createContestedMessage() {
        const messageData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: await this._getContestedMessageContent(),
            flags: {
                'more-activities': {
                    type: `contested`,
                    activityId: this.id,
                    itemId: this.item.id,
                    actorId: this.actor?.id,
                    attackerRoll: null,
                    defenderRoll: null,
                    result: null
                }
            }
        };
        return ChatMessage.create(messageData);
    }

    /**
     * Get the HTML content for the contested check message
     * @returns {Promise<string>}
     * @private
     */
    async _getContestedMessageContent() {
        const templateData = {
            activity: this,
            item: this.item,
            actor: this.actor,
            attackerLabel: this.attackerLabel,
            defenderLabel: this.defenderLabel,
            attackerOptions: this._getOptionLabels(this.attackerRollType, this.attackerOptions),
            defenderOptions: this._getOptionLabels(this.defenderRollType, this.defenderOptions),
            attackerRoll: null,
            defenderRoll: null,
            result: null
        };

        return await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-chat.hbs`, templateData);
    }

    /**
     * Get human-readable labels for roll options with keys
     * @param {string} rollType - The type of roll (ability, skill, tool)
     * @param {string[]} options - Array of option keys
     * @returns {Object[]}
     * @private
     */
    _getOptionLabels(rollType, options) {
        const config = {
            ability: CONFIG.DND5E.abilities,
            skill: CONFIG.DND5E.skills,
        };

        return options.map(option => {
            const optionConfig = config[rollType][option];
            return {
                key: option,
                label: optionConfig?.label || optionConfig || option
            };
        });
    }

    /**
     * Update the contested check message with a new roll result
     * @param {ChatMessage} message - The message to update
     * @param {string} side - "attacker" or "defender"  
     * @param {Roll} roll - The roll result
     * @returns {Promise<void>}
     * @private
     */
    async _updateContestedMessage(message, side, roll) {
        const flags = foundry.utils.deepClone(message.flags[`more-activities`]);
        flags[`${side}Roll`] = {
            total: roll.total,
            formula: roll.formula,
            tooltip: await roll.getTooltip()
        };

        if (flags.attackerRoll && flags.defenderRoll) {
            flags.result = this._determineWinner(flags.attackerRoll.total, flags.defenderRoll.total);
        }

        const templateData = {
            activity: this,
            item: this.item,
            actor: this.actor,
            attackerLabel: this.attackerLabel,
            defenderLabel: this.defenderLabel,
            attackerOptions: this._getOptionLabels(this.attackerRollType, this.attackerOptions),
            defenderOptions: this._getOptionLabels(this.defenderRollType, this.defenderOptions),
            attackerRoll: flags.attackerRoll,
            defenderRoll: flags.defenderRoll,
            result: flags.result
        };

        const content = await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-chat.hbs`, templateData);
        await message.update({
            content: content,
            flags: { 'more-activities': flags }
        });
    }

    /**
     * Determine the winner of the contested check
     * @param {number} attackerTotal - Attacker's roll total
     * @param {number} defenderTotal - Defender's roll total
     * @returns {string} - "attacker", "defender", "tie", or "reroll"
     * @private
     */
    _determineWinner(attackerTotal, defenderTotal) {
        return attackerTotal > defenderTotal ? `attacker` : defenderTotal > attackerTotal ? `defender` : this.tieCondition;
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null}
     */
    get actor() {
        return this.item?.actor || null;
    }
}

export class TargetSelectionDialog extends foundry.applications.api.ApplicationV2 {
    constructor(options = {}) {
        super(options);
        this.targets = options.targets || [];
        this.playerCharacters = options.playerCharacters || [];
        this.nonPlayerCharacters = options.nonPlayerCharacters || [];
        this.allTokens = options.allTokens || [];
        this.allowPlayerTargeting = options.allowPlayerTargeting || false;
        this.isGM = options.isGM || false;
        this.#promise = new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
        });
    }

    #promise;
    #resolve;
    #reject;

    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        classes: [`dnd5e2`, `target-selection`],
        tag: `dialog`,
        window: {
            title: `Select Defender`,
            icon: `fas fa-crosshairs`,
            resizable: false
        },
        position: {
            width: 400,
            height: `auto`,
        },
        form: {
            handler: undefined,
            submitOnChange: false,
            closeOnSubmit: false,
        }
    };

    /** @inheritdoc */
    static PARTS = {
        form: {
            template: `modules/more-activities/templates/contested-target.hbs`,
        },
    };

    /** @inheritdoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        const preparedTargets = this.targets.map(actor => ({
            id: actor.id,
            name: actor.name,
            img: actor.img,
            type: `target`
        }));

        const preparedPlayerCharacters = this.playerCharacters.map(actor => ({
            id: actor.id,
            name: actor.name,
            img: actor.img,
            type: `character`
        }));

        const preparedNonPlayerCharacters = this.nonPlayerCharacters.map(actor => ({
            id: actor.id,
            name: actor.name,
            img: actor.img,
            type: `npc`
        }));

        const preparedAllTokens = this.allTokens.map(actor => ({
            id: actor.id,
            name: actor.name,
            img: actor.img,
            type: `token`
        }));

        const allActors = [...preparedTargets, ...preparedPlayerCharacters, ...preparedNonPlayerCharacters, ...preparedAllTokens];
        if (allActors.length > 0) {
            allActors[0].selected = true;
        }
        
        context.hasAnyActors = allActors.length > 0;
        context.targets = preparedTargets;
        context.hasTargets = preparedTargets.length > 0;
        context.playerCharacters = preparedPlayerCharacters;
        context.hasPlayerCharacters = preparedPlayerCharacters.length > 0;
        context.nonPlayerCharacters = preparedNonPlayerCharacters;
        context.hasNonPlayerCharacters = preparedNonPlayerCharacters.length > 0;
        context.allTokens = preparedAllTokens;
        context.hasAllTokens = preparedAllTokens.length > 0;
        context.allowPlayerTargeting = this.allowPlayerTargeting;
        context.isGM = this.isGM;
        return context;
    }

    /** @inheritdoc */
    async _renderHTML(context, options) {
        const form = await foundry.applications.handlebars.renderTemplate(this.constructor.PARTS.form.template, context);
        return form;
    }

    /** @inheritdoc */
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
        this._activateListeners(content);
        this._applyDynamicSizing();
    }

    /**
     * Activate event listeners for the rendered content
     * @param {HTMLElement} html - The rendered HTML content
     * @private
     */
    _activateListeners(html) {
        // Add click handlers for actor cards
        html.querySelectorAll('.actor-card').forEach(card => {
            card.addEventListener('click', this.#onActorCardClick.bind(this));
        });

        // Add cancel button handler
        html.querySelector('[data-action="cancel"]')?.addEventListener('click', this.#onCancel.bind(this));

        // Add form submission handler
        const form = html.querySelector('form');
        if (form) {
            form.addEventListener('submit', this.#onFormSubmit.bind(this));
        }
    }

    /**
     * Apply dynamic sizing constraints to the dialog
     * @private
     */
    _applyDynamicSizing() {
        if (!this.element) return;

        requestAnimationFrame(() => {
            const content = this.element.querySelector('.window-content');
            if (!content) return;
            
            this.element.style.height = `auto`;
            content.style.maxHeight = `none`;
            content.style.overflowY = `visible`;

            const naturalHeight = content.scrollHeight;
            const maxHeight = 640;
            
            if (naturalHeight > maxHeight) {
                this.element.style.height = `${maxHeight}px`;
                content.style.maxHeight = `${maxHeight - 40}px`;
                content.style.overflowY = 'auto';
            }
        });
    }

    /**
     * Handle clicking on an actor card
     * @param {Event} event - The click event
     */
    #onActorCardClick(event) {
        const card = event.currentTarget;
        const radio = card.querySelector(`input[type="radio"]`);
        
        this.element.querySelectorAll(`.actor-card`).forEach(c => c.classList.remove(`selected`));
        this.element.querySelectorAll(`input[type="radio"]`).forEach(r => r.checked = false);
        
        card.classList.add(`selected`);
        radio.checked = true;
    }

    /**
     * Handle form submission
     * @param {Event} event - The form submission event
     */
    #onFormSubmit(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const selectedActorId = formData.get(`selectedActor`);
        
        if (!selectedActorId) {
            ui.notifications.warn(`Please select a defender.`);
            return;
        }
        
        const actor = game.actors.get(selectedActorId);
        if (!actor) {
            ui.notifications.error(`Selected actor not found`);
            this.#reject(new Error(`Actor not found`));
            return;
        }
        
        this.#resolve(actor);
        this.close({ force: true });
    }

    /**
     * Handle cancel button click
     * @param {Event} event - The click event
     */
    #onCancel(event) {
        event.preventDefault();
        this.#reject(new Error(`Target selection cancelled`));
        this.close();
    }

    /** @inheritdoc */
    async close(options = {}) {
        if (!options.force && this.#reject) {
            this.#reject(new Error(`Dialog closed`));
        }
        return super.close(options);
    }

    /**
     * Wait for the dialog to be resolved
     * @returns {Promise<Actor5e>}
     */
    async waitForSelection() {
        return this.#promise;
    }

    /**
     * Static method to show the dialog and wait for selection
     * @param {Actor5e[]} targets - Canvas targets
     * @param {Actor5e[]} playerCharacters - Player-owned characters
     * @param {Actor5e[]} nonPlayerCharacters - Player-owned NPCs
     * @param {boolean} allowPlayerTargeting - Whether to show player characters
     * @returns {Promise<Actor5e>}
     */
    static async show(targets = [], playerCharacters = [], nonPlayerCharacters = [], allTokens = [], allowPlayerTargeting = false, isGM = false) {
        const dialog = new TargetSelectionDialog({
            targets,
            playerCharacters,
            nonPlayerCharacters,
            allTokens,
            allowPlayerTargeting,
            isGM
        });
        
        dialog.render(true);
        return dialog.waitForSelection();
    }
}
