import { RankSnapshot } from '../model/rank-snapshot';

/**
 * What a rank does, told by its own numbers, never by its rank number or the scheduler's name: whether it runs tasks,
 * and whether it coordinates. A rank can do both, or, early in a run, neither yet.
 */
export interface RankWork {
    /** It has started a task, or spent time running or waiting for one. */
    readonly runsTasks: boolean;
    /** It has counted assignments, coordinator reports or score broadcasts, or holds queued scheduler requests. */
    readonly coordinates: boolean;
}

export namespace RankWork {

    export function of(rank: RankSnapshot): RankWork {
        const accounting = rank.accounting;
        return {
            runsTasks: rank.tasksStartedTotal > 0 || accounting.schedRunningMicros > 0 || accounting.schedWaitingMicros > 0,
            coordinates: accounting.assignCount > 0 || accounting.coordinatorStateMsgsTotal > 0 || accounting.coordinatorScoreBroadcastsTotal > 0
                || rank.schedulerPendingCount > 0
        };
    }
}
