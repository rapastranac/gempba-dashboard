import { Emitter } from '@theia/core/lib/common/event';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ConnectionMode, ConnectionState, NodeHistoryStore, SessionSpec, TargetSpec, WorldSnapshot } from '@gempba/core';
import { TelemetryServer } from '../common/telemetry-protocol';
import { TelemetryService } from '../common/telemetry-service';
import { TelemetryServerClientImpl } from './telemetry-server-client-impl';

@injectable()
export class TelemetryServiceImpl implements TelemetryService {

    @inject(TelemetryServer) protected readonly server: TelemetryServer;
    @inject(TelemetryServerClientImpl) protected readonly receiver: TelemetryServerClientImpl;
    @inject(NodeHistoryStore) protected readonly history: NodeHistoryStore;

    protected readonly onSnapshotEmitter = new Emitter<WorldSnapshot>();
    protected readonly onStateChangeEmitter = new Emitter<ConnectionState>();
    protected readonly onStatusEmitter = new Emitter<string>();
    readonly onSnapshot = this.onSnapshotEmitter.event;
    readonly onStateChange = this.onStateChangeEmitter.event;
    readonly onStatus = this.onStatusEmitter.event;

    protected currentState = ConnectionState.DISCONNECTED;
    protected latestSnapshot: WorldSnapshot | undefined;
    protected latestStatus = '';

    get state(): ConnectionState {
        return this.currentState;
    }

    get snapshot(): WorldSnapshot | undefined {
        return this.latestSnapshot;
    }

    get status(): string {
        return this.latestStatus;
    }

    @postConstruct()
    protected init(): void {
        this.receiver.snapshots(snapshot => {
            this.history.update(snapshot);
            this.latestSnapshot = snapshot;
            this.onSnapshotEmitter.fire(snapshot);
        });
        this.receiver.stateChanges(state => {
            this.currentState = state;
            this.onStateChangeEmitter.fire(state);
        });
        this.receiver.statuses(text => {
            this.latestStatus = text;
            this.onStatusEmitter.fire(text);
        });
    }

    availableModes(): Promise<ConnectionMode[]> {
        return this.server.availableModes();
    }

    connect(session: SessionSpec): Promise<void> {
        return this.server.connect(session);
    }

    listen(target: TargetSpec): Promise<void> {
        this.history.clear();
        this.latestSnapshot = undefined;
        return this.server.listen(target);
    }

    stop(): Promise<void> {
        return this.server.stop();
    }

    disconnect(): Promise<void> {
        return this.server.disconnect();
    }

    pushRates(workerIntervalMs: number, nodeIntervalMs: number): Promise<void> {
        return this.server.pushRates(workerIntervalMs, nodeIntervalMs);
    }
}
