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
}
