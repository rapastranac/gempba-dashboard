export type TrendDirection = 'up' | 'down' | 'flat';

/** Which way a series is heading: the mean of its latest samples against the mean of the ones just before. */
export interface Trend {
    readonly direction: TrendDirection;
    /** The relative change between the two means; unknown without enough samples or from an earlier mean of 0. */
    readonly change?: number;
}

export namespace Trend {

    /** Samples in each of the two means. */
    export const WINDOW = 5;
    /** A relative change within this much counts as flat. */
    export const TOLERANCE = 0.05;

    export function of(values: readonly number[], window = WINDOW, tolerance = TOLERANCE): Trend {
        if (values.length < 2 * window) {
            return { direction: 'flat' };
        }
        const recent = mean(values.slice(-window));
        const earlier = mean(values.slice(-2 * window, -window));
        if (earlier === 0) {
            return { direction: recent > 0 ? 'up' : 'flat' };
        }
        const change = (recent - earlier) / Math.abs(earlier);
        return { direction: change > tolerance ? 'up' : change < -tolerance ? 'down' : 'flat', change };
    }
}

function mean(values: readonly number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
