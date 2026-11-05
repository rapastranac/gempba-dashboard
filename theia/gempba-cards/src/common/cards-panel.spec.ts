import { expect } from 'chai';
import {
    NodeHistoryStore, NodeSeries, NodeSnapshot, RankAccounting, RankHistoryStore, RankSeries, RankSnapshot, SchedulerRole, SocketSnapshot, StructureKey, TaskWords,
    WorldSnapshot
} from '@gempba/core';
import { CardsPanel } from './cards-panel';

const GiB = 1024 ** 3;

function rank(overrides: Partial<RankSnapshot> = {}): RankSnapshot {
    return {
        role: 'worker', accounting: RankAccounting.none(),
        id: 3, seqNo: 17, localMillis: 0, pid: 4100, sentinel: false, allowedCpuIds: [0, 1, 2, 3],
        tasksStartedTotal: 12_000, tasksRunning: 3, tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 2, idleMicrosPerThread: 0,
        cpuPct: 300, rssBytes: 256 * 1024 ** 2, threads: 5, elapsedSeconds: 100, peers: [], ...overrides
    };
}

function socket(overrides: Partial<SocketSnapshot> = {}): SocketSnapshot {
    return {
        socketId: 0, name: 'Xeon', physicalCores: 4, logicalCores: 8, cpuIds: [0, 1, 2, 3, 4, 5, 6, 7], hasTopology: true,
        coreUsage: [{ rank: 3, cpuPct: 300, accessibleCores: 4, socketCores: 8 }], ranks: [rank()], ...overrides
    };
}

function node(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
    return {
        host: 'alpha', socketCount: 1, physicalCores: 4, logicalCores: 8, hasLiveMemory: true, memTotalBytes: 16 * GiB,
        memUsedBytes: 4 * GiB, sentinelRank: 3, sentinelLocalMillis: 0, nodeUtilPct: 75, sockets: [socket()], ...overrides
    };
}

function histories(overrides: Partial<{ node: NodeSeries, rank: RankSeries, throughput: number[] }> = {}): CardsPanel.Histories {
    return {
        node: () => overrides.node ?? { cpu: [50, 75], mem: [3 * GiB, 4 * GiB], cpuLatest: 75, memUsedLatest: 4 * GiB, memTotalLatest: 16 * GiB },
        rank: () => overrides.rank ?? { cpu: [280, 300], tasksPerSecond: [110, 120], idlePct: [10, 12.4], rssBytes: [250 * 1024 ** 2, 256 * 1024 ** 2] },
        throughput: () => overrides.throughput ?? [100, 100, 100, 100, 100, 130, 130, 130, 130, 130]
    };
}

function world(...nodes: NodeSnapshot[]): WorldSnapshot {
    return { runId: '', paused: false, final: false, timestampMillis: 0, elapsedSeconds: 100, nodes, structure: StructureKey.empty() };
}

describe('CardsPanel', () => {

    describe('a node', () => {

        it('heads with its host and the hardware no figure shows', () => {
            const panel = CardsPanel.forNode(node(), histories());
            expect([panel.title, panel.subtitle]).to.deep.equal(['alpha', '1 socket · 4 physical / 8 logical cores · sentinel: rank 3']);
            expect(CardsPanel.nodeFacts(node({ socketCount: 0, physicalCores: 0, logicalCores: 0 }))).to.equal('sentinel: rank 3');
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
            expect(cores).to.deep.equal({ label: 'Cores busy', value: '3.0', unit: 'of 4', detail: '1 rank' });
            expect(memory).to.include({ label: 'Memory', value: '4.0', unit: 'GB', detail: 'of 16.0 GB', tone: 'memory' });
        });

        it('counts every core when no rank is restricted', () => {
            const unrestricted = node({ sockets: [socket({ ranks: [rank({ allowedCpuIds: [] })] })] });
            expect(CardsPanel.forNode(unrestricted, histories()).heroes[1].unit).to.equal('of 8');
        });

        it('shows no rate before the ranks sent two frames', () => {
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
            expect(charts.map(chart => chart.capacity)).to.deep.equal([NodeHistoryStore.CAPACITY, NodeHistoryStore.CAPACITY, RankHistoryStore.CAPACITY]);
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
            const strips = CardsPanel.forNode(node({ sockets: [socket(), socket({ socketId: 1, cpuIds: [], hasTopology: false, ranks: [] })] }), histories()).strips;
            expect(strips.map(strip => strip.title)).to.deep.equal(['Socket 0: Xeon']);
            // rank 3 runs 300% over its four allowed CPUs, 0-3
            expect(strips[0].cells.map(cell => [cell.key, cell.loadPct])).to.deep.equal([[0, 75], [1, 75], [2, 75], [3, 75], [4, 0], [5, 0], [6, 0], [7, 0]]);
            expect(strips[0].cells[0].title).to.equal('CPU 0: 75% (estimated)');
        });

        it('marks an oversubscribed CPU in its cell', () => {
            const crowded = node({ sockets: [socket({ ranks: [rank({ allowedCpuIds: [0], cpuPct: 150 })], coreUsage: [] })] });
            const cell = CardsPanel.forNode(crowded, histories()).strips[0].cells[0];
            expect([cell.oversubscribed, cell.title]).to.deep.equal([true, 'CPU 0: 150%, oversubscribed (estimated)']);
        });
    });

    describe('a socket', () => {

        it('gauges its CPU and heads with the cores busy and its ranks', () => {
            const panel = CardsPanel.forSocket(node(), socket());
            expect([panel.title, panel.subtitle]).to.deep.equal(['Socket 0: Xeon', 'on alpha · 4 physical / 8 logical cores · CPUs 0–7']);
            expect(panel.gauge).to.deep.equal({ label: 'CPU of the socket', fraction: 3 / 8, valueText: '38%', tone: 'cpu' });
            expect(panel.heroes).to.deep.equal([{ label: 'Cores busy', value: '3.0', unit: 'of 8' }, { label: 'Ranks', value: '1' }]);
            expect(panel.strips).to.have.lengthOf(1);
        });

        it('has a bar per rank, its CPU as a share of the cores it may use, as its gauge reads', () => {
            const two = socket({ ranks: [rank(), rank({ id: 4, cpuPct: 50, allowedCpuIds: [] })] });
            expect(CardsPanel.forSocket(node(), two).bars[0].rows).to.deep.equal([
                { label: 'Rank 3', fraction: 0.75, valueText: '75% of 4 cores', tone: 'cpu' },
                { label: 'Rank 4', fraction: 50 / 800, valueText: '6% of 8 cores', tone: 'cpu' }
            ]);
        });

        it('has no gauge without topology', () => {
            expect(CardsPanel.forSocket(node(), socket({ logicalCores: 0, cpuIds: [], hasTopology: false })).gauge).to.equal(undefined);
        });
    });

    describe('a rank', () => {

        it('heads with its title, and its process, frame and node', () => {
            const panel = CardsPanel.forRank(world(node()), socket(), rank(), histories());
            expect([panel.title, panel.subtitle]).to.deep.equal(['Rank 3', 'PID 4100 · frame #17 · on alpha']);
        });

        it('gauges the CPU of the cores it may use', () => {
            expect(CardsPanel.forRank(undefined, socket(), rank(), histories()).gauge)
                .to.deep.equal({ label: 'CPU on 4 cores', fraction: 0.75, tone: 'cpu', valueText: '75%' });
        });

        it('heads with its tasks started per second, idle time and memory', () => {
            const [tasks, idle, memory] = CardsPanel.forRank(undefined, socket(), rank(), histories()).heroes;
            expect(tasks).to.include({ label: 'Tasks started', value: '120', unit: '/s', detail: 'run average 120 tasks/s', tone: 'tasks' });
            expect(idle).to.include({ label: 'Idle', value: '12', unit: '%', tone: 'idle' });
            expect(memory).to.include({ value: '256.0', unit: 'MB', tone: 'memory' });
        });

        it('charts its tasks started, idle time and CPU, the CPU as a share of its cores as the gauge reads it', () => {
            const charts = CardsPanel.forRank(undefined, socket(), rank(), histories()).charts;
            expect(charts.map(chart => [chart.title, chart.latest, chart.max]))
                .to.deep.equal([['Tasks started', '120 tasks/s', undefined], ['Idle', '12%', 100], ['CPU', '75% of 4 cores', 100]]);
            expect(charts[2].values).to.deep.equal([70, 75]);
        });

        it('meters its thread pool: the tasks running of its threads', () => {
            const [pool] = CardsPanel.forRank(undefined, socket(), rank(), histories()).bars;
            expect(pool).to.deep.equal({ title: 'Thread pool', rows: [{ label: 'Running', fraction: 0.75, valueText: '3 of 4 threads', tone: 'tasks' }] });
        });

        it('shows a queue only where gempba reports one: at the centralized coordinator', () => {
            expect(CardsPanel.forRank(undefined, socket(), rank({ schedulerPendingCount: 0 }), histories()).heroes.map(hero => hero.label))
                .to.not.include('Queued');
            const coordinator = CardsPanel.forRank(undefined, socket(), rank({ id: 0, schedulerPendingCount: 1200 }), histories());
            expect(coordinator.heroes[3]).to.deep.equal({ label: 'Queued', value: '1,200', unit: 'tasks', detail: 'waiting for idle workers', tone: 'network' });
        });

        it('totals what no figure shows: tasks started, sent and received with their run averages, the bytes moved, and the pool\'s idle time', () => {
            const totals = CardsPanel.forRank(undefined, socket(), rank({ tasksSentTotal: 30, idleMicrosPerThread: 4_500_000 }), histories()).totals;
            expect(totals.map(total => [total.label, total.value])).to.deep.equal([
                ['Tasks started', '12,000 · 120 tasks/s on average'], ['Tasks sent', '30 · 18 tasks/min on average'], ['Tasks received', '0'],
                ['Bytes sent', '0 B in 0 µs'], ['Bytes received', '0 B in 0 µs'], ['Pool idle', '4.5 s per thread: 0 µs starved, 0 µs imbalanced']
            ]);
            expect(totals.slice(0, 3).map(total => total.hint)).to.deep.equal([TaskWords.STARTED_HINT, TaskWords.SENT_HINT, TaskWords.RECEIVED_HINT]);
        });

        it('marks the coordinator among the ranks of a socket', () => {
            const shared = socket({ ranks: [rank({ id: 0, role: 'coordinator' }), rank()] });
            const labels = CardsPanel.forSocket(node({ sockets: [shared] }), shared).bars[0].rows.map(row => row.label);
            expect(labels).to.deep.equal(['Rank 0 · coordinator · aggregator', 'Rank 3']);
        });

        describe('by what it counts', () => {

            /** A rank: its declared role and the counters it filled, the rest at 0. */
            function counted(role: SchedulerRole, overrides: Partial<RankSnapshot>, accounting: Partial<RankAccounting>): RankSnapshot {
                return rank({ role, accounting: { ...RankAccounting.none(), bytesSentTotal: 2048, sendMicrosTotal: 1500, ...accounting }, ...overrides });
            }

            const coordinator = counted('coordinator', { id: 2, tasksStartedTotal: 0, schedulerPendingCount: 5 },
                { assignCount: 4, assignLatencyMicrosTotal: 2000, assignLatencyMicrosMax: 900, coordinatorStateMsgsTotal: 30 });
            const worker = counted('worker', { idleMicrosPerThread: 4_500_000, schedulerPendingCount: 0 },
                { idleMicrosStarved: 3_000_000, idleMicrosImbalanced: 1_500_000, schedRunningMicros: 8_000_000, schedWaitingMicros: 2_000_000 });
            const panelOf = (subject: RankSnapshot) => {
                const shared = socket({ ranks: [subject] });
                return CardsPanel.forRank(world(node({ sockets: [shared] })), shared, subject, histories());
            };
            const labels = (items: readonly { label: string }[]) => items.map(item => item.label);

            it('shows a coordinator on any rank its queue, assignments and reports, and no task figures', () => {
                const panel = panelOf(coordinator);
                expect(panel.title).to.equal('Rank 2 · coordinator');
                expect(panel.subtitle).to.match(/^schedules the run, runs no tasks · /);
                expect([labels(panel.heroes), labels(panel.charts.map(chart => ({ label: chart.title }))), panel.bars]).to.deep.equal([['Memory', 'Queued'], ['CPU'], []]);
                expect(panel.totals.map(total => [total.label, total.value])).to.deep.equal([
                    ['Tasks sent', '0'], ['Tasks received', '0'], ['Bytes sent', '2.0 KB in 1.5 ms'], ['Bytes received', '0 B in 0 µs'],
                    ['Assignments', '4 · 500 µs mean, 900 µs max'], ['Reports handled', '30']
                ]);
            });

            it('shows a worker its task figures, where its pool\'s idle time goes and how long it waited for work, and no coordinator counters', () => {
                const panel = panelOf(worker);
                expect([panel.title, labels(panel.heroes)]).to.deep.equal(['Rank 3', ['Tasks started', 'Idle', 'Memory']]);
                expect(labels(panel.totals)).to.deep.equal(['Tasks started', 'Tasks sent', 'Tasks received', 'Bytes sent', 'Bytes received', 'Pool idle', 'Waiting for work']);
                expect(panel.totals.slice(-2).map(total => total.value)).to.deep.equal(['4.5 s per thread: 3.0 s starved, 1.5 s imbalanced', '2.0 s']);
            });

            it('shows both on a rank that coordinates and runs tasks', () => {
                const both = counted('worker', { schedulerPendingCount: 3 }, { schedWaitingMicros: 1000, assignCount: 2, assignLatencyMicrosTotal: 40 });
                const panel = panelOf(both);
                expect(labels(panel.heroes)).to.deep.equal(['Tasks started', 'Idle', 'Memory', 'Queued']);
                expect(labels(panel.totals)).to.include.members(['Pool idle', 'Waiting for work', 'Assignments']);
                expect(panel.subtitle).to.not.match(/schedules the run/);
            });

            it('hides a scheduler counter while it is 0', () => {
                const fresh = counted('worker', {}, { schedRunningMicros: 1, schedWaitingMicros: 0 });
                expect(labels(panelOf(fresh).totals)).to.not.include('Waiting for work');
                const unassigned = counted('coordinator', { tasksStartedTotal: 0 }, { coordinatorStateMsgsTotal: 1 });
                expect(labels(panelOf(unassigned).totals).slice(-1)).to.deep.equal(['Reports handled']);
            });

            it('shows a rank that has done nothing yet its memory and CPU alone', () => {
                const panel = panelOf(counted('worker', { tasksStartedTotal: 0, schedulerPendingCount: 0 }, {}));
                expect([labels(panel.heroes), panel.charts.map(chart => chart.title), panel.bars]).to.deep.equal([['Memory'], ['CPU'], []]);
                expect(labels(panel.totals)).to.deep.equal(['Tasks sent', 'Tasks received', 'Bytes sent', 'Bytes received']);
                expect(panel.subtitle).to.not.match(/schedules the run/);
            });
        });

        it('never meters more tasks running than threads', () => {
            const [pool] = CardsPanel.forRank(undefined, socket(), rank({ tasksRunning: 4, threads: 4 }), histories()).bars;
            expect(pool.rows[0]).to.deep.equal({ label: 'Running', fraction: 1, valueText: '4 of 4 threads', tone: 'tasks' });
        });

        it('lists its five busiest peers, with their nodes, against the busiest', () => {
            const peers = [1, 2, 4, 5, 6, 7].map(id => ({ peerRank: id, count: id * 10, bytes: id * 1024 }));
            const other = node({ host: 'beta', sockets: [socket({ ranks: [rank({ id: 7 })] })] });
            const busiest = CardsPanel.forRank(world(node(), other), socket(), rank({ peers }), histories()).bars[1];
            expect([busiest.title, busiest.peers]).to.deep.equal(['Busiest peers', true]);
            expect(busiest.rows.map(row => [row.label, row.fraction, row.valueText])).to.deep.equal([
                ['Rank 7 · beta', 1, '70 tasks · 7.0 KB'], ['Rank 6', 6 / 7, '60 tasks · 6.0 KB'], ['Rank 5', 5 / 7, '50 tasks · 5.0 KB'],
                ['Rank 4', 4 / 7, '40 tasks · 4.0 KB'], ['Rank 2', 2 / 7, '20 tasks · 2.0 KB']
            ]);
        });

        it('has no peers panel without peers', () => {
            expect(CardsPanel.forRank(undefined, socket(), rank(), histories()).bars.map(bars => bars.title)).to.deep.equal(['Thread pool']);
        });

        it('shows no idle time or rate before two frames', () => {
            const [tasks, idle] = CardsPanel.forRank(undefined, socket(), rank(), histories({ rank: RankSeries.empty() })).heroes;
            expect([tasks.value, idle.value, idle.unit]).to.deep.equal(['—', '—', undefined]);
        });
    });
});
