import { randomUUID } from 'crypto';
import { RefreshInterval, RefreshRates, SchedulerRole } from '@gempba/core';
import { Schema1Frame, Schema1NodeFrame } from './schema1-lines';
import { Schema2Frame, Schema2NodeFrame, Schema2Topology } from './schema2-lines';
import { MockFidelity, MockLive, MockRoles, MockScheduler, MockShape } from '../../common/mock-config';
import { MockFault } from '../../common/mock-fault';
import { CoordinatorQueue, QueuedTask } from './coordinator-queue';
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
    /** The idle rank the coordinator reserved for it to send a task to. */
    readonly next?: number;
    readonly running: number;
    readonly tasksLocal: number;
    readonly sent: number;
    readonly recv: number;
    readonly edges: ReadonlyMap<number, { readonly bytes: number, readonly count: number }>;
    /** `scheduler_pending_count`: the coordinator's queue when centralized, 0 everywhere else. */
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
    /** What it last sent; gempba's aggregator repeats it until the rank sends a new one. */
    sample?: RankSample;
    /** The sample written in the schema `frameSchema`, kept until it is sampled again or the schema changes. */
    frameJson?: string;
    frameSchema?: number;
    phase: MockRun.Phase;
    /** When it last reported itself available: the coordinator hears of it from the next step on. */
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
    /** What schema 2 counts beyond schema 1; the coordinator's counters stay 0 on a worker, and the workers' on the coordinator. */
    acct: Accounting;
    /** When the coordinator reserved it as a push target: where the assignment's latency starts. */
    assignedAtMs?: number;
    /** Its edges serialized, kept until it sends again: a rank's edges reach every rank it ever sent to, as gempba's do. */
    edgesJson?: string;
}

interface NodeState {
    /** The node's monotonic clock when the run started; every process on it reads the same clock. */
    clockBaseMs: number;
    stalledUntilMs: number;
    lastSampleMs: number;
    nextSampleMs: number;
    sample?: NodeSample;
    frameJson?: string;
    frameSchema?: number;
    pageCache: number;
}

/** Schema 2's time accounting, as gempba v4.3.0 counts it; times in microseconds unless they say `Ms`, since the run started. */
interface Accounting {
    bytesSent: number;
    bytesRecv: number;
    sendMicros: number;
    recvMicros: number;
    spawnRejectedPoolFull: number;
    spawnRemoteRejected: number;
    idleStarved: number;
    idleImbalanced: number;
    schedRunning: number;
    schedWaiting: number;
    firstTaskMs: number;
    lastTaskMs: number;
    assignLatencyTotal: number;
    assignCount: number;
    assignLatencyMax: number;
    availableQueueEmpty: number;
    stateMsgs: number;
    scoreProposals: number;
    scoreBroadcasts: number;
    scoreProposalsSent: number;
    lastImprovementMs: number;
    fullMicros: number;
    telemetryMicros: number;
}

/** What a rank's frame says, taken when it is sampled; either schema writes it. */
interface RankSample {
    readonly id: number;
    readonly seqNo: number;
    readonly localMs: number;
    readonly tasksStarted: number;
    readonly sent: number;
    readonly recv: number;
    readonly running: number;
    readonly pending: number;
    readonly idleMicros: number;
    readonly cpuPct: number;
    readonly rssBytes: number;
    readonly threads: number;
    readonly edgesJson: string;
    /** Whole microseconds, as gempba's counters are. */
    readonly acct: Readonly<Accounting>;
}

/** What a node's frame says, taken when its sentinel samples it; either schema writes it. */
interface NodeSample {
    readonly sentinel: number;
    readonly localMs: number;
    readonly host: string;
    readonly socketCount: number;
    readonly logicalCores: number;
    readonly memTotalBytes: number;
    readonly memAvailBytes: number;
    readonly cgroupUsedBytes: number;
    readonly cgroupLimitBytes: number;
    readonly sockets: readonly { readonly socketId: number, readonly cpuPct: number, readonly memTotalBytes: number, readonly memUsedBytes: number }[];
}

/**
 * A seeded gempba run, stepped in fixed simulated time so the same seed and the same steps give the same frames
 * whatever the wall clock does. It follows gempba's MPI schedulers (mpi_semi_centralized_scheduler.hpp,
 * mpi_centralized_scheduler.hpp):
 * - the coordinator, on rank 0 as gempba's schedulers put it or on the rank set, seeds the search tree's root to the
 *   lowest rank beside it and runs no tasks itself;
 * - a worker explores one received subtree at a time on its pool, then reports itself available;
 * - semi-centralized: the coordinator reserves an available rank for each running worker that has none, and the worker
 *   sends it one task, a subtree of its own, with nothing else in flight; nothing queues anywhere;
 * - centralized: running workers send spare tasks to the coordinator while it isn't full, and it hands the biggest it holds
 *   to each available worker; its queue is the only pending count.
 * The counters follow from that, so they agree with one another as gempba's do. Frames are sampled at the worker and
 * node intervals, one interval for both in schema 2, and written once in the schema the fidelity asks for; a line is
 * the latest frame of every rank and node with the topology, as gempba's aggregator broadcasts them.
 */
export class MockRun {

    static readonly STEP_MS = 50;
    /** The release whose telemetry schema 2 the mocker sends. */
    static readonly GEMPBA_VERSION = '4.3.0';
    /** gempba up to v4.2.0 broadcasts on a fixed interval, whatever the worker rate (its center_tcp_server.cpp). */
    static readonly GEMPBA_BROADCAST_MS = 500;
    /** gempba's CENTER_NBSTORED_TASKS_PER_PROCESS: past this many tasks per process, the centralized coordinator says it is full. */
    static readonly COORDINATOR_TASKS_PER_PROCESS = 1000;
    /** gempba's MAX_MEMORY_MB: past this much memory, the centralized coordinator says it is full too. */
    static readonly COORDINATOR_MAX_MEMORY_BYTES = 10 * GiB;
    /** It says it is free again below this share of the task limit, with its memory at or below 90 % of its own. */
    static readonly COORDINATOR_FREE_SHARE = 0.8;
    /** How widely the sizes of the branches cut off an endless root vary: the deviation of their logarithm. */
    static readonly BRANCH_SPREAD = 1;
    /** The share of a finite subtree a worker gives away: a branch near its top. */
    static readonly SPLIT_SHARE: readonly [number, number] = [0.2, 0.5];
    /** gempba's main thread polls MPI without sleeping, so an idle process still keeps about one core busy. */
    static readonly POLLING_PCT = 97;
    /** A task's latency and bandwidth on the way, in microseconds and bytes per microsecond: shared memory within a node, the network across. */
    static readonly WITHIN_NODE: readonly [number, number] = [15, 8000];
    static readonly ACROSS_NODES: readonly [number, number] = [60, 1250];
    /** The node expansions a running task tries to spawn; with every pool thread busy, each is refused and runs inline. */
    static readonly SPAWN_TRIES_PER_TASK = 4;
    /** The share of finished tasks that reach a leaf whose score a worker proposes. */
    static readonly PROPOSALS_PER_TASK = 1e-4;

    protected readonly random: MockRandom;
    /** The counters' own noise, apart from the run's, so the same seed steps the same run whatever schema 2 counts. */
    protected readonly noise: MockRandom;
    protected topologyNow: MockTopology;
    protected readonly ranks = new Map<number, RankState>();
    protected readonly nodes: NodeState[];
    protected readonly queue = new CoordinatorQueue();
    protected coordinatorFull = false;
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
    protected topologySchema?: number;
    protected frameOrder?: number[];
    protected readonly runSeed: number;
    /** Drawn at each Start, so the dashboard tells this run from the one before, whatever the seed. */
    readonly runId = randomUUID();

    constructor(protected readonly shape: MockShape, readonly scheduler: MockScheduler, live: MockLive, seed: number,
        rates: RefreshRates = RefreshRates.defaults(), protected readonly roles: MockRoles = { coordinatorRank: 0, declared: true }) {
        this.random = new MockRandom(seed);
        this.noise = new MockRandom(seed + 0x5eed);
        this.runSeed = seed;
        this.liveNow = live;
        this.model = MockScenarioModel.of(live.scenario);
        this.workerInterval = RefreshInterval.clamp(rates.workerIntervalMs);
        this.nodeInterval = RefreshInterval.clamp(rates.nodeIntervalMs);
        this.topologyNow = MockTopology.of(shape);
        this.nodes = this.topologyNow.nodes.map(node => ({
            clockBaseMs: this.random.int(1_000_000, 900_000_000), stalledUntilMs: 0, lastSampleMs: 0, nextSampleMs: 0,
            pageCache: node.memTotalBytes * 0.08
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

    /** gempba up to v4.2.0 broadcasts every 500 ms; from v4.3.0, at the one interval every frame follows. */
    get broadcastIntervalMs(): number {
        return this.schema === 1 ? MockRun.GEMPBA_BROADCAST_MS : this.workerInterval;
    }

    /** The telemetry schema the fidelity sends; it can change while the mocker runs. */
    get schema(): 1 | 2 {
        return MockFidelity.schema(this.liveNow.fidelity);
    }

    /** A new scenario starts from its beginning; the load and fidelity apply from the next step. */
    setLive(live: MockLive): void {
        if (live.scenario !== this.liveNow.scenario) {
            this.model = MockScenarioModel.of(live.scenario);
            this.scenarioStartMs = this.time;
        }
        const schema = this.schema;
        this.liveNow = live;
        if (this.schema !== schema) {
            this.rearm();
        }
    }

    /** Applies the intervals at once: a sample due sooner under the new interval is brought forward. */
    setIntervals(workerMs: number, nodeMs: number): void {
        this.workerInterval = RefreshInterval.clamp(workerMs);
        this.nodeInterval = RefreshInterval.clamp(nodeMs);
        this.rearm();
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

    /** One broadcast line, without its newline: the latest frame of every rank and node, as gempba's aggregator sends it. */
    line(nowEpochMs: number): string {
        const schema = this.schema;
        if (this.topologySchema !== schema) {
            this.topologyJson = undefined;
            this.topologySchema = schema;
        }
        const pidOf = (id: number) => this.ranks.get(id)?.pid ?? 0;
        this.topologyJson ??= JSON.stringify(schema === 1 ? MockTopology.toSchema1(this.topologyNow, pidOf) : this.topologySchema2(pidOf));
        // node by node, as gempba's aggregator walks its topology
        this.frameOrder ??= [...this.topologyNow.ranks].sort((a, b) => a.nodeIndex - b.nodeIndex || a.id - b.id).map(place => place.id);
        const ranks = this.frameOrder.map(id => this.ranks.get(id)).map(rank => rank && this.rankJson(rank, schema)).filter(frame => frame !== undefined);
        const nodes = this.nodes.map(node => this.nodeJson(node, schema)).filter(frame => frame !== undefined);
        const clock = `"ts":${nowEpochMs},"elapsed_seconds":${Math.floor(this.time / 1000)}`;
        if (schema === 1) {
            return `{"version":1,${clock},"topology":${this.topologyJson},"workers":[${ranks.join(',')}],"nodes":[${nodes.join(',')}]}`;
        }
        return `{"version":2,"run_id":"${this.runId}",${clock},"paused":false,"final":false,`
            + `"topology":${this.topologyJson},"ranks":[${ranks.join(',')}],"nodes":[${nodes.join(',')}]}`;
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
            if (this.isCoordinator(rank)) {
                this.runCoordinator(rank);
            } else {
                this.runRank(rank, scenarioTime);
            }
        }
        if (this.centralized) {
            this.scheduleCentralized();
        } else {
            this.scheduleSemiCentralized();
        }
        const busy = [...this.ranks.values()].some(rank => !this.isCoordinator(rank) && rank.phase !== 'available');
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
        const acct = rank.acct;
        if (rank.phase === 'running') {
            acct.schedRunning += dt * 1000;
            const busyTarget = pool * this.model.loadFactor(scenarioTime) * this.liveNow.loadPct / 100;
            rank.running = Math.min(pool, this.random.round(busyTarget), rank.subtree);
            const finished = Math.min(this.random.poisson(rank.running * dt / this.model.meanTaskMs), rank.subtree);
            rank.tasksLocal += finished;
            rank.subtree -= finished;
            this.spawn(rank, finished);
            for (let proposals = this.noise.poisson(finished * MockRun.PROPOSALS_PER_TASK); proposals > 0; proposals--) {
                this.propose(rank);
            }
            if (rank.subtree <= 0) {
                this.finish(rank);
            }
        } else {
            acct.schedWaiting += dt * 1000;
            rank.running = 0;
        }
        const idle = dt * 1000 * (pool - rank.running) / pool;
        rank.idleMicros += idle;
        // starved while no task ran in the pool, imbalanced while some ran and other threads waited
        if (rank.running === 0) {
            acct.idleStarved += idle;
        } else {
            acct.idleImbalanced += idle;
        }
        const cap = Math.max(rank.place.allowedCpuIds.length, 1) * 100;
        const cpuTarget = Math.min(cap, MockRun.POLLING_PCT + rank.running * 100 * rank.efficiency);
        rank.cpuPct = clamp(rank.cpuPct + 0.5 * (cpuTarget - rank.cpuPct) + this.random.normal(), 0, cap);
        const rssTarget = rank.baseRss + rank.running * this.model.taskRssBytes;
        rank.rssBytes = Math.max(rank.baseRss * 0.9, rank.rssBytes + 0.2 * (rssTarget - rank.rssBytes) + this.random.normal() * 256 * KiB);
    }

    /** The coordinator runs no tasks: its pool stays idle while it polls MPI, and it holds the queued tasks in memory. */
    protected runCoordinator(coordinator: RankState): void {
        const dt = MockRun.STEP_MS;
        coordinator.running = 0;
        coordinator.idleMicros += dt * 1000;
        coordinator.acct.idleStarved += dt * 1000;
        if (this.centralized) {
            if (this.coordinatorFull) {
                coordinator.acct.fullMicros += dt * 1000;
            }
            if (this.queue.length === 0) {
                coordinator.acct.availableQueueEmpty += dt * 1000 * this.computing().filter(rank => rank.phase === 'available').length;
            }
        }
        coordinator.cpuPct = clamp(coordinator.cpuPct + 0.5 * (98 - coordinator.cpuPct) + this.random.normal(), 0, 100);
        const rssTarget = this.coordinatorMemory(coordinator);
        coordinator.rssBytes = Math.max(coordinator.baseRss * 0.9, coordinator.rssBytes + 0.2 * (rssTarget - coordinator.rssBytes) + this.random.normal() * 64 * KiB);
    }

    /**
     * The coordinator reserves an available rank for each running worker that has none (process_running, process_available),
     * taking the running workers in turn; then each worker with a rank reserved sends it one task when it has one to spare.
     */
    protected scheduleSemiCentralized(): void {
        const available = this.computing().filter(rank => this.idleAtCoordinator(rank));
        const waiting = this.computing().filter(rank => rank.phase === 'running' && rank.next === undefined);
        if (available.length > 0 && waiting.length > 0) {
            const start = this.pairingCursor++ % waiting.length;
            const turn = [...waiting.slice(start), ...waiting.slice(0, start)];
            for (let i = 0; i < Math.min(turn.length, available.length); i++) {
                turn[i].next = available[i].place.id;
                available[i].phase = 'assigned';
                available[i].assignedAtMs = this.time;
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
     * Running workers send spare tasks to the coordinator while it isn't full, one each per step. Past 1000 tasks per process,
     * or 10 GiB of memory, it says it is full, until the queue is below 80 % of that limit and its memory at most 9 GiB.
     * It hands its biggest task to each available worker.
     */
    protected scheduleCentralized(): void {
        const coordinator = this.ranks.get(this.roles.coordinatorRank)!;
        const limit = MockRun.COORDINATOR_TASKS_PER_PROCESS * this.ranks.size;
        for (const rank of this.computing()) {
            if (this.coordinatorFull) {
                break;
            }
            if (rank.phase === 'running' && rank.subtree >= 2 && this.random.chance(this.model.sendChance(rank.place.id))) {
                this.give(rank, coordinator, this.split(rank));
                this.coordinatorFull = this.queue.length > limit || this.coordinatorMemory(coordinator) > MockRun.COORDINATOR_MAX_MEMORY_BYTES;
            }
        }
        const freed = this.queue.length < MockRun.COORDINATOR_FREE_SHARE * limit && this.coordinatorMemory(coordinator) <= 0.9 * MockRun.COORDINATOR_MAX_MEMORY_BYTES;
        if (this.coordinatorFull && freed) {
            this.coordinatorFull = false;
        }
        for (const rank of this.computing()) {
            if (this.queue.length === 0) {
                break;
            }
            if (this.idleAtCoordinator(rank)) {
                this.give(coordinator, rank, this.queue.pop()!);
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

    /** Sends one task: the sender's edge to the receiver counts it with its bytes; the coordinator queues it, a worker starts on it. */
    protected give(from: RankState, to: RankState, task: QueuedTask): void {
        from.sent += 1;
        to.recv += 1;
        const [latency, bytesPerMicro] = from.place.nodeIndex === to.place.nodeIndex ? MockRun.WITHIN_NODE : MockRun.ACROSS_NODES;
        from.acct.bytesSent += task.bytes;
        from.acct.sendMicros += latency + task.bytes / bytesPerMicro;
        to.acct.bytesRecv += task.bytes;
        to.acct.recvMicros += task.bytes / bytesPerMicro;
        const edge = from.edges.get(to.place.id) ?? { bytes: 0, count: 0 };
        edge.bytes += task.bytes;
        edge.count += 1;
        from.edges.set(to.place.id, edge);
        from.edgesJson = undefined;
        if (this.isCoordinator(to)) {
            this.queue.push(task);
        } else {
            to.phase = 'running';
            to.subtree = task.tasks;
            if (to.recv === 1) {
                to.acct.firstTaskMs = this.time;
            }
            this.assigned(to, this.isCoordinator(from) ? latency + task.bytes / bytesPerMicro : undefined);
        }
    }

    /**
     * The rank reports itself running, which ends the coordinator's assignment: a task it handed out, or a push target it
     * named and a worker then sent to; the latency runs from the assignment to the report.
     */
    protected assigned(rank: RankState, transferMicros: number | undefined): void {
        const coordinator = this.coordinatorRank();
        if (!coordinator) {
            return;
        }
        coordinator.acct.stateMsgs += 1;
        const since = transferMicros ?? (rank.assignedAtMs === undefined ? undefined : (this.time - rank.assignedAtMs) * 1000);
        rank.assignedAtMs = undefined;
        if (since === undefined) {
            return;
        }
        const latency = since + this.noise.int(200, 1500);
        coordinator.acct.assignLatencyTotal += latency;
        coordinator.acct.assignCount += 1;
        coordinator.acct.assignLatencyMax = Math.max(coordinator.acct.assignLatencyMax, latency);
    }

    /** A busy pool refuses the node expansions it can't take, and so does the scheduler when the rank has no channel to send them on. */
    protected spawn(rank: RankState, finished: number): void {
        if (rank.running < rank.place.poolThreads) {
            return;
        }
        const refused = this.noise.poisson(finished * MockRun.SPAWN_TRIES_PER_TASK);
        rank.acct.spawnRejectedPoolFull += refused;
        const channel = this.centralized ? !this.coordinatorFull : rank.next !== undefined;
        if (!channel) {
            rank.acct.spawnRemoteRejected += refused;
        }
    }

    /** A worker proposes a score it reached; the coordinator broadcasts it when it improves, less often as the run goes on. */
    protected propose(rank: RankState): void {
        const coordinator = this.coordinatorRank();
        if (!coordinator) {
            return;
        }
        rank.acct.scoreProposalsSent += 1;
        coordinator.acct.scoreProposals += 1;
        if (this.noise.chance(1 / (1 + coordinator.acct.scoreBroadcasts))) {
            coordinator.acct.scoreBroadcasts += 1;
            coordinator.acct.lastImprovementMs = this.time;
        }
    }

    protected coordinatorRank(): RankState | undefined {
        return this.roles.declared ? this.ranks.get(this.roles.coordinatorRank) : undefined;
    }

    /** The coordinator hands the search tree's root to the first worker, the lowest rank beside it. */
    protected seed(): void {
        const coordinator = this.coordinatorRank();
        const first = this.computing().find(rank => rank.phase === 'available');
        if (!first) {
            return;
        }
        const tasksPerSecond = this.computing().reduce((sum, rank) => sum + rank.place.poolThreads * 1000 / this.model.meanTaskMs, 0);
        const root = { tasks: this.model.seedTasks(tasksPerSecond), bytes: this.random.int(8, 64) * KiB };
        if (coordinator) {
            this.give(coordinator, first, root);
        } else {
            // without a coordinator, the lowest rank starts on the root itself
            first.phase = 'running';
            first.subtree = root.tasks;
            first.acct.firstTaskMs = this.time;
        }
    }

    /** The worker explored its whole subtree: it reports itself available, and a rank reserved for it is freed. */
    protected finish(rank: RankState): void {
        rank.acct.lastTaskMs = this.time;
        const coordinator = this.coordinatorRank();
        if (coordinator) {
            coordinator.acct.stateMsgs += 1;
        }
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
                reserved.assignedAtMs = undefined;
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

    /** What the coordinator holds in memory: its own, and every queued task's bytes. */
    protected coordinatorMemory(coordinator: RankState): number {
        return coordinator.baseRss + this.queue.bytes;
    }

    /** Available, and the coordinator has heard so: a worker that finished this step is not handed work in the same step. */
    protected idleAtCoordinator(rank: RankState): boolean {
        return rank.phase === 'available' && rank.availableSinceMs < this.time;
    }

    protected isCoordinator(rank: RankState): boolean {
        return this.roles.declared && rank.place.id === this.roles.coordinatorRank;
    }

    /** The centralized scheduler queues at its coordinator; a run that declares no roles has none, so it pairs ranks instead. */
    protected get centralized(): boolean {
        return this.scheduler === 'centralized' && this.roles.declared;
    }

    /** A sample due sooner under the intervals now in force is brought forward. */
    protected rearm(): void {
        for (const rank of this.ranks.values()) {
            rank.nextSampleMs = Math.max(this.time, Math.min(rank.nextSampleMs, rank.lastSampleMs + this.workerInterval));
        }
        for (const node of this.nodes) {
            node.nextSampleMs = Math.max(this.time, Math.min(node.nextSampleMs, node.lastSampleMs + this.nodeEvery));
        }
    }

    /** Node frames keep their own interval in schema 1, and follow the one interval in schema 2, as gempba v4.3.0 drives them. */
    protected get nodeEvery(): number {
        return this.schema === 1 ? this.nodeInterval : this.workerInterval;
    }

    protected roleOf(id: number): SchedulerRole {
        return this.roles.declared && id === this.roles.coordinatorRank ? 'coordinator' : 'worker';
    }

    protected topologySchema2(pidOf: (id: number) => number): Schema2Topology {
        return {
            ...MockTopology.toSchema2(this.topologyNow, pidOf, id => this.roleOf(id)),
            run: {
                scheduler: !this.roles.declared ? 'decentralized' : this.centralized ? 'centralized' : 'semi_centralized',
                load_balancer: 'quasi_horizontal',
                runtime_mode: 'multiprocessing',
                world_size: this.topologyNow.ranks.length,
                threads_per_process: Math.max(...this.topologyNow.ranks.map(place => place.poolThreads)),
                gempba_version: MockRun.GEMPBA_VERSION,
                annotations: { mock: `seed ${this.runSeed}` },
                markers: []
            }
        };
    }

    /** The rank's latest sample in the schema asked for, written once per sample and schema. */
    protected rankJson(rank: RankState, schema: number): string | undefined {
        const sample = rank.sample;
        if (!sample) {
            return undefined;
        }
        if (rank.frameJson === undefined || rank.frameSchema !== schema) {
            const frame = schema === 1 ? schema1Frame(sample) : schema2Frame(sample);
            // the edges last, as gempba writes them
            rank.frameJson = `${JSON.stringify(frame).slice(0, -1)},"edges_out":${sample.edgesJson}}`;
            rank.frameSchema = schema;
        }
        return rank.frameJson;
    }

    protected nodeJson(node: NodeState, schema: number): string | undefined {
        const sample = node.sample;
        if (!sample) {
            return undefined;
        }
        if (node.frameJson === undefined || node.frameSchema !== schema) {
            node.frameJson = JSON.stringify(schema === 1 ? schema1NodeFrame(sample) : schema2NodeFrame(sample));
            node.frameSchema = schema;
        }
        return node.frameJson;
    }

    protected computing(): RankState[] {
        return [...this.ranks.values()].filter(rank => !this.isCoordinator(rank));
    }

    protected pendingOf(rank: RankState): number {
        return this.isCoordinator(rank) && this.centralized ? this.queue.length : 0;
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
        // rank 0 is telemetry's aggregator in every run: it gathers every rank's frame and serves the stream
        rank.acct.telemetryMicros += rank.place.id === 0 ? 1500 + 400 * this.ranks.size : this.noise.int(25, 60);
        rank.sample = {
            id: rank.place.id, seqNo: rank.seqNo, localMs: this.nodes[rank.place.nodeIndex].clockBaseMs + this.time, tasksStarted: rank.tasksLocal,
            sent: rank.sent, recv: rank.recv, running: rank.running, pending: this.pendingOf(rank), idleMicros: Math.round(rank.idleMicros),
            cpuPct: Math.round(rank.cpuPct * 100) / 100, rssBytes: Math.round(rank.rssBytes), threads: rank.place.poolThreads + 1, edgesJson: rank.edgesJson,
            acct: Object.fromEntries(Object.entries(rank.acct).map(([key, value]) => [key, Math.round(value)])) as unknown as Accounting
        };
        rank.frameJson = undefined;
    }

    protected sampleNode(index: number): void {
        const node = this.nodes[index];
        const place = this.topologyNow.nodes[index];
        const sentinel = MockTopology.sentinelOf(this.topologyNow, index);
        if (sentinel === undefined) {
            node.sample = node.frameJson = undefined;
            return;
        }
        node.lastSampleMs = this.time;
        node.nextSampleMs = node.sample === undefined ? this.time + this.random.int(1, this.nodeEvery) : nextAfter(node.nextSampleMs, this.nodeEvery, this.time);
        const local = this.topologyNow.ranks.filter(rank => rank.nodeIndex === index).map(rank => this.ranks.get(rank.id)!);
        const rss = local.reduce((sum, rank) => sum + rank.rssBytes, 0);
        const total = place.memTotalBytes;
        node.pageCache = Math.max(0, node.pageCache + 0.05 * (total * 0.08 - node.pageCache) + this.random.normal() * 16 * MiB);
        const used = Math.min(total * 0.98, 2 * GiB + total * 0.01 + rss + node.pageCache);
        const cgroupLimit = this.shape.cgroupGiB * GiB;
        // hwloc gives each socket's memory; gempba leaves its CPU and use at 0 for now (hwloc_probe.cpp)
        const full = this.liveNow.fidelity === 'full';
        node.sample = {
            sentinel, localMs: node.clockBaseMs + this.time, host: place.host, socketCount: place.sockets.length, logicalCores: place.logicalCores,
            memTotalBytes: total, memAvailBytes: Math.round(total - used),
            cgroupUsedBytes: cgroupLimit > 0 ? Math.round(Math.min(cgroupLimit, rss + local.length * 64 * MiB)) : 0, cgroupLimitBytes: cgroupLimit,
            sockets: place.sockets.map(socket => {
                const busy = local.filter(rank => rank.place.socketId === socket.socketId).reduce((sum, rank) => sum + rank.cpuPct, 0);
                return {
                    socketId: socket.socketId, cpuPct: full ? Math.round(Math.min(100, busy / socket.logicalCores) * 100) / 100 : 0,
                    memTotalBytes: Math.round(total / place.sockets.length), memUsedBytes: full ? Math.round(used / place.sockets.length) : 0
                };
            })
        };
        node.frameJson = undefined;
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

    /** Removes a rank from a node that keeps at least one; never the coordinator, nor the last worker beside it. */
    protected removeRank(): string {
        const computing = this.topologyNow.ranks.filter(place => !this.roles.declared || place.id !== this.roles.coordinatorRank);
        const candidates = computing.length < 2 ? [] : computing.filter(place => this.topologyNow.ranks.filter(other => other.nodeIndex === place.nodeIndex).length > 1);
        if (candidates.length === 0) {
            return 'No rank can be removed: every node would be left empty, or only the coordinator would remain';
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
        const baseRss = this.roles.declared && place.id === this.roles.coordinatorRank ? 48 * MiB : this.random.int(64, 160) * MiB;
        return {
            place, pid: this.nextPid++, seqNo: 0, lastSampleMs: this.time, nextSampleMs: this.time, phase: 'available', availableSinceMs: this.time,
            subtree: 0, running: 0,
            tasksLocal: 0, sent: 0, recv: 0, idleMicros: 0, cpuPct: 0, rssBytes: baseRss, baseRss, efficiency: this.random.between(0.92, 0.99),
            edges: new Map(), acct: noAccounting()
        };
    }
}

export namespace MockRun {
    /** The faults the run carries out itself; dropping clients and sending a malformed line belong to the transport. */
    export type Fault = Exclude<MockFault, 'drop-clients' | 'malformed-line'>;

    /** A rank's state at the coordinator: exploring a subtree, idle, or reserved to receive one (semi-centralized). */
    export type Phase = 'running' | 'available' | 'assigned';
}

function schema1Frame(sample: RankSample): Schema1Frame {
    return {
        worker_id: sample.id, seq_no: sample.seqNo, worker_local_ms: sample.localMs, tasks_started_total: sample.tasksStarted,
        tasks_sent_total: sample.sent, tasks_recv_total: sample.recv, tasks_running: sample.running, scheduler_pending_count: sample.pending,
        idle_microseconds_per_worker: sample.idleMicros, process_cpu_pct: sample.cpuPct, process_rss_bytes: sample.rssBytes, process_threads: sample.threads
    };
}

/** Every key gempba v4.3.0 writes, in its order. */
function schema2Frame(sample: RankSample): Schema2Frame {
    const acct = sample.acct;
    return {
        rank: sample.id, seq_no: sample.seqNo, rank_local_ms: sample.localMs, tasks_started_total: sample.tasksStarted,
        tasks_sent_total: sample.sent, tasks_recv_total: sample.recv, bytes_sent_total: acct.bytesSent, bytes_recv_total: acct.bytesRecv,
        send_microseconds_total: acct.sendMicros, recv_microseconds_total: acct.recvMicros, spawn_rejected_pool_full: acct.spawnRejectedPoolFull,
        spawn_remote_rejected: acct.spawnRemoteRejected, tasks_running: sample.running, scheduler_pending_count: sample.pending,
        idle_microseconds_per_thread: sample.idleMicros, idle_microseconds_starved: acct.idleStarved, idle_microseconds_imbalanced: acct.idleImbalanced,
        sched_running_microseconds: acct.schedRunning, sched_waiting_microseconds: acct.schedWaiting, first_task_ms: acct.firstTaskMs,
        last_task_ms: acct.lastTaskMs, assign_latency_microseconds_total: acct.assignLatencyTotal, assign_count: acct.assignCount,
        assign_latency_microseconds_max: acct.assignLatencyMax, available_microseconds_queue_empty: acct.availableQueueEmpty,
        coordinator_state_msgs_total: acct.stateMsgs, coordinator_score_proposals_total: acct.scoreProposals,
        coordinator_score_broadcasts_total: acct.scoreBroadcasts, score_proposals_sent: acct.scoreProposalsSent,
        last_score_improvement_ms: acct.lastImprovementMs, coordinator_full_microseconds: acct.fullMicros, telemetry_microseconds_total: acct.telemetryMicros,
        process_cpu_pct: sample.cpuPct, process_rss_bytes: sample.rssBytes, process_threads: sample.threads
    };
}

/** gempba v4.2.0 still sends the network and disk aggregates, always as zeros (node_probe.cpp). */
function schema1NodeFrame(sample: NodeSample): Schema1NodeFrame {
    return {
        sentinel_worker_id: sample.sentinel, ...nodeFields(sample),
        net_aggregate: { bytes_in: 0, bytes_out: 0, packets_in: 0, packets_out: 0 }, disk_aggregate: { read_bytes: 0, write_bytes: 0 }
    };
}

function schema2NodeFrame(sample: NodeSample): Schema2NodeFrame {
    return { sentinel_rank: sample.sentinel, ...nodeFields(sample) };
}

/** The node frame's keys both schemas share, in gempba's order after the sentinel's. */
function nodeFields(sample: NodeSample): Omit<Schema2NodeFrame, 'sentinel_rank'> {
    return {
        sentinel_local_ms: sample.localMs, hostname: sample.host, socket_count: sample.socketCount, logical_cores: sample.logicalCores,
        mem_total_bytes: sample.memTotalBytes, mem_avail_bytes: sample.memAvailBytes, cgroup_mem_used_bytes: sample.cgroupUsedBytes,
        cgroup_mem_limit_bytes: sample.cgroupLimitBytes,
        sockets: sample.sockets.map(socket => ({
            socket_id: socket.socketId, cpu_pct: socket.cpuPct, mem_total_bytes: socket.memTotalBytes, mem_used_bytes: socket.memUsedBytes
        }))
    };
}

function noAccounting(): Accounting {
    return {
        bytesSent: 0, bytesRecv: 0, sendMicros: 0, recvMicros: 0, spawnRejectedPoolFull: 0, spawnRemoteRejected: 0, idleStarved: 0, idleImbalanced: 0,
        schedRunning: 0, schedWaiting: 0, firstTaskMs: 0, lastTaskMs: 0, assignLatencyTotal: 0, assignCount: 0, assignLatencyMax: 0,
        availableQueueEmpty: 0, stateMsgs: 0, scoreProposals: 0, scoreBroadcasts: 0, scoreProposalsSent: 0, lastImprovementMs: 0, fullMicros: 0,
        telemetryMicros: 0
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** The next sample time on the interval's grid, skipping the ones already past. */
function nextAfter(previous: number, interval: number, now: number): number {
    const next = previous + interval;
    return next > now ? next : now + interval;
}
