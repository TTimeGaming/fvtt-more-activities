export class HandlebarsData {
    static async init() {
        Handlebars.registerHelper(`add`, function(a, b) {
            return a + b;
        });
        
        Handlebars.registerHelper(`subtract`, function(a, b) {
            return a - b;
        });
        
        Handlebars.registerHelper(`includes`, function(array, value) {
            return Array.isArray(array) && array.includes(value);
        });
    }
}
