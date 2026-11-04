import { PeerSnapshot } from './peer-snapshot';
import { WorkerAccounting } from './run-setup';

/**
 * A rank's role in the scheduler, as the scheduler declares it: a coordinator hands out work and runs no tasks; a worker
 * runs tasks. Telemetry's rank 0, the aggregator, can be either, and a run can have no coordinator.
 */
export type WorkerRole = 'coordinator' | 'worker';

export interface WorkerSnapshot {
    readonly workerId: number;
    readonly seqNo: number;
    /** The worker's own monotonic clock when it took the frame; only the difference between two of its frames means anything. */
    readonly localMillis: number;
    /** 0 when unknown. */
    readonly pid: number;
    readonly sentinel: boolean;
    /** The rank's declared scheduler role; absent before telemetry schema 2. */
    readonly role?: WorkerRole;
    /** The CPUs the worker may run on; empty when unrestricted or unknown. */
    readonly allowedCpuIds: readonly number[];
    /** Subtrees handed to a pool thread, received ones included, counted at hand-off. */
    readonly tasksStartedTotal: number;
    readonly tasksRunning: number;
    readonly tasksSentTotal: number;
    readonly tasksRecvTotal: number;
    readonly schedulerPendingCount: number;
    readonly idleMicrosPerWorker: number;
    readonly cpuPct: number;
    readonly rssBytes: number;
    readonly threads: number;
    readonly elapsedSeconds: number;
    readonly peers: readonly PeerSnapshot[];
    /** Where the worker's time and its tasks' bytes go; absent before telemetry schema 2. */
    readonly accounting?: WorkerAccounting;
}
