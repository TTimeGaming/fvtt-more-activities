export class FieldsData {
    static resolveFormula(formula, item, fallback = 0) {
        if (!formula || typeof formula !== `string`) return fallback;

        try {
            if (/^\d+$/.test(formula.trim()))
                return parseInt(formula.trim());

            const roll = new Roll(formula, item?.getRollData() || {});
            roll.evaluateSync();
            
            return Math.max(0, Math.floor(roll.total));
        }
        catch (error) {
            console.warn(`Failed to resolve formula "${formula}": `, error);
            return fallback;
        }
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
