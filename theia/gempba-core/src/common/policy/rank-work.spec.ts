import { expect } from 'chai';
import { RankSnapshot, SchedulerRole } from '../model/rank-snapshot';
import { RankAccounting } from '../model/run-setup';
import { RankWork } from './rank-work';

/** A schema-2 rank: its declared role, and the counters it filled, the rest at 0. */
function rank(id: number, role: SchedulerRole, counts: Partial<RankSnapshot> = {}, accounting: Partial<RankAccounting> = {}): RankSnapshot {
    return {
        id, seqNo: 1, localMillis: 0, pid: 0, sentinel: false, role, allowedCpuIds: [], tasksStartedTotal: 0, tasksRunning: 0, tasksSentTotal: 0,
        tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerThread: 0, cpuPct: 0, rssBytes: 0, threads: 1, elapsedSeconds: 0, peers: [],
        accounting: { ...RankAccounting.none(), ...accounting }, ...counts
    };
}

const worker = (id: number, role: SchedulerRole = 'worker') => rank(id, role, { tasksStartedTotal: 500 }, { schedRunningMicros: 9_000, schedWaitingMicros: 1_000 });
const works = (...ranks: RankSnapshot[]) => ranks.map(each => RankWork.of(each));

describe('RankWork', () => {

    it('tells a coordinator on rank 0 that runs no tasks from the workers', () => {
        expect(works(rank(0, 'coordinator', {}, { assignCount: 12, coordinatorStateMsgsTotal: 30 }), worker(1), worker(2))).to.deep.equal([
            { runsTasks: false, coordinates: true },
            { runsTasks: true, coordinates: false },
            { runsTasks: true, coordinates: false }
        ]);
    });

    it('finds no coordinator in a run that has none, and rank 0 running tasks like the others', () => {
        expect(works(worker(0), worker(1), worker(2)).map(work => work.coordinates)).to.deep.equal([false, false, false]);
        expect(works(worker(0))[0].runsTasks).to.equal(true);
    });

    it('finds the coordinator on rank 2 by what it counts, whatever its rank number', () => {
        expect(works(worker(0), worker(1), rank(2, 'coordinator', {}, { coordinatorStateMsgsTotal: 8 }))).to.deep.equal([
            { runsTasks: true, coordinates: false },
            { runsTasks: true, coordinates: false },
            { runsTasks: false, coordinates: true }
        ]);
    });

    it('shows a rank that coordinates and runs tasks doing both, whatever role it declares', () => {
        const both = rank(0, 'worker', { tasksStartedTotal: 40, schedulerPendingCount: 3 });
        expect(RankWork.of(both)).to.deep.equal({ runsTasks: true, coordinates: true });
    });

    it('counts a worker still waiting for its first task as running tasks, and a rank that has done nothing yet as neither', () => {
        const waiting = rank(1, 'worker', {}, { schedWaitingMicros: 500 });
        const idle = rank(2, 'coordinator');
        expect([RankWork.of(waiting), RankWork.of(idle)]).to.deep.equal([
            { runsTasks: true, coordinates: false },
            { runsTasks: false, coordinates: false }
        ]);
    });
});
