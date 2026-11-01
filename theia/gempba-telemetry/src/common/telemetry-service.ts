import { Event } from '@theia/core/lib/common/event';
import { ConnectionMode, ConnectionState, NodeSeries, RefreshRates, SessionSpec, TargetSpec, WorkerSeries, WorldSnapshot } from '@gempba/core';

/**
 * The frontend API every feature injects: the active session's telemetry stream and its controls. Features
 * depend on this interface only, never on the RPC contract or the wire format behind it.
 */
export const TelemetryService = Symbol('TelemetryService');

export interface TelemetryService {
    readonly state: ConnectionState;
    /** The latest snapshot of the active session, for a view that opens mid-stream. */
    readonly snapshot: WorldSnapshot | undefined;
    /** When the latest snapshot arrived, on this machine's clock; `undefined` before the first of a stream. */
    readonly lastFrameAt: number | undefined;
    /** The latest user-facing status line. */
    readonly status: string;
    readonly onSnapshot: Event<WorldSnapshot>;
    readonly onStateChange: Event<ConnectionState>;
    readonly onStatus: Event<string>;
    /**
     * The refresh rates the user chose, kept as settings every window shares. They are sent to gempba before every
     * Listen and Connect, and on every change.
     */
    readonly rates: RefreshRates;
    /** How often frames actually arrive, measured on gempba's own clocks since it acknowledges no change; unknown until measured. */
    readonly observedRates: Partial<RefreshRates>;
    readonly onRatesChange: Event<RefreshRates>;

    /**
     * When one of the node's workers last sent a new frame, on this machine's clock; `undefined` before any. A node whose
     * workers stalled keeps its time while the stream goes on.
     */
    nodeFrameAt(host: string): number | undefined;
    availableModes(): Promise<ConnectionMode[]>;
    /** Opens an SSH session (HOST, JUMP), authenticating once; a local gempba needs none. */
    connect(session: SessionSpec): Promise<void>;
    /**
     * Starts a new target over the open session, or on this machine when none is open; the snapshot, the
     * histories, the observed rates and the frame times are cleared first.
     */
    listen(target: TargetSpec): Promise<void>;
    /** Stops streaming; an SSH session stays open, a local stream ends in DISCONNECTED. */
    stop(): Promise<void>;
    disconnect(): Promise<void>;
    /** Saves new rates as the user's settings, which applies them in every window. */
    setRates(rates: Partial<RefreshRates>): Promise<void>;
}

/** Per-node utilization history of the active session, updated before each snapshot is announced. */
export const NodeHistoryService = Symbol('NodeHistoryService');

export interface NodeHistoryService {
    seriesFor(host: string): NodeSeries;
    hosts(): readonly string[];
}

/** Per-worker live history of the active session, with node and cluster throughput, updated before each snapshot is announced. */
export const WorkerHistoryService = Symbol('WorkerHistoryService');

export interface WorkerHistoryService {
    seriesFor(workerId: number): WorkerSeries;
    /** Tasks started per second by all of one node's workers, oldest first. */
    throughputFor(host: string): readonly number[];
    /** Tasks started per second by every worker, oldest first. */
    clusterThroughput(): readonly number[];
}
