import {
    Bytes, CoreHeat, CountHistories, CountSeries, Cpu, Durations, NodeHistoryStore, NodeSeries, NodeSnapshot, NodeUtilization, NumberText, RankAccounting,
    RankCount, RankHistoryStore, RankSeries, RankSnapshot, RankWork, Rates, SocketSnapshot, TaskWords, WorldSnapshot
} from '@gempba/core';
import { Trend } from '@gempba/ui/lib/common/trend';
import { CardsText } from './cards-text';
import { ChartCatalog } from './chart-catalog';

/**
 * The live instrument panel of the row picked in the Cards tree: its header, headline figures, a gauge, history charts,
 * heat strips, bars and run totals, all worded and scaled here. Each figure appears once, and a rank's CPU always
 * reads as a share of the cores it may use. The charts follow the panel's layout of {@link ChartCatalog} tiles. Pure, so the
 * view only lays it out with the UI kit.
 */
export namespace CardsPanel {

    /** A chart color, matching the UI kit's chart tones. */
    export type Tone = 'cpu' | 'memory' | 'tasks' | 'network' | 'idle';

    export interface Gauge {
        readonly label: string;
        /** How full, from 0 to 1. */
        readonly fraction: number;
        readonly valueText: string;
        readonly tone: Tone;
    }

    export interface Hero {
        readonly label: string;
        readonly value: string;
        readonly unit?: string;
        readonly detail?: string;
        readonly trend?: Trend;
        readonly tone?: Tone;
        /** What the figure counts, on hover. */
        readonly hint?: string;
    }

    export interface Chart {
        /** The tile it draws, as its layout saves it. */
        readonly key: string;
        readonly title: string;
        /** The newest sample, in words, beside the title. */
        readonly latest: string;
        /** Samples, oldest first, in the chart's one unit. */
        readonly values: readonly number[];
        /** The top of the scale; a round number above the largest sample when absent. */
        readonly max?: number;
        /** How many samples a full chart holds: its history's. */
        readonly capacity: number;
        readonly tone: Tone;
        /** What the chart counts, on hover. */
        readonly hint?: string;
        /** Why this panel has nothing to chart for the tile, shown in the chart's place. */
        readonly unavailable?: string;
    }

    export interface HeatCell {
        readonly key: number;
        readonly loadPct: number;
        readonly oversubscribed: boolean;
        readonly title: string;
    }

    export interface Strip {
        readonly title: string;
        readonly cells: readonly HeatCell[];
    }

    export interface Bar {
        readonly label: string;
        /** How full, from 0 to 1. */
        readonly fraction: number;
        readonly valueText: string;
        readonly tone: Tone;
    }

    export interface Bars {
        readonly title: string;
        readonly rows: readonly Bar[];
        /** The rank's busiest peers, which the view can open in full. */
        readonly peers?: boolean;
    }

    /** A figure the panel shows nowhere else, such as a total since the run started. */
    export interface Total {
        readonly label: string;
        readonly value: string;
        /** What the total counts, on hover. */
        readonly hint?: string;
    }

    export interface Panel {
        readonly title: string;
        /** Facts about the row that no figure shows: its hardware, process or place. */
        readonly subtitle: string;
        readonly gauge?: Gauge;
        readonly heroes: readonly Hero[];
        readonly charts: readonly Chart[];
        readonly strips: readonly Strip[];
        readonly bars: readonly Bars[];
        readonly totals: readonly Total[];
    }

    /** What the panel reads besides the snapshot: the hub's rolling histories. */
    export interface Histories {
        node(host: string): NodeSeries;
        rank(id: number): RankSeries;
        throughput(host: string): readonly number[];
        /** A node's sums of its ranks' counts. */
        counts(host: string): CountHistories;
    }

    /** The busiest peers a rank's panel shows; the rest open with View all…. */
    export const TOP_PEERS = 5;

    export function forNode(node: NodeSnapshot, histories: Histories, layout: readonly ChartCatalog.Tile[] = ChartCatalog.DEFAULTS.node): Panel {
        const series = histories.node(node.host);
        const throughput = histories.throughput(node.host);
        const ranks = node.sockets.flatMap(socket => socket.ranks);
        const allocated = NodeUtilization.allocatedCores(node);
        const busy = NodeUtilization.coresBusy(ranks);
        const memTotal = series.memTotalLatest > 0 ? series.memTotalLatest : node.memTotalBytes;
        const memUsed = series.memTotalLatest > 0 ? series.memUsedLatest : node.memUsedBytes;
        const heroes: Hero[] = [
            {
                label: TaskWords.STARTED, ...Rates.of(latest(throughput)), trend: Trend.of(throughput), tone: 'tasks', detail: runAverage(ranks),
                hint: TaskWords.STARTED_HINT
            },
            { label: 'Cores busy', value: NumberText.fixed(busy, 1), unit: `of ${allocated}`, detail: plural(ranks.length, 'rank') }
        ];
        if (memTotal > 0) {
            heroes.push({ label: 'Memory', ...bytesValue(memUsed), detail: `of ${Bytes.human(memTotal)}`, trend: Trend.of(series.mem), tone: 'memory' });
        }
        return {
            title: node.host,
            subtitle: nodeFacts(node),
            gauge: { label: 'CPU of the allocation', fraction: node.nodeUtilPct / 100, valueText: `${NumberText.fixed(node.nodeUtilPct, 0)}%`, tone: 'cpu' },
            heroes,
            charts: layout.map(tile => {
                const count = ChartCatalog.countOf(tile.id);
                if (count) {
                    return countChart(tile, histories.counts(node.host)[count]);
                }
                return tile.id === 'memory'
                    ? {
                        key: 'memory', title: 'Memory', latest: memTotal > 0 ? Bytes.human(memUsed) : '—', values: series.mem, max: memTotal > 0 ? memTotal : undefined,
                        capacity: NodeHistoryStore.CAPACITY, tone: 'memory'
                    }
                    : {
                        key: 'cpu', title: 'CPU', latest: `${NumberText.fixed(series.cpuLatest, 0)}%`, values: series.cpu, max: 100,
                        capacity: NodeHistoryStore.CAPACITY, tone: 'cpu'
                    };
            }),
            strips: node.sockets.filter(socket => socket.cpuIds.length > 0).map(socket => strip(node, socket)),
            bars: [],
            totals: []
        };
    }

    export function forSocket(node: NodeSnapshot, socket: SocketSnapshot): Panel {
        const busy = NodeUtilization.coresBusy(socket.ranks);
        const cores = socket.logicalCores;
        return {
            title: CardsText.socketTitle(socket),
            subtitle: socketFacts(node.host, socket),
            gauge: cores > 0
                ? { label: 'CPU of the socket', fraction: busy / cores, valueText: `${NumberText.fixed(busy / cores * 100, 0)}%`, tone: 'cpu' }
                : undefined,
            heroes: [
                { label: 'Cores busy', value: NumberText.fixed(busy, 1), unit: cores > 0 ? `of ${cores}` : undefined },
                { label: 'Ranks', value: String(socket.ranks.length) }
            ],
            charts: [],
            strips: socket.cpuIds.length > 0 ? [strip(node, socket)] : [],
            bars: [{
                title: 'Ranks',
                rows: socket.ranks.map(rank => {
                    const accessible = accessibleCores(rank, socket);
                    const fraction = rank.cpuPct / (100 * accessible);
                    return {
                        label: CardsText.rankTitle(rank), fraction, tone: 'cpu',
                        valueText: `${NumberText.fixed(fraction * 100, 0)}% of ${plural(accessible, 'core')}`
                    };
                })
            }],
            totals: []
        };
    }

    export function forRank(world: WorldSnapshot | undefined, socket: SocketSnapshot, rank: RankSnapshot, histories: Histories,
        layout: readonly ChartCatalog.Tile[] = ChartCatalog.DEFAULTS.rank): Panel {
        const series = histories.rank(rank.id);
        const accessible = accessibleCores(rank, socket);
        const idle = latest(series.idlePct);
        const host = world?.nodes.find(node => node.sockets.some(each => each.ranks.some(other => other.id === rank.id)))?.host;
        // a rank shows what it does, told by its own numbers: tasks where it runs them, the queue and assignments where it coordinates
        const work = RankWork.of(rank);
        // gempba's process has one thread beyond its pool, which runs the tasks; a source that counts differently never shows more running than threads
        const pool = Math.max(rank.threads - 1, rank.tasksRunning, 1);
        const memory: Hero = { label: 'Memory', ...bytesValue(rank.rssBytes), trend: Trend.of(series.rssBytes), tone: 'memory' };
        const started = series.counts.tasksStarted.perSecond;
        const heroes: Hero[] = [
            ...(work.runsTasks ? [
                {
                    label: TaskWords.STARTED, ...Rates.of(latest(started)), trend: Trend.of(started), tone: 'tasks' as const,
                    detail: runAverage([rank]), hint: TaskWords.STARTED_HINT
                },
                {
                    label: 'Idle', value: idle === undefined ? '—' : NumberText.fixed(idle, 0), unit: idle === undefined ? undefined : '%',
                    trend: Trend.of(series.idlePct), tone: 'idle' as const
                }
            ] : []),
            memory
        ];
        // only gempba's centralized coordinator queues tasks, for the workers that run out
        if (rank.schedulerPendingCount > 0) {
            heroes.push({ label: 'Queued', value: NumberText.grouped(rank.schedulerPendingCount), unit: 'tasks', detail: 'waiting for idle workers', tone: 'network' });
        }
        const bars: Bars[] = work.runsTasks ? [{
            title: 'Thread pool',
            rows: [{ label: 'Running', fraction: rank.tasksRunning / pool, valueText: `${rank.tasksRunning} of ${plural(pool, 'thread')}`, tone: 'tasks' }]
        }] : [];
        const peers = CardsText.peerRows(rank, world).slice(0, TOP_PEERS);
        if (peers.length > 0) {
            const busiest = Math.max(...rank.peers.map(peer => peer.count), 1);
            const counts = new Map<string, number>(rank.peers.map(peer => [`Rank ${peer.peerRank}`, peer.count]));
            bars.push({
                title: 'Busiest peers',
                peers: true,
                rows: peers.map(peer => ({
                    label: peer.host === '—' ? peer.peer : `${peer.peer} · ${peer.host}`, fraction: (counts.get(peer.peer) ?? 0) / busiest,
                    valueText: `${peer.tasks} tasks · ${peer.bytes}`, tone: 'network'
                }))
            });
        }
        const cpu: Chart = {
            key: 'cpu', title: 'CPU', latest: `${NumberText.fixed(rank.cpuPct / accessible, 0)}% of ${plural(accessible, 'core')}`, values: series.cpu.map(pct => pct / accessible),
            max: 100, capacity: RankHistoryStore.CAPACITY, tone: 'cpu'
        };
        return {
            title: CardsText.rankTitle(rank),
            subtitle: [...(work.coordinates && !work.runsTasks ? ['schedules the run, runs no tasks'] : []), CardsText.rankSubtitle(host ?? '—', rank)].join(' · '),
            gauge: {
                label: `CPU on ${plural(accessible, 'core')}`, fraction: rank.cpuPct / (100 * accessible), tone: 'cpu',
                valueText: `${NumberText.fixed(rank.cpuPct / accessible, 0)}%`
            },
            heroes,
            charts: layout.map(tile => {
                const count = ChartCatalog.countOf(tile.id);
                // a tile whose data this rank doesn't have says why, rather than drawing an empty chart
                const idleRank = work.coordinates ? 'Schedules the run and runs no tasks' : 'No tasks run yet';
                if (count) {
                    if (!RankCount.applies(rank, count)) {
                        return { ...countChart(tile, CountSeries.EMPTY), unavailable: 'A coordinator queues the tasks it receives and starts none, so it runs none locally' };
                    }
                    const tasksOfItsOwn = count === 'tasksStarted' || count === 'tasksLocal';
                    return { ...countChart(tile, series.counts[count]), unavailable: tasksOfItsOwn && !work.runsTasks ? idleRank : undefined };
                }
                if (tile.id === 'memory') {
                    return { key: 'memory', title: 'Memory', latest: Bytes.human(rank.rssBytes), values: series.rssBytes, capacity: RankHistoryStore.CAPACITY, tone: 'memory' };
                }
                if (tile.id === 'idle') {
                    return {
                        key: 'idle', title: 'Idle', latest: idle === undefined ? '—' : `${NumberText.fixed(idle, 0)}%`, values: series.idlePct, max: 100,
                        capacity: RankHistoryStore.CAPACITY, tone: 'idle', unavailable: work.runsTasks ? undefined : idleRank
                    };
                }
                return cpu;
            }),
            strips: [],
            bars,
            totals: [
                ...(work.runsTasks ? [{ label: TaskWords.STARTED, value: Rates.countWithRate(rank.tasksStartedTotal, rank.elapsedSeconds), hint: TaskWords.STARTED_HINT }] : []),
                { label: TaskWords.SENT, value: Rates.countWithRate(rank.tasksSentTotal, rank.elapsedSeconds), hint: TaskWords.SENT_HINT },
                { label: TaskWords.RECEIVED, value: Rates.countWithRate(rank.tasksRecvTotal, rank.elapsedSeconds), hint: TaskWords.RECEIVED_HINT },
                ...movingTotals(rank.accounting),
                ...(work.runsTasks ? taskTotals(rank) : []),
                ...(work.coordinates ? coordinatorTotals(rank.accounting) : [])
            ]
        };
    }

    /** The cores a rank may run on in its socket, as core usage counts them; at least 1. */
    export function accessibleCores(rank: RankSnapshot, socket: SocketSnapshot): number {
        const usage = socket.coreUsage.find(entry => entry.rank === rank.id);
        if (usage) {
            return Math.max(usage.accessibleCores, 1);
        }
        return Math.max(rank.allowedCpuIds.length || socket.logicalCores, 1);
    }

    /** `2 sockets · 4 physical / 8 logical cores · sentinel: rank 3`; hardware the topology did not describe is left out. */
    export function nodeFacts(node: NodeSnapshot): string {
        const facts: string[] = [];
        if (node.socketCount > 0) {
            facts.push(plural(node.socketCount, 'socket'));
        }
        if (node.logicalCores > 0) {
            facts.push(cores(node.physicalCores, node.logicalCores));
        }
        facts.push(`sentinel: rank ${node.sentinelRank}`);
        return facts.join(' · ');
    }

    /** `on alpha · 4 physical / 8 logical cores · CPUs 0–7`. */
    export function socketFacts(host: string, socket: SocketSnapshot): string {
        const facts = [`on ${host}`];
        if (socket.hasTopology && socket.logicalCores > 0) {
            facts.push(cores(socket.physicalCores, socket.logicalCores));
        }
        const range = Cpu.range(socket.cpuIds);
        if (range) {
            facts.push(range);
        }
        return facts.join(' · ');
    }

    /** The bytes of the tasks a rank moved and its time in the MPI calls that moved them, which schema 2 counts on every rank. */
    function movingTotals(accounting: RankAccounting): Total[] {
        return [
            {
                label: 'Bytes sent', value: `${Bytes.human(accounting.bytesSentTotal)} in ${Durations.format(accounting.sendMicrosTotal)}`,
                hint: 'The bytes of the tasks this process sent to others, and its time in the MPI calls that sent them: how long it stalled, not '
                    + 'the network\'s latency.'
            },
            {
                label: 'Bytes received', value: `${Bytes.human(accounting.bytesRecvTotal)} in ${Durations.format(accounting.recvMicrosTotal)}`,
                hint: 'The bytes of the tasks this process received from others, and its time in the MPI calls that received them.'
            }
        ];
    }

    /** Where the idle time of a rank that runs tasks goes, and how long it waited for work: a scheduler counter, shown once filled. */
    function taskTotals(rank: RankSnapshot): Total[] {
        const accounting = rank.accounting;
        const idle = `${Durations.format(rank.idleMicrosPerThread)} per thread`;
        const totals: Total[] = [{
            label: 'Pool idle',
            value: `${idle}: ${Durations.format(accounting.idleMicrosStarved)} starved, ${Durations.format(accounting.idleMicrosImbalanced)} imbalanced`,
            hint: 'Time each pool thread spent idle, on average: starved while no task ran anywhere in the pool, imbalanced while other threads of '
                + 'the pool ran tasks.'
        }];
        if (accounting.schedWaitingMicros > 0) {
            totals.push({
                label: 'Waiting for work', value: Durations.format(accounting.schedWaitingMicros),
                hint: 'Time this rank waited for a task from its scheduler since the run started.'
            });
        }
        return totals;
    }

    /** What a coordinator counted: its assignments and the reports it handled, each a scheduler counter, shown once filled. */
    function coordinatorTotals(accounting: RankAccounting): Total[] {
        const totals: Total[] = [];
        if (accounting.assignCount > 0) {
            const mean = Math.round(accounting.assignLatencyMicrosTotal / accounting.assignCount);
            totals.push({
                label: 'Assignments',
                value: `${NumberText.grouped(accounting.assignCount)} · ${Durations.format(mean)} mean, ${Durations.format(accounting.assignLatencyMicrosMax)} max`,
                hint: 'Ranks this coordinator handed work to, and how long each took to report running.'
            });
        }
        if (accounting.coordinatorStateMsgsTotal > 0) {
            totals.push({
                label: 'Reports handled', value: NumberText.grouped(accounting.coordinatorStateMsgsTotal),
                hint: 'Running and available reports this coordinator handled from the ranks.'
            });
        }
        return totals;
    }

    const COUNT_TONES: Readonly<Record<RankCount, Tone>> = {
        tasksStarted: 'tasks', tasksLocal: 'tasks', tasksSent: 'network', tasksReceived: 'network', bytesSent: 'network', bytesReceived: 'network'
    };

    const COUNT_HINTS: Readonly<Record<RankCount, string>> = {
        tasksStarted: TaskWords.STARTED_HINT,
        tasksLocal: 'Subtrees handed to a pool thread from the rank\'s own work: tasks started less those received. Branches explored inline '
            + 'count nowhere. It holds for gempba\'s built-in schedulers, which hand every subtree to the pool the same way.',
        tasksSent: TaskWords.SENT_HINT,
        tasksReceived: TaskWords.RECEIVED_HINT,
        bytesSent: 'Bytes of the tasks shipped to other ranks.',
        bytesReceived: 'Bytes of the tasks that arrived from other ranks.'
    };

    /**
     * A count's chart: its running total, or its rate in one unit for the whole history, tasks per second once any sample
     * reaches one a second and per minute below, bytes per second.
     */
    function countChart(tile: ChartCatalog.Tile, series: CountSeries): Chart {
        const count = ChartCatalog.countOf(tile.id)!;
        const bytes = count === 'bytesSent' || count === 'bytesReceived';
        const base = { key: ChartCatalog.key(tile), title: ChartCatalog.label(tile.id), capacity: RankHistoryStore.CAPACITY, tone: COUNT_TONES[count], hint: COUNT_HINTS[count] };
        if (tile.form === 'rate') {
            const rate = latest(series.perSecond);
            if (bytes) {
                return { ...base, latest: rate === undefined ? '—' : `${Bytes.human(rate)}/s`, values: series.perSecond };
            }
            const unit = Rates.unitFor(Math.max(0, ...series.perSecond));
            return { ...base, latest: Rates.text(rate, 'tasks', unit), values: series.perSecond.map(each => Rates.inUnit(each, unit)) };
        }
        const total = latest(series.total);
        return { ...base, latest: total === undefined ? '—' : `${bytes ? Bytes.human(total) : NumberText.grouped(total)} so far`, values: series.total };
    }

    function bytesValue(bytes: number): { value: string, unit?: string } {
        const [value, unit] = Bytes.human(bytes).split(' ');
        return { value, unit };
    }

    /** The run's average rate, all tasks over the elapsed time. */
    function runAverage(ranks: readonly RankSnapshot[]): string | undefined {
        return Rates.runAverage(ranks.reduce((sum, rank) => sum + rank.tasksStartedTotal, 0), ranks[0]?.elapsedSeconds ?? 0);
    }

    function strip(node: NodeSnapshot, socket: SocketSnapshot): Strip {
        return {
            title: CardsText.socketTitle(socket),
            cells: CoreHeat.forSocket(node, socket).map(cell => ({
                key: cell.cpuId, loadPct: cell.loadPct, oversubscribed: cell.oversubscribed,
                title: `CPU ${cell.cpuId}: ${NumberText.fixed(cell.loadPct, 0)}%${cell.oversubscribed ? ', oversubscribed' : ''} (estimated)`
            }))
        };
    }

    function cores(physical: number, logical: number): string {
        return physical > 0 ? `${physical} physical / ${plural(logical, 'logical core')}` : plural(logical, 'logical core');
    }

    function latest(values: readonly number[]): number | undefined {
        return values.length > 0 ? values[values.length - 1] : undefined;
    }

    function plural(count: number, noun: string): string {
        return `${count} ${noun}${count === 1 ? '' : 's'}`;
    }
}
