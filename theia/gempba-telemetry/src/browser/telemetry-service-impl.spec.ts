import '@theia/core/shared/reflect-metadata';
import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import { Container } from '@theia/core/shared/inversify';
import {
    ConnectionMode, ConnectionState, NodeHistoryStore, NodeSnapshot, RefreshRates, SessionSpec, TargetSpec, WorkerHistoryStore, WorkerSnapshot, WorldSnapshot
} from '@gempba/core';
import { TelemetryServer } from '../common/telemetry-protocol';
import { TelemetryService } from '../common/telemetry-service';
import { RateSettings } from './rate-settings';
import { TelemetryServerClientImpl } from './telemetry-server-client-impl';
import { TelemetryServiceImpl } from './telemetry-service-impl';

/** One node "h" whose worker 7 sent frame `seqNo` at `millis`, with a node frame its sentinel took at `millis`. */
function snapshot(host: string, seqNo = 1, millis = 0): WorldSnapshot {
    const worker: WorkerSnapshot = {
        workerId: 7, seqNo, localMillis: millis, pid: 0, sentinel: true, allowedCpuIds: [], tasksStartedTotal: 0, tasksRunning: 0,
        tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerWorker: 0, cpuPct: 90, rssBytes: 0, threads: 1,
        elapsedSeconds: 0, peers: []
    };
    const node: NodeSnapshot = {
        host, socketCount: 1, physicalCores: 4, logicalCores: 4, hasLiveMemory: true, memTotalBytes: 100, memUsedBytes: 25,
        sentinelWorkerId: 7, sentinelLocalMillis: millis, nodeUtilPct: 50,
        sockets: [{ socketId: 0, physicalCores: 4, logicalCores: 4, cpuIds: [0, 1, 2, 3], hasTopology: true, coreUsage: [], workers: [worker] }]
    };
    return { ...WorldSnapshot.empty(), timestampMillis: 1, nodes: [node] };
}

/** Rate settings held in memory, announcing each saved change as the preferences do. */
class FakeRateSettings implements RateSettings {
    readonly ready = Promise.resolve();
    rates = RefreshRates.defaults();
    protected readonly onChangeEmitter = new Emitter<RefreshRates>();
    readonly onChange = this.onChangeEmitter.event;

    async set(rates: Partial<RefreshRates>): Promise<void> {
        this.rates = { ...this.rates, ...rates };
        this.onChangeEmitter.fire(this.rates);
    }
}

describe('TelemetryServiceImpl', () => {

    let calls: string[];
    let receiver: TelemetryServerClientImpl;
    let nodeHistory: NodeHistoryStore;
    let workerHistory: WorkerHistoryStore;
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
            pushRates: async (worker, node) => void calls.push(`rates ${worker} ${node}`),
            setClient: () => undefined,
            dispose: () => undefined
        };
        const container = new Container();
        container.bind(TelemetryServer).toConstantValue(server);
        container.bind(TelemetryServerClientImpl).toSelf().inSingletonScope();
        container.bind(NodeHistoryStore).toConstantValue(new NodeHistoryStore());
        container.bind(WorkerHistoryStore).toConstantValue(new WorkerHistoryStore());
        container.bind(RateSettings).toConstantValue(new FakeRateSettings());
        container.bind(TelemetryServiceImpl).toSelf().inSingletonScope();
        container.bind(TelemetryService).toService(TelemetryServiceImpl);
        receiver = container.get(TelemetryServerClientImpl);
        nodeHistory = container.get(NodeHistoryStore);
        workerHistory = container.get(WorkerHistoryStore);
        settings = container.get<FakeRateSettings>(RateSettings);
        service = container.get(TelemetryService);
    });

    it('starts disconnected with no snapshot, at the default rates', () => {
        expect([service.state, service.snapshot, service.lastFrameAt, service.status]).to.deep.equal([ConnectionState.DISCONNECTED, undefined, undefined, '']);
        expect([service.rates, service.observedRates]).to.deep.equal([RefreshRates.defaults(), { workerIntervalMs: undefined, nodeIntervalMs: undefined }]);
    });

    it('records the histories before announcing a snapshot', () => {
        const seen: number[][] = [];
        service.onSnapshot(() => seen.push([nodeHistory.seriesFor('h').cpu.length, workerHistory.seriesFor(7).cpu.length]));
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

    it('sends the rates as set before every Listen and Connect', async () => {
        settings.rates = { workerIntervalMs: 250, nodeIntervalMs: 2000 };
        await service.connect(SessionSpec.local());
        await service.listen(TargetSpec.of(undefined, 9001));
        expect(calls).to.deep.equal(['rates 250 2000', 'connect LOCAL', 'rates 250 2000', 'listen 9001']);
    });

    it('saves new rates as settings, then announces and sends them', async () => {
        const announced: RefreshRates[] = [];
        service.onRatesChange(rates => announced.push(rates));
        await service.setRates({ workerIntervalMs: 100 });
        expect(settings.rates).to.deep.equal({ workerIntervalMs: 100, nodeIntervalMs: 1000 });
        expect(service.rates).to.deep.equal(settings.rates);
        expect(announced).to.deep.equal([settings.rates]);
        expect(calls).to.deep.equal(['rates 100 1000']);
    });

    it('observes how often frames arrive, on the senders\' own clocks', () => {
        receiver.onSnapshot(snapshot('h', 1, 10_000));
        receiver.onSnapshot(snapshot('h', 1, 10_000));
        receiver.onSnapshot(snapshot('h', 2, 10_250));
        expect(service.observedRates).to.deep.equal({ workerIntervalMs: 250, nodeIntervalMs: 250 });
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

    it('a new target clears the snapshot, the histories, the observed rates and the frame times', async () => {
        receiver.onSnapshot(snapshot('h', 1, 0));
        receiver.onSnapshot(snapshot('h', 2, 500));
        await service.listen(TargetSpec.of(undefined, 9001));
        expect(service.snapshot).to.equal(undefined);
        expect([nodeHistory.hosts(), workerHistory.workerIds()]).to.deep.equal([[], []]);
        expect(service.observedRates).to.deep.equal({ workerIntervalMs: undefined, nodeIntervalMs: undefined });
        expect([service.lastFrameAt, service.nodeFrameAt('h')]).to.deep.equal([undefined, undefined]);
    });

    it('forwards the other controls to the backend', async () => {
        await service.stop();
        await service.disconnect();
        expect(await service.availableModes()).to.deep.equal([ConnectionMode.LOCAL]);
        expect(calls).to.deep.equal(['stop', 'disconnect']);
    });
});
