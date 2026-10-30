import { expect } from 'chai';
import { NodeSnapshot } from '../model/node-snapshot';
import { StructureKey } from '../model/structure-key';
import { WorkerSnapshot } from '../model/worker-snapshot';
import { WorldSnapshot } from '../model/world-snapshot';
import { WorkerHistoryStore } from './worker-history-store';
import { WorkerSeries } from './worker-series';

interface Frame {
    readonly seqNo: number;
    readonly localMillis: number;
    readonly tasks?: number;
    readonly idleMicros?: number;
    readonly cpuPct?: number;
    readonly rssBytes?: number;
}

function worker(workerId: number, frame: Frame): WorkerSnapshot {
    return {
        workerId, seqNo: frame.seqNo, localMillis: frame.localMillis, pid: 0, sentinel: false, allowedCpuIds: [],
        tasksLocalTotal: frame.tasks ?? 0, tasksRunning: 0, tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 0,
        idleMicrosPerWorker: frame.idleMicros ?? 0, cpuPct: frame.cpuPct ?? 0, rssBytes: frame.rssBytes ?? 0, threads: 1,
        elapsedSeconds: 0, peers: []
    };
}

function node(host: string, ...workers: WorkerSnapshot[]): NodeSnapshot {
    return {
        host, socketCount: 1, physicalCores: 0, logicalCores: 0, hasLiveMemory: false, memTotalBytes: 0, memUsedBytes: 0,
        sentinelWorkerId: 0, sentinelLocalMillis: 0, nodeUtilPct: 0,
        sockets: [{ socketId: 0, physicalCores: 0, logicalCores: 0, cpuIds: [], hasTopology: false, coreUsage: [], workers }]
    };
}

function world(...nodes: NodeSnapshot[]): WorldSnapshot {
    return { schemaVersion: 1, timestampMillis: 0, elapsedSeconds: 0, nodes, structure: StructureKey.empty() };
}

/** One worker 1 on host "h". */
function solo(frame: Frame): WorldSnapshot {
    return world(node('h', worker(1, frame)));
}

describe('WorkerHistoryStore', () => {

    it('records CPU and memory from every new frame, and rates from the second one', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 1, localMillis: 1_000, tasks: 10, idleMicros: 0, cpuPct: 80, rssBytes: 100 }));
        store.update(solo({ seqNo: 2, localMillis: 1_500, tasks: 60, idleMicros: 125_000, cpuPct: 90, rssBytes: 120 }));
        expect(store.seriesFor(1)).to.deep.equal({ cpu: [80, 90], tasksPerSecond: [100], idlePct: [25], rssBytes: [100, 120] });
    });

    it('measures rates on the worker\'s own clock', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 1, localMillis: 0, tasks: 0 }));
        store.update(solo({ seqNo: 2, localMillis: 2_000, tasks: 30 }));
        expect(store.seriesFor(1).tasksPerSecond).to.deep.equal([15]);
    });

    it('a repeated frame adds no sample', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 1, localMillis: 0, tasks: 0, cpuPct: 50 }));
        store.update(solo({ seqNo: 1, localMillis: 0, tasks: 0, cpuPct: 50 }));
        store.update(solo({ seqNo: 2, localMillis: 500, tasks: 50, cpuPct: 60 }));
        store.update(solo({ seqNo: 2, localMillis: 500, tasks: 50, cpuPct: 60 }));
        const series = store.seriesFor(1);
        expect([series.cpu, series.tasksPerSecond]).to.deep.equal([[50, 60], [100]]);
    });

    it('a restarted worker gives no rate until its next frame', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 40, localMillis: 20_000, tasks: 4_000, idleMicros: 1_000_000, cpuPct: 90 }));
        store.update(solo({ seqNo: 41, localMillis: 20_500, tasks: 4_050, idleMicros: 1_000_000, cpuPct: 90 }));
        store.update(solo({ seqNo: 1, localMillis: 21_000, tasks: 5, idleMicros: 0, cpuPct: 10 }));
        expect(store.seriesFor(1).tasksPerSecond).to.deep.equal([100]);
        store.update(solo({ seqNo: 2, localMillis: 21_500, tasks: 25, idleMicros: 0, cpuPct: 20 }));
        const series = store.seriesFor(1);
        expect([series.cpu, series.tasksPerSecond, series.idlePct]).to.deep.equal([[90, 90, 10, 20], [100, 40], [0, 0]]);
    });

    it('a counter that went back with a rising sequence number gives no rate', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 1, localMillis: 0, tasks: 100 }));
        store.update(solo({ seqNo: 2, localMillis: 500, tasks: 10 }));
        expect(store.seriesFor(1).tasksPerSecond).to.be.empty;
    });

    it('idle time is capped at 100 percent', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 1, localMillis: 0, idleMicros: 0 }));
        store.update(solo({ seqNo: 2, localMillis: 500, idleMicros: 600_000 }));
        expect(store.seriesFor(1).idlePct).to.deep.equal([100]);
    });

    it('each series is capped and drops the oldest samples', () => {
        const store = new WorkerHistoryStore();
        const n = WorkerHistoryStore.CAPACITY + 10;
        for (let i = 0; i <= n; i++) {
            store.update(solo({ seqNo: i + 1, localMillis: i * 1_000, tasks: i * i, cpuPct: i }));
        }
        const series = store.seriesFor(1);
        expect(series.cpu).to.have.lengthOf(WorkerHistoryStore.CAPACITY);
        expect(series.cpu[0]).to.equal(n + 1 - WorkerHistoryStore.CAPACITY);
        expect(series.tasksPerSecond).to.have.lengthOf(WorkerHistoryStore.CAPACITY);
        // the rate between frames i - 1 and i is i² - (i - 1)² = 2i - 1
        expect(series.tasksPerSecond[series.tasksPerSecond.length - 1]).to.equal(2 * n - 1);
        expect(store.clusterThroughput()).to.have.lengthOf(WorkerHistoryStore.CAPACITY);
    });

    it('a node\'s throughput sums its workers\' latest rates, and the cluster\'s sums every node', () => {
        const store = new WorkerHistoryStore();
        store.update(world(node('a', worker(1, { seqNo: 1, localMillis: 0 }), worker(2, { seqNo: 1, localMillis: 0 })),
            node('b', worker(3, { seqNo: 1, localMillis: 0 }))));
        store.update(world(node('a', worker(1, { seqNo: 2, localMillis: 1_000, tasks: 10 }), worker(2, { seqNo: 2, localMillis: 1_000, tasks: 20 })),
            node('b', worker(3, { seqNo: 2, localMillis: 1_000, tasks: 5 }))));
        expect([store.throughputFor('a'), store.throughputFor('b'), store.clusterThroughput()]).to.deep.equal([[30], [5], [35]]);
    });

    it('a worker that sent no new frame keeps counting at its latest rate', () => {
        const store = new WorkerHistoryStore();
        store.update(world(node('a', worker(1, { seqNo: 1, localMillis: 0 }), worker(2, { seqNo: 1, localMillis: 0 }))));
        store.update(world(node('a', worker(1, { seqNo: 2, localMillis: 1_000, tasks: 10 }), worker(2, { seqNo: 2, localMillis: 1_000, tasks: 20 }))));
        store.update(world(node('a', worker(1, { seqNo: 3, localMillis: 2_000, tasks: 50 }), worker(2, { seqNo: 2, localMillis: 1_000, tasks: 20 }))));
        expect(store.throughputFor('a')).to.deep.equal([30, 60]);
    });

    it('a node adds no throughput sample until one of its workers has a rate, nor while none sends a new frame', () => {
        const store = new WorkerHistoryStore();
        store.update(world(node('a', worker(1, { seqNo: 1, localMillis: 0 }))));
        expect(store.throughputFor('a')).to.be.empty;
        store.update(world(node('a', worker(1, { seqNo: 2, localMillis: 1_000, tasks: 10 }))));
        store.update(world(node('a', worker(1, { seqNo: 2, localMillis: 1_000, tasks: 10 }))));
        expect([store.throughputFor('a'), store.clusterThroughput()]).to.deep.equal([[10], [10]]);
    });

    it('drops the workers and nodes that leave the frames', () => {
        const store = new WorkerHistoryStore();
        store.update(world(node('a', worker(1, { seqNo: 1, localMillis: 0 })), node('b', worker(2, { seqNo: 1, localMillis: 0 }))));
        store.update(world(node('a', worker(1, { seqNo: 2, localMillis: 500 })), node('b', worker(2, { seqNo: 2, localMillis: 500 }))));
        store.update(world(node('a', worker(1, { seqNo: 3, localMillis: 1_000 }))));
        expect(store.workerIds()).to.deep.equal([1]);
        expect(WorkerSeries.isEmpty(store.seriesFor(2))).to.be.true;
        expect(store.throughputFor('b')).to.be.empty;
        expect(store.throughputFor('a')).to.have.lengthOf(2);
    });

    it('clear drops every history', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 1, localMillis: 0 }));
        store.update(solo({ seqNo: 2, localMillis: 500, tasks: 5 }));
        store.clear();
        expect([store.workerIds(), store.throughputFor('h'), store.clusterThroughput()]).to.deep.equal([[], [], []]);
        expect(WorkerSeries.isEmpty(store.seriesFor(1))).to.be.true;
    });

    it('seriesFor an unknown worker is empty', () => {
        expect(new WorkerHistoryStore().seriesFor(7)).to.deep.equal(WorkerSeries.empty());
    });

    it('a missing snapshot is a no-op', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 1, localMillis: 0 }));
        store.update(undefined);
        expect(store.workerIds()).to.deep.equal([1]);
    });

    it('a returned series is a copy, unaffected by later frames', () => {
        const store = new WorkerHistoryStore();
        store.update(solo({ seqNo: 1, localMillis: 0, cpuPct: 10 }));
        const series = store.seriesFor(1);
        store.update(solo({ seqNo: 2, localMillis: 500, cpuPct: 20 }));
        expect(series.cpu).to.deep.equal([10]);
    });
});
