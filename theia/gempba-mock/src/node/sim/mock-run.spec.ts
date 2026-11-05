import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { WorldSnapshot } from '@gempba/core';
import { BroadcastEnvelope, RankFrame } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { WorldSnapshotMapper } from '@gempba/telemetry/lib/node/telemetry/world-snapshot-mapper';
import { MockConfig, MockLive, MockRoles, MockScheduler, MockShape } from '../../common/mock-config';
import { MockFault } from '../../common/mock-fault';
import { MockRun, MockRankView } from './mock-run';
import { MockScenarioModel } from './mock-scenario';

describe('MockRun', () => {

    const defaults = MockConfig.defaults();
    const TS = 1_700_000_000_000;

    interface Options {
        readonly shape?: Partial<MockShape>;
        readonly scheduler?: MockScheduler;
        readonly seed?: number;
        readonly intervalMs?: number;
        readonly roles?: MockRoles;
    }

    function run(live: Partial<MockLive> = {}, options: Options = {}): MockRun {
        return new MockRun({ ...defaults.shape, ...options.shape }, options.scheduler ?? defaults.scheduler, { ...defaults.live, ...live }, options.seed ?? 42,
            options.intervalMs, options.roles);
    }

    function envelope(mock: MockRun): BroadcastEnvelope {
        return BroadcastEnvelope.parse(mock.line(TS));
    }

    function rankFrame(mock: MockRun, id: number): RankFrame {
        return envelope(mock).ranks!.find(frame => frame.rank === id)!;
    }

    function view(mock: MockRun, id: number): MockRankView {
        return mock.rankViews().find(rank => rank.id === id)!;
    }

    function computing(mock: MockRun): MockRankView[] {
        return mock.rankViews().filter(rank => rank.id !== 0);
    }

    it('replays the same frames from the same seed, and others from another', () => {
        const a = run();
        const b = run();
        const c = run({}, { seed: 7 });
        [a, b, c].forEach(mock => mock.advanceTo(30_000));
        // the run id is drawn at each start, whatever the seed
        const frames = (mock: MockRun) => mock.line(TS).replace(/"run_id":"[^"]+",/, '');
        expect(frames(a)).to.equal(frames(b));
        expect(frames(a)).not.to.equal(frames(c));
    });

    it('sends lines gempba\'s way, which the dashboard parses and maps into its nodes, sockets and ranks', () => {
        const mock = run();
        const first = envelope(mock);
        expect(first).to.include({ version: 2, ts: TS, elapsed_seconds: 0 });
        expect(first.ranks!.map(frame => frame.rank)).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(first.nodes!.map(frame => frame.hostname)).to.deep.equal(['mock-host-01', 'mock-host-02']);
        mock.advanceTo(10_000);
        const world: WorldSnapshot = WorldSnapshotMapper.toWorldSnapshot(envelope(mock));
        expect(world.elapsedSeconds).to.equal(10);
        expect(world.nodes.map(node => node.host)).to.deep.equal(['mock-host-01', 'mock-host-02']);
        expect(world.nodes.map(node => node.sockets.map(socket => socket.ranks.length))).to.deep.equal([[2, 2], [2, 2]]);
        expect(world.nodes[1].sentinelRank).to.equal(4);
        expect(world.nodes[0].hasLiveMemory).to.equal(true);
        expect(rankFrame(mock, 3).process_threads).to.equal(5);
    });

    it('keeps its counters consistent over 10,000 steps: rising, summing over edges, and within the pool and the CPUs', () => {
        const mock = run();
        const last = new Map<number, RankFrame>();
        const allowed = new Map(mock.topology.ranks.map(rank => [rank.id, rank.allowedCpuIds.length]));
        for (let step = 1; step <= 1000; step++) {
            mock.advanceTo(step * 10 * MockRun.STEP_MS);
            const sent = envelope(mock);
            for (const frame of sent.ranks!) {
                const before = last.get(frame.rank);
                if (before) {
                    expect(frame.seq_no).to.be.at.least(before.seq_no);
                    expect(frame.tasks_started_total).to.be.at.least(before.tasks_started_total);
                    expect(frame.tasks_sent_total).to.be.at.least(before.tasks_sent_total);
                    expect(frame.tasks_recv_total).to.be.at.least(before.tasks_recv_total);
                    expect(frame.idle_microseconds_per_thread).to.be.at.least(before.idle_microseconds_per_thread);
                }
                expect(frame.tasks_running).to.be.at.most(frame.process_threads - 1);
                expect(frame.process_cpu_pct).to.be.at.most(allowed.get(frame.rank)! * 100);
                expect(frame.process_rss_bytes).to.be.below(2 * 1024 ** 3);
                last.set(frame.rank, frame);
            }
            for (const node of sent.nodes!) {
                expect(node.mem_avail_bytes).to.be.within(0, node.mem_total_bytes);
            }
        }
        const views = mock.rankViews();
        for (const rank of views) {
            const outgoing = [...rank.edges.values()].reduce((sum, edge) => sum + edge.count, 0);
            const incoming = views.reduce((sum, other) => sum + (other.edges.get(rank.id)?.count ?? 0), 0);
            expect(rank.sent).to.equal(outgoing);
            expect(rank.recv).to.equal(incoming);
        }
        expect(views.reduce((sum, rank) => sum + rank.tasksLocal, 0)).to.be.above(1_000_000);
    });

    describe('semi-centralized, as gempba schedules it', () => {

        it('has the coordinator seed the root and nothing more, and run no tasks while it polls', () => {
            const mock = run();
            mock.advanceTo(60_000);
            const coordinator = rankFrame(mock, 0);
            expect(coordinator).to.include({ tasks_sent_total: 1, tasks_recv_total: 0, tasks_started_total: 0, tasks_running: 0, scheduler_pending_count: 0 });
            expect(coordinator.process_cpu_pct).to.be.within(90, 100);
        });

        it('sends one task at a time to an idle rank the coordinator reserved, so no worker ever queues one', () => {
            const mock = run();
            let before = new Map(mock.rankViews().map(rank => [rank.id, rank]));
            let transfers = 0;
            for (let step = 1; step <= 1200; step++) {
                mock.advanceTo(step * MockRun.STEP_MS);
                const now = mock.rankViews();
                for (const rank of now) {
                    const was = before.get(rank.id)!;
                    expect(rank.pending).to.equal(0);
                    if (rank.id === 0) {
                        continue;
                    }
                    expect(rank.sent - was.sent, 'one in flight').to.be.at.most(1);
                    expect(rank.recv - was.recv, 'one subtree at a time').to.be.at.most(1);
                    if (rank.recv > was.recv) {
                        expect(was.phase, `rank ${rank.id} received while running`).not.to.equal('running');
                        transfers++;
                    }
                }
                for (const reserved of now.filter(rank => rank.phase === 'assigned')) {
                    expect(now.filter(rank => rank.next === reserved.id && rank.phase === 'running')).to.have.lengthOf(1);
                }
                before = new Map(now.map(rank => [rank.id, rank]));
            }
            expect(transfers).to.be.above(10);
        });
    });

    describe('with the coordinator on another rank, as another scheduler may put it', () => {

        it('has it seed the root to rank 0 and run no tasks, while rank 0 works like the others', () => {
            const mock = run({}, { roles: { coordinatorRank: 2, declared: true } });
            mock.advanceTo(60_000);
            expect(rankFrame(mock, 2)).to.include({ tasks_sent_total: 1, tasks_recv_total: 0, tasks_started_total: 0, tasks_running: 0 });
            expect(view(mock, 2).edges.get(0)?.count, 'the root went to rank 0').to.equal(1);
            expect(rankFrame(mock, 0).tasks_started_total).to.be.above(0);
        });

        it('queues the centralized tasks there', () => {
            const mock = run({}, { scheduler: 'centralized', roles: { coordinatorRank: 2, declared: true } });
            mock.advanceTo(30_000);
            expect(view(mock, 2).pending).to.be.above(0);
            expect(mock.rankViews().filter(rank => rank.id !== 2).every(rank => rank.pending === 0)).to.equal(true);
        });

        it('never removes it', () => {
            const mock = run({}, { shape: { nodes: 1, ranksPerNode: 3 }, roles: { coordinatorRank: 2, declared: true } });
            mock.advanceTo(1_000);
            for (let i = 0; i < 4; i++) {
                mock.fault('remove-rank');
            }
            expect(mock.topology.ranks.map(rank => rank.id)).to.have.members([2, mock.topology.ranks.find(rank => rank.id !== 2)!.id]);
        });
    });

    describe('with no roles declared, as a custom scheduler may run', () => {

        const NO_ROLES = { coordinatorRank: 0, declared: false };

        it('reports every rank a worker, starts the root on rank 0, and pairs the ranks among themselves', () => {
            const mock = run({}, { roles: NO_ROLES });
            mock.advanceTo(30_000);
            const line = envelope(mock);
            expect(line.topology!.identities!.map(identity => identity.role)).to.deep.equal(Array(8).fill('worker'));
            expect(line.topology!.run!.scheduler).to.equal('decentralized');
            expect(rankFrame(mock, 0).tasks_started_total).to.be.above(0);
            expect(rankFrame(mock, 0).tasks_recv_total, 'the root was its own').to.equal(0);
            expect(line.ranks!.reduce((sum, frame) => sum + frame.tasks_sent_total, 0)).to.be.above(0);
        });

        it('fills no coordinator\'s counters, and no rank holds a queue, whatever the scheduler chosen', () => {
            const mock = run({}, { scheduler: 'centralized', roles: NO_ROLES });
            mock.advanceTo(30_000);
            for (const frame of envelope(mock).ranks!) {
                expect([frame.assign_count, frame.coordinator_state_msgs_total, frame.coordinator_score_proposals_total, frame.score_proposals_sent,
                    frame.scheduler_pending_count], `rank ${frame.rank}`).to.deep.equal([0, 0, 0, 0, 0]);
            }
        });
    });

    describe('centralized, as gempba schedules it', () => {

        it('queues the tasks workers send at the coordinator, which alone reports them pending', () => {
            const mock = run({}, { scheduler: 'centralized' });
            mock.advanceTo(30_000);
            const coordinator = view(mock, 0);
            expect(coordinator.pending).to.equal(coordinator.recv - (coordinator.sent - 1));
            expect(coordinator.pending).to.be.above(0);
            expect(computing(mock).every(rank => rank.pending === 0)).to.equal(true);
            // the frame was sampled up to a worker interval ago
            expect(rankFrame(mock, 0).scheduler_pending_count).to.be.within(1, coordinator.pending);
            expect(envelope(mock).ranks!.filter(frame => frame.rank !== 0).every(frame => frame.scheduler_pending_count === 0)).to.equal(true);
        });

        it('fills its queue to gempba\'s limit, then takes no more while it is full', () => {
            const mock = run({}, { scheduler: 'centralized', shape: { nodes: 1, ranksPerNode: 3 } });
            const limit = MockRun.COORDINATOR_TASKS_PER_PROCESS * 3;
            let filled = false;
            let highest = 0;
            for (let step = 1; step <= 400_000 / MockRun.STEP_MS; step++) {
                mock.advanceTo(step * MockRun.STEP_MS);
                const coordinator = view(mock, 0);
                highest = Math.max(highest, coordinator.pending);
                filled = filled || coordinator.pending > limit;
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
        const idle = envelope(mock).ranks!.filter(frame => frame.rank !== 0 && frame.tasks_running === 0).map(frame => frame.process_cpu_pct).sort((a, b) => a - b);
        expect(idle.length).to.be.above(2);
        expect(idle[Math.floor(idle.length / 2)]).to.be.within(85, 110);
    });

    it('finishes slow tasks one every few seconds on each busy worker', () => {
        const mock = run({ scenario: 'slow' });
        mock.advanceTo(300_000);
        const before = new Map(mock.rankViews().map(rank => [rank.id, rank.tasksLocal]));
        mock.advanceTo(420_000);
        const perRank = computing(mock).map(rank => (rank.tasksLocal - before.get(rank.id)!) / 120);
        const mean = perRank.reduce((sum, rate) => sum + rate, 0) / perRank.length;
        expect(1 / mean).to.be.within(1.5, 10);
    });

    it('ramps up, drains its finite tree and ends, after which it stands still', () => {
        const mock = run({ scenario: 'ramp' });
        mock.advanceTo(30_000);
        expect(computing(mock).every(rank => rank.phase === 'running')).to.equal(true);
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
        const others = computing(mock).filter(rank => !MockScenarioModel.isRich(rank.id));
        const average = others.reduce((sum, rank) => sum + rank.tasksLocal, 0) / others.length;
        expect(view(mock, 1).tasksLocal).to.be.above(10 * average);
    });

    it('rests between bursts', () => {
        const mock = run({ scenario: 'bursty' });
        const running = () => computing(mock).reduce((sum, rank) => sum + rank.running, 0);
        mock.advanceTo(MockScenarioModel.BURST_PERIOD_MS * 3 + 5000);
        const busy = running();
        mock.advanceTo(MockScenarioModel.BURST_PERIOD_MS * 3 + MockScenarioModel.BURST_BUSY_MS + 5000);
        // a tenth of the load: at most one thread a rank, against most of every pool in a burst
        expect(running()).to.be.at.most(computing(mock).length).and.below(busy / 3);
    });

    it('leaves the pools idle at no load', () => {
        const mock = run({ loadPct: 0 });
        mock.advanceTo(5000);
        expect(mock.rankViews().every(rank => rank.running === 0)).to.equal(true);
    });

    it('applies a new interval at once', () => {
        const mock = run({}, { intervalMs: 600_000 });
        mock.advanceTo(1000);
        const seq = rankFrame(mock, 5).seq_no;
        mock.setIntervalMs(100);
        mock.advanceTo(2000);
        expect(rankFrame(mock, 5).seq_no - seq).to.be.within(9, 11);
    });

    describe('faults', () => {

        it('stalls a node: its frames stop for a while, then resume', () => {
            const mock = run();
            mock.advanceTo(5000);
            const message = mock.fault('stall-node');
            expect(message).to.match(/^Stalled mock-host-0\d: its frames stop for 10 s$/);
            const nodeIndex = mock.topology.nodes.findIndex(node => message.includes(node.host));
            const stalled = mock.topology.ranks.filter(rank => rank.nodeIndex === nodeIndex).map(rank => rank.id);
            const others = mock.topology.ranks.filter(rank => rank.nodeIndex !== nodeIndex).map(rank => rank.id);
            const seqs = () => new Map(envelope(mock).ranks!.map(frame => [frame.rank, frame.seq_no]));
            const start = seqs();
            mock.advanceTo(5000 + MockFault.STALL_MS - 100);
            const during = seqs();
            expect(stalled.every(id => during.get(id) === start.get(id))).to.equal(true);
            expect(others.every(id => during.get(id)! > start.get(id)!)).to.equal(true);
            mock.advanceTo(5000 + MockFault.STALL_MS + 1000);
            const after = seqs();
            expect(stalled.every(id => after.get(id)! > start.get(id)!)).to.equal(true);
        });

        it('restarts a rank as a new process with its counters from zero, freeing what was reserved for it', () => {
            const mock = run();
            mock.advanceTo(20_000);
            const message = mock.fault('restart-rank');
            const id = Number(/rank (\d+)/.exec(message)![1]);
            const frame = rankFrame(mock, id);
            expect(frame).to.include({ seq_no: 1, tasks_started_total: 0, tasks_sent_total: 0, tasks_recv_total: 0 });
            const pid = envelope(mock).topology!.identities!.find(identity => identity.rank === id)!.pid;
            expect(message).to.contain(`PID ${pid}`);
            expect(view(mock, id).phase).to.equal('available');
            expect(mock.rankViews().some(rank => rank.next === id)).to.equal(false);
        });

        it('adds and removes ranks, keeping every node and the coordinator', () => {
            const mock = run({}, { shape: { nodes: 1, ranksPerNode: 2 } });
            expect(mock.fault('add-rank')).to.equal('Added rank 2 on mock-host-01');
            expect(envelope(mock).ranks!.map(frame => frame.rank)).to.deep.equal([0, 1, 2]);
            mock.advanceTo(1000);
            expect(mock.fault('remove-rank')).to.match(/^Removed rank [12] from mock-host-01$/);
            expect(mock.fault('remove-rank')).to.match(/^No rank can be removed/);
            expect(envelope(mock).topology!.nodes![0].ranks).to.have.lengthOf(2);
        });

        it('ends the run', () => {
            const mock = run();
            mock.fault('end-run');
            expect(mock.ended).to.equal(true);
        });
    });

    describe('time accounting, as gempba 4.3 counts it', () => {

        const COORDINATOR_KEYS = [
            'assign_latency_microseconds_total', 'assign_count', 'assign_latency_microseconds_max', 'available_microseconds_queue_empty',
            'coordinator_state_msgs_total', 'coordinator_score_proposals_total', 'coordinator_score_broadcasts_total', 'last_score_improvement_ms',
            'coordinator_full_microseconds'
        ] as const;
        const WORKER_KEYS = ['sched_running_microseconds', 'sched_waiting_microseconds', 'first_task_ms', 'last_task_ms', 'score_proposals_sent'] as const;

        it('splits each rank\'s idle time into starved and imbalanced, and a worker\'s time into running and waiting', () => {
            const mock = run();
            mock.advanceTo(30_000);
            for (const frame of envelope(mock).ranks!) {
                expect(frame.idle_microseconds_starved! + frame.idle_microseconds_imbalanced!).to.be.closeTo(frame.idle_microseconds_per_thread, 1);
                if (frame.rank === 0) {
                    expect(frame.idle_microseconds_starved).to.equal(frame.idle_microseconds_per_thread);
                } else {
                    expect(frame.sched_running_microseconds! + frame.sched_waiting_microseconds!).to.be.within(29_000_000, 30_000_000);
                }
            }
        });

        it('counts the bytes and the time of every task moved, at both ends', () => {
            const mock = run({}, { shape: { nodes: 2 } });
            mock.advanceTo(30_000);
            for (const frame of envelope(mock).ranks!) {
                expect(frame.bytes_sent_total).to.equal(frame.edges_out!.reduce((sum, edge) => sum + edge.bytes, 0));
                expect(frame.tasks_sent_total > 0 ? frame.send_microseconds_total : 0).to.be.at.least(frame.tasks_sent_total > 0 ? 15 : 0);
                expect(frame.tasks_recv_total > 0).to.equal(frame.bytes_recv_total! > 0);
            }
        });

        it('fills the coordinator\'s counters on the coordinator alone, and the workers\' on the workers alone', () => {
            const mock = run();
            mock.advanceTo(30_000);
            const [coordinator, ...workers] = envelope(mock).ranks!;
            expect(coordinator.assign_count).to.be.above(0);
            expect(coordinator.assign_latency_microseconds_total).to.be.at.least(200 * coordinator.assign_count!);
            expect(coordinator.assign_latency_microseconds_max).to.be.within(1, coordinator.assign_latency_microseconds_total!);
            expect(coordinator.coordinator_state_msgs_total).to.be.above(0);
            expect(coordinator.coordinator_score_proposals_total).to.be.at.least(coordinator.coordinator_score_broadcasts_total!);
            expect(coordinator.coordinator_score_broadcasts_total).to.be.above(0);
            expect(coordinator.last_score_improvement_ms).to.be.within(1, 30_000);
            expect(WORKER_KEYS.map(key => coordinator[key])).to.deep.equal(WORKER_KEYS.map(() => 0));
            for (const worker of workers) {
                expect(COORDINATOR_KEYS.map(key => worker[key]), `rank ${worker.rank}`).to.deep.equal(COORDINATOR_KEYS.map(() => 0));
            }
            expect(workers.reduce((sum, worker) => sum + worker.score_proposals_sent!, 0)).to.be.above(0);
        });

        it('counts the time ranks wait while the centralized queue is empty, and the time it is full', () => {
            const mock = run({}, { scheduler: 'centralized', shape: { nodes: 1, ranksPerNode: 3 } });
            mock.advanceTo(400_000);
            const coordinator = rankFrame(mock, 0);
            expect(coordinator.available_microseconds_queue_empty).to.be.above(0);
            expect(coordinator.coordinator_full_microseconds).to.be.above(0);
        });

        it('refuses spawns while a pool is full, and remote ones while there is no channel to send them on', () => {
            const mock = run({ loadPct: 100 });
            mock.advanceTo(30_000);
            const workers = envelope(mock).ranks!.filter(frame => frame.rank !== 0);
            expect(workers.every(frame => frame.spawn_rejected_pool_full! >= frame.spawn_remote_rejected!)).to.equal(true);
            expect(workers.some(frame => frame.spawn_remote_rejected! > 0)).to.equal(true);
        });

        it('counts telemetry\'s own time, most of it on rank 0, the aggregator', () => {
            const mock = run();
            mock.advanceTo(10_000);
            const [aggregator, ...others] = envelope(mock).ranks!;
            expect(others.every(frame => frame.telemetry_microseconds_total! > 0 && frame.telemetry_microseconds_total! < aggregator.telemetry_microseconds_total!)).to.equal(true);
        });
    });

    describe('controls, as gempba 4.3 answers them', () => {

        it('pauses: the run goes on, its ranks send no frames, and the lines carry the header alone, as gempba\'s do', () => {
            const recorded = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../gempba-telemetry/fixtures/schema2-run.ndjson'), 'utf8').split('\n')[1]);
            const mock = run();
            mock.advanceTo(10_000);
            const was = rankFrame(mock, 1);
            mock.pause();
            mock.advanceTo(20_000);
            const paused = JSON.parse(mock.line(TS));
            expect(Object.keys(paused)).to.deep.equal(Object.keys(recorded));
            expect(paused).to.include({ version: 2, run_id: mock.runId, elapsed_seconds: 20, paused: true, final: false });
            expect(JSON.parse(mock.line(TS, { full: true })).ranks[1].seq_no, 'no frame while paused').to.equal(was.seq_no);
            mock.resume();
            mock.advanceTo(21_000);
            const now = rankFrame(mock, 1);
            expect(envelope(mock).paused).to.equal(false);
            const perSecond = was.tasks_started_total / 10;
            expect(now.tasks_started_total - was.tasks_started_total, 'the counters kept counting').to.be.above(5 * perSecond);
        });

        it('answers a snapshot with every frame taken now, paused or not', () => {
            const mock = run();
            mock.advanceTo(10_000);
            mock.pause();
            mock.advanceTo(15_000);
            const frozen = JSON.parse(mock.line(TS, { full: true }));
            mock.snapshot();
            const snapshot = JSON.parse(mock.line(TS, { full: true }));
            expect(snapshot.paused).to.equal(true);
            expect(snapshot.ranks.map((frame: RankFrame) => frame.seq_no)).to.deep.equal(frozen.ranks.map((frame: RankFrame) => frame.seq_no + 1));
            expect(snapshot.nodes[0].sentinel_local_ms).to.be.above(frozen.nodes[0].sentinel_local_ms);
        });

        it('lists a marker a dashboard sent in the run\'s setup, up to gempba\'s 32', () => {
            const mock = run();
            mock.advanceTo(4_000);
            expect(mock.mark('phase 2')).to.equal(true);
            expect(envelope(mock).topology!.run!.markers).to.deep.equal([{ elapsed_ms: 4_000, label: 'phase 2', source: 'dashboard' }]);
            for (let i = 1; i < MockRun.MAX_MARKERS; i++) {
                mock.mark(`marker ${i}`);
            }
            expect(mock.mark('one too many')).to.equal(false);
            expect(envelope(mock).topology!.run!.markers).to.have.lengthOf(MockRun.MAX_MARKERS);
        });
    });

    describe('fidelity', () => {

        it('sends every key gempba 4.3 sends, in its order, and the run\'s id, roles and setup', () => {
            const recorded = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../gempba-telemetry/fixtures/schema2-run.ndjson'), 'utf8').split('\n')[0]);
            const mock = run({}, { intervalMs: 100 });
            mock.advanceTo(20_000);
            const line = JSON.parse(mock.line(TS));
            const keys = (value: object) => Object.keys(value);
            expect(keys(line)).to.deep.equal(keys(recorded));
            expect(keys(line.topology)).to.deep.equal(keys(recorded.topology));
            expect(keys(line.topology.nodes[0])).to.deep.equal(keys(recorded.topology.nodes[0]));
            expect(keys(line.topology.identities[0])).to.deep.equal(keys(recorded.topology.identities[0]));
            expect(keys(line.topology.run)).to.deep.equal(keys(recorded.topology.run));
            expect(line.ranks.every((frame: object) => JSON.stringify(keys(frame)) === JSON.stringify(keys(recorded.ranks[0])))).to.equal(true);
            expect(keys(line.nodes[0])).to.deep.equal(keys(recorded.nodes[0]));
            expect([line.version, line.run_id, line.paused, line.final]).to.deep.equal([2, mock.runId, false, false]);
            expect(line.topology.identities.map((identity: { role: string }) => identity.role)).to.deep.equal(['coordinator', ...Array(7).fill('worker')]);
            expect(line.topology.run).to.deep.equal({
                scheduler: 'semi_centralized', load_balancer: 'quasi_horizontal', runtime_mode: 'multiprocessing', world_size: 8,
                threads_per_process: Math.max(...mock.topology.ranks.map(place => place.poolThreads)), gempba_version: '4.3.0',
                annotations: { mock: 'seed 42' }, markers: []
            });
            expect(mock.intervalMs).to.equal(100);
        });

        it('samples node frames at the one interval, as gempba 4.3 does', () => {
            const mock = run({}, { intervalMs: 100 });
            mock.advanceTo(10_000);
            const before = envelope(mock).nodes![0].sentinel_local_ms;
            mock.advanceTo(10_200);
            expect(envelope(mock).nodes![0].sentinel_local_ms - before).to.be.within(100, 200);
        });

        it('fills every field when asked: socket CPU and memory too', () => {
            const mock = run({ fidelity: 'full' }, { intervalMs: 100 });
            mock.advanceTo(20_000);
            const node = envelope(mock).nodes![1];
            expect(envelope(mock).version).to.equal(2);
            expect(node.sockets!.every(socket => socket.cpu_pct > 0 && socket.mem_used_bytes > 0)).to.equal(true);
            expect(mock.intervalMs).to.equal(100);
        });

        it('draws a new run id at each start, whatever the seed', () => {
            const [first, second] = [run(), run()];
            expect(first.runId).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            expect(second.runId).not.to.equal(first.runId);
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
