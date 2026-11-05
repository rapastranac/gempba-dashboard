import { expect } from 'chai';
import { NodeSnapshot } from '../model/node-snapshot';
import { PeerSnapshot } from '../model/peer-snapshot';
import { RankSnapshot } from '../model/rank-snapshot';
import { WorldSnapshot } from '../model/world-snapshot';
import { TaskMoves } from './task-moves';

function worker(workerId: number, counts: Partial<RankSnapshot> = {}, peers: PeerSnapshot[] = []): RankSnapshot {
    return {
        id: workerId, seqNo: 1, localMillis: 0, pid: 0, sentinel: false, allowedCpuIds: [], tasksStartedTotal: 0, tasksRunning: 0, tasksSentTotal: 0,
        tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerThread: 0, cpuPct: 0, rssBytes: 0, threads: 1, elapsedSeconds: 0, peers, ...counts
    };
}

function node(host: string, ...workers: RankSnapshot[]): NodeSnapshot {
    return {
        host, socketCount: 1, physicalCores: 4, logicalCores: 4, hasLiveMemory: false, memTotalBytes: 0, memUsedBytes: 0, sentinelRank: 0,
        sentinelLocalMillis: 0, nodeUtilPct: 0, sockets: [{ socketId: 0, physicalCores: 4, logicalCores: 4, cpuIds: [], hasTopology: false, coreUsage: [], ranks: workers }]
    };
}

const peer = (peerWorkerId: number, count: number): PeerSnapshot => ({ peerRank: peerWorkerId, count, bytes: count * 100 });

// gempba's own report for a four-rank run: the coordinator sent the root to rank 1, which handed most of it on
const RUN: WorldSnapshot = {
    ...WorldSnapshot.empty(),
    nodes: [
        node('alpha',
            worker(0, { tasksSentTotal: 1 }, [peer(1, 1)]),
            worker(1, { tasksStartedTotal: 142, tasksSentTotal: 78, tasksRecvTotal: 7 }, [peer(2, 40), peer(3, 38)])),
        node('beta',
            worker(2, { tasksStartedTotal: 3609, tasksSentTotal: 20, tasksRecvTotal: 41 }, [peer(1, 5), peer(3, 15)]),
            worker(3, { tasksStartedTotal: 3537, tasksSentTotal: 19, tasksRecvTotal: 70 }, [peer(1, 2), peer(2, 17)]))
    ]
};

describe('TaskMoves', () => {

    it('sums what every worker started, sent and received', () => {
        expect(TaskMoves.of(RUN)).to.include({ started: 7288, sent: 118, received: 118 });
    });

    it('counts as across nodes only the tasks sent to a process on another node', () => {
        expect(TaskMoves.of(RUN).acrossNodes).to.equal(40 + 38 + 5 + 2);
    });

    it('keeps to one node when given its host', () => {
        expect(TaskMoves.of(RUN, 'alpha')).to.deep.equal({ started: 142, sent: 79, received: 7, acrossNodes: 78 });
        expect(TaskMoves.of(RUN, 'gamma')).to.deep.equal({ started: 0, sent: 0, received: 0, acrossNodes: 0 });
    });

    it('leaves out a peer it cannot place on a node', () => {
        const world: WorldSnapshot = { ...WorldSnapshot.empty(), nodes: [node('alpha', worker(1, { tasksSentTotal: 3 }, [peer(9, 3)]))] };
        expect(TaskMoves.of(world).acrossNodes).to.equal(0);
    });
});
