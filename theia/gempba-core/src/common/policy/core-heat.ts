import { NodeSnapshot } from '../model/node-snapshot';
import { SocketSnapshot } from '../model/socket-snapshot';

/** The estimated load on one CPU. */
export interface CpuHeat {
    readonly cpuId: number;
    /** Percent of the CPU, not clamped: above 100 means more work than it can run. */
    readonly loadPct: number;
    readonly oversubscribed: boolean;
}

/**
 * An estimate of the load on each CPU. The frames carry no per-CPU numbers, so each worker's CPU is spread evenly over
 * the CPUs it may run on, or over its own socket's CPUs when it is unrestricted, as for core usage.
 */
export namespace CoreHeat {

    /** The load above which a CPU counts as oversubscribed: all of it, plus a little for sampling noise. */
    export const OVERSUBSCRIBED_ABOVE_PCT = 105;

    /** One cell per CPU of the socket, in its CPU order; a worker on another socket of the node counts where it may run. */
    export function forSocket(node: NodeSnapshot, socket: SocketSnapshot): CpuHeat[] {
        const load = loadByCpu(node);
        return socket.cpuIds.map(cpuId => {
            const loadPct = load.get(cpuId) ?? 0;
            return { cpuId, loadPct, oversubscribed: loadPct > OVERSUBSCRIBED_ABOVE_PCT };
        });
    }

    /** The estimated load on every CPU of the node that a worker may run on, by CPU id. */
    export function loadByCpu(node: NodeSnapshot): Map<number, number> {
        const load = new Map<number, number>();
        for (const socket of node.sockets) {
            for (const rank of socket.ranks) {
                const cpuIds = rank.allowedCpuIds.length > 0 ? rank.allowedCpuIds : socket.cpuIds;
                if (cpuIds.length === 0) {
                    continue;
                }
                const share = rank.cpuPct / cpuIds.length;
                for (const cpuId of cpuIds) {
                    load.set(cpuId, (load.get(cpuId) ?? 0) + share);
                }
            }
        }
        return load;
    }
}
