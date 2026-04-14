export function ensureActivityInferredSource(activity) {
    if (!activity || activity._inferredSource || typeof activity.toObject !== `function`) return;

    const source = activity.toObject(false) ?? activity.toObject() ?? activity._source;
    if (!source) return;

    Object.defineProperty(activity, `_inferredSource`, {
        value: Object.freeze(source),
        configurable: true,
        enumerable: false,
        writable: false,
    });
}
