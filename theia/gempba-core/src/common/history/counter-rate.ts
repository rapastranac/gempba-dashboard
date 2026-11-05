export namespace CounterRate {

    /**
     * The per-second rate of a cumulative counter between two readings, or `undefined` when there is none: no time
     * passed between them, or the counter went back, as it does when its rank restarts.
     */
    export function perSecond(previous: number, current: number, elapsedMillis: number): number | undefined {
        if (elapsedMillis <= 0 || current < previous) {
            return undefined;
        }
        return (current - previous) * 1000 / elapsedMillis;
    }
}
