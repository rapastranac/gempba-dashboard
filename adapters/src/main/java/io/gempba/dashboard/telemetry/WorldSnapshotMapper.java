package io.gempba.dashboard.telemetry;

import io.gempba.dashboard.model.*;
import io.gempba.dashboard.policy.NodeUtilization;
import io.gempba.dashboard.protocol.*;

import java.util.*;

/**
 * Pure transformation from the wire {@link BroadcastEnvelope} to the domain
 * {@link WorldSnapshot}. This is the one place wire types meet the read-model;
 * it consolidates logic that used to be scattered across the SWT card
 * hierarchy:
 * <ul>
 *   <li>{@code WorldCard}'s three-pass index/join of node frames, topology
 *       and identities, grouping worker frames by (host, socket);</li>
 *   <li>{@code NodeCard}'s header resolution (topology-vs-frame precedence for
 *       socket/core counts, memory and sentinel);</li>
 *   <li>{@code CoresCard.countAccessibleCores}'s {@code allowed ∩ cpu_ids}
 *       join.</li>
 * </ul>
 * Because it touches no SWT and no IO it is unit-testable in isolation — the
 * whole point of moving it here.
 * <p>
 * Ordering is preserved exactly as the card hierarchy rendered it: nodes in
 * first-seen host order, sockets in ascending socket-id order, workers in
 * frame-arrival order. That keeps the visual layout identical after the
 * migration.
 */
public final class WorldSnapshotMapper {

    /**
     * Host bucket for workers with no identity/topology mapping.
     */
    public static final String UNKNOWN_HOST = "(unknown host)";

    private WorldSnapshotMapper() {
    }

    /**
     * Map one envelope to its domain read-model. Null in → empty model.
     */
    public static WorldSnapshot toWorldSnapshot(BroadcastEnvelope env) {
        if (env == null) {
            return WorldSnapshot.empty();
        }

        Map<String, NodeFrame> nodeFrameByHost = indexNodeFrames(env);

        Map<String, TopologyNode> topoByHost = new HashMap<>();
        Map<Long, String> hostByWorkerId = new HashMap<>();
        Map<String, Long> sentinelByHost = new HashMap<>();
        indexTopology(env, topoByHost, hostByWorkerId, sentinelByHost);

        Map<Long, Integer> socketByWorkerId = new HashMap<>();
        Map<Long, WorkerIdentity> identityByWorkerId = new HashMap<>();
        indexIdentities(env, socketByWorkerId, identityByWorkerId);

        // host (first-seen order) → socket (numeric order) → workers (frame order)
        Map<String, Map<Integer, List<WorkerSnapshot>>> byHostBySocket = new LinkedHashMap<>();
        // Parallel raw maps so each socket can compute its core-usage rows.
        Map<String, Map<Integer, Map<Long, WorkerIdentity>>> identsByHostBySocket = new HashMap<>();
        Map<String, Map<Integer, Map<Long, WorkerFrame>>> framesByHostBySocket = new HashMap<>();
        Set<String> structure = new HashSet<>();

        // Per-allocation CPU accumulators (the join that used to live in
        // NodeHistoryStore): per host, the Σ of rank CPU and the union of the
        // ranks' allocated cores. Divided in NodeUtilization.pct per node.
        Map<String, Double> cpuSumByHost = new HashMap<>();
        Map<String, Set<Integer>> allocCoresByHost = new HashMap<>();

        if (env.workers() != null) {
            for (WorkerFrame wf : env.workers()) {
                String host = hostByWorkerId.getOrDefault(wf.workerId(), UNKNOWN_HOST);
                int socketId = socketByWorkerId.getOrDefault(wf.workerId(), 0);
                boolean isSentinel = sentinelByHost.getOrDefault(host, -1L) == wf.workerId();
                structure.add(host + '|' + socketId + '|' + wf.workerId());

                WorkerIdentity ident = identityByWorkerId.get(wf.workerId());
                long pid = (ident != null) ? ident.pid() : 0L;

                // Accumulate this rank toward its host's per-allocation metric.
                cpuSumByHost.merge(host, (double) wf.processCpuPct(), Double::sum);
                if (ident != null && ident.allowedCpuIds() != null) {
                    Set<Integer> allowedCpus = allocCoresByHost.computeIfAbsent(host, h -> new HashSet<>());
                    allowedCpus.addAll(ident.allowedCpuIds());
                }

                byHostBySocket
                        .computeIfAbsent(host, h -> new TreeMap<>())
                        .computeIfAbsent(socketId, s -> new ArrayList<>())
                        .add(toWorkerSnapshot(wf, isSentinel, pid, env.elapsedSeconds()));

                framesByHostBySocket
                        .computeIfAbsent(host, h -> new HashMap<>())
                        .computeIfAbsent(socketId, s -> new LinkedHashMap<>())
                        .put(wf.workerId(), wf);
                if (ident != null) {
                    identsByHostBySocket
                            .computeIfAbsent(host, h -> new HashMap<>())
                            .computeIfAbsent(socketId, s -> new HashMap<>())
                            .put(wf.workerId(), ident);
                }
            }
        }

        List<NodeSnapshot> nodes = new ArrayList<>();
        for (Map.Entry<String, Map<Integer, List<WorkerSnapshot>>> hostEntry : byHostBySocket.entrySet()) {
            String host = hostEntry.getKey();
            TopologyNode topo = topoByHost.get(host);
            NodeFrame nf = nodeFrameByHost.get(host);

            Map<Integer, TopologySocket> topoSocketById = new HashMap<>();
            if (topo != null && topo.sockets() != null) {
                for (TopologySocket ts : topo.sockets()) {
                    topoSocketById.put(ts.socketId(), ts);
                }
            }

            List<SocketSnapshot> sockets = new ArrayList<>();
            for (Map.Entry<Integer, List<WorkerSnapshot>> sockEntry : hostEntry.getValue().entrySet()) {
                int sid = sockEntry.getKey();
                Map<Long, WorkerIdentity> idents = identsByHostBySocket.getOrDefault(host, Map.of()).getOrDefault(sid, Map.of());
                Map<Long, WorkerFrame> frames = framesByHostBySocket.getOrDefault(host, Map.of()).getOrDefault(sid, Map.of());
                sockets.add(toSocketSnapshot(sid, topoSocketById.get(sid), sockEntry.getValue(), idents, frames));
            }

            double sumCpu = cpuSumByHost.getOrDefault(host, 0.0);
            int allocCores = allocCoresByHost.getOrDefault(host, Set.of()).size();
            double nodeUtilPct = NodeUtilization.pct(sumCpu, allocCores);

            nodes.add(toNodeSnapshot(host, topo, nf, nodeUtilPct, sockets));
        }

        return new WorldSnapshot(env.version(), env.ts(), env.elapsedSeconds(), nodes, new StructureKey(structure));
    }

    // ---- indexing (mirrors WorldCard.index*) --------------------------------

    private static Map<String, NodeFrame> indexNodeFrames(BroadcastEnvelope env) {
        Map<String, NodeFrame> by = new HashMap<>();
        if (env.nodes() != null) {
            for (NodeFrame nf : env.nodes()) {
                by.put(nf.hostname(), nf);
            }
        }
        return by;
    }

    private static void indexTopology(BroadcastEnvelope env,
                                      Map<String, TopologyNode> topoByHost,
                                      Map<Long, String> hostByWorkerId,
                                      Map<String, Long> sentinelByHost) {
        if (env.topology() == null || env.topology().nodes() == null) {
            return;
        }
        for (TopologyNode tn : env.topology().nodes()) {
            topoByHost.put(tn.hostname(), tn);
            sentinelByHost.put(tn.hostname(), tn.sentinelWorkerId());
            if (tn.workerIds() != null) {
                for (Long wid : tn.workerIds()) {
                    hostByWorkerId.put(wid, tn.hostname());
                }
            }
        }
    }

    private static void indexIdentities(BroadcastEnvelope env,
                                        Map<Long, Integer> socketByWorkerId,
                                        Map<Long, WorkerIdentity> identityByWorkerId) {
        if (env.topology() == null || env.topology().identities() == null) return;
        for (WorkerIdentity wi : env.topology().identities()) {
            socketByWorkerId.put(wi.workerId(), wi.primarySocket());
            identityByWorkerId.put(wi.workerId(), wi);
        }
    }

    // ---- per-entity mapping -------------------------------------------------

    private static WorkerSnapshot toWorkerSnapshot(WorkerFrame f, boolean sentinel, long pid, long elapsedSeconds) {
        List<PeerSnapshot> peers = new ArrayList<>();
        if (f.edgesOut() != null) {
            for (EdgeOut e : f.edgesOut()) {
                peers.add(new PeerSnapshot(e.to(), e.bytes(), e.count()));
            }
        }
        return new WorkerSnapshot(
                f.workerId(), f.seqNo(), pid, sentinel,
                f.tasksLocalTotal(), f.tasksRunning(), f.tasksSentTotal(), f.tasksRecvTotal(),
                f.schedulerPendingCount(), f.idleMicrosecondsPerWorker(),
                f.processCpuPct(), f.processRssBytes(), f.processThreads(),
                elapsedSeconds, peers);
    }

    private static SocketSnapshot toSocketSnapshot(int socketId,
                                                   TopologySocket ts,
                                                   List<WorkerSnapshot> workers,
                                                   Map<Long, WorkerIdentity> identsById,
                                                   Map<Long, WorkerFrame> framesById) {
        boolean hasTopo = ts != null;
        String name = hasTopo ? ts.name() : null;
        int physical = hasTopo ? ts.physicalCores() : 0;
        int logical = hasTopo ? ts.logicalCores() : 0;
        List<Integer> cpuIds = (hasTopo && ts.cpuIds() != null) ? ts.cpuIds() : List.of();

        // Core-usage rows exist only when the socket has a topology entry with
        // a positive logical-core count — same guard CoresCard rendered under.
        List<CoreUsageSnapshot> coreUsage = new ArrayList<>();
        if (hasTopo && logical > 0) {
            Set<Integer> socketCpuIds = (ts.cpuIds() == null) ? Set.of() : new HashSet<>(ts.cpuIds());
            for (Map.Entry<Long, WorkerFrame> e : framesById.entrySet()) {
                long wid = e.getKey();
                int accessible = countAccessibleCores(identsById.get(wid), socketCpuIds, logical);
                CoreUsageSnapshot usageSnapshot = new CoreUsageSnapshot(wid, e.getValue().processCpuPct(), accessible, logical);
                coreUsage.add(usageSnapshot);
            }
        }
        return new SocketSnapshot(socketId, name, physical, logical, cpuIds, hasTopo, coreUsage, workers);
    }

    private static NodeSnapshot toNodeSnapshot(String host, TopologyNode topo, NodeFrame nf,
                                               double nodeUtilPct, List<SocketSnapshot> sockets) {
        final int socketCount;
        if (topo != null && topo.sockets() != null) {
            socketCount = topo.sockets().size();
        } else if (nf != null) {
            socketCount = nf.socketCount();
        } else {
            socketCount = 0;
        }

        final int logical;
        if (topo != null && topo.totalLogicalCores() > 0) {
            logical = topo.totalLogicalCores();
        } else if (nf != null) {
            logical = nf.logicalCores();
        } else {
            logical = 0;
        }

        int physical = (topo != null) ? topo.totalPhysicalCores() : 0;

        boolean hasLiveMemory = nf != null;
        long memTotal;
        long memUsed;
        if (nf != null) {
            long hostTotal = nf.memTotalBytes();
            long hostUsed = hostTotal > nf.memAvailBytes() ? hostTotal - nf.memAvailBytes() : 0;
            // Prefer the job's cgroup memory (its real footprint and allocation)
            // over the host-wide totals, which on a shared node mostly reflect
            // other tenants. Fall back per-field when a cgroup value is absent.
            memUsed = nf.cgroupMemUsedBytes() > 0 ? nf.cgroupMemUsedBytes() : hostUsed;
            memTotal = nf.cgroupMemLimitBytes() > 0 ? nf.cgroupMemLimitBytes() : hostTotal;
        } else if (topo != null) {
            memTotal = topo.memTotalBytes();
            memUsed = 0;
        } else {
            memTotal = 0;
            memUsed = 0;
        }

        final long sentinel;
        if (topo != null) {
            sentinel = topo.sentinelWorkerId();
        } else if (nf != null) {
            sentinel = nf.sentinelWorkerId();
        } else {
            sentinel = 0;
        }

        return new NodeSnapshot(host, socketCount, physical, logical, hasLiveMemory, memTotal, memUsed, sentinel, nodeUtilPct, sockets);
    }

    /**
     * How many of this socket's CPUs the worker can run on. With explicit
     * allowed_cpu_ids and per-socket cpu_ids the answer is just the size of the
     * intersection; a null/empty allowed list means "no restriction" → all
     * cores in the socket. Lifted verbatim from {@code CoresCard}.
     */
    private static int countAccessibleCores(WorkerIdentity ident, Set<Integer> socketCpuIds, int socketCores) {
        if (ident == null) {
            return socketCores;
        }
        List<Integer> allowed = ident.allowedCpuIds();
        if (allowed == null || allowed.isEmpty()) {
            return socketCores;
        }
        int n = 0;
        for (Integer cpu : allowed) {
            if (socketCpuIds.contains(cpu)) {
                ++n;
            }
        }
        return n;
    }
}
