import { expect } from 'chai';
import { NodeSnapshot, SocketSnapshot, WorkerSnapshot, WorldSnapshot } from '@gempba/core';
import { CardsText } from './cards-text';

const GiB = 1024 ** 3;

function worker(overrides: Partial<WorkerSnapshot> = {}): WorkerSnapshot {
    return {
        workerId: 3, seqNo: 17, localMillis: 0, pid: 4100, sentinel: false, allowedCpuIds: [0, 1, 2, 3],
        tasksLocalTotal: 12450, tasksRunning: 1, tasksSentTotal: 619, tasksRecvTotal: 0, schedulerPendingCount: 2, idleMicrosPerWorker: 238,
        cpuPct: 87.3, rssBytes: 256 * 1024 ** 2, threads: 12, elapsedSeconds: 100,
        peers: [{ peerWorkerId: 1, bytes: 4096, count: 3 }], ...overrides
    };
}

function socket(overrides: Partial<SocketSnapshot> = {}): SocketSnapshot {
    return {
        socketId: 0, name: 'Xeon', physicalCores: 4, logicalCores: 8, cpuIds: [0, 1, 2, 3, 4, 5, 6, 7], hasTopology: true,
        coreUsage: [{ workerId: 3, cpuPct: 87.3, accessibleCores: 4, socketCores: 8 }], workers: [worker(), worker({ workerId: 4 })], ...overrides
    };
}

function node(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
    return {
        host: 'alpha', socketCount: 2, physicalCores: 8, logicalCores: 16, hasLiveMemory: true, memTotalBytes: 16 * GiB,
        memUsedBytes: 4 * GiB, sentinelWorkerId: 0, sentinelLocalMillis: 0, nodeUtilPct: 50, sockets: [], ...overrides
    };
}

describe('CardsText', () => {

    it('captions tree rows briefly', () => {
        expect(CardsText.nodeCaption(node({ sockets: [socket(), socket({ socketId: 1, workers: [] })] }))).to.equal('2 sockets · 2 workers');
        expect(CardsText.socketTitle(socket())).to.equal('Socket 0: Xeon');
        expect(CardsText.socketTitle(socket({ hasTopology: false }))).to.equal('Socket 0');
        expect(CardsText.socketCaption(socket({ workers: [worker()] }))).to.equal('1 worker');
        expect(CardsText.workerTitle(worker())).to.equal('Worker 3');
        expect(CardsText.workerTitle(worker({ workerId: 0, sentinel: true }))).to.equal('Worker 0 · sentinel');
        expect(CardsText.workerCaption(worker(), 4)).to.equal('22% CPU · 256.0 MB');
    });

    it('subtitles a worker with its process, frame and node', () => {
        expect(CardsText.workerSubtitle('alpha', worker())).to.equal('PID 4100 · frame #17 · on alpha');
        expect(CardsText.workerSubtitle('alpha', worker({ pid: 0 }))).to.equal('frame #17 · on alpha');
    });

    it('lists outgoing peers busiest first, with the node each runs on', () => {
        const sender = worker({
            peers: [{ peerWorkerId: 4, bytes: 2048, count: 3 }, { peerWorkerId: 9, bytes: 1024 ** 2, count: 1200 }, { peerWorkerId: 7, bytes: 10, count: 3 }]
        });
        const world = {
            nodes: [node({ host: 'alpha', sockets: [socket()] }), node({ host: 'beta', sockets: [socket({ workers: [worker({ workerId: 9 })] })] })]
        } as unknown as WorldSnapshot;
        expect(CardsText.peerRows(sender, world)).to.deep.equal([
            { peer: 'Worker 9', host: 'beta', tasks: '1,200', bytes: '1.0 MB' },
            { peer: 'Worker 4', host: 'alpha', tasks: '3', bytes: '2.0 KB' },
            { peer: 'Worker 7', host: '—', tasks: '3', bytes: '10 B' }
        ]);
    });
});
