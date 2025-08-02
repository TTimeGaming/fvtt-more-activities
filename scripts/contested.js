export class ContestedData {
    static async init() {
        Handlebars.registerHelper(`includes`, function(array, value) {
            return Array.isArray(array) && array.includes(value);
        });

        Handlebars.registerHelper(`formatBonus`, function(value) {
            if (value === undefined || value == null) return ``;

            const num = parseInt(value);
            return isNaN(num) ? `` : num >= 0 ? `(+${num})` : `(${num})`;
        });
    }

    static applyListeners(message, html) {
        if (!message.flags[`more-activities`]?.type === `contested`) return;

        $(html).find(`.defender-selection select`).change(async(event) => {
            const selectElement = event.currentTarget;
            const selectedActorId = selectElement.value;
            const activityId = message.flags[`more-activities`].activityId;
            const itemId = message.flags[`more-activities`].itemId;
            const actorId = message.flags[`more-activities`].actorId;

            const actor = game.actors.get(actorId);
            const item = actor?.items.get(itemId);
            const activity = item?.system.activities.get(activityId);

            if (!activity || !selectedActorId) return;

            const defender = game.actors.get(selectedActorId);
            await activity.updateDefenderOptions(message, defender);
        });

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

            let targetActor = actor;
            if (side === `defender`) {
                const defenderSelect = $(event.target).closest(`.chat-message`).find(`.defender-selection select`);
                const selectedActorId = defenderSelect.val();
                if (selectedActorId)
                    targetActor = game.actors.get(selectedActorId);
            }


            await activity.handleRoll(targetActor, side, rollOption, message);
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

        schema.appliedEffects = new fields.ArrayField(new fields.StringField({
            required: false,
            blank: true
        }), {
            required: false,
            initial: [],
        });

        schema.applyEffectsTo = new fields.StringField({
            required: false,
            initial: `loserDefender`,
            choices: [ `loserAttacker`, `loserDefender`, `loserAny`, `winnerAttacker`, `winnerDefender`, `winnerAny`, ],
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
            icon: effect.icon
        })) || [];

        context.attackerLabel = this.activity?.attackerLabel || `Attacker`;
        context.attackerRollType = this.activity?.attackerRollType || `ability`;
        context.attackerOptions = this.activity?.attackerOptions || [ `str` ];
        context.defenderLabel = this.activity?.defenderLabel || `Defender`;
        context.defenderRollType = this.activity?.defenderRollType || `ability`;
        context.defenderOptions = this.activity?.defenderOptions || [ `str` ];
        context.tieCondition = this.activity?.tieCondition || `defender`;
        context.allowPlayerTargeting = this.activity?.allowPlayerTargeting || false;
        context.appliedEffects = this.activity?.appliedEffects || [];
        context.applyEffectsTo = this.activity?.applyEffectsTo || `loserDefender`;

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
     * @param {Actor5e} rollActor - The actor making the roll
     * @param {string} side - "attacker" or "defender"
     * @param {string} rollOption - The specific ability/skill/tool to roll
     * @param {ChatMessage} message - The chat message to update
     * @returns {Promise<void>}
     */
    async handleRoll(rollActor, side, rollOption, message) {
        const rollType = side === `attacker` ? this.attackerRollType : this.defenderRollType;

        if (!rollActor) {
            ui.notifications.warn(`No actor found for the ${side}.`);
            return;
        }

        try {
            let roll;
            switch (rollType) {
                case `ability`:
                    roll = await rollActor.rollAbilityCheck({ ability: rollOption });
                    break;
                case `skill`:
                    roll = await rollActor.rollSkill({ skill: rollOption });
                    break;
                default:
                    throw new Error(`Unknown roll type: ${rollType}`);
            }

            if (roll === undefined || roll == null || roll.length === 0) return;

            const flags = foundry.utils.deepClone(message.flags[`more-activities`]);
            if (side === `defender`)
                flags.defenderActorId = rollActor.id;

            await this._updateContestedMessage(message, side, roll[0], flags);
        } catch (error) {
            console.error(`Error performing contested roll:`, error);
            ui.notifications.error(`Error performing roll: ${error.message}`);
        }
    }

    /**
     * Update defender options with bonuses for selected actor
     * @param {ChatMessage} message - The chat message to update
     * @param {Actor5e} defenderActor - The selected defender actor
     * @returns {Promise<void>}
     */
    async updateDefenderOptions(message, defenderActor) {
        const flags = foundry.utils.deepClone(message.flags[`more-activities`]);
        flags.selectedDefenderId = defenderActor?.id;

        const templateData = await this._prepareMessageTemplateData(flags, defenderActor);
        const content = await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-chat.hbs`, templateData);

        await message.update({
            content: content,
            flags: { 'more-activities': flags }
        });
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
                selectedDefenderId: message.flags[`more-activities`]?.selectedDefenderId,
                attackerRoll: null,
                defenderRoll: null,
                defenderActorId: null,
                result: null
            }
        };

        const defenderActor = flags[`more-activities`].selectedDefenderId ?
            game.actors.get(flags[`more-activities`].selectedDefenderId) : null;

        const templateData = await this._prepareMessageTemplateData(flags[`more-activities`], defenderActor);
        const content = await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-chat.hbs`, templateData);
        await message.update({
            content: content,
            flags: flags
        });
    }

    async _createContestedMessage() {
        const defendersData = await this._getPotentialDefenders();

        const messageData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: await this._getContestedMessageContent(null, defendersData),
            flags: {
                'more-activities': {
                    type: `contested`,
                    activityId: this.id,
                    itemId: this.item.id,
                    actorId: this.actor?.id,
                    selectedDefenderId: null,
                    attackerRoll: null,
                    defenderRoll: null,
                    defenderActorId: null,
                    result: null
                }
            }
        };
        return ChatMessage.create(messageData);
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

        if (this.allowPlayerTargeting || isGM) {
            if (isGM) {
                playerCharacters = game.actors.filter(actor => actor.type === `character` && actor !== this.actor);
                nonPlayerCharacters = game.actors.filter(actor => actor.type !== `character` && actor !== this.actor);

                const scene = game.scenes.current;
                if (scene) {
                    allTokens = scene.tokens
                        .map(token => token.actor)
                        .filter(actor => actor && actor !== this.actor && actor.type !== `character`)
                    ;
                }
            }
            else {
                playerCharacters = game.actors.filter(actor => actor.type === `character` && actor.isOwner && actor !== this.actor);
                nonPlayerCharacters = game.actors.filter(actor => actor.type !== `character` && actor.isOwner && actor !== this.actor);
            }
        }
        
        return {
            targets: targets,
            playerCharacters: playerCharacters,
            nonPlayerCharacters: nonPlayerCharacters,
            allTokens: allTokens,
            hasMultipleGroups: [ targets, playerCharacters, nonPlayerCharacters, allTokens ].filter(group => group.length > 0).length > 1,
        };
    }

    /**
     * Get the HTML content for the contested check message
     * @param {Actor5e} selectedDefender - Currently selected defender
     * @param {Object} defendersData - All available defenders
     * @returns {Promise<string>}
     * @private
     */
    async _getContestedMessageContent(selectedDefender = null, defendersData = []) {
        if (!defendersData) defendersData = await this._getPotentialDefenders();

        const templateData = await this._prepareMessageTemplateData({
            selectedDefenderId: selectedDefender?.id,
            attackerRoll: null,
            defenderRoll: null,
            result: null,
        }, selectedDefender, defendersData);
        return await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-chat.hbs`, templateData);
    }

    /**
     * Prepare template data for the message
     * @param {Object} flags - Message flags
     * @param {Actor5e} selectedDefender - Selected defender actor
     * @param {Object} defendersData - Available defender options
     * @returns {Promise<Object>}
     * @private
     */
    async _prepareMessageTemplateData(flags, selectedDefender = null, defendersData = null) {
        if (!defendersData) defendersData = await this._getPotentialDefenders();

        const isGM = game.user.isGM;
        const totalDefenders = defendersData.targets.length + defendersData.playerCharacters.length + defendersData.nonPlayerCharacters.length + defendersData.allTokens.length;

        return {
            activity: this,
            item: this.item,
            actor: this.actor,
            isGM: isGM,
            allowPlayerTargeting: this.allowPlayerTargeting,
            attackerLabel: this.attackerLabel,
            defenderLabel: this.defenderLabel,
            attackerOptions: this._getOptionLabels(this.attackerRollType, this.attackerOptions, this.actor),
            defenderOptions: selectedDefender ? 
                this._getOptionLabels(this.defenderRollType, this.defenderOptions, selectedDefender) :
                this._getOptionLabels(this.defenderRollType, this.defenderOptions),
            defendersData: {
                ...defendersData,
                selectedDefenderId: flags.selectedDefenderId,
            },
            selectedDefender: selectedDefender,
            hasDefenderSelection: totalDefenders > 1,
            attackerRoll: flags.attackerRoll,
            defenderRoll: flags.defenderRoll,
            result: flags.result
        };
    }

    /**
     * Get human-readable labels for roll options with bonuses
     * @param {string} rollType - The type of roll (ability, skill, tool)
     * @param {string[]} options - Array of option keys
     * @param {Actor5e} actor - Actor to get bonuses for (optional)
     * @returns {Object[]}
     * @private
     */
    _getOptionLabels(rollType, options, actor = null) {
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

    /**
     * Update the contested check message with a new roll result
     * @param {ChatMessage} message - The message to update
     * @param {string} side - "attacker" or "defender"  
     * @param {Roll} roll - The roll result
     * @param {Object} flags - Updated flags object
     * @returns {Promise<void>}
     * @private
     */
    async _updateContestedMessage(message, side, roll, flags) {
        flags[`${side}Roll`] = {
            total: roll.total,
            formula: roll.formula,
            tooltip: await roll.getTooltip()
        };

        let selectedDefender = null;
        if (flags.selectedDefenderId)
            selectedDefender = game.actors.get(flags.selectedDefenderId);

        if (flags.attackerRoll && flags.defenderRoll) {
            flags.result = this._determineWinner(flags.attackerRoll.total, flags.defenderRoll.total);
            await this._applyContestEffects(flags);
        }

        const templateData = await this._prepareMessageTemplateData(flags, selectedDefender);
        const content = await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-chat.hbs`, templateData);
        await message.update({
            content: content,
            flags: { 'more-activities': flags }
        });
    }

    /**
     * Apply effects based on contest result
     * @param {Object} flags - Contest flags containing result and actor IDs
     * @returns {Promise<void>}
     * @private
     */
    async _applyContestEffects(flags) {
        if (!flags.result || this.appliedEffects.length === 0) return;

        const attackerActor = this.actor;
        const defenderActor = flags.defenderActorId ? game.actors.get(flags.defenderActorId) : null;

        if (!attackerActor || !defenderActor) {
            console.warn(`Cannot apply effects: missing attacker or defender actor`);
            return;
        }

        let winner = null;
        let loser = null;

        if (flags.result === `attacker`) {
            winner = attackerActor;
            loser = defenderActor;
        } else if (flags.result === `defender`) {
            winner = defenderActor;
            loser = attackerActor;
        }

        let targetActors = [];
        switch (this.applyEffectsTo) {
            case `loserAttacker`:
                if (loser && flags.result === `defender`) targetActors = [loser];
                break;
            case `loserDefender`:
                if (loser && flags.result === `attacker`) targetActors = [loser];
                break;
            case `loser`:
                if (loser) targetActors = [loser];
                break;
            case `winnerAttacker`:
                if (winner && flags.result === `defender`) targetActors = [winner];
                break;
            case `winnerDefender`:
                if (winner && flags.result === `attacker`) targetActors = [winner];
                break;
            case `winner`:
                if (winner) targetActors = [winner];
                break;
        }

        if (targetActors.length === 0) {
            console.warn('Cannot apply effects: cannot identify target');
            return;
        }

        for (const effectId of this.appliedEffects) {
            const effect = this.item?.effects?.get(effectId);
            if (!effect) {
                console.warn(`Effect ${effectId} not found on item ${this.item.name}`);
                continue;
            }

            for (const targetActor of targetActors) {
                try {
                    const effectData = effect.toObject();
                    effectData.origin = this.item?.uuid;
                    await targetActor.createEmbeddedDocuments(`ActiveEffect`, [ effectData ]);
                    ui.notifications.info(`Applied ${effect.name} to ${targetActor.name}`);
                }
                catch (error) {
                    console.error(`Failed to apply effect ${effect.name} to ${targetActor.name}:`, error);
                    ui.notifications.error(`Failed to apply effect ${effect.name} to ${targetActor.name}`);
                }
            }
        }
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
