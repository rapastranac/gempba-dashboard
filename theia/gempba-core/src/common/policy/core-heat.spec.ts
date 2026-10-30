import { expect } from 'chai';
import { NodeSnapshot } from '../model/node-snapshot';
import { SocketSnapshot } from '../model/socket-snapshot';
import { WorkerSnapshot } from '../model/worker-snapshot';
import { CoreHeat } from './core-heat';

function worker(workerId: number, cpuPct: number, allowedCpuIds: number[] = []): WorkerSnapshot {
    return {
        workerId, seqNo: 1, localMillis: 0, pid: 0, sentinel: false, allowedCpuIds, tasksLocalTotal: 0, tasksRunning: 0,
        tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerWorker: 0, cpuPct, rssBytes: 0, threads: 1,
        elapsedSeconds: 0, peers: []
    };
}

function socket(socketId: number, cpuIds: number[], ...workers: WorkerSnapshot[]): SocketSnapshot {
    return {
        socketId, physicalCores: cpuIds.length, logicalCores: cpuIds.length, cpuIds, hasTopology: cpuIds.length > 0, coreUsage: [], workers
    };
}

function node(...sockets: SocketSnapshot[]): NodeSnapshot {
    return {
        host: 'h', socketCount: sockets.length, physicalCores: 0, logicalCores: 0, hasLiveMemory: false, memTotalBytes: 0, memUsedBytes: 0,
        sentinelWorkerId: 0, sentinelLocalMillis: 0, nodeUtilPct: 0, sockets
    };
}

function loads(n: NodeSnapshot, s: SocketSnapshot): number[] {
    return CoreHeat.forSocket(n, s).map(cell => cell.loadPct);
}

describe('CoreHeat', () => {

    it('spreads a pinned worker\'s load evenly over its CPUs', () => {
        const s0 = socket(0, [0, 1, 2, 3], worker(1, 150, [1, 2]));
        expect(CoreHeat.forSocket(node(s0), s0)).to.deep.equal([
            { cpuId: 0, loadPct: 0, oversubscribed: false },
            { cpuId: 1, loadPct: 75, oversubscribed: false },
            { cpuId: 2, loadPct: 75, oversubscribed: false },
            { cpuId: 3, loadPct: 0, oversubscribed: false }
        ]);
    });

    it('spreads an unrestricted worker over its own socket\'s CPUs', () => {
        const s0 = socket(0, [0, 1, 2, 3], worker(1, 200));
        const s1 = socket(1, [4, 5, 6, 7]);
        const n = node(s0, s1);
        expect([loads(n, s0), loads(n, s1)]).to.deep.equal([[50, 50, 50, 50], [0, 0, 0, 0]]);
    });

    it('a worker allowed on two sockets heats both', () => {
        const s0 = socket(0, [0, 1, 2, 3], worker(1, 400, [2, 3, 4, 5]));
        const s1 = socket(1, [4, 5, 6, 7]);
        const n = node(s0, s1);
        expect([loads(n, s0), loads(n, s1)]).to.deep.equal([[0, 0, 100, 100], [100, 100, 0, 0]]);
    });

    it('workers sharing CPUs add up, and more than one CPU of work oversubscribes them', () => {
        const s0 = socket(0, [0, 1], worker(1, 150, [0, 1]), worker(2, 150, [0, 1]));
        expect(CoreHeat.forSocket(node(s0), s0).map(cell => [cell.loadPct, cell.oversubscribed])).to.deep.equal([[150, true], [150, true]]);
    });

    it('a worker using all of its own CPUs is not oversubscribed, even a little over through sampling noise', () => {
        const s0 = socket(0, [0, 1, 2, 3], worker(1, 410, [0, 1, 2, 3]));
        expect(CoreHeat.forSocket(node(s0), s0).every(cell => !cell.oversubscribed && cell.loadPct === 102.5)).to.be.true;
    });

    it('cells follow the socket\'s CPU order', () => {
        const s0 = socket(0, [6, 2, 4], worker(1, 30, [2]));
        expect(CoreHeat.forSocket(node(s0), s0).map(cell => [cell.cpuId, cell.loadPct])).to.deep.equal([[6, 0], [2, 30], [4, 0]]);
    });

    it('a socket without topology has no cells, and its unrestricted workers heat nothing', () => {
        const s0 = socket(0, [], worker(1, 100));
        expect(CoreHeat.forSocket(node(s0), s0)).to.be.empty;
        expect(CoreHeat.loadByCpu(node(s0)).size).to.equal(0);
    });
});
