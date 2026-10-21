import { CoreUsageSnapshot } from './core-usage-snapshot';
import { WorkerSnapshot } from './worker-snapshot';

export interface SocketSnapshot {
    readonly socketId: number;
    /** CPU brand; absent when the topology did not describe this socket. */
    readonly name?: string;
    readonly physicalCores: number;
    readonly logicalCores: number;
    readonly cpuIds: readonly number[];
    readonly hasTopology: boolean;
    readonly coreUsage: readonly CoreUsageSnapshot[];
    readonly workers: readonly WorkerSnapshot[];
}

export namespace SocketSnapshot {

    export function workerCount(socket: SocketSnapshot): number {
        return socket.workers.length;
    }
}
