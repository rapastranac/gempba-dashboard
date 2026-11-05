import { expect } from 'chai';
import { RefreshRates, WorldSnapshot } from '@gempba/core';
import { BroadcastEnvelope, WorkerFrame } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { WorldSnapshotMapper } from '@gempba/telemetry/lib/node/telemetry/world-snapshot-mapper';
import { MockConfig, MockLive, MockScheduler, MockShape } from '../../common/mock-config';
import { MockFault } from '../../common/mock-fault';
import { MockRun, MockWorkerView } from './mock-run';
import { MockScenarioModel } from './mock-scenario';

describe('MockRun', () => {

    const defaults = MockConfig.defaults();
    const TS = 1_700_000_000_000;

    interface Options {
        readonly shape?: Partial<MockShape>;
        readonly scheduler?: MockScheduler;
        readonly seed?: number;
        readonly rates?: RefreshRates;
    }

    function run(live: Partial<MockLive> = {}, options: Options = {}): MockRun {
        return new MockRun({ ...defaults.shape, ...options.shape }, options.scheduler ?? defaults.scheduler, { ...defaults.live, ...live }, options.seed ?? 42,
            options.rates);
    }

    function envelope(mock: MockRun): BroadcastEnvelope {
        return BroadcastEnvelope.parse(mock.line(TS));
    }

    function workerFrame(mock: MockRun, workerId: number): WorkerFrame {
        return envelope(mock).workers!.find(frame => frame.worker_id === workerId)!;
    }

    function view(mock: MockRun, workerId: number): MockWorkerView {
        return mock.workerViews().find(worker => worker.workerId === workerId)!;
    }

    function computing(mock: MockRun): MockWorkerView[] {
        return mock.workerViews().filter(worker => worker.workerId !== 0);
    }

    it('replays the same frames from the same seed, and others from another', () => {
        const a = run();
        const b = run();
        const c = run({}, { seed: 7 });
        [a, b, c].forEach(mock => mock.advanceTo(30_000));
        expect(a.line(TS)).to.equal(b.line(TS));
        expect(a.line(TS)).not.to.equal(c.line(TS));
    });

    it('sends lines gempba\'s way, which the dashboard parses and maps into its nodes, sockets and workers', () => {
        const mock = run();
        const first = envelope(mock);
        expect(first).to.include({ version: 1, ts: TS, elapsed_seconds: 0 });
        expect(first.workers!.map(frame => frame.worker_id)).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(first.nodes!.map(frame => frame.hostname)).to.deep.equal(['mock-host-01', 'mock-host-02']);
        mock.advanceTo(10_000);
        const world: WorldSnapshot = WorldSnapshotMapper.toWorldSnapshot(envelope(mock));
        expect(world.elapsedSeconds).to.equal(10);
        expect(world.nodes.map(node => node.host)).to.deep.equal(['mock-host-01', 'mock-host-02']);
        expect(world.nodes.map(node => node.sockets.map(socket => socket.ranks.length))).to.deep.equal([[2, 2], [2, 2]]);
        expect(world.nodes[1].sentinelRank).to.equal(4);
        expect(world.nodes[0].hasLiveMemory).to.equal(true);
        expect(workerFrame(mock, 3).process_threads).to.equal(5);
    });

    it('keeps its counters consistent over 10,000 steps: rising, summing over edges, and within the pool and the CPUs', () => {
        const mock = run();
        const last = new Map<number, WorkerFrame>();
        const allowed = new Map(mock.topology.workers.map(worker => [worker.workerId, worker.allowedCpuIds.length]));
        for (let step = 1; step <= 1000; step++) {
            mock.advanceTo(step * 10 * MockRun.STEP_MS);
            const sent = envelope(mock);
            for (const frame of sent.workers!) {
                const before = last.get(frame.worker_id);
                if (before) {
                    expect(frame.seq_no).to.be.at.least(before.seq_no);
                    expect(frame.tasks_started_total).to.be.at.least(before.tasks_started_total);
                    expect(frame.tasks_sent_total).to.be.at.least(before.tasks_sent_total);
                    expect(frame.tasks_recv_total).to.be.at.least(before.tasks_recv_total);
                    expect(frame.idle_microseconds_per_worker).to.be.at.least(before.idle_microseconds_per_worker);
                }
                expect(frame.tasks_running).to.be.at.most(frame.process_threads - 1);
                expect(frame.process_cpu_pct).to.be.at.most(allowed.get(frame.worker_id)! * 100);
                expect(frame.process_rss_bytes).to.be.below(2 * 1024 ** 3);
                last.set(frame.worker_id, frame);
            }
            for (const node of sent.nodes!) {
                expect(node.mem_avail_bytes).to.be.within(0, node.mem_total_bytes);
            }
        }
        const views = mock.workerViews();
        for (const worker of views) {
            const outgoing = [...worker.edges.values()].reduce((sum, edge) => sum + edge.count, 0);
            const incoming = views.reduce((sum, other) => sum + (other.edges.get(worker.workerId)?.count ?? 0), 0);
            expect(worker.sent).to.equal(outgoing);
            expect(worker.recv).to.equal(incoming);
        }
        expect(views.reduce((sum, worker) => sum + worker.tasksLocal, 0)).to.be.above(1_000_000);
    });

    describe('semi-centralized, as gempba schedules it', () => {

        it('has the center seed the root and nothing more, and run no tasks while it polls', () => {
            const mock = run();
            mock.advanceTo(60_000);
            const center = workerFrame(mock, 0);
            expect(center).to.include({ tasks_sent_total: 1, tasks_recv_total: 0, tasks_started_total: 0, tasks_running: 0, scheduler_pending_count: 0 });
            expect(center.process_cpu_pct).to.be.within(90, 100);
        });

        it('sends one task at a time to an idle rank the center reserved, so no worker ever queues one', () => {
            const mock = run();
            let before = new Map(mock.workerViews().map(worker => [worker.workerId, worker]));
            let transfers = 0;
            for (let step = 1; step <= 1200; step++) {
                mock.advanceTo(step * MockRun.STEP_MS);
                const now = mock.workerViews();
                for (const worker of now) {
                    const was = before.get(worker.workerId)!;
                    expect(worker.pending).to.equal(0);
                    if (worker.workerId === 0) {
                        continue;
                    }
                    expect(worker.sent - was.sent, 'one in flight').to.be.at.most(1);
                    expect(worker.recv - was.recv, 'one subtree at a time').to.be.at.most(1);
                    if (worker.recv > was.recv) {
                        expect(was.phase, `worker ${worker.workerId} received while running`).not.to.equal('running');
                        transfers++;
                    }
                }
                for (const reserved of now.filter(worker => worker.phase === 'assigned')) {
                    expect(now.filter(worker => worker.next === reserved.workerId && worker.phase === 'running')).to.have.lengthOf(1);
                }
                before = new Map(now.map(worker => [worker.workerId, worker]));
            }
            expect(transfers).to.be.above(10);
        });
    });

    describe('centralized, as gempba schedules it', () => {

        it('queues the tasks workers send at the center, which alone reports them pending', () => {
            const mock = run({}, { scheduler: 'centralized' });
            mock.advanceTo(30_000);
            const center = view(mock, 0);
            expect(center.pending).to.equal(center.recv - (center.sent - 1));
            expect(center.pending).to.be.above(0);
            expect(computing(mock).every(worker => worker.pending === 0)).to.equal(true);
            // the frame was sampled up to a worker interval ago
            expect(workerFrame(mock, 0).scheduler_pending_count).to.be.within(1, center.pending);
            expect(envelope(mock).workers!.filter(frame => frame.worker_id !== 0).every(frame => frame.scheduler_pending_count === 0)).to.equal(true);
        });

        it('fills its queue to gempba\'s limit, then takes no more while it is full', () => {
            const mock = run({}, { scheduler: 'centralized', shape: { nodes: 1, workersPerNode: 3 } });
            const limit = MockRun.CENTER_TASKS_PER_PROCESS * 3;
            let filled = false;
            let highest = 0;
            for (let step = 1; step <= 400_000 / MockRun.STEP_MS; step++) {
                mock.advanceTo(step * MockRun.STEP_MS);
                const center = view(mock, 0);
                highest = Math.max(highest, center.pending);
                filled = filled || center.pending > limit;
            }
            expect(filled, 'it filled').to.equal(true);
            // past the limit by at most one task per worker, sent in the step it filled
            expect(highest).to.be.within(limit + 1, limit + 2);
        });
    });

    it('keeps an idle worker at about one core: gempba\'s main thread polls MPI without sleeping', () => {
        const mock = run({ scenario: 'imbalanced' });
        mock.advanceTo(60_000);
        // a worker that just went idle still shows the CPU it was using, settling within a few steps
        const idle = envelope(mock).workers!.filter(frame => frame.worker_id !== 0 && frame.tasks_running === 0).map(frame => frame.process_cpu_pct).sort((a, b) => a - b);
        expect(idle.length).to.be.above(2);
        expect(idle[Math.floor(idle.length / 2)]).to.be.within(85, 110);
    });

    it('finishes slow tasks one every few seconds on each busy worker', () => {
        const mock = run({ scenario: 'slow' });
        mock.advanceTo(300_000);
        const before = new Map(mock.workerViews().map(worker => [worker.workerId, worker.tasksLocal]));
        mock.advanceTo(420_000);
        const perWorker = computing(mock).map(worker => (worker.tasksLocal - before.get(worker.workerId)!) / 120);
        const mean = perWorker.reduce((sum, rate) => sum + rate, 0) / perWorker.length;
        expect(1 / mean).to.be.within(1.5, 10);
    });

    it('ramps up, drains its finite tree and ends, after which it stands still', () => {
        const mock = run({ scenario: 'ramp' });
        mock.advanceTo(30_000);
        expect(computing(mock).every(worker => worker.phase === 'running')).to.equal(true);
        mock.advanceTo(600_000);
        expect(mock.ended).to.equal(true);
        const endedAt = mock.timeMs;
        expect(endedAt).to.be.within(100_000, 600_000);
        mock.advanceTo(700_000);
        expect(mock.timeMs).to.equal(endedAt);
    });

    it('leaves most of the work with the worker holding the root when imbalanced, while the others wait', () => {
        const mock = run({ scenario: 'imbalanced' });
        mock.advanceTo(120_000);
        const others = computing(mock).filter(worker => !MockScenarioModel.isRich(worker.workerId));
        const average = others.reduce((sum, worker) => sum + worker.tasksLocal, 0) / others.length;
        expect(view(mock, 1).tasksLocal).to.be.above(10 * average);
    });

    it('rests between bursts', () => {
        const mock = run({ scenario: 'bursty' });
        mock.advanceTo(MockScenarioModel.BURST_PERIOD_MS * 3 + MockScenarioModel.BURST_BUSY_MS + 5000);
        expect(computing(mock).reduce((sum, worker) => sum + worker.running, 0)).to.be.at.most(4);
    });

    it('leaves the pools idle at no load', () => {
        const mock = run({ loadPct: 0 });
        mock.advanceTo(5000);
        expect(mock.workerViews().every(worker => worker.running === 0)).to.equal(true);
    });

    it('applies new intervals at once', () => {
        const mock = run({}, { rates: { workerIntervalMs: 600_000, nodeIntervalMs: 600_000 } });
        mock.advanceTo(1000);
        const seq = workerFrame(mock, 5).seq_no;
        mock.setIntervals(100, 1000);
        mock.advanceTo(2000);
        expect(workerFrame(mock, 5).seq_no - seq).to.be.within(9, 11);
    });

    describe('faults', () => {

        it('stalls a node: its frames stop for a while, then resume', () => {
            const mock = run();
            mock.advanceTo(5000);
            const message = mock.fault('stall-node');
            expect(message).to.match(/^Stalled mock-host-0\d: its frames stop for 10 s$/);
            const nodeIndex = mock.topology.nodes.findIndex(node => message.includes(node.host));
            const stalled = mock.topology.workers.filter(worker => worker.nodeIndex === nodeIndex).map(worker => worker.workerId);
            const others = mock.topology.workers.filter(worker => worker.nodeIndex !== nodeIndex).map(worker => worker.workerId);
            const seqs = () => new Map(envelope(mock).workers!.map(frame => [frame.worker_id, frame.seq_no]));
            const start = seqs();
            mock.advanceTo(5000 + MockFault.STALL_MS - 100);
            const during = seqs();
            expect(stalled.every(workerId => during.get(workerId) === start.get(workerId))).to.equal(true);
            expect(others.every(workerId => during.get(workerId)! > start.get(workerId)!)).to.equal(true);
            mock.advanceTo(5000 + MockFault.STALL_MS + 1000);
            const after = seqs();
            expect(stalled.every(workerId => after.get(workerId)! > start.get(workerId)!)).to.equal(true);
        });

        it('restarts a worker as a new process with its counters from zero, freeing what was reserved for it', () => {
            const mock = run();
            mock.advanceTo(20_000);
            const message = mock.fault('restart-worker');
            const workerId = Number(/worker (\d+)/.exec(message)![1]);
            const frame = workerFrame(mock, workerId);
            expect(frame).to.include({ seq_no: 1, tasks_started_total: 0, tasks_sent_total: 0, tasks_recv_total: 0 });
            const pid = envelope(mock).topology!.identities!.find(identity => identity.worker_id === workerId)!.pid;
            expect(message).to.contain(`PID ${pid}`);
            expect(view(mock, workerId).phase).to.equal('available');
            expect(mock.workerViews().some(worker => worker.next === workerId)).to.equal(false);
        });

        it('adds and removes workers, keeping every node and the center', () => {
            const mock = run({}, { shape: { nodes: 1, workersPerNode: 2 } });
            expect(mock.fault('add-worker')).to.equal('Added worker 2 on mock-host-01');
            expect(envelope(mock).workers!.map(frame => frame.worker_id)).to.deep.equal([0, 1, 2]);
            mock.advanceTo(1000);
            expect(mock.fault('remove-worker')).to.match(/^Removed worker [12] from mock-host-01$/);
            expect(mock.fault('remove-worker')).to.match(/^No worker can be removed/);
            expect(envelope(mock).topology!.nodes![0].worker_ids).to.have.lengthOf(2);
        });

        it('ends the run', () => {
            const mock = run();
            mock.fault('end-run');
            expect(mock.ended).to.equal(true);
        });
    });

    describe('fidelity', () => {

        it('sends what gempba sends today: zeros for socket CPU and use, network and disk, every 500 ms', () => {
            const mock = run({}, { rates: { workerIntervalMs: 100, nodeIntervalMs: 1000 } });
            mock.advanceTo(20_000);
            const node = envelope(mock).nodes![0];
            expect(node.sockets!.map(socket => [socket.cpu_pct, socket.mem_used_bytes])).to.deep.equal([[0, 0], [0, 0]]);
            expect(node.sockets![0].mem_total_bytes).to.equal(32 * 1024 ** 3);
            expect(node.net_aggregate).to.deep.equal({ bytes_in: 0, bytes_out: 0, packets_in: 0, packets_out: 0 });
            expect(node.disk_aggregate).to.deep.equal({ read_bytes: 0, write_bytes: 0 });
            expect(mock.broadcastIntervalMs).to.equal(500);
        });

        it('fills every field when asked, and broadcasts at the worker rate', () => {
            const mock = run({ fidelity: 'full' }, { rates: { workerIntervalMs: 100, nodeIntervalMs: 1000 } });
            mock.advanceTo(20_000);
            const node = envelope(mock).nodes![1];
            expect(node.sockets!.every(socket => socket.cpu_pct > 0 && socket.mem_used_bytes > 0)).to.equal(true);
            expect(node.net_aggregate!.bytes_in).to.be.above(0);
            expect(node.disk_aggregate!.write_bytes).to.be.above(0);
            expect(mock.broadcastIntervalMs).to.equal(100);
        });

        it('reports the job\'s cgroup when it runs in one', () => {
            const mock = run({}, { shape: { cgroupGiB: 16 } });
            mock.advanceTo(5000);
            const node = envelope(mock).nodes![0];
            expect(node.cgroup_mem_limit_bytes).to.equal(16 * 1024 ** 3);
            expect(node.cgroup_mem_used_bytes).to.be.within(1, 16 * 1024 ** 3);
        });
    });
});
