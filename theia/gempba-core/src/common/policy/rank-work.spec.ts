import { expect } from 'chai';
import { NodeSnapshot } from '../model/node-snapshot';
import { RankSnapshot, SchedulerRole } from '../model/rank-snapshot';
import { RankAccounting } from '../model/run-setup';
import { WorldSnapshot } from '../model/world-snapshot';
import { RankWork } from './rank-work';

/** A schema-2 rank: its declared role, and the counters it filled, the rest at 0. */
function rank(id: number, role: SchedulerRole, counts: Partial<RankSnapshot> = {}, accounting: Partial<RankAccounting> = {}): RankSnapshot {
    return {
        id, seqNo: 1, localMillis: 0, pid: 0, sentinel: false, role, allowedCpuIds: [], tasksStartedTotal: 0, tasksRunning: 0, tasksSentTotal: 0,
        tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerThread: 0, cpuPct: 0, rssBytes: 0, threads: 1, elapsedSeconds: 0, peers: [],
        accounting: { ...RankAccounting.none(), ...accounting }, ...counts
    };
}

function world(schemaVersion: number, ...ranks: RankSnapshot[]): WorldSnapshot {
    const node: NodeSnapshot = {
        host: 'alpha', socketCount: 1, physicalCores: 4, logicalCores: 4, hasLiveMemory: false, memTotalBytes: 0, memUsedBytes: 0, sentinelRank: 0,
        sentinelLocalMillis: 0, nodeUtilPct: 0, sockets: [{ socketId: 0, physicalCores: 4, logicalCores: 4, cpuIds: [], hasTopology: false, coreUsage: [], ranks }]
    };
    return { ...WorldSnapshot.empty(), schemaVersion, nodes: [node] };
}

const worker = (id: number, role: SchedulerRole = 'worker') => rank(id, role, { tasksStartedTotal: 500 }, { schedRunningMicros: 9_000, schedWaitingMicros: 1_000 });
const works = (run: WorldSnapshot) => run.nodes[0].sockets[0].ranks.map(each => RankWork.of(run, each));

describe('RankWork', () => {

    it('tells a coordinator on rank 0 that runs no tasks from the workers', () => {
        const run = world(2, rank(0, 'coordinator', {}, { assignCount: 12, coordinatorStateMsgsTotal: 30 }), worker(1), worker(2));
        expect(works(run)).to.deep.equal([
            { runsTasks: false, coordinates: true },
            { runsTasks: true, coordinates: false },
            { runsTasks: true, coordinates: false }
        ]);
    });

    it('finds no coordinator in a run that has none, and rank 0 running tasks like the others', () => {
        const run = world(2, worker(0), worker(1), worker(2));
        expect(works(run).map(work => work.coordinates)).to.deep.equal([false, false, false]);
        expect(works(run)[0].runsTasks).to.equal(true);
    });

    it('finds the coordinator on rank 2 by what it counts, whatever its rank number', () => {
        const run = world(2, worker(0), worker(1), rank(2, 'coordinator', {}, { coordinatorStateMsgsTotal: 8 }));
        expect(works(run)).to.deep.equal([
            { runsTasks: true, coordinates: false },
            { runsTasks: true, coordinates: false },
            { runsTasks: false, coordinates: true }
        ]);
    });

    it('shows a rank that coordinates and runs tasks doing both, whatever role it declares', () => {
        const both = rank(0, 'worker', { tasksStartedTotal: 40, schedulerPendingCount: 3 });
        expect(RankWork.of(world(2, both), both)).to.deep.equal({ runsTasks: true, coordinates: true });
    });

    it('counts a worker still waiting for its first task as running tasks, and a rank that has done nothing yet as neither', () => {
        const waiting = rank(1, 'worker', {}, { schedWaitingMicros: 500 });
        const idle = rank(2, 'coordinator');
        expect([RankWork.of(undefined, waiting), RankWork.of(undefined, idle)]).to.deep.equal([
            { runsTasks: true, coordinates: false },
            { runsTasks: false, coordinates: false }
        ]);
    });

    it('keeps schema 1\'s rule, which counts too little to tell: rank 0 coordinates once the run has other ranks', () => {
        const schema1 = (id: number): RankSnapshot => ({ ...worker(id), role: undefined, accounting: undefined });
        expect(works(world(1, schema1(0), schema1(1)))).to.deep.equal([
            { runsTasks: false, coordinates: true },
            { runsTasks: true, coordinates: false }
        ]);
        expect(works(world(1, schema1(0))), 'a run of one rank').to.deep.equal([{ runsTasks: true, coordinates: false }]);
    });
});
