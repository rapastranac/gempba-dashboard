/** Round tops for chart scales, so a graph of tasks per second tops out at 250 rather than at 237. */
export namespace NiceScale {

    const STEPS = [1, 2, 2.5, 5, 10];

    /** The smallest 1, 2, 2.5 or 5 × 10ⁿ at or above every value and `floor`; 1 when there is nothing above 0. */
    export function max(values: readonly number[], floor = 0): number {
        const top = values.reduce((highest, value) => Number.isFinite(value) && value > highest ? value : highest, floor);
        return top > 0 ? niceAbove(top) : 1;
    }

    /** The smallest 1, 2, 2.5 or 5 × 10ⁿ at or above `value`, which must be above 0. */
    export function niceAbove(value: number): number {
        const magnitude = 10 ** Math.floor(Math.log10(value));
        const step = STEPS.find(candidate => candidate * magnitude >= value) ?? 10;
        return Number((step * magnitude).toPrecision(12));
    }
}
