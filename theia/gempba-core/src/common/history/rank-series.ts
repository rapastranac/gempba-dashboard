import { RankSnapshot } from '../model/rank-snapshot';

/** The counts a rank's history keeps, each as a running total and as a rate. */
export type RankCount = 'tasksStarted' | 'tasksLocal' | 'tasksSent' | 'tasksReceived' | 'bytesSent' | 'bytesReceived';

export namespace RankCount {

    export const ALL: readonly RankCount[] = ['tasksStarted', 'tasksLocal', 'tasksSent', 'tasksReceived', 'bytesSent', 'bytesReceived'];

    /**
     * The count in one frame. Tasks run locally are the tasks started less those received: the subtrees the rank handed its
     * own pool from its own work. gempba v4.3.0 counts a received task just before submitting it, so a live frame can read
     * a little low; it is clamped at 0, and the final line is exact.
     */
    export function of(rank: RankSnapshot, count: RankCount): number {
        switch (count) {
            case 'tasksStarted':
                return rank.tasksStartedTotal;
            case 'tasksLocal':
                return Math.max(0, rank.tasksStartedTotal - rank.tasksRecvTotal);
            case 'tasksSent':
                return rank.tasksSentTotal;
            case 'tasksReceived':
                return rank.tasksRecvTotal;
            case 'bytesSent':
                return rank.accounting.bytesSentTotal;
            case 'bytesReceived':
                return rank.accounting.bytesRecvTotal;
        }
    }

    /**
     * Whether the count means something on this rank. Tasks run locally hold on a worker of gempba's built-in schedulers,
     * whose every hand-off to its pool goes through `force_local_submit`; a coordinator queues the tasks it receives and
     * starts none, so the difference says nothing there.
     */
    export function applies(rank: RankSnapshot, count: RankCount): boolean {
        return count !== 'tasksLocal' || rank.role !== 'coordinator';
    }
}

/** One count's history, oldest first: its running total at each new frame, and its rate per second over the rank's last 10 s. */
export interface CountSeries {
    readonly total: readonly number[];
    readonly perSecond: readonly number[];
}

export namespace CountSeries {

    /** A count with no history, for a chart that has none to show. */
    export const EMPTY: CountSeries = { total: [], perSecond: [] };
}

/** Every count's history. */
export type CountHistories = Readonly<Record<RankCount, CountSeries>>;

export namespace CountHistories {

    export function empty(): CountHistories {
        return of(() => ({ total: [], perSecond: [] }));
    }

    export function of(series: (count: RankCount) => CountSeries): CountHistories {
        return Object.fromEntries(RankCount.ALL.map(count => [count, series(count)])) as Record<RankCount, CountSeries>;
    }
}

/** A copy of one rank's recent history for drawing; each series is oldest first. */
export interface RankSeries {
    /** Percent of one core, as in the frames. */
    readonly cpu: readonly number[];
    /** Percent of the time the rank's pool threads were idle, between two consecutive frames. */
    readonly idlePct: readonly number[];
    readonly rssBytes: readonly number[];
    /** Each count, as a running total and as a rate. */
    readonly counts: CountHistories;
}

export namespace RankSeries {

    export function empty(): RankSeries {
        return { cpu: [], idlePct: [], rssBytes: [], counts: CountHistories.empty() };
    }

    export function isEmpty(series: RankSeries): boolean {
        return series.cpu.length === 0;
    }
}
