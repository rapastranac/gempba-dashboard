import { expect } from 'chai';
import { NodeSnapshot } from './node-snapshot';
import { SocketSnapshot } from './socket-snapshot';
import { StructureKey } from './structure-key';
import { WorkerSnapshot } from './worker-snapshot';
import { WorldSnapshot } from './world-snapshot';

function worker(workerId: number): WorkerSnapshot {
    return {
        workerId, seqNo: 1, localMillis: 0, pid: 100 + workerId, sentinel: false, allowedCpuIds: [], tasksStartedTotal: 0, tasksRunning: 0,
        tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerWorker: 0,
        cpuPct: 0, rssBytes: 0, threads: 1, elapsedSeconds: 0, peers: []
    };
}

function socket(socketId: number, ...workerIds: number[]): SocketSnapshot {
    return {
        socketId, physicalCores: 0, logicalCores: 0, cpuIds: [], hasTopology: false, coreUsage: [],
        workers: workerIds.map(worker)
    };
}

function node(host: string, ...sockets: SocketSnapshot[]): NodeSnapshot {
    return {
        host, socketCount: sockets.length, physicalCores: 0, logicalCores: 0, hasLiveMemory: false,
        memTotalBytes: 0, memUsedBytes: 0, sentinelWorkerId: 0, sentinelLocalMillis: 0, nodeUtilPct: 0, sockets
    };
}

function world(...nodes: NodeSnapshot[]): WorldSnapshot {
    const keys = nodes.flatMap(n => n.sockets.flatMap(s => s.workers.map(w => StructureKey.keyOf(n.host, s.socketId, w.workerId))));
    return { schemaVersion: 3, timestampMillis: 1_700_000_000_000, elapsedSeconds: 42, nodes, structure: StructureKey.of(keys) };
}

describe('WorldSnapshot', () => {

    it('empty has no nodes, no workers and an empty structure', () => {
        const empty = WorldSnapshot.empty();
        expect(WorldSnapshot.totalNodes(empty)).to.equal(0);
        expect(WorldSnapshot.totalWorkers(empty)).to.equal(0);
        expect(empty.structure.keys).to.be.empty;
    });

    it('totals count nodes and workers across every socket', () => {
        const snapshot = world(node('a', socket(0, 1, 2), socket(1, 3)), node('b', socket(0, 4)));
        expect(WorldSnapshot.totalNodes(snapshot)).to.equal(2);
        expect(WorldSnapshot.totalWorkers(snapshot)).to.equal(4);
        expect(NodeSnapshot.workerCount(snapshot.nodes[0])).to.equal(3);
    });

    it('takes rank 0 for the center once the run has other processes, and a lone process for none', () => {
        const cluster = world(node('alpha', socket(0, 0, 1)), node('beta', socket(0, 2)));
        expect([0, 1, 2].map(id => WorldSnapshot.isCenter(cluster, id))).to.deep.equal([true, false, false]);
        expect(WorldSnapshot.isCenter(world(node('alpha', socket(0, 0))), 0)).to.equal(false);
        expect(WorldSnapshot.isCenter(undefined, 0)).to.equal(false);
    });

    it('forHost keeps only that host and rebuilds its structure key', () => {
        const snapshot = world(node('a', socket(0, 1), socket(1, 2)), node('b', socket(0, 3)));
        const narrowed = WorldSnapshot.forHost(snapshot, 'a');
        expect(narrowed.nodes.map(n => n.host)).to.deep.equal(['a']);
        expect(narrowed.structure.keys).to.deep.equal(['a|0|1', 'a|1|2']);
    });

    it('forHost on an unknown host keeps the frame scalars but no nodes', () => {
        const narrowed = WorldSnapshot.forHost(world(node('a', socket(0, 1))), 'missing');
        expect(narrowed.nodes).to.be.empty;
        expect(narrowed.structure.keys).to.be.empty;
        expect([narrowed.schemaVersion, narrowed.timestampMillis, narrowed.elapsedSeconds]).to.deep.equal([3, 1_700_000_000_000, 42]);
    });

    it('forHost without a host returns the snapshot unchanged', () => {
        const snapshot = world(node('a', socket(0, 1)));
        expect(WorldSnapshot.forHost(snapshot, undefined)).to.equal(snapshot);
    });
});

describe('StructureKey', () => {

    it('deduplicates and orders keys', () => {
        expect(StructureKey.of(['b|0|2', 'a|0|1', 'b|0|2']).keys).to.deep.equal(['a|0|1', 'b|0|2']);
    });

    it('equal structures compare equal regardless of input order', () => {
        expect(StructureKey.equals(StructureKey.of(['x', 'y']), StructureKey.of(['y', 'x']))).to.be.true;
        expect(StructureKey.equals(StructureKey.of(['x']), StructureKey.of(['x', 'y']))).to.be.false;
    });
});
