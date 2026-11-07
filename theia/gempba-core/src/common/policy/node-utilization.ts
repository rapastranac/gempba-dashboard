import { NodeSnapshot } from '../model/node-snapshot';
import { RankSnapshot } from '../model/rank-snapshot';

export namespace NodeUtilization {

    /**
     * Per-allocation utilization: `clamp(sumCpuPct / allocatedCores, 0, 100)`, or 0 without an allocation.
     * `sumCpuPct` is in percent-of-one-core units (400 = four cores pegged).
     */
    export function pct(sumCpuPct: number, allocatedCores: number): number {
        if (allocatedCores <= 0) {
            return 0;
        }
        const util = sumCpuPct / allocatedCores;
        if (util < 0) {
            return 0;
        }
        return Math.min(util, 100);
    }

    /** The cores a node's ranks may run on: their allowed CPUs together, or every core when none is restricted. */
    export function allocatedCores(node: NodeSnapshot): number {
        const allowed = new Set(node.sockets.flatMap(socket => socket.ranks.flatMap(rank => rank.allowedCpuIds)));
        return allowed.size > 0 ? allowed.size : node.logicalCores;
    }

    /** How many cores the ranks keep busy together, e.g. 3.5 for ranks at 300% and 50%. */
    export function coresBusy(ranks: readonly RankSnapshot[]): number {
        return ranks.reduce((sum, rank) => sum + rank.cpuPct, 0) / 100;
    }
}
