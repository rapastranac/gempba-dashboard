/** How a gempba run is set up, as telemetry reports it from schema 2 on. */
export interface RunSetup {
    /** `centralized`, `semi_centralized`, or a custom scheduler's name; absent without a scheduler. */
    readonly scheduler?: string;
    /** `quasi_horizontal` or `work_stealing`; absent until one is created. */
    readonly loadBalancer?: string;
    /** `multiprocessing` or `multithreading`. */
    readonly runtimeMode?: string;
    readonly worldSize: number;
    /** The largest thread pool a rank reports; 0 until a frame arrives. */
    readonly threadsPerProcess: number;
    readonly gempbaVersion?: string;
    /** The key and value pairs the program set, in the order their keys were first set. */
    readonly annotations: ReadonlyArray<readonly [string, string]>;
    readonly markers: readonly RunMarker[];
}

/** A labelled moment of a run, recorded by the program or from a dashboard. */
export interface RunMarker {
    /** Milliseconds since telemetry came up on rank 0, the aggregator. */
    readonly elapsedMs: number;
    readonly label: string;
    /** `code` for one the program recorded, `dashboard` for one a client sent. */
    readonly source: string;
}

/**
 * What telemetry schema 2 adds to a rank's frame: where its time and its tasks' bytes go. Counters are cumulative
 * since the process started telemetry; a key that doesn't apply to the rank, such as a coordinator-only one on a worker,
 * reads 0. Times marked `Ms` are milliseconds since the scheduler run started, 0 until the event first happens.
 */
export interface RankAccounting {
    readonly bytesSentTotal: number;
    readonly bytesRecvTotal: number;
    /** Time in the MPI calls that send tasks: how long the sender stalled, not wire latency. */
    readonly sendMicrosTotal: number;
    /** Time in the MPI calls that receive tasks once a probe found them. */
    readonly recvMicrosTotal: number;
    /** Local submissions refused because every pool thread was busy; those nodes ran inline. */
    readonly spawnRejectedPoolFull: number;
    /** Remote submissions refused because the scheduler opened no channel; those nodes were tried locally. */
    readonly spawnRemoteRejected: number;
    /** The part of the pool's idle time, per thread, while no task ran in the pool. */
    readonly idleMicrosStarved: number;
    /** The part of the pool's idle time, per thread, while other pool threads ran tasks. */
    readonly idleMicrosImbalanced: number;
    /** A worker's time from receiving a task to reporting available, summed over its tasks. */
    readonly schedRunningMicros: number;
    /** A worker's time waiting for a task since the run started. */
    readonly schedWaitingMicros: number;
    readonly firstTaskMs: number;
    readonly lastTaskMs: number;
    /** A coordinator's time from assigning a rank to that rank reporting running, summed over assignments. */
    readonly assignLatencyMicrosTotal: number;
    readonly assignCount: number;
    readonly assignLatencyMicrosMax: number;
    /** A coordinator's time ranks spent available while it held no queued work, summed over ranks; 0 where the scheduler keeps no queue. */
    readonly availableMicrosQueueEmpty: number;
    /** Running and available reports a coordinator handled. */
    readonly coordinatorStateMsgsTotal: number;
    readonly coordinatorScoreProposalsTotal: number;
    readonly coordinatorScoreBroadcastsTotal: number;
    /** A coordinator's time telling its workers it was full and must not send tasks; 0 where it never fills. */
    readonly coordinatorFullMicros: number;
    readonly scoreProposalsSent: number;
    readonly lastScoreImprovementMs: number;
    /** Time in telemetry ticks that sent or read a frame. */
    readonly telemetryMicrosTotal: number;
}

export namespace RankAccounting {

    /** Every counter at 0, as a rank sends before it has done anything. */
    export function none(): RankAccounting {
        return {
            bytesSentTotal: 0, bytesRecvTotal: 0, sendMicrosTotal: 0, recvMicrosTotal: 0, spawnRejectedPoolFull: 0, spawnRemoteRejected: 0,
            idleMicrosStarved: 0, idleMicrosImbalanced: 0, schedRunningMicros: 0, schedWaitingMicros: 0, firstTaskMs: 0, lastTaskMs: 0,
            assignLatencyMicrosTotal: 0, assignCount: 0, assignLatencyMicrosMax: 0, availableMicrosQueueEmpty: 0, coordinatorStateMsgsTotal: 0,
            coordinatorScoreProposalsTotal: 0, coordinatorScoreBroadcastsTotal: 0, coordinatorFullMicros: 0, scoreProposalsSent: 0,
            lastScoreImprovementMs: 0, telemetryMicrosTotal: 0
        };
    }
}
