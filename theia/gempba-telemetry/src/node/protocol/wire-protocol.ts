/**
 * The gempba telemetry wire contract: one {@link BroadcastEnvelope} per newline-terminated JSON line,
 * and {@link ControlLine}s written back on the same socket, as gempba v4.3.0 sends and takes them: telemetry schema 2,
 * which gempba documents in its `docs/telemetry/wire-format.md`. Keys are read by their names, never gated by a line's
 * `version`, so a line from an older gempba reads as whatever of it matches. Field names stay snake_case
 * as on the wire; only the WorldSnapshotMapper translates them into the camelCase read-model. Parsing mirrors the
 * Java/Jackson contract: unknown fields are ignored, missing numbers read as 0, and missing objects or
 * lists stay undefined (a missing topology node `sockets` means something different from an empty one).
 */

import { RunControl } from '../../common/run-control';

export interface BroadcastEnvelope {
    readonly version: number;
    /** A UUID v4 drawn once per run; schema 2. */
    readonly run_id?: string;
    /** Epoch millis. */
    readonly ts: number;
    readonly elapsed_seconds: number;
    /** Whether telemetry is paused. A paused line carries only this header; a full line sent while paused says so too. Schema 2. */
    readonly paused?: boolean;
    /** True only on the line rank 0, the aggregator, sends at shutdown, with the run's totals, before it closes; schema 2. */
    readonly final?: boolean;
    readonly topology?: Topology;
    /** Every rank's frame, whatever its role. */
    readonly ranks?: readonly RankFrame[];
    readonly nodes?: readonly NodeFrame[];
}

export interface Topology {
    readonly nodes?: readonly TopologyNode[];
    readonly identities?: readonly RankIdentity[];
    /** The run's setup; schema 2. */
    readonly run?: TopologyRun;
}

export interface TopologyRun {
    readonly scheduler?: string;
    readonly load_balancer?: string;
    readonly runtime_mode?: string;
    readonly world_size: number;
    readonly threads_per_process: number;
    readonly gempba_version?: string;
    /** In the order their keys were first set. */
    readonly annotations?: ReadonlyArray<readonly [string, string]>;
    readonly markers?: readonly RunMarkerFrame[];
}

export interface RunMarkerFrame {
    readonly elapsed_ms: number;
    readonly label?: string;
    readonly source?: string;
}

export interface TopologyNode {
    readonly hostname?: string;
    readonly sentinel_rank: number;
    /** 0 when unknown (no hwloc). */
    readonly total_physical_cores: number;
    readonly total_logical_cores: number;
    /** Captured once at startup; the live NodeFrame carries current availability. */
    readonly mem_total_bytes: number;
    readonly ranks?: readonly number[];
    readonly sockets?: readonly TopologySocket[];
}

export interface TopologySocket {
    readonly socket_id: number;
    readonly name?: string;
    /** 0 when unknown (no hwloc). */
    readonly physical_cores: number;
    readonly logical_cores: number;
    /** OS logical-CPU indices belonging to this socket. */
    readonly cpu_ids?: readonly number[];
}

export interface RankIdentity {
    readonly rank: number;
    readonly hostname?: string;
    readonly pid: number;
    readonly primary_socket: number;
    /** The scheduler's declared role, `coordinator` or `worker` (`center` before the rename); schema 2. */
    readonly role?: string;
    /** Plain CPU indices (not a bitmask, so not capped at 64); missing or empty means unrestricted. */
    readonly allowed_cpu_ids?: readonly number[];
}

/** Per-rank frame, emitted at the worker interval (default 500 ms). */
export interface RankFrame {
    readonly rank: number;
    readonly seq_no: number;
    readonly rank_local_ms: number;
    /** Subtrees handed to a pool thread, received ones included, counted at hand-off. */
    readonly tasks_started_total: number;
    readonly tasks_sent_total: number;
    readonly tasks_recv_total: number;
    // the time accounting and the scheduler's counters; a key a line leaves out reads 0
    readonly bytes_sent_total?: number;
    readonly bytes_recv_total?: number;
    readonly send_microseconds_total?: number;
    readonly recv_microseconds_total?: number;
    readonly spawn_rejected_pool_full?: number;
    readonly spawn_remote_rejected?: number;
    readonly idle_microseconds_starved?: number;
    readonly idle_microseconds_imbalanced?: number;
    readonly sched_running_microseconds?: number;
    readonly sched_waiting_microseconds?: number;
    readonly first_task_ms?: number;
    readonly last_task_ms?: number;
    readonly assign_latency_microseconds_total?: number;
    readonly assign_count?: number;
    readonly assign_latency_microseconds_max?: number;
    readonly available_microseconds_queue_empty?: number;
    readonly coordinator_state_msgs_total?: number;
    readonly coordinator_score_proposals_total?: number;
    readonly coordinator_score_broadcasts_total?: number;
    readonly score_proposals_sent?: number;
    readonly last_score_improvement_ms?: number;
    readonly coordinator_full_microseconds?: number;
    readonly telemetry_microseconds_total?: number;
    /** Tasks executing in the local pool right now (bounded by pool size). */
    readonly tasks_running: number;
    /** IPC scheduler queue depth; a different layer from tasks_running. */
    readonly scheduler_pending_count: number;
    /** Cumulative idle time, already averaged across the pool's threads. */
    readonly idle_microseconds_per_thread: number;
    /** Percent of one core: 400 means four cores pegged. */
    readonly process_cpu_pct: number;
    readonly process_rss_bytes: number;
    readonly process_threads: number;
    readonly edges_out?: readonly EdgeOut[];
}

/** Sender-side edge: what this rank has sent to one peer. */
export interface EdgeOut {
    readonly to: number;
    readonly bytes: number;
    readonly count: number;
}

/** Per-node frame, emitted only by the node's elected sentinel (default every 1 s). */
export interface NodeFrame {
    readonly sentinel_rank: number;
    readonly sentinel_local_ms: number;
    readonly hostname?: string;
    readonly socket_count: number;
    readonly logical_cores: number;
    readonly mem_total_bytes: number;
    readonly mem_avail_bytes: number;
    /** Job memory-cgroup usage; 0 when not in a memory cgroup. */
    readonly cgroup_mem_used_bytes: number;
    /** Job memory-cgroup limit; 0 when unlimited. */
    readonly cgroup_mem_limit_bytes: number;
    readonly sockets?: readonly SocketStats[];
}

export interface SocketStats {
    readonly socket_id: number;
    readonly cpu_pct: number;
    readonly mem_total_bytes: number;
    readonly mem_used_bytes: number;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectOf(value: unknown): JsonObject {
    return isObject(value) ? value : {};
}

function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function nested<T>(value: unknown, read: (value: unknown) => T): T | undefined {
    return isObject(value) ? read(value) : undefined;
}

function list<T>(value: unknown, read: (value: unknown) => T): T[] | undefined {
    return Array.isArray(value) ? value.map(read) : undefined;
}

export namespace BroadcastEnvelope {

    /** Parses one wire line; throws on malformed JSON or a payload that is not a JSON object. */
    export function parse(line: string): BroadcastEnvelope {
        const value: unknown = JSON.parse(line);
        if (!isObject(value)) {
            throw new Error('telemetry frame is not a JSON object');
        }
        return fromJson(value);
    }

    export function fromJson(value: unknown): BroadcastEnvelope {
        const json = objectOf(value);
        return {
            version: num(json.version),
            run_id: str(json.run_id),
            ts: num(json.ts),
            elapsed_seconds: num(json.elapsed_seconds),
            paused: bool(json.paused),
            final: bool(json.final),
            topology: nested(json.topology, Topology.fromJson),
            ranks: list(json.ranks, RankFrame.fromJson),
            nodes: list(json.nodes, NodeFrame.fromJson)
        };
    }
}

export namespace Topology {
    export function fromJson(value: unknown): Topology {
        const json = objectOf(value);
        return {
            nodes: list(json.nodes, TopologyNode.fromJson),
            identities: list(json.identities, RankIdentity.fromJson),
            run: nested(json.run, TopologyRun.fromJson)
        };
    }
}

export namespace TopologyRun {
    export function fromJson(value: unknown): TopologyRun {
        const json = objectOf(value);
        const annotations = isObject(json.annotations)
            ? Object.entries(json.annotations).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            : undefined;
        return {
            scheduler: str(json.scheduler),
            load_balancer: str(json.load_balancer),
            runtime_mode: str(json.runtime_mode),
            world_size: num(json.world_size),
            threads_per_process: num(json.threads_per_process),
            gempba_version: str(json.gempba_version),
            annotations,
            markers: list(json.markers, RunMarkerFrame.fromJson)
        };
    }
}

export namespace RunMarkerFrame {
    export function fromJson(value: unknown): RunMarkerFrame {
        const json = objectOf(value);
        return { elapsed_ms: num(json.elapsed_ms), label: str(json.label), source: str(json.source) };
    }
}

export namespace TopologyNode {
    export function fromJson(value: unknown): TopologyNode {
        const json = objectOf(value);
        return {
            hostname: str(json.hostname),
            sentinel_rank: num(json.sentinel_rank),
            total_physical_cores: num(json.total_physical_cores),
            total_logical_cores: num(json.total_logical_cores),
            mem_total_bytes: num(json.mem_total_bytes),
            ranks: list(json.ranks, num),
            sockets: list(json.sockets, TopologySocket.fromJson)
        };
    }
}

export namespace TopologySocket {
    export function fromJson(value: unknown): TopologySocket {
        const json = objectOf(value);
        return {
            socket_id: num(json.socket_id),
            name: str(json.name),
            physical_cores: num(json.physical_cores),
            logical_cores: num(json.logical_cores),
            cpu_ids: list(json.cpu_ids, num)
        };
    }
}

export namespace RankIdentity {
    export function fromJson(value: unknown): RankIdentity {
        const json = objectOf(value);
        return {
            rank: num(json.rank),
            hostname: str(json.hostname),
            pid: num(json.pid),
            primary_socket: num(json.primary_socket),
            role: str(json.role),
            allowed_cpu_ids: list(json.allowed_cpu_ids, num)
        };
    }
}

export namespace RankFrame {
    export function fromJson(value: unknown): RankFrame {
        const json = objectOf(value);
        return {
            rank: num(json.rank),
            seq_no: num(json.seq_no),
            rank_local_ms: num(json.rank_local_ms),
            tasks_started_total: num(json.tasks_started_total),
            tasks_sent_total: num(json.tasks_sent_total),
            tasks_recv_total: num(json.tasks_recv_total),
            bytes_sent_total: num(json.bytes_sent_total),
            bytes_recv_total: num(json.bytes_recv_total),
            send_microseconds_total: num(json.send_microseconds_total),
            recv_microseconds_total: num(json.recv_microseconds_total),
            spawn_rejected_pool_full: num(json.spawn_rejected_pool_full),
            spawn_remote_rejected: num(json.spawn_remote_rejected),
            idle_microseconds_starved: num(json.idle_microseconds_starved),
            idle_microseconds_imbalanced: num(json.idle_microseconds_imbalanced),
            sched_running_microseconds: num(json.sched_running_microseconds),
            sched_waiting_microseconds: num(json.sched_waiting_microseconds),
            first_task_ms: num(json.first_task_ms),
            last_task_ms: num(json.last_task_ms),
            assign_latency_microseconds_total: num(json.assign_latency_microseconds_total),
            assign_count: num(json.assign_count),
            assign_latency_microseconds_max: num(json.assign_latency_microseconds_max),
            available_microseconds_queue_empty: num(json.available_microseconds_queue_empty),
            coordinator_state_msgs_total: num(json.coordinator_state_msgs_total),
            coordinator_score_proposals_total: num(json.coordinator_score_proposals_total),
            coordinator_score_broadcasts_total: num(json.coordinator_score_broadcasts_total),
            score_proposals_sent: num(json.score_proposals_sent),
            last_score_improvement_ms: num(json.last_score_improvement_ms),
            coordinator_full_microseconds: num(json.coordinator_full_microseconds),
            telemetry_microseconds_total: num(json.telemetry_microseconds_total),
            tasks_running: num(json.tasks_running),
            scheduler_pending_count: num(json.scheduler_pending_count),
            idle_microseconds_per_thread: num(json.idle_microseconds_per_thread),
            process_cpu_pct: num(json.process_cpu_pct),
            process_rss_bytes: num(json.process_rss_bytes),
            process_threads: num(json.process_threads),
            edges_out: list(json.edges_out, EdgeOut.fromJson)
        };
    }
}

export namespace EdgeOut {
    export function fromJson(value: unknown): EdgeOut {
        const json = objectOf(value);
        return { to: num(json.to), bytes: num(json.bytes), count: num(json.count) };
    }
}

export namespace NodeFrame {
    export function fromJson(value: unknown): NodeFrame {
        const json = objectOf(value);
        return {
            sentinel_rank: num(json.sentinel_rank),
            sentinel_local_ms: num(json.sentinel_local_ms),
            hostname: str(json.hostname),
            socket_count: num(json.socket_count),
            logical_cores: num(json.logical_cores),
            mem_total_bytes: num(json.mem_total_bytes),
            mem_avail_bytes: num(json.mem_avail_bytes),
            cgroup_mem_used_bytes: num(json.cgroup_mem_used_bytes),
            cgroup_mem_limit_bytes: num(json.cgroup_mem_limit_bytes),
            sockets: list(json.sockets, SocketStats.fromJson)
        };
    }
}

export namespace SocketStats {
    export function fromJson(value: unknown): SocketStats {
        const json = objectOf(value);
        return {
            socket_id: num(json.socket_id),
            cpu_pct: num(json.cpu_pct),
            mem_total_bytes: num(json.mem_total_bytes),
            mem_used_bytes: num(json.mem_used_bytes)
        };
    }
}

/** The control lines a client writes back on the telemetry socket; gempba clamps an interval itself. */
export enum ControlKind {
    /** The one interval gempba v4.3.0 drives every frame and its broadcast at. */
    SetIntervalMs = 'set_interval_ms',
    /** An older name gempba v4.3.0 still takes as `set_interval_ms`, until v5.0.0 drops it. */
    SetWorkerIntervalMs = 'set_worker_interval_ms',
    /** An older control gempba v4.3.0 accepts and ignores. */
    SetNodeIntervalMs = 'set_node_interval_ms',
    /** From gempba v4.3.0: the ranks stop sending frames while their counters keep counting, and the stream sends header-only lines. */
    Pause = 'pause',
    Resume = 'resume',
    /** From gempba v4.3.0: one full line now, paused or not. */
    Snapshot = 'snapshot',
    /** From gempba v4.3.0: a labelled moment, listed in the run's markers. */
    Mark = 'mark'
}

/** One control line: an interval in whole milliseconds, a marker's label, or the kind alone. */
export type ControlLine = ControlLine.Interval | ControlLine.Mark | ControlLine.Plain;

export namespace ControlLine {

    export type IntervalKind = ControlKind.SetIntervalMs | ControlKind.SetWorkerIntervalMs | ControlKind.SetNodeIntervalMs;

    export interface Interval {
        readonly kind: IntervalKind;
        readonly value: number;
    }

    export interface Mark {
        readonly kind: ControlKind.Mark;
        readonly label: string;
    }

    export interface Plain {
        readonly kind: ControlKind.Pause | ControlKind.Resume | ControlKind.Snapshot;
    }

    /** gempba keeps a marker's label from 1 to 64 bytes. */
    export const MAX_LABEL_BYTES = RunControl.MAX_LABEL_BYTES;

    export function isInterval(line: ControlLine): line is Interval {
        return line.kind === ControlKind.SetIntervalMs || line.kind === ControlKind.SetWorkerIntervalMs || line.kind === ControlKind.SetNodeIntervalMs;
    }

    /** The line as written on the socket, its newline included: an interval in whole milliseconds, a mark with its label. */
    export function write(line: ControlLine): string {
        if (isInterval(line)) {
            return JSON.stringify({ kind: line.kind, value: Math.round(line.value) }) + '\n';
        }
        return JSON.stringify(line.kind === ControlKind.Mark ? { kind: line.kind, label: line.label } : { kind: line.kind }) + '\n';
    }

    export function format(kind: IntervalKind, value: number): string {
        return write({ kind, value });
    }

    /** The line a user's run control goes out as. */
    export function of(control: RunControl): ControlLine {
        switch (control.kind) {
            case 'pause':
                return { kind: ControlKind.Pause };
            case 'resume':
                return { kind: ControlKind.Resume };
            case 'snapshot':
                return { kind: ControlKind.Snapshot };
            case 'mark':
                return { kind: ControlKind.Mark, label: control.label };
        }
    }

    /** Mirrors gempba's forgiving parser: anything malformed or unknown reads as undefined. */
    export function parse(line: string): ControlLine | undefined {
        let value: unknown;
        try {
            value = JSON.parse(line);
        } catch {
            return undefined;
        }
        const json = objectOf(value);
        const kind = Object.values(ControlKind).find(candidate => candidate === str(json.kind)?.trim());
        switch (kind) {
            case undefined:
                return undefined;
            case ControlKind.SetIntervalMs:
            case ControlKind.SetWorkerIntervalMs:
            case ControlKind.SetNodeIntervalMs: {
                const ms = json.value;
                return typeof ms === 'number' && Number.isInteger(ms) && ms >= 0 ? { kind, value: ms } : undefined;
            }
            case ControlKind.Mark: {
                const label = str(json.label);
                const bytes = label === undefined ? 0 : new TextEncoder().encode(label).length;
                return label !== undefined && bytes >= 1 && bytes <= MAX_LABEL_BYTES ? { kind, label } : undefined;
            }
            default:
                return { kind };
        }
    }
}
