/**
 * The gempba telemetry wire contract: one {@link BroadcastEnvelope} per newline-terminated JSON line,
 * and {@link ControlLine}s written back on the same socket. Field names stay snake_case as on the wire;
 * only the WorldSnapshotMapper translates them into the camelCase read-model. Parsing mirrors the
 * Java/Jackson contract: unknown fields are ignored, missing numbers read as 0, and missing objects or
 * lists stay undefined (a missing topology node `sockets` means something different from an empty one).
 */

export interface BroadcastEnvelope {
    readonly version: number;
    /** Epoch millis. */
    readonly ts: number;
    readonly elapsed_seconds: number;
    readonly topology?: Topology;
    readonly workers?: readonly WorkerFrame[];
    readonly nodes?: readonly NodeFrame[];
}

export interface Topology {
    readonly nodes?: readonly TopologyNode[];
    readonly identities?: readonly WorkerIdentity[];
}

export interface TopologyNode {
    readonly hostname?: string;
    readonly sentinel_worker_id: number;
    /** 0 when unknown (no hwloc). */
    readonly total_physical_cores: number;
    readonly total_logical_cores: number;
    /** Captured once at startup; the live NodeFrame carries current availability. */
    readonly mem_total_bytes: number;
    readonly worker_ids?: readonly number[];
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

export interface WorkerIdentity {
    readonly worker_id: number;
    readonly hostname?: string;
    readonly pid: number;
    readonly primary_socket: number;
    /** Plain CPU indices (not a bitmask, so not capped at 64); missing or empty means unrestricted. */
    readonly allowed_cpu_ids?: readonly number[];
}

/** Per-worker frame, emitted every worker interval (default 500 ms). */
export interface WorkerFrame {
    readonly worker_id: number;
    readonly seq_no: number;
    readonly worker_local_ms: number;
    readonly tasks_local_total: number;
    readonly tasks_sent_total: number;
    readonly tasks_recv_total: number;
    /** Tasks executing in the local pool right now (bounded by pool size). */
    readonly tasks_running: number;
    /** IPC scheduler queue depth; a different layer from tasks_running. */
    readonly scheduler_pending_count: number;
    /** Cumulative idle time, already averaged across the pool's threads. */
    readonly idle_microseconds_per_worker: number;
    /** Percent of one core: 400 means four cores pegged. */
    readonly process_cpu_pct: number;
    readonly process_rss_bytes: number;
    readonly process_threads: number;
    readonly edges_out?: readonly EdgeOut[];
}

/** Sender-side edge: what this worker has sent to one peer. */
export interface EdgeOut {
    readonly to: number;
    readonly bytes: number;
    readonly count: number;
}

/** Per-node frame, emitted only by the node's elected sentinel (default every 1 s). */
export interface NodeFrame {
    readonly sentinel_worker_id: number;
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
    readonly net_aggregate?: NetStats;
    readonly disk_aggregate?: DiskStats;
}

export interface SocketStats {
    readonly socket_id: number;
    readonly cpu_pct: number;
    readonly mem_total_bytes: number;
    readonly mem_used_bytes: number;
}

export interface NetStats {
    readonly bytes_in: number;
    readonly bytes_out: number;
    readonly packets_in: number;
    readonly packets_out: number;
}

export interface DiskStats {
    readonly read_bytes: number;
    readonly write_bytes: number;
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
            ts: num(json.ts),
            elapsed_seconds: num(json.elapsed_seconds),
            topology: nested(json.topology, Topology.fromJson),
            workers: list(json.workers, WorkerFrame.fromJson),
            nodes: list(json.nodes, NodeFrame.fromJson)
        };
    }
}

export namespace Topology {
    export function fromJson(value: unknown): Topology {
        const json = objectOf(value);
        return { nodes: list(json.nodes, TopologyNode.fromJson), identities: list(json.identities, WorkerIdentity.fromJson) };
    }
}

export namespace TopologyNode {
    export function fromJson(value: unknown): TopologyNode {
        const json = objectOf(value);
        return {
            hostname: str(json.hostname),
            sentinel_worker_id: num(json.sentinel_worker_id),
            total_physical_cores: num(json.total_physical_cores),
            total_logical_cores: num(json.total_logical_cores),
            mem_total_bytes: num(json.mem_total_bytes),
            worker_ids: list(json.worker_ids, num),
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

export namespace WorkerIdentity {
    export function fromJson(value: unknown): WorkerIdentity {
        const json = objectOf(value);
        return {
            worker_id: num(json.worker_id),
            hostname: str(json.hostname),
            pid: num(json.pid),
            primary_socket: num(json.primary_socket),
            allowed_cpu_ids: list(json.allowed_cpu_ids, num)
        };
    }
}

export namespace WorkerFrame {
    export function fromJson(value: unknown): WorkerFrame {
        const json = objectOf(value);
        return {
            worker_id: num(json.worker_id),
            seq_no: num(json.seq_no),
            worker_local_ms: num(json.worker_local_ms),
            tasks_local_total: num(json.tasks_local_total),
            tasks_sent_total: num(json.tasks_sent_total),
            tasks_recv_total: num(json.tasks_recv_total),
            tasks_running: num(json.tasks_running),
            scheduler_pending_count: num(json.scheduler_pending_count),
            idle_microseconds_per_worker: num(json.idle_microseconds_per_worker),
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
            sentinel_worker_id: num(json.sentinel_worker_id),
            sentinel_local_ms: num(json.sentinel_local_ms),
            hostname: str(json.hostname),
            socket_count: num(json.socket_count),
            logical_cores: num(json.logical_cores),
            mem_total_bytes: num(json.mem_total_bytes),
            mem_avail_bytes: num(json.mem_avail_bytes),
            cgroup_mem_used_bytes: num(json.cgroup_mem_used_bytes),
            cgroup_mem_limit_bytes: num(json.cgroup_mem_limit_bytes),
            sockets: list(json.sockets, SocketStats.fromJson),
            net_aggregate: nested(json.net_aggregate, NetStats.fromJson),
            disk_aggregate: nested(json.disk_aggregate, DiskStats.fromJson)
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

export namespace NetStats {
    export function fromJson(value: unknown): NetStats {
        const json = objectOf(value);
        return {
            bytes_in: num(json.bytes_in),
            bytes_out: num(json.bytes_out),
            packets_in: num(json.packets_in),
            packets_out: num(json.packets_out)
        };
    }
}

export namespace DiskStats {
    export function fromJson(value: unknown): DiskStats {
        const json = objectOf(value);
        return { read_bytes: num(json.read_bytes), write_bytes: num(json.write_bytes) };
    }
}

/** The control messages the dashboard writes back on the telemetry socket; gempba clamps the value itself. */
export enum ControlKind {
    SetWorkerIntervalMs = 'set_worker_interval_ms',
    SetNodeIntervalMs = 'set_node_interval_ms'
}

/** One `{"kind":…,"value":…}` control line; the value is an unsigned integer in milliseconds. */
export interface ControlLine {
    readonly kind: ControlKind;
    readonly value: number;
}

export namespace ControlLine {
    export function format(kind: ControlKind, value: number): string {
        return JSON.stringify({ kind, value: Math.round(value) }) + '\n';
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
        const ms = json.value;
        if (!kind || typeof ms !== 'number' || !Number.isInteger(ms) || ms < 0) {
            return undefined;
        }
        return { kind, value: ms };
    }
}
