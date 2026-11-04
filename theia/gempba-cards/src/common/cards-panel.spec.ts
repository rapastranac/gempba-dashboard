import { expect } from 'chai';
import {
    NodeHistoryStore, NodeSeries, NodeSnapshot, SocketSnapshot, StructureKey, TaskWords, WorkerHistoryStore, WorkerSeries, WorkerSnapshot, WorldSnapshot
} from '@gempba/core';
import { CardsPanel } from './cards-panel';

const GiB = 1024 ** 3;

function worker(overrides: Partial<WorkerSnapshot> = {}): WorkerSnapshot {
    return {
        workerId: 3, seqNo: 17, localMillis: 0, pid: 4100, sentinel: false, allowedCpuIds: [0, 1, 2, 3],
        tasksLocalTotal: 12_000, tasksRunning: 3, tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 2, idleMicrosPerWorker: 0,
        cpuPct: 300, rssBytes: 256 * 1024 ** 2, threads: 5, elapsedSeconds: 100, peers: [], ...overrides
    };
}

function socket(overrides: Partial<SocketSnapshot> = {}): SocketSnapshot {
    return {
        socketId: 0, name: 'Xeon', physicalCores: 4, logicalCores: 8, cpuIds: [0, 1, 2, 3, 4, 5, 6, 7], hasTopology: true,
        coreUsage: [{ workerId: 3, cpuPct: 300, accessibleCores: 4, socketCores: 8 }], workers: [worker()], ...overrides
    };
}

function node(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
    return {
        host: 'alpha', socketCount: 1, physicalCores: 4, logicalCores: 8, hasLiveMemory: true, memTotalBytes: 16 * GiB,
        memUsedBytes: 4 * GiB, sentinelWorkerId: 3, sentinelLocalMillis: 0, nodeUtilPct: 75, sockets: [socket()], ...overrides
    };
}

function histories(overrides: Partial<{ node: NodeSeries, worker: WorkerSeries, throughput: number[] }> = {}): CardsPanel.Histories {
    return {
        node: () => overrides.node ?? { cpu: [50, 75], mem: [3 * GiB, 4 * GiB], cpuLatest: 75, memUsedLatest: 4 * GiB, memTotalLatest: 16 * GiB },
        worker: () => overrides.worker ?? { cpu: [280, 300], tasksPerSecond: [110, 120], idlePct: [10, 12.4], rssBytes: [250 * 1024 ** 2, 256 * 1024 ** 2] },
        throughput: () => overrides.throughput ?? [100, 100, 100, 100, 100, 130, 130, 130, 130, 130]
    };
}

function world(...nodes: NodeSnapshot[]): WorldSnapshot {
    return { schemaVersion: 1, timestampMillis: 0, elapsedSeconds: 100, nodes, structure: StructureKey.empty() };
}

describe('CardsPanel', () => {

    describe('a node', () => {

        it('heads with its host and the hardware no figure shows', () => {
            const panel = CardsPanel.forNode(node(), histories());
            expect([panel.title, panel.subtitle]).to.deep.equal(['alpha', '1 socket · 4 physical / 8 logical cores · sentinel: worker 3']);
            expect(CardsPanel.nodeFacts(node({ socketCount: 0, physicalCores: 0, logicalCores: 0 }))).to.equal('sentinel: worker 3');
        });

        it('gauges the CPU of its allocation', () => {
            expect(CardsPanel.forNode(node(), histories()).gauge).to.deep.equal({ label: 'CPU of the allocation', fraction: 0.75, valueText: '75%', tone: 'cpu' });
        });

        it('heads with its tasks started per second and their trend, the cores busy, and its memory', () => {
            const [tasks, cores, memory] = CardsPanel.forNode(node(), histories()).heroes;
            expect(tasks).to.deep.equal({
                label: 'Tasks started', value: '130', unit: '/s', trend: { direction: 'up', change: 0.3 }, tone: 'tasks', detail: 'run average 120 tasks/s',
                hint: TaskWords.STARTED_HINT
            });
            expect(cores).to.deep.equal({ label: 'Cores busy', value: '3.0', unit: 'of 4', detail: '1 worker' });
            expect(memory).to.include({ label: 'Memory', value: '4.0', unit: 'GB', detail: 'of 16.0 GB', tone: 'memory' });
        });

        it('counts every core when no worker is restricted', () => {
            const unrestricted = node({ sockets: [socket({ workers: [worker({ allowedCpuIds: [] })] })] });
            expect(CardsPanel.forNode(unrestricted, histories()).heroes[1].unit).to.equal('of 8');
        });

        it('shows no rate before the workers sent two frames', () => {
            const [tasks] = CardsPanel.forNode(node(), histories({ throughput: [] })).heroes;
            expect([tasks.value, tasks.unit]).to.deep.equal(['—', undefined]);
            expect(CardsPanel.forNode(node(), histories({ throughput: [] })).charts[2].latest).to.equal('—');
        });

        it('takes memory from the node frame before the history has any, and leaves it out when unknown', () => {
            const fresh = histories({ node: NodeSeries.empty() });
            expect(CardsPanel.forNode(node(), fresh).heroes[2]).to.include({ value: '4.0', detail: 'of 16.0 GB' });
            expect(CardsPanel.forNode(node({ memTotalBytes: 0, hasLiveMemory: false }), fresh).heroes.map(hero => hero.label)).to.not.include('Memory');
        });

        it('charts CPU on a 0–100 scale, memory up to the total, and tasks started on a round scale', () => {
            const charts = CardsPanel.forNode(node(), histories()).charts;
            expect(charts.map(chart => chart.capacity)).to.deep.equal([NodeHistoryStore.CAPACITY, NodeHistoryStore.CAPACITY, WorkerHistoryStore.CAPACITY]);
            expect(charts.map(chart => [chart.title, chart.latest, chart.max, chart.tone])).to.deep.equal([
                ['CPU', '75%', 100, 'cpu'], ['Memory', '4.0 GB', 16 * GiB, 'memory'], ['Tasks started', '130 tasks/s', undefined, 'tasks']
            ]);
        });

        it('counts slow tasks per minute, the chart in one unit for its whole history', () => {
            const panel = CardsPanel.forNode(node(), histories({ throughput: [0.1, 0.2] }));
            expect(panel.heroes[0]).to.include({ value: '12', unit: '/min' });
            expect([panel.charts[2].latest, panel.charts[2].values]).to.deep.equal(['12 tasks/min', [6, 12]]);
            const mixed = CardsPanel.forNode(node(), histories({ throughput: [2, 0.5] })).charts[2];
            expect([mixed.latest, mixed.values]).to.deep.equal(['0.50 tasks/s', [2, 0.5]]);
        });

        it('has a heat strip per socket with topology, a cell per CPU in the socket\'s order', () => {
            const strips = CardsPanel.forNode(node({ sockets: [socket(), socket({ socketId: 1, cpuIds: [], hasTopology: false, workers: [] })] }), histories()).strips;
            expect(strips.map(strip => strip.title)).to.deep.equal(['Socket 0: Xeon']);
            // worker 3 runs 300% over its four allowed CPUs, 0-3
            expect(strips[0].cells.map(cell => [cell.key, cell.loadPct])).to.deep.equal([[0, 75], [1, 75], [2, 75], [3, 75], [4, 0], [5, 0], [6, 0], [7, 0]]);
            expect(strips[0].cells[0].title).to.equal('CPU 0: 75% (estimated)');
        });

        it('marks an oversubscribed CPU in its cell', () => {
            const crowded = node({ sockets: [socket({ workers: [worker({ allowedCpuIds: [0], cpuPct: 150 })], coreUsage: [] })] });
            const cell = CardsPanel.forNode(crowded, histories()).strips[0].cells[0];
            expect([cell.oversubscribed, cell.title]).to.deep.equal([true, 'CPU 0: 150%, oversubscribed (estimated)']);
        });
    });

    describe('a socket', () => {

        it('gauges its CPU and heads with the cores busy and its workers', () => {
            const panel = CardsPanel.forSocket(undefined, node(), socket());
            expect([panel.title, panel.subtitle]).to.deep.equal(['Socket 0: Xeon', 'on alpha · 4 physical / 8 logical cores · CPUs 0–7']);
            expect(panel.gauge).to.deep.equal({ label: 'CPU of the socket', fraction: 3 / 8, valueText: '38%', tone: 'cpu' });
            expect(panel.heroes).to.deep.equal([{ label: 'Cores busy', value: '3.0', unit: 'of 8' }, { label: 'Workers', value: '1' }]);
            expect(panel.strips).to.have.lengthOf(1);
        });

        it('has a bar per worker, its CPU as a share of the cores it may use, as its gauge reads', () => {
            const two = socket({ workers: [worker(), worker({ workerId: 4, cpuPct: 50, allowedCpuIds: [] })] });
            expect(CardsPanel.forSocket(undefined, node(), two).bars[0].rows).to.deep.equal([
                { label: 'Worker 3', fraction: 0.75, valueText: '75% of 4 cores', tone: 'cpu' },
                { label: 'Worker 4', fraction: 50 / 800, valueText: '6% of 8 cores', tone: 'cpu' }
            ]);
        });

        it('has no gauge without topology', () => {
            expect(CardsPanel.forSocket(undefined, node(), socket({ logicalCores: 0, cpuIds: [], hasTopology: false })).gauge).to.equal(undefined);
        });
    });

    describe('a worker', () => {

        it('heads with its title, and its process, frame and node', () => {
            const panel = CardsPanel.forWorker(world(node()), socket(), worker(), histories());
            expect([panel.title, panel.subtitle]).to.deep.equal(['Worker 3', 'PID 4100 · frame #17 · on alpha']);
        });

        it('gauges the CPU of the cores it may use', () => {
            expect(CardsPanel.forWorker(undefined, socket(), worker(), histories()).gauge)
                .to.deep.equal({ label: 'CPU on 4 cores', fraction: 0.75, tone: 'cpu', valueText: '75%' });
        });

        it('heads with its tasks started per second, idle time and memory', () => {
            const [tasks, idle, memory] = CardsPanel.forWorker(undefined, socket(), worker(), histories()).heroes;
            expect(tasks).to.include({ label: 'Tasks started', value: '120', unit: '/s', detail: 'run average 120 tasks/s', tone: 'tasks' });
            expect(idle).to.include({ label: 'Idle', value: '12', unit: '%', tone: 'idle' });
            expect(memory).to.include({ value: '256.0', unit: 'MB', tone: 'memory' });
        });

        it('charts its tasks started, idle time and CPU, the CPU as a share of its cores as the gauge reads it', () => {
            const charts = CardsPanel.forWorker(undefined, socket(), worker(), histories()).charts;
            expect(charts.map(chart => [chart.title, chart.latest, chart.max]))
                .to.deep.equal([['Tasks started', '120 tasks/s', undefined], ['Idle', '12%', 100], ['CPU', '75% of 4 cores', 100]]);
            expect(charts[2].values).to.deep.equal([70, 75]);
        });

        it('meters its thread pool: the tasks running of its threads', () => {
            const [pool] = CardsPanel.forWorker(undefined, socket(), worker(), histories()).bars;
            expect(pool).to.deep.equal({ title: 'Thread pool', rows: [{ label: 'Running', fraction: 0.75, valueText: '3 of 4 threads', tone: 'tasks' }] });
        });

        it('shows a queue only where gempba reports one: at the centralized center', () => {
            expect(CardsPanel.forWorker(undefined, socket(), worker({ schedulerPendingCount: 0 }), histories()).heroes.map(hero => hero.label))
                .to.not.include('Queued');
            const center = CardsPanel.forWorker(undefined, socket(), worker({ workerId: 0, schedulerPendingCount: 1200 }), histories());
            expect(center.heroes[3]).to.deep.equal({ label: 'Queued', value: '1,200', unit: 'tasks', detail: 'waiting for idle workers', tone: 'network' });
        });

        it('totals what no figure shows: tasks started, sent and received with their run averages, and the pool\'s idle time', () => {
            const totals = CardsPanel.forWorker(undefined, socket(), worker({ tasksSentTotal: 30, idleMicrosPerWorker: 4_500_000 }), histories()).totals;
            expect(totals).to.deep.equal([
                { label: 'Tasks started', value: '12,000 · 120 tasks/s on average', hint: TaskWords.STARTED_HINT },
                { label: 'Tasks sent', value: '30 · 18 tasks/min on average', hint: TaskWords.SENT_HINT },
                { label: 'Tasks received', value: '0', hint: TaskWords.RECEIVED_HINT },
                { label: 'Pool idle', value: '4.5 s per thread' }
            ]);
        });

        it('shows the center as the center: no tasks started, idle time or pool; its CPU, memory, and the tasks it sent and received', () => {
            const center = worker({ workerId: 0, tasksLocalTotal: 0, tasksSentTotal: 1, schedulerPendingCount: 0 });
            const shared = socket({ workers: [center, worker()] });
            const panel = CardsPanel.forWorker(world(node({ sockets: [shared] })), shared, center, histories());
            expect([panel.title, panel.subtitle]).to.deep.equal(['Worker 0 · center', 'schedules the run, runs no tasks · PID 4100 · frame #17 · on alpha']);
            expect(panel.heroes.map(hero => hero.label)).to.deep.equal(['Memory']);
            expect(panel.charts.map(chart => chart.title)).to.deep.equal(['CPU']);
            expect(panel.bars).to.deep.equal([]);
            expect(panel.totals.map(total => [total.label, total.value])).to.deep.equal([['Tasks sent', '1 · 0.60 tasks/min on average'], ['Tasks received', '0']]);
        });

        it('marks the center among the workers of a socket', () => {
            const shared = socket({ workers: [worker({ workerId: 0 }), worker()] });
            const labels = CardsPanel.forSocket(world(node({ sockets: [shared] })), node({ sockets: [shared] }), shared).bars[0].rows.map(row => row.label);
            expect(labels).to.deep.equal(['Worker 0 · center', 'Worker 3']);
        });

        it('never meters more tasks running than threads', () => {
            const [pool] = CardsPanel.forWorker(undefined, socket(), worker({ tasksRunning: 4, threads: 4 }), histories()).bars;
            expect(pool.rows[0]).to.deep.equal({ label: 'Running', fraction: 1, valueText: '4 of 4 threads', tone: 'tasks' });
        });

        it('lists its five busiest peers, with their nodes, against the busiest', () => {
            const peers = [1, 2, 4, 5, 6, 7].map(id => ({ peerWorkerId: id, count: id * 10, bytes: id * 1024 }));
            const other = node({ host: 'beta', sockets: [socket({ workers: [worker({ workerId: 7 })] })] });
            const busiest = CardsPanel.forWorker(world(node(), other), socket(), worker({ peers }), histories()).bars[1];
            expect([busiest.title, busiest.peers]).to.deep.equal(['Busiest peers', true]);
            expect(busiest.rows.map(row => [row.label, row.fraction, row.valueText])).to.deep.equal([
                ['Worker 7 · beta', 1, '70 tasks · 7.0 KB'], ['Worker 6', 6 / 7, '60 tasks · 6.0 KB'], ['Worker 5', 5 / 7, '50 tasks · 5.0 KB'],
                ['Worker 4', 4 / 7, '40 tasks · 4.0 KB'], ['Worker 2', 2 / 7, '20 tasks · 2.0 KB']
            ]);
        });

        it('has no peers panel without peers', () => {
            expect(CardsPanel.forWorker(undefined, socket(), worker(), histories()).bars.map(bars => bars.title)).to.deep.equal(['Thread pool']);
        });

        it('shows no idle time or rate before two frames', () => {
            const [tasks, idle] = CardsPanel.forWorker(undefined, socket(), worker(), histories({ worker: WorkerSeries.empty() })).heroes;
            expect([tasks.value, idle.value, idle.unit]).to.deep.equal(['—', '—', undefined]);
        });
    });
});
