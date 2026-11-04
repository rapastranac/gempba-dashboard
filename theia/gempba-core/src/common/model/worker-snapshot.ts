import { PeerSnapshot } from './peer-snapshot';

export interface WorkerSnapshot {
    readonly workerId: number;
    readonly seqNo: number;
    /** The worker's own monotonic clock when it took the frame; only the difference between two of its frames means anything. */
    readonly localMillis: number;
    /** 0 when unknown. */
    readonly pid: number;
    readonly sentinel: boolean;
    /** The CPUs the worker may run on; empty when unrestricted or unknown. */
    readonly allowedCpuIds: readonly number[];
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
}
