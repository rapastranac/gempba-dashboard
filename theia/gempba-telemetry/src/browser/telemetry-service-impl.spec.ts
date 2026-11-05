import '@theia/core/shared/reflect-metadata';
import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import { Container } from '@theia/core/shared/inversify';
import {
    ConnectionMode, ConnectionState, NodeHistoryStore, NodeSnapshot, RefreshInterval, SessionSpec, TargetSpec, RankHistoryStore, RankSnapshot, WorldSnapshot
} from '@gempba/core';
import { TelemetryServer } from '../common/telemetry-protocol';
import { ObservedIntervals, TelemetryService } from '../common/telemetry-service';
import { RateSettings } from './rate-settings';
import { TelemetryServerClientImpl } from './telemetry-server-client-impl';
import { TelemetryServiceImpl } from './telemetry-service-impl';

/** One node "h" whose rank 7 sent frame `seqNo` at `millis`, with a node frame its sentinel took at `millis`. */
function snapshot(host: string, seqNo = 1, millis = 0): WorldSnapshot {
    const rank: RankSnapshot = {
        id: 7, seqNo, localMillis: millis, pid: 0, sentinel: true, allowedCpuIds: [], tasksStartedTotal: 0, tasksRunning: 0,
        tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerThread: 0, cpuPct: 90, rssBytes: 0, threads: 1,
        elapsedSeconds: 0, peers: []
    };
    const node: NodeSnapshot = {
        host, socketCount: 1, physicalCores: 4, logicalCores: 4, hasLiveMemory: true, memTotalBytes: 100, memUsedBytes: 25,
        sentinelRank: 7, sentinelLocalMillis: millis, nodeUtilPct: 50,
        sockets: [{ socketId: 0, physicalCores: 4, logicalCores: 4, cpuIds: [0, 1, 2, 3], hasTopology: true, coreUsage: [], ranks: [rank] }]
    };
    return { ...WorldSnapshot.empty(), timestampMillis: 1, nodes: [node] };
}

/** The rate setting held in memory, announcing each saved change as the preferences do. */
class FakeRateSettings implements RateSettings {
    readonly ready = Promise.resolve();
    intervalMs = RefreshInterval.DEFAULT_MS;
    protected readonly onChangeEmitter = new Emitter<number>();
    readonly onChange = this.onChangeEmitter.event;

    async set(intervalMs: number): Promise<void> {
        this.intervalMs = intervalMs;
        this.onChangeEmitter.fire(intervalMs);
    }
}

describe('TelemetryServiceImpl', () => {

    let calls: string[];
    let receiver: TelemetryServerClientImpl;
    let nodeHistory: NodeHistoryStore;
    let rankHistory: RankHistoryStore;
    let settings: FakeRateSettings;
    let service: TelemetryService;

    beforeEach(() => {
        calls = [];
        const server: TelemetryServer = {
            availableModes: async () => [ConnectionMode.LOCAL],
            connect: async session => void calls.push(`connect ${session.mode}`),
            listen: async target => void calls.push(`listen ${target.gempbaPort}`),
            stop: async () => void calls.push('stop'),
            disconnect: async () => void calls.push('disconnect'),
            pushInterval: async ms => void calls.push(`interval ${ms}`),
            setClient: () => undefined,
            dispose: () => undefined
        };
        const container = new Container();
        container.bind(TelemetryServer).toConstantValue(server);
        container.bind(TelemetryServerClientImpl).toSelf().inSingletonScope();
        container.bind(NodeHistoryStore).toConstantValue(new NodeHistoryStore());
        container.bind(RankHistoryStore).toConstantValue(new RankHistoryStore());
        container.bind(RateSettings).toConstantValue(new FakeRateSettings());
        container.bind(TelemetryServiceImpl).toSelf().inSingletonScope();
        container.bind(TelemetryService).toService(TelemetryServiceImpl);
        receiver = container.get(TelemetryServerClientImpl);
        nodeHistory = container.get(NodeHistoryStore);
        rankHistory = container.get(RankHistoryStore);
        settings = container.get<FakeRateSettings>(RateSettings);
        service = container.get(TelemetryService);
    });

    it('starts disconnected with no snapshot, at the default rate', () => {
        expect([service.state, service.snapshot, service.lastFrameAt, service.lastLineAt, service.status])
            .to.deep.equal([ConnectionState.DISCONNECTED, undefined, undefined, undefined, '']);
        expect([service.intervalMs, service.observedIntervals]).to.deep.equal([RefreshInterval.DEFAULT_MS, { rankMs: undefined, nodeMs: undefined }]);
    });

    it('records the histories before announcing a snapshot', () => {
        const seen: number[][] = [];
        service.onSnapshot(() => seen.push([nodeHistory.seriesFor('h').cpu.length, rankHistory.seriesFor(7).cpu.length]));
        receiver.onSnapshot(snapshot('h'));
        expect(seen).to.deep.equal([[1, 1]]);
        expect(service.snapshot!.nodes[0].host).to.equal('h');
    });

    it('follows the backend state and status', () => {
        const states: ConnectionState[] = [];
        service.onStateChange(state => states.push(state));
        receiver.onStateChange(ConnectionState.LISTENING);
        receiver.onStatus('connected to 127.0.0.1:9000');
        expect(states).to.deep.equal([ConnectionState.LISTENING]);
        expect([service.state, service.status]).to.deep.equal([ConnectionState.LISTENING, 'connected to 127.0.0.1:9000']);
    });

    it('sends the rate as set before every Listen and Connect', async () => {
        settings.intervalMs = 250;
        await service.connect(SessionSpec.local());
        await service.listen(TargetSpec.of(undefined, 9001));
        expect(calls).to.deep.equal(['interval 250', 'connect LOCAL', 'interval 250', 'listen 9001']);
    });

    it('saves a new rate as a setting, then announces and sends it', async () => {
        const announced: number[] = [];
        service.onIntervalChange(intervalMs => announced.push(intervalMs));
        await service.setIntervalMs(100);
        expect([settings.intervalMs, service.intervalMs, announced]).to.deep.equal([100, 100, [100]]);
        expect(calls).to.deep.equal(['interval 100']);
    });

    it('observes how often frames arrive, on the senders\' own clocks', () => {
        receiver.onSnapshot(snapshot('h', 1, 10_000));
        receiver.onSnapshot(snapshot('h', 1, 10_000));
        receiver.onSnapshot(snapshot('h', 2, 10_250));
        expect(service.observedIntervals).to.deep.equal({ rankMs: 250, nodeMs: 250 });
        expect(ObservedIntervals.text(service.observedIntervals)).to.equal('rank frames arrive every 250 ms, node frames every 250 ms');
        expect([ObservedIntervals.text({ nodeMs: 1000 }), ObservedIntervals.text({})]).to.deep.equal(['node frames arrive every 1 s', '']);
    });

    it('keeps when the latest snapshot arrived, and when each node last sent a new frame', () => {
        const realNow = Date.now;
        try {
            Date.now = () => 1000;
            receiver.onSnapshot(snapshot('h', 1));
            Date.now = () => 1500;
            receiver.onSnapshot(snapshot('h', 1));
            expect([service.lastFrameAt, service.nodeFrameAt('h'), service.nodeFrameAt('other')]).to.deep.equal([1500, 1000, undefined]);
            Date.now = () => 2000;
            receiver.onSnapshot(snapshot('h', 2));
            expect([service.lastFrameAt, service.nodeFrameAt('h')]).to.deep.equal([2000, 2000]);
        } finally {
            Date.now = realNow;
        }
    });

    it('keeps the histories, observed rates and frame times through a paused line, which carries the header alone', () => {
        const realNow = Date.now;
        try {
            Date.now = () => 1000;
            receiver.onSnapshot(snapshot('h', 1, 0));
            Date.now = () => 1500;
            receiver.onSnapshot(snapshot('h', 2, 500));
            const announced: WorldSnapshot[] = [];
            service.onSnapshot(world => announced.push(world));
            Date.now = () => 9000;
            receiver.onSnapshot({ ...snapshot('h', 2, 500), paused: true, headerOnly: true });
            expect([nodeHistory.seriesFor('h').cpu.length, rankHistory.seriesFor(7).cpu.length]).to.deep.equal([2, 2]);
            expect(service.observedIntervals).to.deep.equal({ rankMs: 500, nodeMs: 500 });
            expect([service.lastFrameAt, service.nodeFrameAt('h'), service.lastLineAt]).to.deep.equal([1500, 1500, 9000]);
            expect(announced.map(world => world.paused), 'the views still hear of it').to.deep.equal([true]);
            Date.now = () => 9500;
            receiver.onSnapshot({ ...snapshot('h', 3, 9000), paused: true });
            expect([service.lastFrameAt, nodeHistory.seriesFor('h').cpu.length], 'a snapshot sent while paused is data').to.deep.equal([9500, 3]);
        } finally {
            Date.now = realNow;
        }
    });

    it('clears the histories, observed rates and frame times for another run, before its first snapshot', () => {
        receiver.onSnapshot({ ...snapshot('h', 1, 0), runId: 'a' });
        receiver.onSnapshot({ ...snapshot('h', 2, 500), runId: 'a' });
        receiver.onSnapshot({ ...snapshot('h', 3, 1000) });
        expect(rankHistory.seriesFor(7).cpu.length, 'a line without a run id is the same run').to.equal(3);
        const seen: number[] = [];
        service.onSnapshot(() => seen.push(rankHistory.seriesFor(7).cpu.length));
        receiver.onSnapshot({ ...snapshot('h', 1, 0), runId: 'b' });
        expect(seen).to.deep.equal([1]);
        expect([nodeHistory.seriesFor('h').cpu.length, service.observedIntervals.rankMs]).to.deep.equal([1, undefined]);
    });

    it('a new target clears the snapshot, the histories, the observed rates and the frame times', async () => {
        receiver.onSnapshot(snapshot('h', 1, 0));
        receiver.onSnapshot(snapshot('h', 2, 500));
        await service.listen(TargetSpec.of(undefined, 9001));
        expect(service.snapshot).to.equal(undefined);
        expect([nodeHistory.hosts(), rankHistory.ranks()]).to.deep.equal([[], []]);
        expect(service.observedIntervals).to.deep.equal({ rankMs: undefined, nodeMs: undefined });
        expect([service.lastFrameAt, service.lastLineAt, service.nodeFrameAt('h')]).to.deep.equal([undefined, undefined, undefined]);
    });

    it('forwards the other controls to the backend', async () => {
        await service.stop();
        await service.disconnect();
        expect(await service.availableModes()).to.deep.equal([ConnectionMode.LOCAL]);
        expect(calls).to.deep.equal(['stop', 'disconnect']);
    });
});
