/** A copy of one node's recent history for drawing. */
export interface NodeSeries {
    /** CPU% samples, oldest first. */
    readonly cpu: readonly number[];
    readonly cpuLatest: number;
    readonly memUsedLatest: number;
    readonly memTotalLatest: number;
}

export namespace NodeSeries {

    export function empty(): NodeSeries {
        return { cpu: [], cpuLatest: 0, memUsedLatest: 0, memTotalLatest: 0 };
    }

    export function isEmpty(series: NodeSeries): boolean {
        return series.cpu.length === 0;
    }
}
