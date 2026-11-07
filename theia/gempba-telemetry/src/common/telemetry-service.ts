import { Event } from '@theia/core/lib/common/event';
import {
    ConnectionMode, ConnectionState, CountHistories, NodeSeries, RankSeries, RefreshInterval, SessionSpec, StreamCondition, StreamLink, TargetSpec, WorldSnapshot
} from '@gempba/core';

/**
 * The frontend API every feature injects: the active session's telemetry stream and its controls. Features
 * depend on this interface only, never on the RPC contract or the wire format behind it.
 */
export const TelemetryService = Symbol('TelemetryService');

export interface TelemetryService {
    readonly state: ConnectionState;
    /** The latest snapshot of the active session, for a view that opens mid-stream. */
    readonly snapshot: WorldSnapshot | undefined;
    /**
     * When the latest snapshot with frames arrived, on this machine's clock; `undefined` before the first of a stream or
     * a run. A paused line, the header alone, leaves it.
     */
    readonly lastFrameAt: number | undefined;
    /** When the latest line of any kind arrived, paused lines included; `undefined` before the first of a stream or a run. */
    readonly lastLineAt: number | undefined;
    /** The latest user-facing status line. */
    readonly status: string;
    /** What the stream's link did last: up, retrying, or why it stopped; `undefined` from a new Listen until the backend reports. */
    readonly link: StreamLink | undefined;
    /** What the views say about the data held, from the state, the link and the latest snapshot; `undefined` while none is held. */
    readonly condition: StreamCondition | undefined;
    readonly onSnapshot: Event<WorldSnapshot>;
    readonly onStateChange: Event<ConnectionState>;
    readonly onStatus: Event<string>;
    readonly onLinkChange: Event<StreamLink | undefined>;
    /** The held data was emptied, by Clear or a new Listen: views redraw from the empty hub. */
    readonly onClear: Event<void>;
    /**
     * The refresh rate the user chose, in milliseconds: how often gempba sends every frame, rank and node frames alike.
     * It is a setting every window shares, sent to gempba before every Listen and Connect, and on every change.
     */
    readonly intervalMs: number;
    /** How often frames actually arrive, measured on gempba's own clocks since it acknowledges no change. */
    readonly observedIntervals: ObservedIntervals;
    readonly onIntervalChange: Event<number>;

    /**
     * When one of the node's ranks last sent a new frame, on this machine's clock; `undefined` before any. A node whose
     * ranks stalled keeps its time while the stream goes on.
     */
    nodeFrameAt(host: string): number | undefined;
    availableModes(): Promise<ConnectionMode[]>;
    /** Opens an SSH session (HOST, JUMP), authenticating once; a local gempba needs none. */
    connect(session: SessionSpec): Promise<void>;
    /**
     * Starts a new target over the open session, or on this machine when none is open; the snapshot, the
     * histories, the observed rates and the frame times are cleared first, as by {@link clear}. Another run on the same
     * target, told by its run id, clears them too, before its first snapshot.
     */
    listen(target: TargetSpec): Promise<void>;
    /** Stops streaming; an SSH session stays open, a local stream ends in DISCONNECTED. */
    stop(): Promise<void>;
    disconnect(): Promise<void>;
    /**
     * Empties the snapshot, the histories, the observed rates and the frame times, and fires {@link onClear}. The commands offer
     * it for frozen data only: a live stream would refill the views with its next frame.
     */
    clear(): void;
    /** Asks gempba to pause its telemetry: its ranks stop sending frames, and the stream stays connected with header-only lines. */
    pause(): Promise<void>;
    /** Asks gempba to resume its telemetry. */
    resume(): Promise<void>;
    /** Asks gempba for one full line now, paused or not. */
    requestSnapshot(): Promise<void>;
    /** Marks this moment of the run with a label of 1 to 64 bytes, listed in the run's markers. */
    mark(label: string): Promise<void>;
    /** Saves a new refresh rate as the user's setting, which applies it in every window. */
    setIntervalMs(intervalMs: number): Promise<void>;
}

/** How often rank frames and node frames arrive, in milliseconds; each unknown until measured. */
export interface ObservedIntervals {
    readonly rankMs?: number;
    readonly nodeMs?: number;
}

export namespace ObservedIntervals {

    /** `rank frames arrive every 650 ms, node frames every 1 s`, leaving out what isn't measured; empty before anything is. */
    export function text(observed: ObservedIntervals): string {
        const rank = observed.rankMs === undefined ? undefined : `rank frames arrive every ${RefreshInterval.label(observed.rankMs)}`;
        const node = observed.nodeMs === undefined ? undefined : `node frames ${rank ? '' : 'arrive '}every ${RefreshInterval.label(observed.nodeMs)}`;
        return [rank, node].filter(part => part !== undefined).join(', ');
    }
}

/** Per-node utilization history of the active session, updated before each snapshot is announced. */
export const NodeHistoryService = Symbol('NodeHistoryService');

export interface NodeHistoryService {
    seriesFor(host: string): NodeSeries;
    hosts(): readonly string[];
}

/** Per-rank live history of the active session, with node and cluster throughput, updated before each snapshot is announced. */
export const RankHistoryService = Symbol('RankHistoryService');

export interface RankHistoryService {
    seriesFor(id: number): RankSeries;
    /** Tasks started per second by all of one node's ranks, oldest first. */
    throughputFor(host: string): readonly number[];
    /** One node's sums of its ranks' counts, as running totals and as rates, oldest first; tasks run locally leave out a coordinator. */
    countsFor(host: string): CountHistories;
    /** Tasks started per second by every rank, oldest first. */
    clusterThroughput(): readonly number[];
}
