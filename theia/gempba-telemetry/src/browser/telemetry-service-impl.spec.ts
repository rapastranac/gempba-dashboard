import '@theia/core/shared/reflect-metadata';
import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { ConnectionMode, ConnectionState, NodeHistoryStore, NodeSnapshot, SessionSpec, TargetSpec, WorkerHistoryStore, WorkerSnapshot, WorldSnapshot } from '@gempba/core';
import { TelemetryServer } from '../common/telemetry-protocol';
import { TelemetryService } from '../common/telemetry-service';
import { TelemetryServerClientImpl } from './telemetry-server-client-impl';
import { TelemetryServiceImpl } from './telemetry-service-impl';

function snapshot(host: string): WorldSnapshot {
    const worker: WorkerSnapshot = {
        workerId: 7, seqNo: 1, localMillis: 0, pid: 0, sentinel: true, allowedCpuIds: [], tasksLocalTotal: 0, tasksRunning: 0,
        tasksSentTotal: 0, tasksRecvTotal: 0, schedulerPendingCount: 0, idleMicrosPerWorker: 0, cpuPct: 90, rssBytes: 0, threads: 1,
        elapsedSeconds: 0, peers: []
    };
    const node: NodeSnapshot = {
        host, socketCount: 1, physicalCores: 4, logicalCores: 4, hasLiveMemory: true, memTotalBytes: 100, memUsedBytes: 25,
        sentinelWorkerId: 7, sentinelLocalMillis: 0, nodeUtilPct: 50,
        sockets: [{ socketId: 0, physicalCores: 4, logicalCores: 4, cpuIds: [0, 1, 2, 3], hasTopology: true, coreUsage: [], workers: [worker] }]
    };
    return { ...WorldSnapshot.empty(), timestampMillis: 1, nodes: [node] };
}

describe('TelemetryServiceImpl', () => {

    let calls: string[];
    let receiver: TelemetryServerClientImpl;
    let nodeHistory: NodeHistoryStore;
    let workerHistory: WorkerHistoryStore;
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
        container.bind(TelemetryServiceImpl).toSelf().inSingletonScope();
        container.bind(TelemetryService).toService(TelemetryServiceImpl);
        receiver = container.get(TelemetryServerClientImpl);
        nodeHistory = container.get(NodeHistoryStore);
        workerHistory = container.get(WorkerHistoryStore);
        service = container.get(TelemetryService);
    });

    it('starts disconnected with no snapshot', () => {
        expect([service.state, service.snapshot, service.status]).to.deep.equal([ConnectionState.DISCONNECTED, undefined, '']);
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

    it('a new target clears the snapshot and the histories', async () => {
        receiver.onSnapshot(snapshot('h'));
        await service.listen(TargetSpec.of(undefined, 9001));
        expect(service.snapshot).to.equal(undefined);
        expect([nodeHistory.hosts(), workerHistory.workerIds()]).to.deep.equal([[], []]);
        expect(calls).to.deep.equal(['listen 9001']);
    });

    it('forwards the controls to the backend', async () => {
        await service.connect(SessionSpec.local());
        await service.pushRates(100, 1000);
        await service.stop();
        await service.disconnect();
        expect(await service.availableModes()).to.deep.equal([ConnectionMode.LOCAL]);
        expect(calls).to.deep.equal(['connect LOCAL', 'rates 100 1000', 'stop', 'disconnect']);
    });
});
