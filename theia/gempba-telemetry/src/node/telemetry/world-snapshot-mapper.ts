import { CoreUsageSnapshot, NodeSnapshot, NodeUtilization, SocketSnapshot, StructureKey, WorkerSnapshot, WorldSnapshot } from '@gempba/core';
import { BroadcastEnvelope, NodeFrame, TopologyNode, TopologySocket, WorkerFrame, WorkerIdentity } from '../protocol/wire-protocol';

/**
 * The one place wire types meet the read-model: a pure BroadcastEnvelope → WorldSnapshot mapping.
 * Order is preserved: nodes in first-seen host order, sockets by ascending id, workers in frame order.
 */
export namespace WorldSnapshotMapper {

    /** Host bucket for workers with no identity or topology mapping. */
    export const UNKNOWN_HOST = '(unknown host)';

    export function toWorldSnapshot(envelope: BroadcastEnvelope | undefined): WorldSnapshot {
        if (!envelope) {
            return WorldSnapshot.empty();
        }
        const nodeFrameByHost = indexNodeFrames(envelope);
        const { topologyByHost, hostByWorkerId, sentinelByHost } = indexTopology(envelope);
        const { socketByWorkerId, identityByWorkerId } = indexIdentities(envelope);

        const workersByHostBySocket = new Map<string, Map<number, WorkerSnapshot[]>>();
        const framesByHostBySocket = new Map<string, Map<number, Map<number, WorkerFrame>>>();
        const identitiesByHostBySocket = new Map<string, Map<number, Map<number, WorkerIdentity>>>();
        const structure = new Set<string>();
        const cpuSumByHost = new Map<string, number>();
        const allocatedCpusByHost = new Map<string, Set<number>>();

        for (const frame of envelope.workers ?? []) {
            const workerId = frame.worker_id;
            const host = hostByWorkerId.get(workerId) ?? UNKNOWN_HOST;
            const socketId = socketByWorkerId.get(workerId) ?? 0;
            const sentinel = (sentinelByHost.get(host) ?? -1) === workerId;
            const identity = identityByWorkerId.get(workerId);
            structure.add(StructureKey.keyOf(host, socketId, workerId));

            cpuSumByHost.set(host, (cpuSumByHost.get(host) ?? 0) + frame.process_cpu_pct);
            if (identity?.allowed_cpu_ids) {
                const allocated = getOrCreate(allocatedCpusByHost, host, () => new Set<number>());
                identity.allowed_cpu_ids.forEach(cpu => allocated.add(cpu));
            }

            getOrCreate(getOrCreate(workersByHostBySocket, host, () => new Map()), socketId, () => [])
                .push(toWorkerSnapshot(frame, sentinel, identity, envelope.elapsed_seconds));
            getOrCreate(getOrCreate(framesByHostBySocket, host, () => new Map()), socketId, () => new Map())
                .set(workerId, frame);
            if (identity) {
                getOrCreate(getOrCreate(identitiesByHostBySocket, host, () => new Map()), socketId, () => new Map())
                    .set(workerId, identity);
            }
        }

        const nodes: NodeSnapshot[] = [];
        for (const [host, workersBySocket] of workersByHostBySocket) {
            const topology = topologyByHost.get(host);
            const topologySocketById = new Map((topology?.sockets ?? []).map(socket => [socket.socket_id, socket] as const));
            const sockets = [...workersBySocket.keys()].sort((a, b) => a - b).map(socketId => toSocketSnapshot(
                socketId,
                topologySocketById.get(socketId),
                workersBySocket.get(socketId)!,
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
            structure: StructureKey.of(structure)
        };
    }

    function hostOf(hostname: string | undefined): string {
        return hostname ?? UNKNOWN_HOST;
    }

    function indexNodeFrames(envelope: BroadcastEnvelope): Map<string, NodeFrame> {
        return new Map((envelope.nodes ?? []).map(frame => [hostOf(frame.hostname), frame] as const));
    }

    function indexTopology(envelope: BroadcastEnvelope): {
        topologyByHost: Map<string, TopologyNode>, hostByWorkerId: Map<number, string>, sentinelByHost: Map<string, number>
    } {
        const topologyByHost = new Map<string, TopologyNode>();
        const hostByWorkerId = new Map<number, string>();
        const sentinelByHost = new Map<string, number>();
        for (const node of envelope.topology?.nodes ?? []) {
            const host = hostOf(node.hostname);
            topologyByHost.set(host, node);
            sentinelByHost.set(host, node.sentinel_worker_id);
            for (const workerId of node.worker_ids ?? []) {
                hostByWorkerId.set(workerId, host);
            }
        }
        return { topologyByHost, hostByWorkerId, sentinelByHost };
    }

    function indexIdentities(envelope: BroadcastEnvelope): {
        socketByWorkerId: Map<number, number>, identityByWorkerId: Map<number, WorkerIdentity>
    } {
        const socketByWorkerId = new Map<number, number>();
        const identityByWorkerId = new Map<number, WorkerIdentity>();
        for (const identity of envelope.topology?.identities ?? []) {
            socketByWorkerId.set(identity.worker_id, identity.primary_socket);
            identityByWorkerId.set(identity.worker_id, identity);
        }
        return { socketByWorkerId, identityByWorkerId };
    }

    function toWorkerSnapshot(frame: WorkerFrame, sentinel: boolean, identity: WorkerIdentity | undefined, elapsedSeconds: number): WorkerSnapshot {
        return {
            workerId: frame.worker_id,
            seqNo: frame.seq_no,
            localMillis: frame.worker_local_ms,
            pid: identity?.pid ?? 0,
            sentinel,
            allowedCpuIds: identity?.allowed_cpu_ids ?? [],
            tasksLocalTotal: frame.tasks_local_total,
            tasksRunning: frame.tasks_running,
            tasksSentTotal: frame.tasks_sent_total,
            tasksRecvTotal: frame.tasks_recv_total,
            schedulerPendingCount: frame.scheduler_pending_count,
            idleMicrosPerWorker: frame.idle_microseconds_per_worker,
            cpuPct: frame.process_cpu_pct,
            rssBytes: frame.process_rss_bytes,
            threads: frame.process_threads,
            elapsedSeconds,
            peers: (frame.edges_out ?? []).map(edge => ({ peerWorkerId: edge.to, bytes: edge.bytes, count: edge.count }))
        };
    }

    function toSocketSnapshot(socketId: number, topologySocket: TopologySocket | undefined, workers: WorkerSnapshot[],
        identitiesById: Map<number, WorkerIdentity>, framesById: Map<number, WorkerFrame>): SocketSnapshot {
        const logicalCores = topologySocket?.logical_cores ?? 0;
        const coreUsage: CoreUsageSnapshot[] = [];
        if (topologySocket && logicalCores > 0) {
            const socketCpuIds = new Set(topologySocket.cpu_ids ?? []);
            for (const [workerId, frame] of framesById) {
                coreUsage.push({
                    workerId,
                    cpuPct: frame.process_cpu_pct,
                    accessibleCores: countAccessibleCores(identitiesById.get(workerId), socketCpuIds, logicalCores),
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
            workers
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
            sentinelWorkerId: topology ? topology.sentinel_worker_id : nodeFrame?.sentinel_worker_id ?? 0,
            sentinelLocalMillis: nodeFrame?.sentinel_local_ms ?? 0,
            nodeUtilPct,
            sockets
        };
    }

    /** `|allowed ∩ socket cpu ids|`; a missing or empty allowed list means unrestricted, so every socket core. */
    function countAccessibleCores(identity: WorkerIdentity | undefined, socketCpuIds: Set<number>, socketCores: number): number {
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
