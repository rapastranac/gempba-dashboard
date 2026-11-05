import { CoreUsageSnapshot } from './core-usage-snapshot';
import { RankSnapshot } from './rank-snapshot';

export interface SocketSnapshot {
    readonly socketId: number;
    /** CPU brand; absent when the topology did not describe this socket. */
    readonly name?: string;
    readonly physicalCores: number;
    readonly logicalCores: number;
    readonly cpuIds: readonly number[];
    readonly hasTopology: boolean;
    readonly coreUsage: readonly CoreUsageSnapshot[];
    readonly ranks: readonly RankSnapshot[];
}

export namespace SocketSnapshot {

    export function rankCount(socket: SocketSnapshot): number {
        return socket.ranks.length;
    }
}
