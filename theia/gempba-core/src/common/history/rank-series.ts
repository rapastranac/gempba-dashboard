/** A copy of one rank's recent history for drawing; each series is oldest first. */
export interface RankSeries {
    /** Percent of one core, as in the frames. */
    readonly cpu: readonly number[];
    /** Tasks started per second, handed to its threads, over the last 10 s of the rank's frames. */
    readonly tasksPerSecond: readonly number[];
    /** Percent of the time the rank's pool threads were idle, between two consecutive frames. */
    readonly idlePct: readonly number[];
    readonly rssBytes: readonly number[];
}

export namespace RankSeries {

    export function empty(): RankSeries {
        return { cpu: [], tasksPerSecond: [], idlePct: [], rssBytes: [] };
    }

    export function isEmpty(series: RankSeries): boolean {
        return series.cpu.length === 0;
    }
}
