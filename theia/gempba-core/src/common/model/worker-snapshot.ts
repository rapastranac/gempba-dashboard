import { PeerSnapshot } from './peer-snapshot';

export interface WorkerSnapshot {
    readonly workerId: number;
    readonly seqNo: number;
    /** 0 when unknown. */
    readonly pid: number;
    readonly sentinel: boolean;
    readonly tasksLocalTotal: number;
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
