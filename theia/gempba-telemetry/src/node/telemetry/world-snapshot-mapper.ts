import {
    CoreUsageSnapshot, NodeSnapshot, NodeUtilization, RunSetup, SocketSnapshot, StructureKey, RankAccounting, SchedulerRole, RankSnapshot, WorldSnapshot
} from '@gempba/core';
import { BroadcastEnvelope, NodeFrame, TopologyNode, TopologyRun, TopologySocket, RankFrame, RankIdentity } from '../protocol/wire-protocol';

/**
 * The one place wire types meet the read-model: a pure BroadcastEnvelope → WorldSnapshot mapping.
 * Order is preserved: nodes in first-seen host order, sockets by ascending id, ranks in frame order.
 */
export namespace WorldSnapshotMapper {

    /** Host bucket for ranks with no identity or topology mapping. */
    export const UNKNOWN_HOST = '(unknown host)';

    /** The first schema with the run's id and setup, each rank's role and the time accounting. */
    export const SCHEMA_WITH_ACCOUNTING = 2;

    export function toWorldSnapshot(envelope: BroadcastEnvelope | undefined): WorldSnapshot {
        if (!envelope) {
            return WorldSnapshot.empty();
        }
        const nodeFrameByHost = indexNodeFrames(envelope);
        const { topologyByHost, hostByRank, sentinelByHost } = indexTopology(envelope);
        const { socketByRank, identityByRank } = indexIdentities(envelope);

        const ranksByHostBySocket = new Map<string, Map<number, RankSnapshot[]>>();
        const framesByHostBySocket = new Map<string, Map<number, Map<number, RankFrame>>>();
        const identitiesByHostBySocket = new Map<string, Map<number, Map<number, RankIdentity>>>();
        const structure = new Set<string>();
        const cpuSumByHost = new Map<string, number>();
        const allocatedCpusByHost = new Map<string, Set<number>>();

        for (const frame of envelope.ranks ?? []) {
            const rank = frame.rank;
            const host = hostByRank.get(rank) ?? UNKNOWN_HOST;
            const socketId = socketByRank.get(rank) ?? 0;
            const sentinel = (sentinelByHost.get(host) ?? -1) === rank;
            const identity = identityByRank.get(rank);
            structure.add(StructureKey.keyOf(host, socketId, rank));

            cpuSumByHost.set(host, (cpuSumByHost.get(host) ?? 0) + frame.process_cpu_pct);
            if (identity?.allowed_cpu_ids) {
                const allocated = getOrCreate(allocatedCpusByHost, host, () => new Set<number>());
                identity.allowed_cpu_ids.forEach(cpu => allocated.add(cpu));
            }

            getOrCreate(getOrCreate(ranksByHostBySocket, host, () => new Map()), socketId, () => [])
                .push(toRankSnapshot(frame, sentinel, identity, envelope.elapsed_seconds, envelope.version >= SCHEMA_WITH_ACCOUNTING));
            getOrCreate(getOrCreate(framesByHostBySocket, host, () => new Map()), socketId, () => new Map())
                .set(rank, frame);
            if (identity) {
                getOrCreate(getOrCreate(identitiesByHostBySocket, host, () => new Map()), socketId, () => new Map())
                    .set(rank, identity);
            }
        }

        const nodes: NodeSnapshot[] = [];
        for (const [host, ranksBySocket] of ranksByHostBySocket) {
            const topology = topologyByHost.get(host);
            const topologySocketById = new Map((topology?.sockets ?? []).map(socket => [socket.socket_id, socket] as const));
            const sockets = [...ranksBySocket.keys()].sort((a, b) => a - b).map(socketId => toSocketSnapshot(
                socketId,
                topologySocketById.get(socketId),
                ranksBySocket.get(socketId)!,
                identitiesByHostBySocket.get(host)?.get(socketId) ?? new Map(),
                framesByHostBySocket.get(host)?.get(socketId) ?? new Map()));
            const nodeUtilPct = NodeUtilization.pct(cpuSumByHost.get(host) ?? 0, allocatedCpusByHost.get(host)?.size ?? 0);
            nodes.push(toNodeSnapshot(host, topology, nodeFrameByHost.get(host), nodeUtilPct, sockets));
        }

        return {
            schemaVersion: envelope.version,
            timestampMillis: envelope.ts,
            elapsedSeconds: envelope.elapsed_seconds,
            nodes,
            structure: StructureKey.of(structure),
            runId: envelope.run_id,
            run: envelope.topology?.run && toRunSetup(envelope.topology.run),
            paused: envelope.paused === true,
            final: envelope.final === true
        };
    }

    function toRunSetup(run: TopologyRun): RunSetup {
        return {
            scheduler: run.scheduler,
            loadBalancer: run.load_balancer,
            runtimeMode: run.runtime_mode,
            worldSize: run.world_size,
            threadsPerProcess: run.threads_per_process,
            gempbaVersion: run.gempba_version,
            annotations: run.annotations ?? [],
            markers: (run.markers ?? []).map(marker => ({ elapsedMs: marker.elapsed_ms, label: marker.label ?? '', source: marker.source ?? '' }))
        };
    }

    /** Builds from before gempba's v4.3.0 renames call the coordinator `center`. */
    function toRole(role: string | undefined): SchedulerRole | undefined {
        if (role === 'coordinator' || role === 'center') {
            return 'coordinator';
        }
        return role === 'worker' ? role : undefined;
    }

    function toAccounting(frame: RankFrame): RankAccounting {
        return {
            bytesSentTotal: frame.bytes_sent_total ?? 0,
            bytesRecvTotal: frame.bytes_recv_total ?? 0,
            sendMicrosTotal: frame.send_microseconds_total ?? 0,
            recvMicrosTotal: frame.recv_microseconds_total ?? 0,
            spawnRejectedPoolFull: frame.spawn_rejected_pool_full ?? 0,
            spawnRemoteRejected: frame.spawn_remote_rejected ?? 0,
            idleMicrosStarved: frame.idle_microseconds_starved ?? 0,
            idleMicrosImbalanced: frame.idle_microseconds_imbalanced ?? 0,
            schedRunningMicros: frame.sched_running_microseconds ?? 0,
            schedWaitingMicros: frame.sched_waiting_microseconds ?? 0,
            firstTaskMs: frame.first_task_ms ?? 0,
            lastTaskMs: frame.last_task_ms ?? 0,
            assignLatencyMicrosTotal: frame.assign_latency_microseconds_total ?? 0,
            assignCount: frame.assign_count ?? 0,
            assignLatencyMicrosMax: frame.assign_latency_microseconds_max ?? 0,
            availableMicrosQueueEmpty: frame.available_microseconds_queue_empty ?? 0,
            coordinatorStateMsgsTotal: frame.coordinator_state_msgs_total ?? 0,
            coordinatorScoreProposalsTotal: frame.coordinator_score_proposals_total ?? 0,
            coordinatorScoreBroadcastsTotal: frame.coordinator_score_broadcasts_total ?? 0,
            coordinatorFullMicros: frame.coordinator_full_microseconds ?? 0,
            scoreProposalsSent: frame.score_proposals_sent ?? 0,
            lastScoreImprovementMs: frame.last_score_improvement_ms ?? 0,
            telemetryMicrosTotal: frame.telemetry_microseconds_total ?? 0
        };
    }

    function hostOf(hostname: string | undefined): string {
        return hostname ?? UNKNOWN_HOST;
    }

    function indexNodeFrames(envelope: BroadcastEnvelope): Map<string, NodeFrame> {
        return new Map((envelope.nodes ?? []).map(frame => [hostOf(frame.hostname), frame] as const));
    }

    function indexTopology(envelope: BroadcastEnvelope): {
        topologyByHost: Map<string, TopologyNode>, hostByRank: Map<number, string>, sentinelByHost: Map<string, number>
    } {
        const topologyByHost = new Map<string, TopologyNode>();
        const hostByRank = new Map<number, string>();
        const sentinelByHost = new Map<string, number>();
        for (const node of envelope.topology?.nodes ?? []) {
            const host = hostOf(node.hostname);
            topologyByHost.set(host, node);
            sentinelByHost.set(host, node.sentinel_rank);
            for (const rank of node.ranks ?? []) {
                hostByRank.set(rank, host);
            }
        }
        return { topologyByHost, hostByRank, sentinelByHost };
    }

    function indexIdentities(envelope: BroadcastEnvelope): {
        socketByRank: Map<number, number>, identityByRank: Map<number, RankIdentity>
    } {
        const socketByRank = new Map<number, number>();
        const identityByRank = new Map<number, RankIdentity>();
        for (const identity of envelope.topology?.identities ?? []) {
            socketByRank.set(identity.rank, identity.primary_socket);
            identityByRank.set(identity.rank, identity);
        }
        return { socketByRank, identityByRank };
    }

    function toRankSnapshot(
        frame: RankFrame, sentinel: boolean, identity: RankIdentity | undefined, elapsedSeconds: number, accounted: boolean
    ): RankSnapshot {
        return {
            id: frame.rank,
            seqNo: frame.seq_no,
            localMillis: frame.rank_local_ms,
            pid: identity?.pid ?? 0,
            sentinel,
            role: toRole(identity?.role),
            allowedCpuIds: identity?.allowed_cpu_ids ?? [],
            tasksStartedTotal: frame.tasks_started_total,
            tasksRunning: frame.tasks_running,
            tasksSentTotal: frame.tasks_sent_total,
            tasksRecvTotal: frame.tasks_recv_total,
            schedulerPendingCount: frame.scheduler_pending_count,
            idleMicrosPerThread: frame.idle_microseconds_per_thread,
            cpuPct: frame.process_cpu_pct,
            rssBytes: frame.process_rss_bytes,
            threads: frame.process_threads,
            elapsedSeconds,
            peers: (frame.edges_out ?? []).map(edge => ({ peerRank: edge.to, bytes: edge.bytes, count: edge.count })),
            accounting: accounted ? toAccounting(frame) : undefined
        };
    }

    function toSocketSnapshot(socketId: number, topologySocket: TopologySocket | undefined, ranks: RankSnapshot[],
        identitiesById: Map<number, RankIdentity>, framesById: Map<number, RankFrame>): SocketSnapshot {
        const logicalCores = topologySocket?.logical_cores ?? 0;
        const coreUsage: CoreUsageSnapshot[] = [];
        if (topologySocket && logicalCores > 0) {
            const socketCpuIds = new Set(topologySocket.cpu_ids ?? []);
            for (const [rank, frame] of framesById) {
                coreUsage.push({
                    rank,
                    cpuPct: frame.process_cpu_pct,
                    accessibleCores: countAccessibleCores(identitiesById.get(rank), socketCpuIds, logicalCores),
                    socketCores: logicalCores
                });
            }
        }
        return {
            socketId,
            name: topologySocket?.name,
            physicalCores: topologySocket?.physical_cores ?? 0,
            logicalCores,
            cpuIds: topologySocket?.cpu_ids ?? [],
            hasTopology: topologySocket !== undefined,
            coreUsage,
            ranks
        };
    }

    function toNodeSnapshot(host: string, topology: TopologyNode | undefined, nodeFrame: NodeFrame | undefined,
        nodeUtilPct: number, sockets: SocketSnapshot[]): NodeSnapshot {
        const socketCount = topology?.sockets ? topology.sockets.length : nodeFrame?.socket_count ?? 0;
        const logicalCores = topology && topology.total_logical_cores > 0 ? topology.total_logical_cores : nodeFrame?.logical_cores ?? 0;
        let memTotalBytes = 0;
        let memUsedBytes = 0;
        if (nodeFrame) {
            const hostTotal = nodeFrame.mem_total_bytes;
            const hostUsed = hostTotal > nodeFrame.mem_avail_bytes ? hostTotal - nodeFrame.mem_avail_bytes : 0;
            // On a shared node the host totals mostly reflect other tenants; the job's cgroup is its real footprint.
            memUsedBytes = nodeFrame.cgroup_mem_used_bytes > 0 ? nodeFrame.cgroup_mem_used_bytes : hostUsed;
            memTotalBytes = nodeFrame.cgroup_mem_limit_bytes > 0 ? nodeFrame.cgroup_mem_limit_bytes : hostTotal;
        } else if (topology) {
            memTotalBytes = topology.mem_total_bytes;
        }
        return {
            host,
            socketCount,
            physicalCores: topology?.total_physical_cores ?? 0,
            logicalCores,
            hasLiveMemory: nodeFrame !== undefined,
            memTotalBytes,
            memUsedBytes,
            sentinelRank: topology ? topology.sentinel_rank : nodeFrame?.sentinel_rank ?? 0,
            sentinelLocalMillis: nodeFrame?.sentinel_local_ms ?? 0,
            nodeUtilPct,
            sockets
        };
    }

    /** `|allowed ∩ socket cpu ids|`; a missing or empty allowed list means unrestricted, so every socket core. */
    function countAccessibleCores(identity: RankIdentity | undefined, socketCpuIds: Set<number>, socketCores: number): number {
        const allowed = identity?.allowed_cpu_ids;
        if (!allowed || allowed.length === 0) {
            return socketCores;
        }
        return allowed.filter(cpu => socketCpuIds.has(cpu)).length;
    }

    function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
        let value = map.get(key);
        if (value === undefined) {
            value = create();
            map.set(key, value);
        }
        return value;
    }
}
