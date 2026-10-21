import { SocketSnapshot } from './socket-snapshot';

export interface NodeSnapshot {
    readonly host: string;
    readonly socketCount: number;
    /** 0 when unknown. */
    readonly physicalCores: number;
    readonly logicalCores: number;
    /** Whether a live node frame supplied used/available memory; otherwise only the topology total is known. */
    readonly hasLiveMemory: boolean;
    readonly memTotalBytes: number;
    readonly memUsedBytes: number;
    readonly sentinelWorkerId: number;
    /** Per-allocation CPU utilization, already clamped to 0..100. */
    readonly nodeUtilPct: number;
    /** Ascending socket-id order. */
    readonly sockets: readonly SocketSnapshot[];
}

export namespace NodeSnapshot {

    export function workerCount(node: NodeSnapshot): number {
        return node.sockets.reduce((total, socket) => total + SocketSnapshot.workerCount(socket), 0);
    }
}
