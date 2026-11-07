import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { RankSnapshot, WorldSnapshot } from '@gempba/core';
import { TelemetryStore } from '../telemetry/telemetry-store';
import { WorldSnapshotMapper } from '../telemetry/world-snapshot-mapper';
import { BroadcastEnvelope } from './wire-protocol';

function linesOf(fixture: string): string[] {
    return fs.readFileSync(path.resolve(__dirname, '../../../fixtures', fixture), 'utf8').split('\n').filter(line => line.trim().length > 0);
}

/**
 * Lines recorded from a real gempba run of telemetry schema 2 (gempba-examples' bitvect semi-centralized example,
 * four ranks on one host, against gempba's #333 branch): a full line, a paused line, and a snapshot sent while paused.
 */
const [FULL, PAUSED, SNAPSHOT_WHILE_PAUSED] = linesOf('schema2-run.ndjson');

function ranksOf(world: WorldSnapshot): RankSnapshot[] {
    return world.nodes.flatMap(node => node.sockets.flatMap(socket => socket.ranks));
}

describe('Telemetry schema 2', () => {

    describe('parsing', () => {

        it('reads the run id, the pause, and each rank\'s role', () => {
            const envelope = BroadcastEnvelope.parse(FULL);
            expect(envelope.version).to.equal(2);
            expect(envelope.run_id).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            expect([envelope.paused, envelope.final]).to.deep.equal([false, false]);
            expect(envelope.topology!.identities!.map(identity => identity.role)).to.deep.equal(['coordinator', 'worker', 'worker', 'worker']);
        });

        it('reads the run setup, with a marker a dashboard sent', () => {
            const run = BroadcastEnvelope.parse(FULL).topology!.run!;
            expect(run).to.include({ scheduler: 'semi_centralized', load_balancer: 'quasi_horizontal', runtime_mode: 'multiprocessing', world_size: 4, threads_per_process: 2 });
            expect(run.gempba_version).to.be.a('string');
            expect(run.annotations).to.deep.equal([]);
            expect(run.markers).to.have.lengthOf(1);
            expect(run.markers![0]).to.include({ label: 'fixture recorded', source: 'dashboard' });
        });

        it('reads tasks started and the time-accounting counters', () => {
            const [coordinator, rank] = BroadcastEnvelope.parse(FULL).ranks!;
            expect(coordinator.tasks_started_total).to.equal(0);
            expect(coordinator.assign_count).to.be.above(0);
            expect(coordinator.coordinator_state_msgs_total).to.be.above(0);
            expect(rank.tasks_started_total).to.be.above(0);
            expect(rank.sched_running_microseconds! + rank.sched_waiting_microseconds!).to.be.above(0);
            expect(rank.idle_microseconds_starved! + rank.idle_microseconds_imbalanced!).to.be.closeTo(rank.idle_microseconds_per_thread, 1);
            expect(rank.telemetry_microseconds_total).to.be.above(0);
        });

        it('reads a paused line as the header alone', () => {
            const envelope = BroadcastEnvelope.parse(PAUSED);
            expect(envelope).to.include({ version: 2, paused: true });
            expect([envelope.topology, envelope.ranks, envelope.nodes]).to.deep.equal([undefined, undefined, undefined]);
        });

        it('reads a snapshot sent while paused as a full line', () => {
            const envelope = BroadcastEnvelope.parse(SNAPSHOT_WHILE_PAUSED);
            expect(envelope.paused).to.equal(true);
            expect(envelope.ranks).to.have.lengthOf(4);
        });

        it('reads the final line\'s flag', () => {
            const line = '{"version":2,"run_id":"6a5a9990-6f0f-4972-b6be-9d4bae4ead1e","ts":1,"elapsed_seconds":2,"paused":false,"final":true,"ranks":[]}';
            expect(BroadcastEnvelope.parse(line).final).to.equal(true);
        });

        it('keeps the annotations in the order their keys were set, and only string values', () => {
            const line = '{"version":2,"topology":{"run":{"annotations":{"problem":"mvc","seed":"7","bad":3}}}}';
            expect(BroadcastEnvelope.parse(line).topology!.run!.annotations).to.deep.equal([['problem', 'mvc'], ['seed', '7']]);
        });
    });

    describe('a recorded line', () => {

        it('maps a real line of gempba 4.3 into its ranks, roles, accounting and sentinel', () => {
            const world = WorldSnapshotMapper.toWorldSnapshot(BroadcastEnvelope.parse(FULL));
            expect(world.nodes.map(node => node.host)).to.deep.equal(['DESKTOP']);
            expect(ranksOf(world).map(rank => rank.role)).to.deep.equal(['coordinator', 'worker', 'worker', 'worker']);
            expect([0, 1].map(id => WorldSnapshot.isCoordinator(world, id))).to.deep.equal([true, false]);
            expect(WorldSnapshot.rankOf(world, 0)!.accounting!.coordinatorStateMsgsTotal).to.be.above(0);
            expect(ranksOf(world).filter(rank => rank.sentinel)).to.have.lengthOf(1);
            const rank = WorldSnapshot.rankOf(world, 1)!;
            expect([rank.localMillis, rank.idleMicrosPerThread].every(value => value > 0)).to.equal(true);
        });
    });

    describe('mapping', () => {

        it('carries the run id, setup, roles and pause into the model', () => {
            const world = WorldSnapshotMapper.toWorldSnapshot(BroadcastEnvelope.parse(FULL));
            expect(world.runId).to.equal(BroadcastEnvelope.parse(FULL).run_id);
            expect(world.run).to.include({ scheduler: 'semi_centralized', loadBalancer: 'quasi_horizontal', runtimeMode: 'multiprocessing', worldSize: 4 });
            expect(world.run!.markers[0]).to.include({ label: 'fixture recorded', source: 'dashboard' });
            expect([world.paused, world.final]).to.deep.equal([false, false]);
            expect(ranksOf(world).map(rank => rank.role)).to.deep.equal(['coordinator', 'worker', 'worker', 'worker']);
            expect([0, 1].map(id => WorldSnapshot.isCoordinator(world, id))).to.deep.equal([true, false]);
        });

        it('carries each rank\'s time accounting', () => {
            const envelope = BroadcastEnvelope.parse(FULL);
            const world = WorldSnapshotMapper.toWorldSnapshot(envelope);
            const coordinator = WorldSnapshot.rankOf(world, 0)!;
            expect(coordinator.accounting).to.include({
                assignCount: envelope.ranks![0].assign_count, coordinatorStateMsgsTotal: envelope.ranks![0].coordinator_state_msgs_total
            });
            const rank = WorldSnapshot.rankOf(world, 1)!;
            expect(rank.tasksStartedTotal).to.equal(envelope.ranks![1].tasks_started_total);
            expect(rank.accounting).to.include({
                schedRunningMicros: envelope.ranks![1].sched_running_microseconds,
                idleMicrosStarved: envelope.ranks![1].idle_microseconds_starved,
                bytesSentTotal: envelope.ranks![1].bytes_sent_total
            });
        });
    });

    describe('the store', () => {

        it('keeps the last data through a paused line, marked paused', () => {
            const store = new TelemetryStore();
            const before = store.ingest(BroadcastEnvelope.parse(FULL));
            const paused = store.ingest(BroadcastEnvelope.parse(PAUSED));
            expect(paused.paused).to.equal(true);
            expect(paused.nodes).to.equal(before.nodes);
            expect([paused.runId, paused.timestampMillis]).to.deep.equal([before.runId, before.timestampMillis]);
            expect([before.headerOnly, paused.headerOnly], 'no new frame').to.deep.equal([undefined, true]);
        });

        it('takes a snapshot sent while paused as new data', () => {
            const store = new TelemetryStore();
            store.ingest(BroadcastEnvelope.parse(FULL));
            store.ingest(BroadcastEnvelope.parse(PAUSED));
            const snapshot = store.ingest(BroadcastEnvelope.parse(SNAPSHOT_WHILE_PAUSED));
            expect(snapshot.paused).to.equal(true);
            expect(snapshot.timestampMillis).to.equal(BroadcastEnvelope.parse(SNAPSHOT_WHILE_PAUSED).ts);
            expect(WorldSnapshot.totalRanks(snapshot)).to.equal(4);
            expect(snapshot.headerOnly, 'new frames').to.equal(undefined);
        });

        it('maps a paused line as is before any data, and forgets the last data on reset', () => {
            const store = new TelemetryStore();
            const first = store.ingest(BroadcastEnvelope.parse(PAUSED));
            expect([first.nodes, first.paused, first.headerOnly]).to.deep.equal([[], true, true]);
            store.ingest(BroadcastEnvelope.parse(FULL));
            store.reset();
            expect(store.ingest(BroadcastEnvelope.parse(PAUSED)).nodes).to.deep.equal([]);
        });

        it('starts afresh on another run\'s line: a restarted gempba\'s paused line shows none of the last run\'s data', () => {
            const store = new TelemetryStore();
            store.ingest(BroadcastEnvelope.parse(FULL));
            const next = store.ingest({ ...BroadcastEnvelope.parse(PAUSED), run_id: 'the next run' });
            expect([next.runId, next.nodes, next.headerOnly]).to.deep.equal(['the next run', [], true]);
        });
    });
});
