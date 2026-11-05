import {
    Bytes, CoreHeat, Cpu, Durations, NodeHistoryStore, NodeSeries, NodeSnapshot, NodeUtilization, NumberText, Rates, SocketSnapshot, TaskWords, WorkerHistoryStore,
    WorkerSeries, RankSnapshot, WorldSnapshot
} from '@gempba/core';
import { Trend } from '@gempba/ui/lib/common/trend';
import { CardsText } from './cards-text';

/**
 * The live instrument panel of the row picked in the Cards tree: its header, headline figures, a gauge, history charts,
 * heat strips, bars and run totals, all worded and scaled here. Each figure appears once, and a worker's CPU always
 * reads as a share of the cores it may use. Pure, so the view only lays it out with the UI kit.
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
        /** The worker's busiest peers, which the view can open in full. */
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
        worker(workerId: number): WorkerSeries;
        throughput(host: string): readonly number[];
    }

    /** The busiest peers a worker's panel shows; the rest open with View all…. */
    export const TOP_PEERS = 5;

    export function forNode(node: NodeSnapshot, histories: Histories): Panel {
        const series = histories.node(node.host);
        const throughput = histories.throughput(node.host);
        const workers = node.sockets.flatMap(socket => socket.ranks);
        const allocated = NodeUtilization.allocatedCores(node);
        const busy = NodeUtilization.coresBusy(workers);
        const memTotal = series.memTotalLatest > 0 ? series.memTotalLatest : node.memTotalBytes;
        const memUsed = series.memTotalLatest > 0 ? series.memUsedLatest : node.memUsedBytes;
        const heroes: Hero[] = [
            {
                label: TaskWords.STARTED, ...Rates.of(latest(throughput)), trend: Trend.of(throughput), tone: 'tasks', detail: runAverage(workers),
                hint: TaskWords.STARTED_HINT
            },
            { label: 'Cores busy', value: NumberText.fixed(busy, 1), unit: `of ${allocated}`, detail: plural(workers.length, 'worker') }
        ];
        if (memTotal > 0) {
            heroes.push({ label: 'Memory', ...bytesValue(memUsed), detail: `of ${Bytes.human(memTotal)}`, trend: Trend.of(series.mem), tone: 'memory' });
        }
        return {
            title: node.host,
            subtitle: nodeFacts(node),
            gauge: { label: 'CPU of the allocation', fraction: node.nodeUtilPct / 100, valueText: `${NumberText.fixed(node.nodeUtilPct, 0)}%`, tone: 'cpu' },
            heroes,
            charts: [
                { title: 'CPU', latest: `${NumberText.fixed(series.cpuLatest, 0)}%`, values: series.cpu, max: 100, capacity: NodeHistoryStore.CAPACITY, tone: 'cpu' },
                {
                    title: 'Memory', latest: memTotal > 0 ? Bytes.human(memUsed) : '—', values: series.mem, max: memTotal > 0 ? memTotal : undefined,
                    capacity: NodeHistoryStore.CAPACITY, tone: 'memory'
                },
                rateChart(throughput)
            ],
            strips: node.sockets.filter(socket => socket.cpuIds.length > 0).map(socket => strip(node, socket)),
            bars: [],
            totals: []
        };
    }

    export function forSocket(world: WorldSnapshot | undefined, node: NodeSnapshot, socket: SocketSnapshot): Panel {
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
                { label: 'Workers', value: String(socket.ranks.length) }
            ],
            charts: [],
            strips: socket.cpuIds.length > 0 ? [strip(node, socket)] : [],
            bars: [{
                title: 'Workers',
                rows: socket.ranks.map(worker => {
                    const accessible = accessibleCores(worker, socket);
                    const fraction = worker.cpuPct / (100 * accessible);
                    return {
                        label: CardsText.workerTitle(worker, WorldSnapshot.isCoordinator(world, worker.id)), fraction, tone: 'cpu',
                        valueText: `${NumberText.fixed(fraction * 100, 0)}% of ${plural(accessible, 'core')}`
                    };
                })
            }],
            totals: []
        };
    }

    export function forWorker(world: WorldSnapshot | undefined, socket: SocketSnapshot, worker: RankSnapshot, histories: Histories): Panel {
        const series = histories.worker(worker.id);
        const accessible = accessibleCores(worker, socket);
        const idle = latest(series.idlePct);
        const host = world?.nodes.find(node => node.sockets.some(each => each.ranks.some(other => other.id === worker.id)))?.host;
        const coordinator = WorldSnapshot.isCoordinator(world, worker.id);
        // gempba's process has one thread beyond its pool, which runs the tasks; a source that counts differently never shows more running than threads
        const pool = Math.max(worker.threads - 1, worker.tasksRunning, 1);
        const memory: Hero = { label: 'Memory', ...bytesValue(worker.rssBytes), trend: Trend.of(series.rssBytes), tone: 'memory' };
        // the coordinator schedules the run and runs no tasks, so it has no task rate, idle time or pool to show
        const heroes: Hero[] = coordinator ? [memory] : [
            {
                label: TaskWords.STARTED, ...Rates.of(latest(series.tasksPerSecond)), trend: Trend.of(series.tasksPerSecond), tone: 'tasks',
                detail: runAverage([worker]), hint: TaskWords.STARTED_HINT
            },
            {
                label: 'Idle', value: idle === undefined ? '—' : NumberText.fixed(idle, 0), unit: idle === undefined ? undefined : '%',
                trend: Trend.of(series.idlePct), tone: 'idle'
            },
            memory
        ];
        // only gempba's centralized coordinator queues tasks, for the workers that run out
        if (worker.schedulerPendingCount > 0) {
            heroes.push({ label: 'Queued', value: NumberText.grouped(worker.schedulerPendingCount), unit: 'tasks', detail: 'waiting for idle workers', tone: 'network' });
        }
        const bars: Bars[] = coordinator ? [] : [{
            title: 'Thread pool',
            rows: [{ label: 'Running', fraction: worker.tasksRunning / pool, valueText: `${worker.tasksRunning} of ${plural(pool, 'thread')}`, tone: 'tasks' }]
        }];
        const peers = CardsText.peerRows(worker, world).slice(0, TOP_PEERS);
        if (peers.length > 0) {
            const busiest = Math.max(...worker.peers.map(peer => peer.count), 1);
            const counts = new Map<string, number>(worker.peers.map(peer => [`Worker ${peer.peerRank}`, peer.count]));
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
            title: 'CPU', latest: `${NumberText.fixed(worker.cpuPct / accessible, 0)}% of ${plural(accessible, 'core')}`, values: series.cpu.map(pct => pct / accessible),
            max: 100, capacity: WorkerHistoryStore.CAPACITY, tone: 'cpu'
        };
        const moved: Total[] = [
            { label: TaskWords.SENT, value: Rates.countWithRate(worker.tasksSentTotal, worker.elapsedSeconds), hint: TaskWords.SENT_HINT },
            { label: TaskWords.RECEIVED, value: Rates.countWithRate(worker.tasksRecvTotal, worker.elapsedSeconds), hint: TaskWords.RECEIVED_HINT }
        ];
        return {
            title: CardsText.workerTitle(worker, coordinator),
            subtitle: [...(coordinator ? ['schedules the run, runs no tasks'] : []), CardsText.workerSubtitle(host ?? '—', worker)].join(' · '),
            gauge: {
                label: `CPU on ${plural(accessible, 'core')}`, fraction: worker.cpuPct / (100 * accessible), tone: 'cpu',
                valueText: `${NumberText.fixed(worker.cpuPct / accessible, 0)}%`
            },
            heroes,
            charts: coordinator ? [cpu] : [
                rateChart(series.tasksPerSecond),
                {
                    title: 'Idle', latest: idle === undefined ? '—' : `${NumberText.fixed(idle, 0)}%`, values: series.idlePct, max: 100,
                    capacity: WorkerHistoryStore.CAPACITY, tone: 'idle'
                },
                cpu
            ],
            strips: [],
            bars,
            totals: coordinator ? moved : [
                { label: TaskWords.STARTED, value: Rates.countWithRate(worker.tasksStartedTotal, worker.elapsedSeconds), hint: TaskWords.STARTED_HINT },
                ...moved,
                { label: 'Pool idle', value: `${Durations.format(worker.idleMicrosPerThread)} per thread` }
            ]
        };
    }

    /** The cores a worker may run on in its socket, as core usage counts them; at least 1. */
    export function accessibleCores(worker: RankSnapshot, socket: SocketSnapshot): number {
        const usage = socket.coreUsage.find(entry => entry.rank === worker.id);
        if (usage) {
            return Math.max(usage.accessibleCores, 1);
        }
        return Math.max(worker.allowedCpuIds.length || socket.logicalCores, 1);
    }

    /** `2 sockets · 4 physical / 8 logical cores · sentinel: worker 3`; hardware the topology did not describe is left out. */
    export function nodeFacts(node: NodeSnapshot): string {
        const facts: string[] = [];
        if (node.socketCount > 0) {
            facts.push(plural(node.socketCount, 'socket'));
        }
        if (node.logicalCores > 0) {
            facts.push(cores(node.physicalCores, node.logicalCores));
        }
        facts.push(`sentinel: worker ${node.sentinelRank}`);
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

    /** Tasks started per second or per minute, one unit for the whole history: per second once any sample reaches one a second. */
    function rateChart(perSecond: readonly number[]): Chart {
        const unit = Rates.unitFor(Math.max(0, ...perSecond));
        return {
            title: TaskWords.STARTED, latest: Rates.text(latest(perSecond), 'tasks', unit), values: perSecond.map(rate => Rates.inUnit(rate, unit)),
            capacity: WorkerHistoryStore.CAPACITY, tone: 'tasks'
        };
    }

    function bytesValue(bytes: number): { value: string, unit?: string } {
        const [value, unit] = Bytes.human(bytes).split(' ');
        return { value, unit };
    }

    /** The run's average rate, all tasks over the elapsed time. */
    function runAverage(workers: readonly RankSnapshot[]): string | undefined {
        return Rates.runAverage(workers.reduce((sum, worker) => sum + worker.tasksStartedTotal, 0), workers[0]?.elapsedSeconds ?? 0);
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
