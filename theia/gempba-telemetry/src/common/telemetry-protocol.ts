import { RpcServer } from '@theia/core/lib/common/messaging/proxy-factory';
import { ConnectionMode, ConnectionState, SessionSpec, StreamLink, TargetSpec, WorldSnapshot } from '@gempba/core';

/**
 * The JSON-RPC contract between the telemetry backend and the frontend `TelemetryService`. Only read-model
 * types cross it; features never see it.
 */
export const TELEMETRY_SERVICE_PATH = '/services/gempba-telemetry';

export const TelemetryServer = Symbol('TelemetryServer');

export interface TelemetryServer extends RpcServer<TelemetryServerClient> {
    /** The connection modes a tunnel provider is installed for. */
    availableModes(): Promise<ConnectionMode[]>;
    /** Opens an SSH session, authenticating once; rejects when it cannot. LOCAL needs none. */
    connect(session: SessionSpec): Promise<void>;
    /** Streams one gempba run's telemetry over the open session, or on this machine when none is open, replacing any previous target. */
    listen(target: TargetSpec): Promise<void>;
    /** Stops streaming; an SSH session stays open for the next target, a local stream simply ends. */
    stop(): Promise<void>;
    disconnect(): Promise<void>;
    /** Sends the refresh rate now if streaming, and on every later (re)connect, for rank and node frames alike. */
    pushInterval(intervalMs: number): Promise<void>;
}

/** Backend-to-frontend notifications; the `on` prefix makes them one-way RPC messages. */
export interface TelemetryServerClient {
    onSnapshot(snapshot: WorldSnapshot): void;
    onStateChange(state: ConnectionState): void;
    onStatus(text: string): void;
    /** What the stream's link did last: up, retrying, or why it stopped; sent once per change, and again for each new Listen. */
    onLink(link: StreamLink): void;
}
