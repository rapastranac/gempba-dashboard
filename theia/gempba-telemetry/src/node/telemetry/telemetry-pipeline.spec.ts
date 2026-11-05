import { expect } from 'chai';
import { NodeSnapshot, WorldSnapshot } from '@gempba/core';
import { FrameListener } from '../client/frame-listener';
import { TelemetryClient } from '../client/telemetry-client';
import { MockEmitter } from '../mock/mock-emitter';
import { BroadcastEnvelope, ControlKind } from '../protocol/wire-protocol';
import { TelemetryStore } from './telemetry-store';
import { WorldSnapshotMapper } from './world-snapshot-mapper';

const GiB = 1024 ** 3;

async function eventually(condition: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error('condition not met in time');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

function node(snapshot: WorldSnapshot, host: string): NodeSnapshot {
    const found = snapshot.nodes.find(candidate => candidate.host === host);
    expect(found, host).not.to.equal(undefined);
    return found!;
}

/** The whole backend path over a real socket: mock emitter → TelemetryClient → TelemetryStore → read-model. */
describe('Telemetry pipeline against the mock emitter', () => {

    let emitter: MockEmitter;
    let client: TelemetryClient;
    const snapshots: WorldSnapshot[] = [];

    before(async () => {
        emitter = new MockEmitter({ frames: MockEmitter.load(MockEmitter.DEFAULT_FIXTURE), workerIntervalMs: 80, nodeIntervalMs: 50 });
        const port = await emitter.listen();
        const store = new TelemetryStore();
        const listener: FrameListener = {
            onConnected: () => undefined,
            onFrame: (frame: BroadcastEnvelope) => snapshots.push(store.ingest(frame)),
            onDisconnected: () => undefined
        };
        client = new TelemetryClient('127.0.0.1', port, listener);
        client.start();
        await eventually(() => snapshots.length >= 3);
    });

    after(async () => {
        client.close();
        await emitter.close();
    });

    it('lists hosts in first-seen order, orphan workers under the unknown host', () => {
        expect(snapshots[0].nodes.map(n => n.host)).to.deep.equal(['alpha', 'beta', WorldSnapshotMapper.UNKNOWN_HOST]);
        const orphan = node(snapshots[0], WorldSnapshotMapper.UNKNOWN_HOST);
        expect(orphan.sockets[0].hasTopology).to.equal(false);
        expect(orphan.sockets[0].ranks.map(w => w.id)).to.deep.equal([9]);
    });

    it('prefers the job cgroup over host memory', () => {
        const alpha = node(snapshots[0], 'alpha');
        expect([alpha.memTotalBytes, alpha.memUsedBytes]).to.deep.equal([16 * GiB, 8 * GiB]);
        const beta = node(snapshots[0], 'beta');
        expect([beta.memTotalBytes, beta.memUsedBytes]).to.deep.equal([32 * GiB, 8 * GiB]);
    });

    it('counts accessible cores as the allowed cpus within each socket', () => {
        const alpha = node(snapshots[0], 'alpha');
        expect(alpha.sockets.map(s => s.coreUsage.map(u => [u.rank, u.accessibleCores, u.socketCores])))
            .to.deep.equal([[[0, 2, 4]], [[1, 2, 4]]]);
        const beta = node(snapshots[0], 'beta');
        expect(beta.sockets[0].coreUsage.map(u => u.accessibleCores)).to.deep.equal([4]);
    });

    it('measures utilization against the allocation', () => {
        expect(node(snapshots[0], 'alpha').nodeUtilPct).to.be.closeTo(250 / 6, 1e-9);
    });

    it('keeps the cached topology for frames that arrive without one', () => {
        const second = snapshots[1];
        expect(second.nodes.map(n => n.host)).to.deep.equal(['alpha', 'beta', WorldSnapshotMapper.UNKNOWN_HOST]);
        expect(node(second, 'alpha').nodeUtilPct).to.be.closeTo(250 / 6, 1e-9);
        expect(node(second, 'alpha').hasLiveMemory).to.equal(false);
        expect(node(snapshots[2], 'alpha').hasLiveMemory).to.equal(true);
    });

    it('a control line from the client changes the emitter cadence', async () => {
        expect(client.sendControl(ControlKind.SetWorkerIntervalMs, 75)).to.equal(true);
        await eventually(() => emitter.workerIntervalMs === 75);
    });
});
