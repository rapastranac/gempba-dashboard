import { expect } from 'chai';
import { NodeSnapshot } from '../model/node-snapshot';
import { RankSnapshot } from '../model/rank-snapshot';
import { RankAccounting } from '../model/run-setup';
import { NodeUtilization } from './node-utilization';

function rank(overrides: Partial<RankSnapshot> = {}): RankSnapshot {
    return {
        role: 'worker', accounting: RankAccounting.none(),
        id: 3, seqNo: 1, localMillis: 0, pid: 4100, sentinel: false, allowedCpuIds: [0, 1, 2, 3],
        tasksStartedTotal: 0, tasksRunning: 0, tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerThread: 0,
        cpuPct: 300, rssBytes: 0, threads: 5, elapsedSeconds: 0, peers: [], ...overrides
    };
}

function node(ranks: RankSnapshot[]): NodeSnapshot {
    return {
        host: 'alpha', socketCount: 1, physicalCores: 4, logicalCores: 8, hasLiveMemory: false, memTotalBytes: 0, memUsedBytes: 0,
        sentinelRank: 3, sentinelLocalMillis: 0, nodeUtilPct: 0,
        sockets: [{ socketId: 0, name: '', physicalCores: 4, logicalCores: 8, cpuIds: [], hasTopology: false, coreUsage: [], ranks }]
    };
}

describe('NodeUtilization', () => {

    it('four cores pegged over a four-core allocation is 100', () => {
        expect(NodeUtilization.pct(400, 4)).to.be.closeTo(100, 1e-9);
    });

    it('ten cores busy over a twenty-core allocation is 50', () => {
        expect(NodeUtilization.pct(1000, 20)).to.be.closeTo(50, 1e-9);
    });

    it('an idle allocation is zero', () => {
        expect(NodeUtilization.pct(0, 4)).to.equal(0);
    });

    it('oversubscription clamps to 100', () => {
        expect(NodeUtilization.pct(500, 4)).to.equal(100);
    });

    it('no allocation is zero, not infinity', () => {
        expect(NodeUtilization.pct(400, 0)).to.equal(0);
        expect(NodeUtilization.pct(400, -1)).to.equal(0);
    });

    it('negative cpu is floored to zero', () => {
        expect(NodeUtilization.pct(-5, 4)).to.equal(0);
    });

    it('allocates the cores the ranks may run on, each counted once', () => {
        expect(NodeUtilization.allocatedCores(node([rank(), rank({ id: 4, allowedCpuIds: [2, 3, 4, 5] })]))).to.equal(6);
    });

    it('allocates every core when no rank is restricted', () => {
        expect(NodeUtilization.allocatedCores(node([rank({ allowedCpuIds: [] })]))).to.equal(8);
    });

    it('counts the cores the ranks keep busy together', () => {
        expect(NodeUtilization.coresBusy([rank(), rank({ cpuPct: 50 })])).to.equal(3.5);
        expect(NodeUtilization.coresBusy([])).to.equal(0);
    });
});
