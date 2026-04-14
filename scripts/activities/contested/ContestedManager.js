import { MessageData } from '../../utils/message.js';
import { DomData } from '../../utils/dom.js';
import { EffectsData } from '../../utils/effects.js';
import { FieldsData } from '../../utils/fields.js';
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_NAME = `contested`;

import { ContestedData } from './ContestedData.js';
import { ContestedDefenderApp } from './ContestedDefenderApp.js';

export class ContestedManager {
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
                attackerCustom: activity.attackerCustom,
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

        const initiator = game.actors.get(contest.initiatorId);
        const item = initiator.items.get(contest.activityData.itemId);
        const activity = item.system.activities.get(contest.activityData.id);

        const initiatorRoll = contest.rolls.get(contest.initiatorId);
        const defenderRolls = contest.defenders.map(defenderId => {
            const roll = contest.rolls.get(defenderId);
            const won = roll.total > initiatorRoll.total;
            const lost = roll.total < initiatorRoll.total;

            let minorWin = false, majorWin = false, minorLoss = false, majorLoss = false;
            if (activity.allowMinorSuccess || activity.allowMajorSuccess) {
                const degree = ContestedData.determineVictoryDegree(activity, Math.max(roll.total, initiatorRoll.total), Math.min(roll.total, initiatorRoll.total));

                if (won) {
                    minorWin = degree === `minor`;
                    majorWin = degree === `major`;
                }

                if (lost) {
                    minorLoss = degree === `minor`;
                    majorLoss = degree === `major`;
                }
            }

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
                lost: lost,
                majorWin: majorWin,
                minorWin: minorWin,
                majorLoss: majorLoss,
                minorLoss: minorLoss,
            };
        });

        const results = [];
        for (const term of initiatorRoll.roll.terms) {
            if (!term.results) continue;

            for (const result of term.results)
                results.push(result.result);
        }
    
        const templateData = {
            activity: activity,
            initiatorRoll: initiatorRoll,
            initiatorResults: results,
            defenderRolls: defenderRolls
        };
        
        const content = game.version.startsWith(`12`) ?
            await renderTemplate(`modules/more-activities/templates/contested-results.hbs`, templateData) :
            await foundry.applications.handlebars.renderTemplate(`modules/more-activities/templates/contested-results.hbs`, templateData)
        ;
        
        ChatMessage.create({
            content: content,
            speaker: ChatMessage.getSpeaker({ actor: initiator })
        });

        this._applyContestEffects(contest, activity, templateData);
    }
    
    static async _applyContestEffects(contest, activity, templateData) {
        if (!activity.effectGroups || activity.effectGroups.length === 0) return;

        const attackerActor = game.actors.get(contest.initiatorId);
        if (!attackerActor) return;
        for (const defender of templateData.defenderRolls) {
            const defenderActor = defender.actor;
            if (!defenderActor) continue;

            const winner = defender.lost ? attackerActor : defenderActor;
            const loser = defender.lost ? defenderActor : attackerActor;

            for (const group of activity.effectGroups) {
                if (!group.autoApply) continue;

                const targetActor = this._getTargetActor(group.applyTo, winner, loser, defender);
                if (!targetActor) continue;

                if ((group.appliedEffects?.length ?? 0) > 0) {
                    await EffectsData.apply(activity, [targetActor], group.appliedEffects);
                }

                if ((group.appliedEffectsMinor?.length ?? 0) > 0 && (defender.minorWin || defender.minorLoss)) {
                    await EffectsData.apply(activity, [targetActor], group.appliedEffectsMinor);
                }

                if ((group.appliedEffectsMajor?.length ?? 0) > 0 && (defender.majorWin || defender.majorLoss)) {
                    await EffectsData.apply(activity, [targetActor], group.appliedEffectsMajor);
                }
            }
        }
    }

    static _getTargetActor(applyTo, winner, loser, defender) {
        switch (applyTo) {
            case `loserAttacker`:
                return !defender.lost ? loser : null;
            case `loserDefender`:
                return defender.lost ? loser : null;
            case `loserAny`:
            case `loser`:
                return loser;
            case `winnerAttacker`:
                return defender.lost ? winner : null;
            case `winnerDefender`:
                return !defender.lost ? winner : null;
            case `winnerAny`:
            case `winner`:
                return winner;
            default:
                return null;
        }
    }

    static _getUserForActor(actorId) {
        const actor = game.actors.find(a => a.id === actorId);
        if (!actor) return null;
        const validUsers = game.users.filter(u => actor.testUserPermission(u, `OWNER`) && u.active);
        const validUser = validUsers.find(u => !u.isGM);
        const gmUser = validUsers.find(u => u.isGM);
        return validUser ? validUser : gmUser;
    }
}
