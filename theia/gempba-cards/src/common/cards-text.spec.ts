import { expect } from 'chai';
import { NodeSeries, NodeSnapshot, Rates, SocketSnapshot, WorkerSnapshot, WorldSnapshot } from '@gempba/core';
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
        memUsedBytes: 4 * GiB, sentinelWorkerId: 0, nodeUtilPct: 50, sockets: [], ...overrides
    };
}

function rows(details: CardsText.Details): Map<string, string> {
    return new Map(details.sections.flatMap(section => section.rows.map(row => [row.label, row.value] as [string, string])));
}

describe('CardsText', () => {

    it('captions tree rows briefly', () => {
        expect(CardsText.nodeCaption(node({ sockets: [socket(), socket({ socketId: 1, workers: [] })] }))).to.equal('2 sockets · 2 workers');
        expect(CardsText.socketTitle(socket())).to.equal('Socket 0: Xeon');
        expect(CardsText.socketTitle(socket({ hasTopology: false }))).to.equal('Socket 0');
        expect(CardsText.socketCaption(socket({ workers: [worker()] }))).to.equal('1 worker');
        expect(CardsText.workerTitle(worker())).to.equal('Worker 3');
        expect(CardsText.workerTitle(worker({ workerId: 0, sentinel: true }))).to.equal('Worker 0 · sentinel');
        expect(CardsText.workerCaption(worker())).to.equal('87.3 % CPU · 256.0 MB');
    });

    it('details a node, keeping the last live memory between node frames', () => {
        const none = NodeSeries.empty();
        const live = CardsText.nodeDetails(node({ sockets: [socket()] }), none);
        expect(live.title).to.equal('alpha');
        expect(live.sections.map(section => section.title)).to.deep.equal(['Hardware', 'Activity']);
        expect(rows(live).get('Cores')).to.equal('8 physical / 16 logical cores');
        expect(rows(live).get('Memory')).to.equal('4.0 GB used of 16.0 GB');
        expect(rows(live).get('CPU')).to.equal('50.0 % of its allocated cores');
        expect(rows(live).get('Sentinel')).to.equal('Worker 0');
        // Worker frames come more often than node frames: a snapshot without one keeps the history's last memory and its CPU.
        const history: NodeSeries = { cpu: [50], cpuLatest: 50, memUsedLatest: 6 * GiB, memTotalLatest: 16 * GiB };
        const between = rows(CardsText.nodeDetails(node({ hasLiveMemory: false }), history));
        expect(between.get('Memory')).to.equal('6.0 GB used of 16.0 GB');
        expect(between.get('CPU')).to.equal('50.0 % of its allocated cores');
        const topologyOnly = rows(CardsText.nodeDetails(node({ hasLiveMemory: false, physicalCores: 0, logicalCores: 1 }), none));
        expect(topologyOnly.get('Memory')).to.equal('16.0 GB total memory');
        expect(topologyOnly.get('Cores')).to.equal('1 logical core');
        const unknown = CardsText.nodeDetails(node({ hasLiveMemory: false, memTotalBytes: 0, socketCount: 0, physicalCores: 0, logicalCores: 0, sockets: [socket()] }), none);
        expect(unknown.sections.map(section => section.title)).to.deep.equal(['Activity']);
        expect(unknown.subtitle).to.equal('1 socket · 2 workers');
    });

    it('details a socket and how each worker uses its cores', () => {
        const details = CardsText.socketDetails('alpha', socket());
        expect(details.subtitle).to.equal('on alpha');
        expect(rows(details).get('Cores')).to.equal('4 physical / 8 logical cores');
        expect(rows(details).get('CPU ids')).to.equal('0–7');
        expect(rows(details).get('Worker 3')).to.equal('87.3 % CPU · can use 4 of 8 cores · currently using ≈ 0.87 cores');
        const bare = CardsText.socketDetails('alpha', socket({ hasTopology: false, coreUsage: [] }));
        expect(bare.sections.map(section => section.title)).to.deep.equal(['Topology']);
        expect([...rows(bare).keys()]).to.deep.equal(['Workers']);
    });

    it('details a worker in the Java card\'s sections and order', () => {
        const details = CardsText.workerDetails('alpha', worker());
        expect(details.subtitle).to.equal('PID 4100 · frame #17 · on alpha');
        expect(CardsText.workerDetails('alpha', worker({ pid: 0 })).subtitle).to.equal('frame #17 · on alpha');
        expect(details.sections.map(section => [section.title, section.rows.map(row => row.label)])).to.deep.equal([
            ['Local work', ['Tasks completed', 'Tasks running']],
            ['Remote work', ['Received from peers', 'Sent to peers', CardsText.OUTGOING_PEERS, 'IPC queue']],
            ['Process', ['CPU', 'Memory', 'Threads', 'Pool idle']]
        ]);
        const values = rows(details);
        expect(values.get('Tasks completed')).to.equal(Rates.countWithRate(12450, 100));
        expect(values.get('Tasks running')).to.equal('1 task in pool');
        expect(values.get(CardsText.OUTGOING_PEERS)).to.equal('1 peer · 3 tasks · 4.0 KB total');
        expect(values.get('IPC queue')).to.equal('2 tasks pending');
        expect(values.get('Pool idle')).to.equal('238 µs (cumulative average per pool worker)');
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
