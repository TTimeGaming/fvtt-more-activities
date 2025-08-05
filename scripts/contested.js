const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ContestedData {
    static async init() {
        Handlebars.registerHelper(`includes`, function(array, value) {
            return Array.isArray(array) && array.includes(value);
        });

        await ContestedManager.init();
    }

    static applyListeners(message, html) {
        $(html).find('.contested-results .result-summary').click(function() {
            const row = $(this).closest('.contest-result-row');
            row.toggleClass('expanded');
        });
    }

    /**
     * Get human-readable labels for roll options with bonuses
     * @param {string} rollType - The type of roll (ability, skill, tool)
     * @param {string[]} options - Array of option keys
     * @param {Actor5e} actor - Actor to get bonuses for (optional)
     * @returns {Object[]}
     * @private
     */
    static getOptionLabels(rollType, options, actor = null) {
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

class ContestedManager {
    static contests = new Map();

    static async init() {
        game.socket.on(`module.more-activities`, (data) => {
            switch (data.type) {
                case `createActivity`:
                    this._createContest(data);
                    break;
                case `promptDefender`:
                    this._promptDefender(data);
                    break;
                case `recordRoll`:
                    this._recordRoll(data);
                    break;
                case `deleteContest`:
                    this._deleteContest(data);
                    break;
                case `generateResult`:
                    this._generateResultsCard(data);
                    break;
            }
        });
    }

    static createContest(activity) {
        const contestId = foundry.utils.randomID();
        const data = {
            type: `createActivity`,
            contestId: contestId,
            initiatorId: activity.actor?.id,
            activityData: {
                id: activity.id,
                name: activity.name,
                itemId: activity.item?.id,
                itemName: activity.item?.name,
                attackerRollType: activity.attackerRollType,
                defenderRollType: activity.defenderRollType,
                attackerOptions: activity.attackerOptions,
                defenderOptions: activity.defenderOptions,
            },
        };

        game.socket.emit(`module.more-activities`, data);
        return this._createContest(data);
    }

    static async promptDefender(contestId, defender) {
        const data = {
            type: `promptDefender`,
            contestId: contestId,
            defenderId: defender.id,
        };

        game.socket.emit(`module.more-activities`, data);
        this._promptDefender(data);
    }

    static async recordRoll(contestId, actorId, rollData) {
        const data = {
            type: `recordRoll`,
            contestId: contestId,
            actorId: actorId,
            rollData: rollData,
        };

        game.socket.emit(`module.more-activities`, data);
        this._recordRoll(data);

        const contest = this.contests.get(contestId);
        if (!contest || contest.rolls.size < contest.defenders.length + 1) return;

        const resultData = {
            type: `generateResult`,
            contestId: contestId,
        };
        game.socket.emit(`module.more-activities`, resultData);
        this._generateResultsCard(resultData);

        const deleteData = {
            type: `deleteContest`,
            contestId: contestId,
        };

        game.socket.emit(`module.more-activities`, deleteData);
        this._deleteContest(deleteData);
    }

    static _createContest(data) {
        const contest = {
            id: data.contestId,
            initiatorId: data.initiatorId,
            activityData: data.activityData,
            defenders: [],
            rolls: new Map(),
        };
        this.contests.set(data.contestId, contest);
        return contest;
    }

    static _promptDefender(data) {
        const contest = this.contests.get(data.contestId);
        if (!contest) return;

        contest.defenders.push(data.defenderId);
        
        const user = this._getUserForActor(data.defenderId);
        if (user?.id !== game.userId) return;

        this._handleDefenderApp(data.contestId, data.defenderId);
    }

    static async _recordRoll(data) {
        const contest = this.contests.get(data.contestId);
        if (!contest) return;

        switch (data.rollData.rollType) {
            case `ability`:
                data.rollData.rollLabel = CONFIG.DND5E.abilities[data.rollData.option].label;
                break;
            case `skill`:
                data.rollData.rollLabel = CONFIG.DND5E.skills[data.rollData.option].label;
                break;
        }

        contest.rolls.set(data.actorId, data.rollData);
    }

    static _deleteContest(data) {
        this.contests.delete(data.contestId);
    }

    static _handleDefenderApp(contestId, actorId) {
        const contest = this.contests.get(contestId);
        if (!contest) return;

        const actor = game.actors.get(actorId);
        if (!actor) return;

        new ContestedDefenderApp(contestId, actor, `defender`).render(true);
    }

    static async _generateResultsCard(data) {
        const contest = this.contests.get(data.contestId);
        if (!contest) return;

        const user = this._getUserForActor(contest.initiatorId);
        if (user?.id !== game.userId) return;

        const initiatorRoll = contest.rolls.get(contest.initiatorId);
        const defenderRolls = contest.defenders.map(defenderId => {
            const roll = contest.rolls.get(defenderId);
            const won = roll.total > initiatorRoll.total;
            const lost = roll.total < initiatorRoll.total;

            const results = [];
            for (const term of roll.roll.terms) {
                if (!term.results) continue;

                for (const result of term.results)
                    results.push(result.result);
            }
            
            const actor = game.actors.get(defenderId);
            return {
                actor: actor,
                roll: roll,
                results: results,
                won: won,
                lost: lost
            };
        });

        const results = [];
        for (const term of initiatorRoll.roll.terms) {
            if (!term.results) continue;

            for (const result of term.results)
                results.push(result.result);
        }

        const initiator = game.actors.get(contest.initiatorId);
        const item = initiator.items.get(contest.activityData.itemId);
        const activity = item.system.activities.get(contest.activityData.id);
    
        const templateData = {
            activity: activity,
            initiatorRoll: initiatorRoll,
            initiatorResults: results,
            defenderRolls: defenderRolls
        };
        
        const content = await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-results.hbs`, templateData);
        ChatMessage.create({
            content: content,
            speaker: ChatMessage.getSpeaker({ actor: initiator })
        });

        this._applyContestEffects(contest, activity, templateData);
    }
    
    static async _applyContestEffects(contest, activity, templateData) {
        if (activity.appliedEffects.length === 0) return;

        console.log(contest);
        console.log(activity);
        console.log(templateData);

        const attackerActor = contest.initiator;
        for (const defender of templateData.defenderRolls) {
            const defenderActor = defender.actor;
            if (!defenderActor) continue;

            const winner = defender.lost ? attackerActor : defenderActor;
            const loser = defender.lost ? defenderActor : attackerActor;

            let targetActor = null;
            switch (activity.applyEffectsTo) {
                case `loserAttacker`:
                    if (!defender.lost) targetActor = loser;
                    break;
                case `loserDefender`:
                    if (defender.lost) targetActor = loser;
                    break;
                case `loser`:
                    targetActor = loser;
                    break;
                case `winnerAttacker`:
                    if (defender.lost) targetActor = winner;
                    break;
                case `winnerDefender`:
                    if (!defender.lost) targetActor = winner;
                    break;
                case `winner`:
                    targetActor = winner;
                    break;
            }

            if (targetActor == null) {
                console.warn('Cannot apply effects: cannot identify target');
                return;
            }

            const item = activity?.item;
            for (const effectId of activity.appliedEffects) {
                const effect = item?.effects?.get(effectId);
                if (!effect) {
                    console.warn(`Effect ${effectId} not found on item ${item?.name}`);
                    continue;
                }
                
                try {
                    const effectData = effect.toObject();
                    effectData.origin = item?.uuid;
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

    static _getUserForActor(actorId) {
        const actor = game.actors.find(a => a.id === actorId);
        const validUsers = game.users.filter(u => actor.testUserPermission(u, `OWNER`) && u.active);
        const validUser = validUsers.find(u => !u.isGM);
        const gmUser = validUsers.find(u => u.isGM);
        return validUser ? validUser : gmUser;
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
            choices: [ `attacker`, `defender`, `tie`, ],
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
        new ContestedInitiatorApp(this).render(true);
        return results;
    }

    /**
     * Get the actor that owns this activity's item.
     * @type {Actor5e|null}
     */
    get actor() {
        return this.item?.actor || null;
    }
}

class ContestedInitiatorApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: [ `dnd5e2`, `contested-initiator-app` ],
        tag: `form`,
        position: {
            width: 400,
            height: `auto`,
        },
    };

    static PARTS = {
        form: {
            template: `modules/more-activities/templates/contested-initiator.hbs`,
        },
    };

    constructor(activity, options = {}) {
        super({
            window: {
                title: `Select Targets`,
            },
            ...options,
        });
        this.activity = activity;
        this.actor = activity?.actor;
        this.contest = ContestedManager.createContest(activity);
        this.selectedDefenders = [];
        this._prepopulateDefenders();
    }

    /** @inheritdoc */
    async _prepareContext() {
        const defendersData = await this._getPotentialDefenders();
        return {
            isGM: game.user.isGM,
            activity: this.activity,
            defendersData: defendersData,
            selectedDefenders: this.selectedDefenders.map((element, index) => ({
                ...element,
                index: index,
            })),
            attackerOptions: ContestedData.getOptionLabels(
                this.activity.attackerRollType, 
                this.activity.attackerOptions, 
                this.activity.actor
            )
        };
    }

    /** @inheritdoc */
    async _onRender(context, options) {
        if (!this.element.querySelector(`.window-subtitle`)) {
            const subtitle = document.createElement(`h2`);
            subtitle.classList.add(`window-subtitle`);
            subtitle.innerText = this.activity.item?.name || this.activity.name || ``,
            this.element.querySelector(`.window-header .window-title`).insertAdjacentElement(`afterend`, subtitle);
        }

        this.element.querySelector(`select[name="defenderId"]`).addEventListener(`change`, async(event) => {
            const selectElement = event.currentTarget;
            const actorId = selectElement.value;
            if (!actorId || this.selectedDefenders.find(d => d.id === actorId)) return;

            const actor = game.actors.get(actorId);
            if (!actor) return;

            const optionElement = selectElement.querySelector(`option[value="${actorId}"]`);
            this.selectedDefenders.push({
                ...actor,
                id: actorId,
                defenderType: optionElement.parentElement.getAttribute(`data-type`),
            });
            this.render();
        });

        this.element.querySelectorAll(`.defender-delete-btn`).forEach(btn => {
            btn.addEventListener(`click`, async(event) => {
                const index = parseInt(event.target.dataset.index);
                const selectedDefenders = this.selectedDefenders.filter((_, i) => i !== index);
                this.selectedDefenders = selectedDefenders;
                this.render();
            });
        });

        this.element.querySelector(`.start-contest-btn`).addEventListener(`click`, async(event) => {
            if (this.selectedDefenders.length === 0) {
                ui.notifications.warn(`Select at least one defender`);
                return;
            }

            for (const defender of this.selectedDefenders) {
                await ContestedManager.promptDefender(this.contest.id, defender);
            }

            new ContestedDefenderApp(this.contest.id, this.actor, `attacker`).render(true);
            this.close();
        });
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

        if (this.activity.allowPlayerTargeting || isGM) {
            const selectedActorsIds = this.selectedDefenders.map(actor => actor.id);

            if (isGM) {
                playerCharacters = game.actors.filter(actor => actor.type === `character` && actor !== this.actor && !selectedActorsIds.includes(actor.id));
                nonPlayerCharacters = game.actors.filter(actor => actor.type !== `character` && actor !== this.actor && !selectedActorsIds.includes(actor.id));

                const scene = game.scenes.current;
                if (scene) {
                    allTokens = scene.tokens
                        .map(token => token.actor)
                        .filter(actor => actor && actor !== this.actor && actor.type !== `character` && !selectedActorsIds.includes(actor.id))
                    ;
                }
            }
            else {
                playerCharacters = game.actors.filter(actor => actor.type === `character` && actor.isOwner && actor !== this.actor && !selectedActorsIds.includes(actor.id));
                nonPlayerCharacters = game.actors.filter(actor => actor.type !== `character` && actor.isOwner && actor !== this.actor && !selectedActorsIds.includes(actor.id));
            }
        }
        
        return {
            targets: targets.filter(t => !this.selectedDefenders.find(d => d.id === t.id)),
            playerCharacters: playerCharacters.filter(t => !this.selectedDefenders.find(d => d.id === t.id)),
            nonPlayerCharacters: nonPlayerCharacters.filter(t => !this.selectedDefenders.find(d => d.id === t.id)),
            allTokens: allTokens.filter(t => !this.selectedDefenders.find(d => d.id === t.id)),
            hasMultipleGroups: [ targets, playerCharacters, nonPlayerCharacters, allTokens ].filter(group => group.length > 0).length > 1,
        };
    }

    async _prepopulateDefenders() {
        for (const target of Array.from(game.user.targets).map(token => token.actor).filter(actor => actor && actor !== this.actor)) {
            this.selectedDefenders.push({
                ...target,
                id: target.id,
                defenderType: `Target`
            });
        }
    }
}

class ContestedDefenderApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
            rollOptions: ContestedData.getOptionLabels(rollType, options, this.actor)
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
