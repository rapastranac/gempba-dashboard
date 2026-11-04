/** A copy of one worker's recent history for drawing; each series is oldest first. */
export interface WorkerSeries {
    /** Percent of one core, as in the frames. */
    readonly cpu: readonly number[];
    /** Tasks started per second, handed to its threads, over the last 10 s of the worker's frames. */
    readonly tasksPerSecond: readonly number[];
    /** Percent of the time the worker's pool threads were idle, between two consecutive frames. */
    readonly idlePct: readonly number[];
    readonly rssBytes: readonly number[];
}

export namespace WorkerSeries {

    export function empty(): WorkerSeries {
        return { cpu: [], tasksPerSecond: [], idlePct: [], rssBytes: [] };
    }

    export function isEmpty(series: WorkerSeries): boolean {
        return series.cpu.length === 0;
    }
}
