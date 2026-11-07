import {
    Bytes, NodeHistoryStore, NodeSeries, NodeSnapshot, NodeUtilization, NumberText, RankSeries, RankSnapshot, RankWork, Rates, RunSetupText, TaskMoves, TaskWords,
    WorldSnapshot
} from '@gempba/core';
import { Liveness } from '@gempba/ui/lib/common/liveness';
import { Trend } from '@gempba/ui/lib/common/trend';

export type GridTone = 'cpu' | 'memory' | 'tasks' | 'network' | 'idle';

/** A headline figure, already formatted: the view draws it as a hero stat. */
export interface GridFigure {
    readonly label: string;
    readonly value: string;
    readonly unit?: string;
    readonly detail?: string;
    readonly trend?: Trend;
    readonly tone?: GridTone;
    /** How full, from 0 to 1, for a meter under the figure. */
    readonly meter?: number;
    /** What the figure counts, on hover. */
    readonly hint?: string;
}

/** What one tile shows, already formatted: the view only lays it out. */
export interface GridTile {
    readonly host: string;
    /** The node's utilization now, e.g. `87%`. */
    readonly cpuText: string;
    /** Utilization samples, oldest first, for the graph. */
    readonly cpuHistory: readonly number[];
    readonly tasks: GridFigure;
    /** With a meter of the used over the total; absent until the node reports its memory. */
    readonly memory?: GridFigure;
    /** The tasks the node's processes sent to and received from other processes, as a line and a tooltip; absent in a run of one process. */
    readonly moved?: { readonly text: string, readonly hint: string };
    /** Whether the node's own ranks still send new frames, while the stream goes on. */
    readonly liveness: Liveness;
}

/** The whole cluster above the tiles: the stream's liveness, its size, and its figures summed over the nodes. */
export interface GridOverview {
    readonly liveness: Liveness;
    /** `4 nodes · 32 ranks`. */
    readonly summary: string;
    /** How the run is set up, in one line, and its annotations and markers for a tooltip; absent before telemetry schema 2. */
    readonly setup?: { readonly text: string, readonly details: readonly string[] };
    /** Memory, with a meter, only once a node reports it. */
    readonly figures: readonly GridFigure[];
    /** Tasks completed by every rank, oldest first, in {@link throughputUnit} for the whole history. */
    readonly throughput: readonly number[];
    readonly throughputUnit: Rates.Unit;
    /** `Tasks completed per second`, or per minute, as the history is counted. */
    readonly throughputTitle: string;
}

export namespace GridTiles {

    /** How many samples a full graph shows: the history kept per node. */
    export const HISTORY_CAPACITY = NodeHistoryStore.CAPACITY;

    /** What the Grid reads besides the snapshot: the hub's histories and frame times. */
    export interface Sources {
        node(host: string): NodeSeries;
        throughput(host: string): readonly number[];
        clusterThroughput(): readonly number[];
        rank(id: number): RankSeries;
        nodeFrameAt(host: string): number | undefined;
        lastFrameAt(): number | undefined;
        lastLineAt(): number | undefined;
    }

    /** What liveness is judged against: whether a stream is open, this machine's time, and the worker interval set. */
    export interface Clock {
        readonly streaming: boolean;
        readonly now: number;
        readonly intervalMs: number;
    }

    /** One tile per node, in the snapshot's stable first-seen order. */
    export function of(snapshot: WorldSnapshot | undefined, sources: Sources, clock: Clock): GridTile[] {
        if (!snapshot) {
            return [];
        }
        return snapshot.nodes.map(node => {
            const series = sources.node(node.host);
            const throughput = sources.throughput(node.host);
            const { used, total } = memoryOf(node, series);
            const moves = TaskMoves.of(snapshot, node.host);
            return {
                host: node.host,
                cpuText: `${NumberText.fixed(node.nodeUtilPct, 0)}%`,
                cpuHistory: series.cpu,
                tasks: { label: TaskWords.STARTED, ...Rates.of(latest(throughput)), trend: Trend.of(throughput), tone: 'tasks', hint: TaskWords.STARTED_HINT },
                memory: total > 0 ? memoryFigure(used, total) : undefined,
                moved: WorldSnapshot.totalRanks(snapshot) > 1 ? {
                    text: `${NumberText.grouped(moves.sent)} sent · ${NumberText.grouped(moves.received)} received`,
                    hint: `Tasks this node's processes sent to and received from other processes over the run; ${NumberText.grouped(moves.acrossNodes)} of `
                        + 'those sent went to other nodes, across the network.'
                } : undefined,
                liveness: Liveness.of({ ...clock, ...runState(snapshot, sources), lastFrameAt: sources.nodeFrameAt(node.host) })
            };
        });
    }

    /** The cluster as a whole, or `undefined` before any node. */
    export function overview(snapshot: WorldSnapshot | undefined, sources: Sources, clock: Clock): GridOverview | undefined {
        const nodes = snapshot?.nodes ?? [];
        if (!snapshot || nodes.length === 0) {
            return undefined;
        }
        const ranks = nodes.flatMap(node => node.sockets.flatMap(socket => socket.ranks));
        const allocated = nodes.reduce((sum, node) => sum + NodeUtilization.allocatedCores(node), 0);
        const throughput = sources.clusterThroughput();
        const unit = Rates.unitFor(Math.max(0, ...throughput));
        const memory = nodes.map(node => memoryOf(node, sources.node(node.host))).filter(entry => entry.total > 0);
        const memUsed = memory.reduce((sum, entry) => sum + entry.used, 0);
        const memTotal = memory.reduce((sum, entry) => sum + entry.total, 0);
        const moves = TaskMoves.of(snapshot);
        const figures: GridFigure[] = [
            {
                label: 'Cores busy', value: NumberText.fixed(NodeUtilization.coresBusy(ranks), 1), unit: `of ${allocated}`,
                hint: 'The cores the ranks keep busy, of those allocated to them.'
            },
            {
                label: TaskWords.STARTED, ...Rates.of(latest(throughput)), trend: Trend.of(throughput), tone: 'tasks',
                detail: Rates.runAverage(moves.started, snapshot.elapsedSeconds), hint: TaskWords.STARTED_HINT
            }
        ];
        if (ranks.length > 1) {
            figures.push(movedFigure(moves), idleFigure(snapshot, ranks, sources));
        }
        if (memTotal > 0) {
            figures.push(memoryFigure(memUsed, memTotal));
        }
        return {
            liveness: Liveness.of({ ...clock, ...runState(snapshot, sources), lastFrameAt: sources.lastFrameAt() }),
            summary: `${plural(nodes.length, 'node')} · ${plural(ranks.length, 'rank')}`,
            ...(snapshot.run ? { setup: { text: RunSetupText.line(snapshot.run), details: RunSetupText.details(snapshot.run) } } : {}),
            figures,
            throughput: throughput.map(rate => Rates.inUnit(rate, unit)),
            throughputUnit: unit,
            throughputTitle: `${TaskWords.STARTED} per ${unit === '/s' ? 'second' : 'minute'}`
        };
    }

    /** The tasks moved between processes over the run, as a share of those started, and how many crossed nodes. */
    function movedFigure(moves: TaskMoves): GridFigure {
        const share = moves.started > 0 ? moves.sent / moves.started * 100 : undefined;
        const across = `${NumberText.grouped(moves.acrossNodes)} across nodes`;
        // a handful moved among hundreds of thousands started still moved: never read 0.0%
        const shareText = share === undefined ? undefined : share > 0 && share < 0.1 ? '<0.1%' : `${NumberText.fixed(share, share < 10 ? 1 : 0)}%`;
        return {
            label: 'Tasks moved', value: NumberText.grouped(moves.sent), tone: 'network',
            detail: shareText === undefined ? across : `${shareText} of started · ${across}`,
            hint: 'Tasks sent from one process to another over the run, as a share of the tasks started. Only those across nodes cross a network; '
                + 'the rest stay on their node, where processes share memory.'
        };
    }

    /** How much of their pools' time the ranks that run tasks wait for work now, on average; a dash before any reading. */
    function idleFigure(snapshot: WorldSnapshot, ranks: readonly RankSnapshot[], sources: Sources): GridFigure {
        const readings = ranks.filter(rank => RankWork.of(rank).runsTasks).map(rank => latest(sources.rank(rank.id).idlePct))
            .filter((reading): reading is number => reading !== undefined);
        const mean = readings.length > 0 ? readings.reduce((sum, reading) => sum + reading, 0) / readings.length : undefined;
        return {
            label: 'Idle', value: mean === undefined ? '—' : NumberText.fixed(mean, 0), unit: mean === undefined ? undefined : '%', detail: 'of pool time',
            tone: 'idle',
            hint: 'How much of the time in their pools the ranks that run tasks spend waiting for work, on average, now; a coordinator that runs none is left out. '
                + 'Waiting on other processes, or on the network, shows here.'
        };
    }

    /** A node's memory from its history, else from its latest node frame; 0 total until it reports any. */
    function memoryOf(node: NodeSnapshot, series: NodeSeries): { readonly used: number, readonly total: number } {
        if (series.memTotalLatest > 0) {
            return { used: series.memUsedLatest, total: series.memTotalLatest };
        }
        return node.hasLiveMemory ? { used: node.memUsedBytes, total: node.memTotalBytes } : { used: 0, total: 0 };
    }

    function memoryFigure(used: number, total: number): GridFigure {
        const [value, unit] = Bytes.human(used).split(' ');
        return { label: 'Memory', value, unit, detail: `of ${Bytes.human(total)}`, tone: 'memory', meter: used / total };
    }

    function latest(values: readonly number[]): number | undefined {
        return values.length > 0 ? values[values.length - 1] : undefined;
    }

    function plural(count: number, noun: string): string {
        return `${NumberText.grouped(count)} ${noun}${count === 1 ? '' : 's'}`;
    }
}

/** What the latest line says of the run, paused or ended, which every tile shows as the stream does; and when any line arrived. */
function runState(snapshot: WorldSnapshot, sources: GridTiles.Sources): Pick<Liveness.Stream, 'paused' | 'ended' | 'lastLineAt'> {
    return { paused: snapshot.paused, ended: snapshot.final, lastLineAt: sources.lastLineAt() };
}
