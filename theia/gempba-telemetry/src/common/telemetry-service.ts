import { Event } from '@theia/core/lib/common/event';
import { ConnectionMode, ConnectionState, NodeSeries, SessionSpec, TargetSpec, WorldSnapshot } from '@gempba/core';

/**
 * The frontend API every feature injects: the active session's telemetry stream and its controls. Features
 * depend on this interface only, never on the RPC contract or the wire format behind it.
 */
export const TelemetryService = Symbol('TelemetryService');

export interface TelemetryService {
    readonly state: ConnectionState;
    /** The latest snapshot of the active session, for a view that opens mid-stream. */
    readonly snapshot: WorldSnapshot | undefined;
    /** The latest user-facing status line. */
    readonly status: string;
    readonly onSnapshot: Event<WorldSnapshot>;
    readonly onStateChange: Event<ConnectionState>;
    readonly onStatus: Event<string>;

    availableModes(): Promise<ConnectionMode[]>;
    /** Opens an SSH session (HOST, JUMP), authenticating once; a local gempba needs none. */
    connect(session: SessionSpec): Promise<void>;
    /**
     * Starts a new target over the open session, or on this machine when none is open; the snapshot and node
     * history are cleared first.
     */
    listen(target: TargetSpec): Promise<void>;
    /** Stops streaming; an SSH session stays open, a local stream ends in DISCONNECTED. */
    stop(): Promise<void>;
    disconnect(): Promise<void>;
    pushRates(workerIntervalMs: number, nodeIntervalMs: number): Promise<void>;
}

/** Per-node utilization history of the active session, updated before each snapshot is announced. */
export const NodeHistoryService = Symbol('NodeHistoryService');

export interface NodeHistoryService {
    seriesFor(host: string): NodeSeries;
    hosts(): readonly string[];
}
