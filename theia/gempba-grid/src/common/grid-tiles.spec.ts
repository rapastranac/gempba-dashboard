import { expect } from 'chai';
import { NodeHistoryStore, NodeSeries, NodeSnapshot, PeerSnapshot, TaskWords, WorkerSeries, WorkerSnapshot, WorldSnapshot } from '@gempba/core';
import { GridTiles } from './grid-tiles';

const GiB = 1024 ** 3;

function worker(overrides: Partial<WorkerSnapshot> = {}): WorkerSnapshot {
    return {
        workerId: 3, seqNo: 1, localMillis: 0, pid: 4100, sentinel: false, allowedCpuIds: [0, 1, 2, 3],
        tasksStartedTotal: 6_000, tasksRunning: 3, tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerWorker: 0,
        cpuPct: 300, rssBytes: 0, threads: 5, elapsedSeconds: 100, peers: [], ...overrides
    };
}

function node(host: string, overrides: Partial<NodeSnapshot> = {}, workers = [worker()]): NodeSnapshot {
    return {
        host, socketCount: 1, physicalCores: 4, logicalCores: 8, hasLiveMemory: true, memTotalBytes: 16 * GiB, memUsedBytes: 4 * GiB,
        sentinelWorkerId: 3, sentinelLocalMillis: 0, nodeUtilPct: 75,
        sockets: [{ socketId: 0, physicalCores: 4, logicalCores: 8, cpuIds: [], hasTopology: false, coreUsage: [], workers }], ...overrides
    };
}

function world(...nodes: NodeSnapshot[]): WorldSnapshot {
    return { ...WorldSnapshot.empty(), timestampMillis: 1, elapsedSeconds: 100, nodes };
}

const SERIES: NodeSeries = { cpu: [70, 75], mem: [3 * GiB, 4 * GiB], cpuLatest: 75, memUsedLatest: 4 * GiB, memTotalLatest: 16 * GiB };

function sources(overrides: Partial<GridTiles.Sources> = {}): GridTiles.Sources {
    return {
        node: () => SERIES,
        throughput: () => [100, 100, 100, 100, 100, 130, 130, 130, 130, 130],
        clusterThroughput: () => CLUSTER_THROUGHPUT,
        worker: () => WorkerSeries.empty(),
        nodeFrameAt: () => 9_500,
        lastFrameAt: () => 9_900,
        ...overrides
    };
}

const CLUSTER_THROUGHPUT = [200, 200, 200, 200, 200, 260, 260, 260, 260, 260];

const CLOCK: GridTiles.Clock = { streaming: true, now: 10_000, intervalMs: 500 };

const sentTo = (peerWorkerId: number, count: number): PeerSnapshot => ({ peerWorkerId, count, bytes: count * 100 });

/** Three processes on two nodes: the coordinator on alpha sent the root to worker 1, which shared work with worker 2 on beta. */
const SHARED = world(
    node('alpha', {}, [
        worker({ workerId: 0, tasksStartedTotal: 0, tasksSentTotal: 1, peers: [sentTo(1, 1)] }),
        worker({ workerId: 1, tasksStartedTotal: 142, tasksSentTotal: 78, tasksRecvTotal: 21, peers: [sentTo(2, 78)] })
    ]),
    node('beta', {}, [worker({ workerId: 2, tasksStartedTotal: 3609, tasksSentTotal: 20, tasksRecvTotal: 78, peers: [sentTo(1, 20)] })])
);

describe('GridTiles', () => {

    describe('a tile', () => {

        it('has none before the first snapshot', () => {
            expect(GridTiles.of(undefined, sources(), CLOCK)).to.deep.equal([]);
        });

        it('is one per node, in snapshot order', () => {
            expect(GridTiles.of(world(node('beta'), node('alpha')), sources(), CLOCK).map(tile => tile.host)).to.deep.equal(['beta', 'alpha']);
        });

        it('heads with the node\'s CPU and graphs its history', () => {
            const [tile] = GridTiles.of(world(node('alpha', { nodeUtilPct: 41.6 })), sources(), CLOCK);
            expect([tile.cpuText, tile.cpuHistory]).to.deep.equal(['42%', [70, 75]]);
        });

        it('shows the node\'s tasks started per second with their trend', () => {
            const [tile] = GridTiles.of(world(node('alpha')), sources(), CLOCK);
            expect(tile.tasks).to.deep.equal({
                label: 'Tasks started', value: '130', unit: '/s', trend: { direction: 'up', change: 0.3 }, tone: 'tasks', hint: TaskWords.STARTED_HINT
            });
        });

        it('says how many tasks the node\'s processes moved, and how many crossed nodes, but not in a run of one process', () => {
            const [alpha, beta] = GridTiles.of(SHARED, sources(), CLOCK);
            expect(alpha.moved?.text).to.equal('79 sent · 21 received');
            expect(alpha.moved?.hint).to.contain('; 78 of those sent went to other nodes');
            expect(beta.moved?.text).to.equal('20 sent · 78 received');
            expect(GridTiles.of(world(node('alpha')), sources(), CLOCK)[0].moved).to.equal(undefined);
        });

        it('counts slow tasks per minute, and shows no rate before two frames', () => {
            const [slow] = GridTiles.of(world(node('alpha')), sources({ throughput: () => [0.2] }), CLOCK);
            expect([slow.tasks.value, slow.tasks.unit]).to.deep.equal(['12', '/min']);
            const [fresh] = GridTiles.of(world(node('alpha')), sources({ throughput: () => [] }), CLOCK);
            expect([fresh.tasks.value, fresh.tasks.unit]).to.deep.equal(['—', undefined]);
        });

        it('shows memory from the history, else the node frame, and none until the node reports it', () => {
            const [tile] = GridTiles.of(world(node('alpha')), sources(), CLOCK);
            expect(tile.memory).to.deep.equal({ label: 'Memory', value: '4.0', unit: 'GB', detail: 'of 16.0 GB', tone: 'memory', meter: 0.25 });
            const [fromFrame] = GridTiles.of(world(node('alpha', { memUsedBytes: 8 * GiB })), sources({ node: () => NodeSeries.empty() }), CLOCK);
            expect([fromFrame.memory?.value, fromFrame.memory?.meter]).to.deep.equal(['8.0', 0.5]);
            const [unknown] = GridTiles.of(world(node('alpha', { hasLiveMemory: false })), sources({ node: () => NodeSeries.empty() }), CLOCK);
            expect(unknown.memory).to.equal(undefined);
        });

        it('is live while the node\'s workers send new frames, and waiting once they stop although the stream goes on', () => {
            const frameAt = (host: string) => host === 'alpha' ? 9_500 : 6_000;
            const tiles = GridTiles.of(world(node('alpha'), node('beta')), sources({ nodeFrameAt: frameAt }), CLOCK);
            expect(tiles.map(tile => tile.liveness)).to.deep.equal(['live', 'stale']);
        });

        it('is off once the stream is', () => {
            const [tile] = GridTiles.of(world(node('alpha')), sources(), { ...CLOCK, streaming: false });
            expect(tile.liveness).to.equal('off');
        });

        it('graphs a full window of the kept history', () => {
            expect(GridTiles.HISTORY_CAPACITY).to.equal(NodeHistoryStore.CAPACITY);
        });
    });

    describe('the overview', () => {

        it('has none before any node', () => {
            expect(GridTiles.overview(undefined, sources(), CLOCK)).to.equal(undefined);
            expect(GridTiles.overview(world(), sources(), CLOCK)).to.equal(undefined);
        });

        it('counts the nodes and workers, and follows the stream\'s liveness', () => {
            const cluster = world(node('alpha', {}, [worker(), worker({ workerId: 4 })]), node('beta'));
            const overview = GridTiles.overview(cluster, sources(), CLOCK)!;
            expect([overview.summary, overview.liveness]).to.deep.equal(['2 nodes · 3 workers', 'live']);
            expect(GridTiles.overview(world(node('alpha')), sources({ lastFrameAt: () => 1_000 }), CLOCK)!.summary).to.equal('1 node · 1 worker');
            expect(GridTiles.overview(world(node('alpha')), sources({ lastFrameAt: () => 1_000 }), CLOCK)!.liveness).to.equal('stale');
        });

        it('sums the cores busy over the cores allocated on every node', () => {
            const cluster = world(node('alpha', {}, [worker(), worker({ workerId: 4, cpuPct: 50, allowedCpuIds: [4, 5] })]), node('beta'));
            expect(GridTiles.overview(cluster, sources(), CLOCK)!.figures[0]).to.include({ label: 'Cores busy', value: '6.5', unit: 'of 10' });
        });

        it('shows the cluster\'s tasks started with their trend and run average, and charts them in one unit', () => {
            const overview = GridTiles.overview(world(node('alpha'), node('beta')), sources(), CLOCK)!;
            expect(overview.figures[1]).to.deep.equal({
                label: 'Tasks started', value: '260', unit: '/s', trend: { direction: 'up', change: 0.3 }, tone: 'tasks', detail: 'run average 120 tasks/s',
                hint: TaskWords.STARTED_HINT
            });
            expect([overview.throughput, overview.throughputUnit, overview.throughputTitle]).to.deep.equal([CLUSTER_THROUGHPUT, '/s', 'Tasks started per second']);
            const slow = GridTiles.overview(world(node('alpha')), sources({ clusterThroughput: () => [0.1, 0.2] }), CLOCK)!;
            expect([slow.throughput, slow.throughputUnit, slow.throughputTitle]).to.deep.equal([[6, 12], '/min', 'Tasks started per minute']);
        });

        it('shows the tasks moved between processes, their share of those started, and how many crossed nodes', () => {
            const moved = GridTiles.overview(SHARED, sources(), CLOCK)!.figures.find(figure => figure.label === 'Tasks moved');
            expect(moved).to.include({ value: '99', detail: '2.6% of started · 98 across nodes', tone: 'network' });
            const busy = world(...SHARED.nodes.map(each => ({ ...each, sockets: each.sockets.map(socket => ({
                ...socket, workers: socket.workers.map(one => ({ ...one, tasksStartedTotal: one.tasksStartedTotal * 1000 }))
            })) })));
            expect(GridTiles.overview(busy, sources(), CLOCK)!.figures.find(figure => figure.label === 'Tasks moved')?.detail).to.equal('<0.1% of started · 98 across nodes');
        });

        it('averages how idle the workers are now, leaving out the coordinator, which runs no tasks', () => {
            const idlePct = new Map([[0, [0]], [1, [5, 10]], [2, [30]]]);
            const series = (id: number): WorkerSeries => ({ ...WorkerSeries.empty(), idlePct: idlePct.get(id) ?? [] });
            const idle = GridTiles.overview(SHARED, sources({ worker: series }), CLOCK)!.figures.find(figure => figure.label === 'Idle');
            expect(idle).to.include({ value: '20', unit: '%', tone: 'idle' });
            const fresh = GridTiles.overview(SHARED, sources(), CLOCK)!.figures.find(figure => figure.label === 'Idle');
            expect([fresh?.value, fresh?.unit]).to.deep.equal(['—', undefined]);
        });

        it('shows nothing about moving work in a run of one process', () => {
            const labels = GridTiles.overview(world(node('alpha')), sources(), CLOCK)!.figures.map(figure => figure.label);
            expect(labels).to.deep.equal(['Cores busy', 'Tasks started', 'Memory']);
        });

        it('sums memory over the nodes that report it, and leaves it out when none does', () => {
            const series = (host: string) => host === 'gamma' ? NodeSeries.empty() : SERIES;
            const cluster = world(node('alpha'), node('beta'), node('gamma', { hasLiveMemory: false }));
            const overview = GridTiles.overview(cluster, sources({ node: series }), CLOCK)!;
            expect(overview.figures.find(figure => figure.label === 'Memory')).to.deep.equal({
                label: 'Memory', value: '8.0', unit: 'GB', detail: 'of 32.0 GB', tone: 'memory', meter: 0.25
            });
            const none = GridTiles.overview(world(node('gamma', { hasLiveMemory: false })), sources({ node: () => NodeSeries.empty() }), CLOCK)!;
            expect(none.figures.map(figure => figure.label)).to.deep.equal(['Cores busy', 'Tasks started']);
        });
    });
});
