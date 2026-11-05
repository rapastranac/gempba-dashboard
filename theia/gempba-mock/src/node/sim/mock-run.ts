import { RefreshInterval, RefreshRates } from '@gempba/core';
import { Schema1Frame, Schema1NodeFrame } from './schema1-lines';
import { MockLive, MockScheduler, MockShape } from '../../common/mock-config';
import { MockFault } from '../../common/mock-fault';
import { CenterQueue, QueuedTask } from './center-queue';
import { MockRandom } from './mock-random';
import { MockScenarioModel } from './mock-scenario';
import { MockTopology, MockRankPlace } from './mock-topology';

const KiB = 1024;
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

/** A rank's live state, for specs and status; the frames carry the same counters as last sampled. */
export interface MockRankView {
    readonly id: number;
    readonly phase: MockRun.Phase;
    readonly poolThreads: number;
    /** Tasks left in the subtree it explores; Infinity for the root of an endless search. */
    readonly subtree: number;
    /** The idle rank the center reserved for it to send a task to. */
    readonly next?: number;
    readonly running: number;
    readonly tasksLocal: number;
    readonly sent: number;
    readonly recv: number;
    readonly edges: ReadonlyMap<number, { readonly bytes: number, readonly count: number }>;
    /** `scheduler_pending_count`: the center's queue when centralized, 0 everywhere else. */
    readonly pending: number;
}

interface Edge {
    bytes: number;
    count: number;
}

interface RankState {
    place: MockRankPlace;
    pid: number;
    seqNo: number;
    lastSampleMs: number;
    nextSampleMs: number;
    /** The latest frame, serialized when it was sampled; gempba's center repeats it until the rank sends a new one. */
    frameJson?: string;
    phase: MockRun.Phase;
    /** When it last reported itself available: the center hears of it from the next step on. */
    availableSinceMs: number;
    subtree: number;
    next?: number;
    running: number;
    tasksLocal: number;
    sent: number;
    recv: number;
    idleMicros: number;
    cpuPct: number;
    rssBytes: number;
    baseRss: number;
    efficiency: number;
    edges: Map<number, Edge>;
    /** Its edges serialized, kept until it sends again: a rank's edges reach every rank it ever sent to, as gempba's do. */
    edgesJson?: string;
}

interface NodeState {
    /** The node's monotonic clock when the run started; every process on it reads the same clock. */
    clockBaseMs: number;
    stalledUntilMs: number;
    lastSampleMs: number;
    nextSampleMs: number;
    frameJson?: string;
    pageCache: number;
    netIn: number;
    netOut: number;
    diskRead: number;
    diskWrite: number;
}

/**
 * A seeded gempba run, stepped in fixed simulated time so the same seed and the same steps give the same frames
 * whatever the wall clock does. It follows gempba's MPI schedulers (mpi_semi_centralized_scheduler.hpp,
 * mpi_centralized_scheduler.hpp):
 * - the center seeds the search tree's root to rank 1 and runs no tasks itself;
 * - a worker explores one received subtree at a time on its pool, then reports itself available;
 * - semi-centralized: the center reserves an available rank for each running worker that has none, and the worker
 *   sends it one task, a subtree of its own, with nothing else in flight; nothing queues anywhere;
 * - centralized: running workers send spare tasks to the center while it isn't full, and it hands the biggest it holds
 *   to each available worker; its queue is the only pending count.
 * The counters follow from that, so they agree with one another as gempba's do. Frames are sampled at the worker and
 * node intervals and serialized once; a line is the latest frame of every rank and node with the topology, as
 * gempba's center broadcasts them.
 */
export class MockRun {

    static readonly STEP_MS = 50;
    static readonly SCHEMA_VERSION = 1;
    /** gempba's center broadcasts on a fixed interval, whatever the worker rate (center_tcp_server.cpp). */
    static readonly GEMPBA_BROADCAST_MS = 500;
    /** gempba's CENTER_NBSTORED_TASKS_PER_PROCESS: past this many tasks per process, the centralized center says it is full. */
    static readonly CENTER_TASKS_PER_PROCESS = 1000;
    /** gempba's MAX_MEMORY_MB: past this much memory, the centralized center says it is full too. */
    static readonly CENTER_MAX_MEMORY_BYTES = 10 * GiB;
    /** It says it is free again below this share of the task limit, with its memory at or below 90 % of its own. */
    static readonly CENTER_FREE_SHARE = 0.8;
    /** How widely the sizes of the branches cut off an endless root vary: the deviation of their logarithm. */
    static readonly BRANCH_SPREAD = 1;
    /** The share of a finite subtree a worker gives away: a branch near its top. */
    static readonly SPLIT_SHARE: readonly [number, number] = [0.2, 0.5];
    /** gempba's main thread polls MPI without sleeping, so an idle process still keeps about one core busy. */
    static readonly POLLING_PCT = 97;

    protected readonly random: MockRandom;
    protected topologyNow: MockTopology;
    protected readonly ranks = new Map<number, RankState>();
    protected readonly nodes: NodeState[];
    protected readonly queue = new CenterQueue();
    protected centerFull = false;
    protected liveNow: MockLive;
    protected model: MockScenarioModel;
    protected scenarioStartMs = 0;
    protected time = 0;
    protected workerInterval: number;
    protected nodeInterval: number;
    protected nextPid = 41_000;
    protected pairingCursor = 0;
    protected endedNow = false;
    protected topologyJson?: string;
    protected frameOrder?: number[];

    constructor(protected readonly shape: MockShape, readonly scheduler: MockScheduler, live: MockLive, seed: number,
        rates: RefreshRates = RefreshRates.defaults()) {
        this.random = new MockRandom(seed);
        this.liveNow = live;
        this.model = MockScenarioModel.of(live.scenario);
        this.workerInterval = RefreshInterval.clamp(rates.workerIntervalMs);
        this.nodeInterval = RefreshInterval.clamp(rates.nodeIntervalMs);
        this.topologyNow = MockTopology.of(shape);
        this.nodes = this.topologyNow.nodes.map(node => ({
            clockBaseMs: this.random.int(1_000_000, 900_000_000), stalledUntilMs: 0, lastSampleMs: 0, nextSampleMs: 0,
            pageCache: node.memTotalBytes * 0.08, netIn: 0, netOut: 0, diskRead: 0, diskWrite: 0
        }));
        for (const place of this.topologyNow.ranks) {
            this.ranks.set(place.id, this.newRank(place));
        }
        this.seed();
        this.sample();
    }

    get timeMs(): number {
        return this.time;
    }

    /** Whether gempba's process has exited: the search tree was explored, or the run was ended. */
    get ended(): boolean {
        return this.endedNow;
    }

    get topology(): MockTopology {
        return this.topologyNow;
    }

    get live(): MockLive {
        return this.liveNow;
    }

    get workerIntervalMs(): number {
        return this.workerInterval;
    }

    get nodeIntervalMs(): number {
        return this.nodeInterval;
    }

    /** gempba broadcasts every 500 ms; with every field filled, the broadcast follows the worker rate. */
    get broadcastIntervalMs(): number {
        return this.liveNow.fidelity === 'full' ? this.workerInterval : MockRun.GEMPBA_BROADCAST_MS;
    }

    /** A new scenario starts from its beginning; the load and fidelity apply from the next step. */
    setLive(live: MockLive): void {
        if (live.scenario !== this.liveNow.scenario) {
            this.model = MockScenarioModel.of(live.scenario);
            this.scenarioStartMs = this.time;
        }
        this.liveNow = live;
    }

    /** Applies the intervals at once: a sample due sooner under the new interval is brought forward. */
    setIntervals(workerMs: number, nodeMs: number): void {
        this.workerInterval = RefreshInterval.clamp(workerMs);
        this.nodeInterval = RefreshInterval.clamp(nodeMs);
        for (const rank of this.ranks.values()) {
            rank.nextSampleMs = Math.max(this.time, Math.min(rank.nextSampleMs, rank.lastSampleMs + this.workerInterval));
        }
        for (const node of this.nodes) {
            node.nextSampleMs = Math.max(this.time, Math.min(node.nextSampleMs, node.lastSampleMs + this.nodeInterval));
        }
    }

    /** Steps the run until its simulated time reaches `timeMs`; an ended run stands still. */
    advanceTo(timeMs: number): void {
        while (!this.endedNow && this.time + MockRun.STEP_MS <= timeMs) {
            this.step();
        }
    }

    /** Injects a fault the run itself carries out, and says what happened. */
    fault(fault: MockRun.Fault): string {
        switch (fault) {
            case 'stall-node': return this.stallNode();
            case 'restart-rank': return this.restartRank();
            case 'add-rank': return this.addRank();
            case 'remove-rank': return this.removeRank();
            case 'end-run':
                this.endedNow = true;
                return 'Ended the run, as when gempba\'s process exits';
        }
    }

    /** One broadcast line, without its newline: the latest frame of every rank and node, as gempba's center sends it. */
    line(nowEpochMs: number): string {
        this.topologyJson ??= JSON.stringify(MockTopology.toWire(this.topologyNow, id => this.ranks.get(id)?.pid ?? 0));
        // node by node, as gempba's center walks its topology
        this.frameOrder ??= [...this.topologyNow.ranks].sort((a, b) => a.nodeIndex - b.nodeIndex || a.id - b.id).map(place => place.id);
        const ranks = this.frameOrder.map(id => this.ranks.get(id)?.frameJson).filter(frame => frame !== undefined);
        const nodes = this.nodes.map(node => node.frameJson).filter(frame => frame !== undefined);
        return `{"version":${MockRun.SCHEMA_VERSION},"ts":${nowEpochMs},"elapsed_seconds":${Math.floor(this.time / 1000)},`
            + `"topology":${this.topologyJson},"workers":[${ranks.join(',')}],"nodes":[${nodes.join(',')}]}`;
    }

    rankViews(): MockRankView[] {
        return [...this.ranks.values()].map(rank => ({
            id: rank.place.id, phase: rank.phase, poolThreads: rank.place.poolThreads, subtree: rank.subtree, next: rank.next,
            running: rank.running, tasksLocal: rank.tasksLocal, sent: rank.sent, recv: rank.recv, edges: rank.edges, pending: this.pendingOf(rank)
        }));
    }

    protected step(): void {
        this.time += MockRun.STEP_MS;
        const scenarioTime = this.time - this.scenarioStartMs;
        for (const rank of this.ranks.values()) {
            if (isCenter(rank)) {
                this.runCenter(rank);
            } else {
                this.runRank(rank, scenarioTime);
            }
        }
        if (this.scheduler === 'centralized') {
            this.scheduleCentralized();
        } else {
            this.scheduleSemiCentralized();
        }
        const busy = [...this.ranks.values()].some(rank => !isCenter(rank) && rank.phase !== 'available');
        if (!busy && this.queue.length === 0) {
            if (this.model.endsWhenDrained) {
                this.endedNow = true;
            } else {
                // every subtree was explored before its time: the program starts another search
                this.seed();
            }
        }
        this.sample();
    }

    /** A running worker's pool finishes tasks of its subtree; once none are left, the worker reports itself available. */
    protected runRank(rank: RankState, scenarioTime: number): void {
        const dt = MockRun.STEP_MS;
        const pool = rank.place.poolThreads;
        if (rank.phase === 'running') {
            const busyTarget = pool * this.model.loadFactor(scenarioTime) * this.liveNow.loadPct / 100;
            rank.running = Math.min(pool, this.random.round(busyTarget), rank.subtree);
            const finished = Math.min(this.random.poisson(rank.running * dt / this.model.meanTaskMs), rank.subtree);
            rank.tasksLocal += finished;
            rank.subtree -= finished;
            if (rank.subtree <= 0) {
                this.finish(rank);
            }
        } else {
            rank.running = 0;
        }
        rank.idleMicros += dt * 1000 * (pool - rank.running) / pool;
        const cap = Math.max(rank.place.allowedCpuIds.length, 1) * 100;
        const cpuTarget = Math.min(cap, MockRun.POLLING_PCT + rank.running * 100 * rank.efficiency);
        rank.cpuPct = clamp(rank.cpuPct + 0.5 * (cpuTarget - rank.cpuPct) + this.random.normal(), 0, cap);
        const rssTarget = rank.baseRss + rank.running * this.model.taskRssBytes;
        rank.rssBytes = Math.max(rank.baseRss * 0.9, rank.rssBytes + 0.2 * (rssTarget - rank.rssBytes) + this.random.normal() * 256 * KiB);
    }

    /** The center runs no tasks: its pool stays idle while it polls MPI, and it holds the queued tasks in memory. */
    protected runCenter(center: RankState): void {
        center.running = 0;
        center.idleMicros += MockRun.STEP_MS * 1000;
        center.cpuPct = clamp(center.cpuPct + 0.5 * (98 - center.cpuPct) + this.random.normal(), 0, 100);
        const rssTarget = this.centerMemory(center);
        center.rssBytes = Math.max(center.baseRss * 0.9, center.rssBytes + 0.2 * (rssTarget - center.rssBytes) + this.random.normal() * 64 * KiB);
    }

    /**
     * The center reserves an available rank for each running worker that has none (process_running, process_available),
     * taking the running workers in turn; then each worker with a rank reserved sends it one task when it has one to spare.
     */
    protected scheduleSemiCentralized(): void {
        const available = this.computing().filter(rank => this.idleAtCenter(rank));
        const waiting = this.computing().filter(rank => rank.phase === 'running' && rank.next === undefined);
        if (available.length > 0 && waiting.length > 0) {
            const start = this.pairingCursor++ % waiting.length;
            const turn = [...waiting.slice(start), ...waiting.slice(0, start)];
            for (let i = 0; i < Math.min(turn.length, available.length); i++) {
                turn[i].next = available[i].place.id;
                available[i].phase = 'assigned';
            }
        }
        for (const rank of this.computing()) {
            if (rank.phase !== 'running' || rank.next === undefined || rank.subtree < 2 || !this.random.chance(this.model.sendChance(rank.place.id))) {
                continue;
            }
            const to = this.ranks.get(rank.next);
            rank.next = undefined;
            if (to?.phase === 'assigned') {
                this.give(rank, to, this.split(rank));
            }
        }
    }

    /**
     * Running workers send spare tasks to the center while it isn't full, one each per step. Past 1000 tasks per process,
     * or 10 GiB of memory, it says it is full, until the queue is below 80 % of that limit and its memory at most 9 GiB.
     * It hands its biggest task to each available worker.
     */
    protected scheduleCentralized(): void {
        const center = this.ranks.get(MockTopology.CENTER_ID)!;
        const limit = MockRun.CENTER_TASKS_PER_PROCESS * this.ranks.size;
        for (const rank of this.computing()) {
            if (this.centerFull) {
                break;
            }
            if (rank.phase === 'running' && rank.subtree >= 2 && this.random.chance(this.model.sendChance(rank.place.id))) {
                this.give(rank, center, this.split(rank));
                this.centerFull = this.queue.length > limit || this.centerMemory(center) > MockRun.CENTER_MAX_MEMORY_BYTES;
            }
        }
        if (this.centerFull && this.queue.length < MockRun.CENTER_FREE_SHARE * limit && this.centerMemory(center) <= 0.9 * MockRun.CENTER_MAX_MEMORY_BYTES) {
            this.centerFull = false;
        }
        for (const rank of this.computing()) {
            if (this.queue.length === 0) {
                break;
            }
            if (this.idleAtCenter(rank)) {
                this.give(center, rank, this.queue.pop()!);
            }
        }
    }

    /**
     * Cuts a subtree off the worker's own to send away, always leaving it one task: a share of a finite subtree, as a
     * branch near its top holds; from an endless root, a branch whose size is drawn around the scenario's mean.
     */
    protected split(rank: RankState): QueuedTask {
        let tasks: number;
        if (rank.subtree === Infinity) {
            const tasksPerSecond = rank.place.poolThreads * 1000 / this.model.meanTaskMs;
            const mean = Math.max(this.model.branchSeconds(rank.place.id) * tasksPerSecond, 1);
            tasks = Math.max(1, Math.round(this.random.lognormal(mean, MockRun.BRANCH_SPREAD)));
        } else {
            const [low, high] = MockRun.SPLIT_SHARE;
            tasks = Math.max(1, Math.min(rank.subtree - 1, Math.round(rank.subtree * this.random.between(low, high))));
        }
        rank.subtree -= tasks;
        return { tasks, bytes: this.random.int(8, 64) * KiB };
    }

    /** Sends one task: the sender's edge to the receiver counts it with its bytes; the center queues it, a worker starts on it. */
    protected give(from: RankState, to: RankState, task: QueuedTask): void {
        from.sent += 1;
        to.recv += 1;
        const edge = from.edges.get(to.place.id) ?? { bytes: 0, count: 0 };
        edge.bytes += task.bytes;
        edge.count += 1;
        from.edges.set(to.place.id, edge);
        from.edgesJson = undefined;
        if (from.place.nodeIndex !== to.place.nodeIndex) {
            this.nodes[from.place.nodeIndex].netOut += task.bytes;
            this.nodes[to.place.nodeIndex].netIn += task.bytes;
        }
        if (isCenter(to)) {
            this.queue.push(task);
        } else {
            to.phase = 'running';
            to.subtree = task.tasks;
        }
    }

    /** The center hands the search tree's root to the first worker, rank 1 when it is there. */
    protected seed(): void {
        const center = this.ranks.get(MockTopology.CENTER_ID);
        const first = this.computing().find(rank => rank.phase === 'available');
        if (center && first) {
            const tasksPerSecond = this.computing().reduce((sum, rank) => sum + rank.place.poolThreads * 1000 / this.model.meanTaskMs, 0);
            this.give(center, first, { tasks: this.model.seedTasks(tasksPerSecond), bytes: this.random.int(8, 64) * KiB });
        }
    }

    /** The worker explored its whole subtree: it reports itself available, and a rank reserved for it is freed. */
    protected finish(rank: RankState): void {
        rank.phase = 'available';
        rank.availableSinceMs = this.time;
        rank.subtree = 0;
        this.release(rank);
    }

    /** Frees the rank reserved for this worker, and the reservation that held this one, so neither waits forever. */
    protected release(rank: RankState): void {
        if (rank.next !== undefined) {
            const reserved = this.ranks.get(rank.next);
            if (reserved?.phase === 'assigned') {
                reserved.phase = 'available';
                reserved.availableSinceMs = this.time;
            }
            rank.next = undefined;
        }
        if (rank.phase === 'assigned') {
            for (const other of this.ranks.values()) {
                if (other.next === rank.place.id) {
                    other.next = undefined;
                }
            }
        }
    }

    /** What the center holds in memory: its own, and every queued task's bytes. */
    protected centerMemory(center: RankState): number {
        return center.baseRss + this.queue.bytes;
    }

    /** Available, and the center has heard so: a worker that finished this step is not handed work in the same step. */
    protected idleAtCenter(rank: RankState): boolean {
        return rank.phase === 'available' && rank.availableSinceMs < this.time;
    }

    protected computing(): RankState[] {
        return [...this.ranks.values()].filter(rank => !isCenter(rank));
    }

    protected pendingOf(rank: RankState): number {
        return isCenter(rank) && this.scheduler === 'centralized' ? this.queue.length : 0;
    }

    protected sample(): void {
        for (const rank of this.ranks.values()) {
            if (rank.nextSampleMs <= this.time && this.nodes[rank.place.nodeIndex].stalledUntilMs <= this.time) {
                this.sampleRank(rank);
            }
        }
        for (let index = 0; index < this.nodes.length; index++) {
            const node = this.nodes[index];
            if (node.nextSampleMs <= this.time && node.stalledUntilMs <= this.time) {
                this.sampleNode(index);
            }
        }
    }

    protected sampleRank(rank: RankState): void {
        const first = rank.seqNo === 0;
        rank.seqNo += 1;
        rank.lastSampleMs = this.time;
        // a rank's samples drift apart from the others', as separate processes' do
        rank.nextSampleMs = first ? this.time + this.random.int(1, this.workerInterval) : nextAfter(rank.nextSampleMs, this.workerInterval, this.time);
        rank.edgesJson ??= JSON.stringify([...rank.edges.entries()].sort(([a], [b]) => a - b).map(([to, edge]) => ({ to, bytes: edge.bytes, count: edge.count })));
        const frame: Schema1Frame = {
            worker_id: rank.place.id,
            seq_no: rank.seqNo,
            worker_local_ms: this.nodes[rank.place.nodeIndex].clockBaseMs + this.time,
            tasks_started_total: rank.tasksLocal,
            tasks_sent_total: rank.sent,
            tasks_recv_total: rank.recv,
            tasks_running: rank.running,
            scheduler_pending_count: this.pendingOf(rank),
            idle_microseconds_per_worker: Math.round(rank.idleMicros),
            process_cpu_pct: Math.round(rank.cpuPct * 100) / 100,
            process_rss_bytes: Math.round(rank.rssBytes),
            process_threads: rank.place.poolThreads + 1
        };
        // the edges last, as gempba writes them
        rank.frameJson = `${JSON.stringify(frame).slice(0, -1)},"edges_out":${rank.edgesJson}}`;
    }

    protected sampleNode(index: number): void {
        const node = this.nodes[index];
        const place = this.topologyNow.nodes[index];
        const sentinel = MockTopology.sentinelOf(this.topologyNow, index);
        if (sentinel === undefined) {
            node.frameJson = undefined;
            return;
        }
        const seconds = (this.time - node.lastSampleMs) / 1000;
        node.lastSampleMs = this.time;
        node.nextSampleMs = node.frameJson === undefined ? this.time + this.random.int(1, this.nodeInterval) : nextAfter(node.nextSampleMs, this.nodeInterval, this.time);
        const local = this.topologyNow.ranks.filter(rank => rank.nodeIndex === index).map(rank => this.ranks.get(rank.id)!);
        const rss = local.reduce((sum, rank) => sum + rank.rssBytes, 0);
        const total = place.memTotalBytes;
        node.pageCache = Math.max(0, node.pageCache + 0.05 * (total * 0.08 - node.pageCache) + this.random.normal() * 16 * MiB);
        const used = Math.min(total * 0.98, 2 * GiB + total * 0.01 + rss + node.pageCache);
        const cgroupLimit = this.shape.cgroupGiB * GiB;
        const full = this.liveNow.fidelity === 'full';
        if (full) {
            const chatter = local.length * this.random.int(1, 4) * KiB;
            node.netIn += chatter;
            node.netOut += chatter;
            node.diskRead += Math.round(this.random.int(0, 64) * KiB * seconds);
            node.diskWrite += Math.round(this.random.int(0, 256) * KiB * seconds);
        }
        const frame: Schema1NodeFrame = {
            sentinel_worker_id: sentinel,
            sentinel_local_ms: node.clockBaseMs + this.time,
            hostname: place.host,
            socket_count: place.sockets.length,
            logical_cores: place.logicalCores,
            mem_total_bytes: total,
            mem_avail_bytes: Math.round(total - used),
            cgroup_mem_used_bytes: cgroupLimit > 0 ? Math.round(Math.min(cgroupLimit, rss + local.length * 64 * MiB)) : 0,
            cgroup_mem_limit_bytes: cgroupLimit,
            // hwloc gives each socket's memory; gempba leaves its CPU and use at 0 for now (hwloc_probe.cpp)
            sockets: place.sockets.map(socket => {
                const onSocket = local.filter(rank => rank.place.socketId === socket.socketId);
                const busy = onSocket.reduce((sum, rank) => sum + rank.cpuPct, 0);
                return {
                    socket_id: socket.socketId,
                    cpu_pct: full ? Math.round(Math.min(100, busy / socket.logicalCores) * 100) / 100 : 0,
                    mem_total_bytes: Math.round(total / place.sockets.length),
                    mem_used_bytes: full ? Math.round(used / place.sockets.length) : 0
                };
            }),
            // gempba sends these as zeros for now (node_probe.cpp)
            net_aggregate: full
                ? { bytes_in: node.netIn, bytes_out: node.netOut, packets_in: Math.round(node.netIn / 1400), packets_out: Math.round(node.netOut / 1400) }
                : { bytes_in: 0, bytes_out: 0, packets_in: 0, packets_out: 0 },
            disk_aggregate: full ? { read_bytes: node.diskRead, write_bytes: node.diskWrite } : { read_bytes: 0, write_bytes: 0 }
        };
        node.frameJson = JSON.stringify(frame);
    }

    protected stallNode(): string {
        const index = this.random.int(0, this.nodes.length - 1);
        this.nodes[index].stalledUntilMs = this.time + MockFault.STALL_MS;
        return `Stalled ${this.topologyNow.nodes[index].host}: its frames stop for ${MockFault.STALL_MS / 1000} s`;
    }

    /** A restarted rank is a new process: a new PID, its sequence number and counters from zero, and its subtree lost. */
    protected restartRank(): string {
        const rank = this.random.pick(this.computing());
        this.release(rank);
        const fresh = this.newRank(rank.place);
        this.ranks.set(rank.place.id, fresh);
        this.sampleRank(fresh);
        this.topologyJson = undefined;
        return `Restarted rank ${rank.place.id} as PID ${fresh.pid}`;
    }

    protected addRank(): string {
        const counts = this.topologyNow.nodes.map(node => this.topologyNow.ranks.filter(rank => rank.nodeIndex === node.index).length);
        const nodeIndex = counts.indexOf(Math.min(...counts));
        this.topologyNow = MockTopology.withRank(this.topologyNow, this.shape, nodeIndex);
        for (const place of this.topologyNow.ranks) {
            const existing = this.ranks.get(place.id);
            if (existing) {
                existing.place = place;
            } else {
                const added = this.newRank(place);
                this.ranks.set(place.id, added);
                this.sampleRank(added);
            }
        }
        this.topologyJson = undefined;
        this.frameOrder = undefined;
        const added = Math.max(...this.topologyNow.ranks.map(rank => rank.id));
        return `Added rank ${added} on ${this.topologyNow.nodes[nodeIndex].host}`;
    }

    /** Removes a rank from a node that keeps at least one; never the center, nor the last worker beside it. */
    protected removeRank(): string {
        const computing = this.topologyNow.ranks.filter(place => place.id !== MockTopology.CENTER_ID);
        const candidates = computing.length < 2 ? [] : computing.filter(place => this.topologyNow.ranks.filter(other => other.nodeIndex === place.nodeIndex).length > 1);
        if (candidates.length === 0) {
            return 'No rank can be removed: every node would be left empty, or only the center would remain';
        }
        const gone = this.random.pick(candidates);
        this.release(this.ranks.get(gone.id)!);
        this.ranks.delete(gone.id);
        this.topologyNow = MockTopology.withoutRank(this.topologyNow, this.shape, gone.id);
        for (const place of this.topologyNow.ranks) {
            this.ranks.get(place.id)!.place = place;
        }
        this.topologyJson = undefined;
        this.frameOrder = undefined;
        return `Removed rank ${gone.id} from ${this.topologyNow.nodes[gone.nodeIndex].host}`;
    }

    protected newRank(place: MockRankPlace): RankState {
        const baseRss = place.id === MockTopology.CENTER_ID ? 48 * MiB : this.random.int(64, 160) * MiB;
        return {
            place, pid: this.nextPid++, seqNo: 0, lastSampleMs: this.time, nextSampleMs: this.time, phase: 'available', availableSinceMs: this.time,
            subtree: 0, running: 0,
            tasksLocal: 0, sent: 0, recv: 0, idleMicros: 0, cpuPct: 0, rssBytes: baseRss, baseRss, efficiency: this.random.between(0.92, 0.99),
            edges: new Map()
        };
    }
}

export namespace MockRun {
    /** The faults the run carries out itself; dropping clients and sending a malformed line belong to the transport. */
    export type Fault = Exclude<MockFault, 'drop-clients' | 'malformed-line'>;

    /** A rank's state at the center: exploring a subtree, idle, or reserved to receive one (semi-centralized). */
    export type Phase = 'running' | 'available' | 'assigned';
}

function isCenter(rank: RankState): boolean {
    return rank.place.id === MockTopology.CENTER_ID;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** The next sample time on the interval's grid, skipping the ones already past. */
function nextAfter(previous: number, interval: number, now: number): number {
    const next = previous + interval;
    return next > now ? next : now + interval;
}
