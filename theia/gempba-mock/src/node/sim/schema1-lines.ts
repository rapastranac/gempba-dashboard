import { DiskStats, NetStats, SocketStats, TopologySocket } from '@gempba/telemetry/lib/node/protocol/wire-protocol';

/**
 * What the mocker writes into a line, under telemetry schema 1's keys, which name every rank a worker. The parser's
 * types take gempba v4.3.0's names and read these as fallbacks, so the mocker keeps its own until it speaks schema 2.
 */
export interface Schema1Frame {
    readonly worker_id: number;
    readonly seq_no: number;
    readonly worker_local_ms: number;
    readonly tasks_started_total: number;
    readonly tasks_sent_total: number;
    readonly tasks_recv_total: number;
    readonly tasks_running: number;
    readonly scheduler_pending_count: number;
    readonly idle_microseconds_per_worker: number;
    readonly process_cpu_pct: number;
    readonly process_rss_bytes: number;
    readonly process_threads: number;
}

export interface Schema1NodeFrame {
    readonly sentinel_worker_id: number;
    readonly sentinel_local_ms: number;
    readonly hostname: string;
    readonly socket_count: number;
    readonly logical_cores: number;
    readonly mem_total_bytes: number;
    readonly mem_avail_bytes: number;
    readonly cgroup_mem_used_bytes: number;
    readonly cgroup_mem_limit_bytes: number;
    readonly sockets: readonly SocketStats[];
    readonly net_aggregate: NetStats;
    readonly disk_aggregate: DiskStats;
}

export interface Schema1Topology {
    readonly nodes: readonly Schema1TopologyNode[];
    readonly identities: readonly Schema1Identity[];
}

export interface Schema1TopologyNode {
    readonly hostname: string;
    readonly sentinel_worker_id: number;
    readonly total_physical_cores: number;
    readonly total_logical_cores: number;
    readonly mem_total_bytes: number;
    readonly worker_ids: readonly number[];
    readonly sockets: readonly TopologySocket[];
}

export interface Schema1Identity {
    readonly worker_id: number;
    readonly hostname: string;
    readonly pid: number;
    readonly primary_socket: number;
    readonly allowed_cpu_ids: readonly number[];
}
