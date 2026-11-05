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

    /** The cores a node's workers may run on: their allowed CPUs together, or every core when none is restricted. */
    export function allocatedCores(node: NodeSnapshot): number {
        const allowed = new Set(node.sockets.flatMap(socket => socket.ranks.flatMap(worker => worker.allowedCpuIds)));
        return allowed.size > 0 ? allowed.size : node.logicalCores;
    }

    /** How many cores the workers keep busy together, e.g. 3.5 for workers at 300% and 50%. */
    export function coresBusy(workers: readonly RankSnapshot[]): number {
        return workers.reduce((sum, worker) => sum + worker.cpuPct, 0) / 100;
    }
}
