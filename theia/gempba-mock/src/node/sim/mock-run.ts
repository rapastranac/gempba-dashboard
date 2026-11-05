import { RefreshInterval, RefreshRates } from '@gempba/core';
import { NodeFrame, WorkerFrame } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { MockLive, MockScheduler, MockShape } from '../../common/mock-config';
import { MockFault } from '../../common/mock-fault';
import { CenterQueue, QueuedTask } from './center-queue';
import { MockRandom } from './mock-random';
import { MockScenarioModel } from './mock-scenario';
import { MockTopology, MockWorkerPlace } from './mock-topology';

const KiB = 1024;
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

/** A worker's live state, for specs and status; the frames carry the same counters as last sampled. */
export interface MockWorkerView {
    readonly workerId: number;
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

interface WorkerState {
    place: MockWorkerPlace;
    pid: number;
    seqNo: number;
    lastSampleMs: number;
    nextSampleMs: number;
    /** The latest frame, serialized when it was sampled; gempba's center repeats it until the worker sends a new one. */
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
    /** Its edges serialized, kept until it sends again: a worker's edges reach every rank it ever sent to, as gempba's do. */
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
 * node intervals and serialized once; a line is the latest frame of every worker and node with the topology, as
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
    protected readonly workers = new Map<number, WorkerState>();
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
        for (const place of this.topologyNow.workers) {
            this.workers.set(place.workerId, this.newWorker(place));
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
        for (const worker of this.workers.values()) {
            worker.nextSampleMs = Math.max(this.time, Math.min(worker.nextSampleMs, worker.lastSampleMs + this.workerInterval));
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
            case 'restart-worker': return this.restartWorker();
            case 'add-worker': return this.addWorker();
            case 'remove-worker': return this.removeWorker();
            case 'end-run':
                this.endedNow = true;
                return 'Ended the run, as when gempba\'s process exits';
        }
    }

    /** One broadcast line, without its newline: the latest frame of every worker and node, as gempba's center sends it. */
    line(nowEpochMs: number): string {
        this.topologyJson ??= JSON.stringify(MockTopology.toWire(this.topologyNow, workerId => this.workers.get(workerId)?.pid ?? 0));
        // node by node, as gempba's center walks its topology
        this.frameOrder ??= [...this.topologyNow.workers].sort((a, b) => a.nodeIndex - b.nodeIndex || a.workerId - b.workerId).map(place => place.workerId);
        const workers = this.frameOrder.map(workerId => this.workers.get(workerId)?.frameJson).filter(frame => frame !== undefined);
        const nodes = this.nodes.map(node => node.frameJson).filter(frame => frame !== undefined);
        return `{"version":${MockRun.SCHEMA_VERSION},"ts":${nowEpochMs},"elapsed_seconds":${Math.floor(this.time / 1000)},`
            + `"topology":${this.topologyJson},"workers":[${workers.join(',')}],"nodes":[${nodes.join(',')}]}`;
    }

    workerViews(): MockWorkerView[] {
        return [...this.workers.values()].map(worker => ({
            workerId: worker.place.workerId, phase: worker.phase, poolThreads: worker.place.poolThreads, subtree: worker.subtree, next: worker.next,
            running: worker.running, tasksLocal: worker.tasksLocal, sent: worker.sent, recv: worker.recv, edges: worker.edges, pending: this.pendingOf(worker)
        }));
    }

    protected step(): void {
        this.time += MockRun.STEP_MS;
        const scenarioTime = this.time - this.scenarioStartMs;
        for (const worker of this.workers.values()) {
            if (isCenter(worker)) {
                this.runCenter(worker);
            } else {
                this.runWorker(worker, scenarioTime);
            }
        }
        if (this.scheduler === 'centralized') {
            this.scheduleCentralized();
        } else {
            this.scheduleSemiCentralized();
        }
        const busy = [...this.workers.values()].some(worker => !isCenter(worker) && worker.phase !== 'available');
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
    protected runWorker(worker: WorkerState, scenarioTime: number): void {
        const dt = MockRun.STEP_MS;
        const pool = worker.place.poolThreads;
        if (worker.phase === 'running') {
            const busyTarget = pool * this.model.loadFactor(scenarioTime) * this.liveNow.loadPct / 100;
            worker.running = Math.min(pool, this.random.round(busyTarget), worker.subtree);
            const finished = Math.min(this.random.poisson(worker.running * dt / this.model.meanTaskMs), worker.subtree);
            worker.tasksLocal += finished;
            worker.subtree -= finished;
            if (worker.subtree <= 0) {
                this.finish(worker);
            }
        } else {
            worker.running = 0;
        }
        worker.idleMicros += dt * 1000 * (pool - worker.running) / pool;
        const cap = Math.max(worker.place.allowedCpuIds.length, 1) * 100;
        const cpuTarget = Math.min(cap, MockRun.POLLING_PCT + worker.running * 100 * worker.efficiency);
        worker.cpuPct = clamp(worker.cpuPct + 0.5 * (cpuTarget - worker.cpuPct) + this.random.normal(), 0, cap);
        const rssTarget = worker.baseRss + worker.running * this.model.taskRssBytes;
        worker.rssBytes = Math.max(worker.baseRss * 0.9, worker.rssBytes + 0.2 * (rssTarget - worker.rssBytes) + this.random.normal() * 256 * KiB);
    }

    /** The center runs no tasks: its pool stays idle while it polls MPI, and it holds the queued tasks in memory. */
    protected runCenter(center: WorkerState): void {
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
        const available = this.computing().filter(worker => this.idleAtCenter(worker));
        const waiting = this.computing().filter(worker => worker.phase === 'running' && worker.next === undefined);
        if (available.length > 0 && waiting.length > 0) {
            const start = this.pairingCursor++ % waiting.length;
            const turn = [...waiting.slice(start), ...waiting.slice(0, start)];
            for (let i = 0; i < Math.min(turn.length, available.length); i++) {
                turn[i].next = available[i].place.workerId;
                available[i].phase = 'assigned';
            }
        }
        for (const worker of this.computing()) {
            if (worker.phase !== 'running' || worker.next === undefined || worker.subtree < 2 || !this.random.chance(this.model.sendChance(worker.place.workerId))) {
                continue;
            }
            const to = this.workers.get(worker.next);
            worker.next = undefined;
            if (to?.phase === 'assigned') {
                this.give(worker, to, this.split(worker));
            }
        }
    }

    /**
     * Running workers send spare tasks to the center while it isn't full, one each per step. Past 1000 tasks per process,
     * or 10 GiB of memory, it says it is full, until the queue is below 80 % of that limit and its memory at most 9 GiB.
     * It hands its biggest task to each available worker.
     */
    protected scheduleCentralized(): void {
        const center = this.workers.get(MockTopology.CENTER_ID)!;
        const limit = MockRun.CENTER_TASKS_PER_PROCESS * this.workers.size;
        for (const worker of this.computing()) {
            if (this.centerFull) {
                break;
            }
            if (worker.phase === 'running' && worker.subtree >= 2 && this.random.chance(this.model.sendChance(worker.place.workerId))) {
                this.give(worker, center, this.split(worker));
                this.centerFull = this.queue.length > limit || this.centerMemory(center) > MockRun.CENTER_MAX_MEMORY_BYTES;
            }
        }
        if (this.centerFull && this.queue.length < MockRun.CENTER_FREE_SHARE * limit && this.centerMemory(center) <= 0.9 * MockRun.CENTER_MAX_MEMORY_BYTES) {
            this.centerFull = false;
        }
        for (const worker of this.computing()) {
            if (this.queue.length === 0) {
                break;
            }
            if (this.idleAtCenter(worker)) {
                this.give(center, worker, this.queue.pop()!);
            }
        }
    }

    /**
     * Cuts a subtree off the worker's own to send away, always leaving it one task: a share of a finite subtree, as a
     * branch near its top holds; from an endless root, a branch whose size is drawn around the scenario's mean.
     */
    protected split(worker: WorkerState): QueuedTask {
        let tasks: number;
        if (worker.subtree === Infinity) {
            const tasksPerSecond = worker.place.poolThreads * 1000 / this.model.meanTaskMs;
            const mean = Math.max(this.model.branchSeconds(worker.place.workerId) * tasksPerSecond, 1);
            tasks = Math.max(1, Math.round(this.random.lognormal(mean, MockRun.BRANCH_SPREAD)));
        } else {
            const [low, high] = MockRun.SPLIT_SHARE;
            tasks = Math.max(1, Math.min(worker.subtree - 1, Math.round(worker.subtree * this.random.between(low, high))));
        }
        worker.subtree -= tasks;
        return { tasks, bytes: this.random.int(8, 64) * KiB };
    }

    /** Sends one task: the sender's edge to the receiver counts it with its bytes; the center queues it, a worker starts on it. */
    protected give(from: WorkerState, to: WorkerState, task: QueuedTask): void {
        from.sent += 1;
        to.recv += 1;
        const edge = from.edges.get(to.place.workerId) ?? { bytes: 0, count: 0 };
        edge.bytes += task.bytes;
        edge.count += 1;
        from.edges.set(to.place.workerId, edge);
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
        const center = this.workers.get(MockTopology.CENTER_ID);
        const first = this.computing().find(worker => worker.phase === 'available');
        if (center && first) {
            const tasksPerSecond = this.computing().reduce((sum, worker) => sum + worker.place.poolThreads * 1000 / this.model.meanTaskMs, 0);
            this.give(center, first, { tasks: this.model.seedTasks(tasksPerSecond), bytes: this.random.int(8, 64) * KiB });
        }
    }

    /** The worker explored its whole subtree: it reports itself available, and a rank reserved for it is freed. */
    protected finish(worker: WorkerState): void {
        worker.phase = 'available';
        worker.availableSinceMs = this.time;
        worker.subtree = 0;
        this.release(worker);
    }

    /** Frees the rank reserved for this worker, and the reservation that held this one, so neither waits forever. */
    protected release(worker: WorkerState): void {
        if (worker.next !== undefined) {
            const reserved = this.workers.get(worker.next);
            if (reserved?.phase === 'assigned') {
                reserved.phase = 'available';
                reserved.availableSinceMs = this.time;
            }
            worker.next = undefined;
        }
        if (worker.phase === 'assigned') {
            for (const other of this.workers.values()) {
                if (other.next === worker.place.workerId) {
                    other.next = undefined;
                }
            }
        }
    }

    /** What the center holds in memory: its own, and every queued task's bytes. */
    protected centerMemory(center: WorkerState): number {
        return center.baseRss + this.queue.bytes;
    }

    /** Available, and the center has heard so: a worker that finished this step is not handed work in the same step. */
    protected idleAtCenter(worker: WorkerState): boolean {
        return worker.phase === 'available' && worker.availableSinceMs < this.time;
    }

    protected computing(): WorkerState[] {
        return [...this.workers.values()].filter(worker => !isCenter(worker));
    }

    protected pendingOf(worker: WorkerState): number {
        return isCenter(worker) && this.scheduler === 'centralized' ? this.queue.length : 0;
    }

    protected sample(): void {
        for (const worker of this.workers.values()) {
            if (worker.nextSampleMs <= this.time && this.nodes[worker.place.nodeIndex].stalledUntilMs <= this.time) {
                this.sampleWorker(worker);
            }
        }
        for (let index = 0; index < this.nodes.length; index++) {
            const node = this.nodes[index];
            if (node.nextSampleMs <= this.time && node.stalledUntilMs <= this.time) {
                this.sampleNode(index);
            }
        }
    }

    protected sampleWorker(worker: WorkerState): void {
        const first = worker.seqNo === 0;
        worker.seqNo += 1;
        worker.lastSampleMs = this.time;
        // a worker's samples drift apart from the others', as separate processes' do
        worker.nextSampleMs = first ? this.time + this.random.int(1, this.workerInterval) : nextAfter(worker.nextSampleMs, this.workerInterval, this.time);
        worker.edgesJson ??= JSON.stringify([...worker.edges.entries()].sort(([a], [b]) => a - b).map(([to, edge]) => ({ to, bytes: edge.bytes, count: edge.count })));
        const frame: Omit<WorkerFrame, 'edges_out'> = {
            worker_id: worker.place.workerId,
            seq_no: worker.seqNo,
            worker_local_ms: this.nodes[worker.place.nodeIndex].clockBaseMs + this.time,
            tasks_started_total: worker.tasksLocal,
            tasks_sent_total: worker.sent,
            tasks_recv_total: worker.recv,
            tasks_running: worker.running,
            scheduler_pending_count: this.pendingOf(worker),
            idle_microseconds_per_worker: Math.round(worker.idleMicros),
            process_cpu_pct: Math.round(worker.cpuPct * 100) / 100,
            process_rss_bytes: Math.round(worker.rssBytes),
            process_threads: worker.place.poolThreads + 1
        };
        // the edges last, as gempba writes them
        worker.frameJson = `${JSON.stringify(frame).slice(0, -1)},"edges_out":${worker.edgesJson}}`;
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
        const local = this.topologyNow.workers.filter(worker => worker.nodeIndex === index).map(worker => this.workers.get(worker.workerId)!);
        const rss = local.reduce((sum, worker) => sum + worker.rssBytes, 0);
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
        const frame: NodeFrame = {
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
                const onSocket = local.filter(worker => worker.place.socketId === socket.socketId);
                const busy = onSocket.reduce((sum, worker) => sum + worker.cpuPct, 0);
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

    /** A restarted worker is a new process: a new PID, its sequence number and counters from zero, and its subtree lost. */
    protected restartWorker(): string {
        const worker = this.random.pick(this.computing());
        this.release(worker);
        const fresh = this.newWorker(worker.place);
        this.workers.set(worker.place.workerId, fresh);
        this.sampleWorker(fresh);
        this.topologyJson = undefined;
        return `Restarted worker ${worker.place.workerId} as PID ${fresh.pid}`;
    }

    protected addWorker(): string {
        const counts = this.topologyNow.nodes.map(node => this.topologyNow.workers.filter(worker => worker.nodeIndex === node.index).length);
        const nodeIndex = counts.indexOf(Math.min(...counts));
        this.topologyNow = MockTopology.withWorker(this.topologyNow, this.shape, nodeIndex);
        for (const place of this.topologyNow.workers) {
            const existing = this.workers.get(place.workerId);
            if (existing) {
                existing.place = place;
            } else {
                const added = this.newWorker(place);
                this.workers.set(place.workerId, added);
                this.sampleWorker(added);
            }
        }
        this.topologyJson = undefined;
        this.frameOrder = undefined;
        const added = Math.max(...this.topologyNow.workers.map(worker => worker.workerId));
        return `Added worker ${added} on ${this.topologyNow.nodes[nodeIndex].host}`;
    }

    /** Removes a worker from a node that keeps at least one; never the center, nor the last worker beside it. */
    protected removeWorker(): string {
        const computing = this.topologyNow.workers.filter(place => place.workerId !== MockTopology.CENTER_ID);
        const candidates = computing.length < 2 ? [] : computing.filter(place => this.topologyNow.workers.filter(other => other.nodeIndex === place.nodeIndex).length > 1);
        if (candidates.length === 0) {
            return 'No worker can be removed: every node would be left empty, or only the center would remain';
        }
        const gone = this.random.pick(candidates);
        this.release(this.workers.get(gone.workerId)!);
        this.workers.delete(gone.workerId);
        this.topologyNow = MockTopology.withoutWorker(this.topologyNow, this.shape, gone.workerId);
        for (const place of this.topologyNow.workers) {
            this.workers.get(place.workerId)!.place = place;
        }
        this.topologyJson = undefined;
        this.frameOrder = undefined;
        return `Removed worker ${gone.workerId} from ${this.topologyNow.nodes[gone.nodeIndex].host}`;
    }

    protected newWorker(place: MockWorkerPlace): WorkerState {
        const baseRss = place.workerId === MockTopology.CENTER_ID ? 48 * MiB : this.random.int(64, 160) * MiB;
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

    /** A worker's state at the center: exploring a subtree, idle, or reserved to receive one (semi-centralized). */
    export type Phase = 'running' | 'available' | 'assigned';
}

function isCenter(worker: WorkerState): boolean {
    return worker.place.workerId === MockTopology.CENTER_ID;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** The next sample time on the interval's grid, skipping the ones already past. */
function nextAfter(previous: number, interval: number, now: number): number {
    const next = previous + interval;
    return next > now ? next : now + interval;
}
