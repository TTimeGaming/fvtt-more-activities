export class FieldsData {
    static resolveFormula(formula, item, fallback = 0) {
        if (!formula || typeof formula !== `string`) return fallback;

        try {
            const integer = this._parseIntegerFormula(formula, false);
            if (integer !== null) return integer;

            const rollData = this._resolveRollData([item, item?.actor]);

            const roll = new Roll(formula, rollData);
            roll.evaluateSync();
            
            return Math.max(0, Math.floor(roll.total));
        }
        catch (error) {
            console.warn(`Failed to resolve formula "${formula}": `, error);
            return fallback;
        }
    }

    /**
     * Resolve a formula and return both the numeric result and the evaluated roll.
     * @param {string} formula
     * @param {Array<object>} candidates
     * @param {number} fallback
     * @param {{allowNegative?: boolean}} options
     * @returns {Promise<{amount: number, roll: Roll|null, formula: string}>}
     */
    static async resolveFormulaWithRoll(formula, candidates = [], fallback = 0, options = {}) {
        const { allowNegative = false } = options;
        if (!formula || typeof formula !== `string`) {
            return { amount: fallback, roll: null, formula: `` };
        }

        const trimmed = formula.trim();
        if (!trimmed) {
            return { amount: fallback, roll: null, formula: `` };
        }

        const integer = this._parseIntegerFormula(trimmed, allowNegative);
        if (integer !== null) {
            return { amount: integer, roll: null, formula: trimmed };
        }

        try {
            const rollData = this._resolveRollData(candidates);
            const roll = new Roll(trimmed, rollData);

            if (typeof roll.evaluate === `function`) {
                try {
                    await roll.evaluate({ async: true });
                }
                catch {
                    await roll.evaluate();
                }
            }
            else {
                roll.evaluateSync();
            }

            const total = Number(roll.total);
            if (!Number.isFinite(total)) {
                return { amount: fallback, roll: roll, formula: trimmed };
            }

            const amount = allowNegative ? Math.trunc(total) : Math.max(0, Math.floor(total));
            return { amount: amount, roll: roll, formula: trimmed };
        }
        catch (error) {
            console.warn(`Failed to resolve formula "${trimmed}": `, error);
            return { amount: fallback, roll: null, formula: trimmed };
        }
    }

    /**
     * Parse fixed integer formulas.
     * @param {string} formula
     * @param {boolean} allowNegative
     * @returns {number|null}
     * @private
     */
    static _parseIntegerFormula(formula, allowNegative = false) {
        if (!formula || typeof formula !== `string`) return null;
        const pattern = allowNegative ? /^[+-]?\d+$/ : /^\d+$/;
        if (!pattern.test(formula.trim())) return null;
        return parseInt(formula.trim(), 10);
    }

    /**
     * Resolve roll data from the first candidate that supports getRollData.
     * @param {Array<object>} candidates
     * @returns {object}
     * @private
     */
    static _resolveRollData(candidates = []) {
        for (const candidate of candidates) {
            if (typeof candidate?.getRollData === `function`) {
                return candidate.getRollData();
            }
        }
        return {};
    }

    static resolveCurrency(amount, currency) {
        switch (currency) {
            case `pp`: return amount * 10;
            case `ep`: return amount * 0.5;
            case `sp`: return amount * 0.1;
            case `cp`: return amount * 0.01;
            default: return amount * 1;
        }
    }

    static async deductActorFunds(actor, itemCost) {
        const requiredFunds = {
            pp: 0,
            gp: 0,
            ep: 0,
            sp: 0,
            cp: 0,
        };

        if (itemCost > 10) {
            requiredFunds.pp = Math.floor(itemCost / 10);
            itemCost -= requiredFunds.pp * 10;
            itemCost = Math.round(itemCost * 100) / 100;
        }

        if (itemCost > 1) {
            requiredFunds.gp = Math.floor(itemCost / 1);
            itemCost -= requiredFunds.gp * 1;
            itemCost = Math.round(itemCost * 100) / 100;
        }

        if (itemCost > 0.1) {
            requiredFunds.sp = Math.floor(itemCost * 10);
            itemCost -= requiredFunds.sp / 10;
            itemCost = Math.round(itemCost * 100) / 100;
        }

        if (itemCost > 0.01) {
            requiredFunds.cp = Math.floor(itemCost * 100);
            itemCost -= requiredFunds.cp / 100;
            itemCost = Math.round(itemCost * 100) / 100;
        }

        const actorFunds = { ...actor.system?.currency ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0, } };

        const toCopper = (currency) => (currency.pp * 1000) + (currency.gp * 100) + (currency.ep * 50) + (currency.sp * 10) + currency.cp;
        const fromCopper = (copper) => {
            const result = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

            result.pp = Math.floor(copper / 1000);
            copper %= 1000;

            result.gp = Math.floor(copper / 100);
            copper %= 100;

            result.ep = Math.floor(copper / 50);
            copper %= 50;

            result.sp = Math.floor(copper / 10);
            copper %= 10;

            result.cp = copper;
            return result;
        };
        const giveChange = (funds, changeAmount) => {
            const currencies = [ `gp`, `ep`, `sp`, `cp` ];
            const values = { gp: 100, ep: 50, sp: 10, cp: 1 };

            let remaining = changeAmount;
            for (const currency of currencies) {
                if (remaining < values[currency]) continue;

                const change = Math.floor(remaining / values[currency]);
                funds[currency] += change;
                remaining -= change * values[currency];
            }
        };

        const totalCost = toCopper(requiredFunds);
        const totalFunds = toCopper(actorFunds);

        if (totalFunds < totalCost) {
            return { success: false };
        }

        const currencies = [ `pp`, `gp`, `ep`, `sp`, `cp` ];
        const values = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

        let remainingCost = totalCost;

        for (const currency of currencies) {
            if (remainingCost === 0) break;
            if (actorFunds[currency] <= 0 || remainingCost < values[currency]) continue;

            const canUse = Math.min(actorFunds[currency], Math.floor(remainingCost / values[currency]));
            remainingCost -= canUse * values[currency];
            actorFunds[currency] -= canUse;
        }

        if (remainingCost <= 0) {
            return {
                success: true,
                remainingFunds: actorFunds,
            };
        }

        for (const currency of currencies) {
            if (remainingCost <= 0 || actorFunds[currency] <= 0) continue;

            const currencyValue = values[currency];
            const changeNeeded = currencyValue - remainingCost;

            actorFunds[currency] -= 1;
            remainingCost = 0;

            giveChange(actorFunds, changeNeeded);
            break;
        }
        
        return {
            success: true,
            remainingFunds: actorFunds,
        };
    }
}
