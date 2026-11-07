import { Emitter } from '@theia/core/lib/common/event';
import { injectable } from '@theia/core/shared/inversify';
import { ConnectionState, StreamLink, WorldSnapshot } from '@gempba/core';
import { TelemetryServerClient } from '../common/telemetry-protocol';

/** Receives the backend's notifications and re-emits them inside the frontend. */
@injectable()
export class TelemetryServerClientImpl implements TelemetryServerClient {

    protected readonly onSnapshotEmitter = new Emitter<WorldSnapshot>();
    protected readonly onStateChangeEmitter = new Emitter<ConnectionState>();
    protected readonly onStatusEmitter = new Emitter<string>();
    protected readonly onLinkEmitter = new Emitter<StreamLink>();

    readonly snapshots = this.onSnapshotEmitter.event;
    readonly stateChanges = this.onStateChangeEmitter.event;
    readonly statuses = this.onStatusEmitter.event;
    readonly links = this.onLinkEmitter.event;

    onSnapshot(snapshot: WorldSnapshot): void {
        this.onSnapshotEmitter.fire(snapshot);
    }

    onStateChange(state: ConnectionState): void {
        this.onStateChangeEmitter.fire(state);
    }

    onStatus(text: string): void {
        this.onStatusEmitter.fire(text);
    }

    onLink(link: StreamLink): void {
        this.onLinkEmitter.fire(link);
    }
}
