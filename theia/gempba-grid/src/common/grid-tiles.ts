import { Bytes, NodeHistoryStore, NodeSeries, NumberText, WorldSnapshot } from '@gempba/core';

/** What one tile shows, already formatted: the view only lays it out. */
export interface GridTile {
    readonly host: string;
    /** The node's utilization now, e.g. `87%`. */
    readonly cpuText: string;
    /** Utilization samples, oldest first, for the graph. */
    readonly cpuHistory: readonly number[];
    /** e.g. `Memory 12.4 GB / 16.0 GB`, or a dash before the first node frame. */
    readonly memoryText: string;
    /** Memory used over total, 0 when unknown. */
    readonly memoryFraction: number;
}

export namespace GridTiles {

    /** How many samples a full graph shows: the history kept per node. */
    export const HISTORY_CAPACITY = NodeHistoryStore.CAPACITY;

    /** One tile per node, in the snapshot's stable first-seen order. */
    export function of(snapshot: WorldSnapshot | undefined, history: { seriesFor(host: string): NodeSeries }): GridTile[] {
        return (snapshot?.nodes ?? []).map(node => {
            const series = history.seriesFor(node.host);
            const memTotal = series.memTotalLatest;
            return {
                host: node.host,
                cpuText: `${NumberText.fixed(node.nodeUtilPct, 0)}%`,
                cpuHistory: series.cpu,
                memoryText: memTotal > 0 ? `Memory ${Bytes.human(series.memUsedLatest)} / ${Bytes.human(memTotal)}` : 'Memory —',
                memoryFraction: memTotal > 0 ? series.memUsedLatest / memTotal : 0
            };
        });
    }
}
