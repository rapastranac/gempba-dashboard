package io.gempba.dashboard.model;

import java.util.List;

/**
 * Immutable read-model for one CPU socket on a node. Topology-derived fields
 * ({@link #name}, core counts, {@link #cpuIds}) are populated only when the
 * startup topology snapshot described this socket; {@link #hasTopology}
 * records whether that was the case so the view can fall back to a bare
 * "Socket N · k workers" header.
 *
 * @param socketId      socket index within the node
 * @param name          CPU brand string, or null when unknown
 * @param physicalCores physical cores in this socket (0 when unknown)
 * @param logicalCores  logical cores in this socket (0 when unknown)
 * @param cpuIds        OS logical-CPU indices belonging to this socket
 * @param hasTopology   whether the topology snapshot described this socket
 * @param coreUsage     per-worker core-usage rows (empty without topology)
 * @param workers       worker read-models in this socket, in frame order
 */
public record SocketSnapshot(
        int socketId,
        String name,
        int physicalCores,
        int logicalCores,
        List<Integer> cpuIds,
        boolean hasTopology,
        List<CoreUsageSnapshot> coreUsage,
        List<WorkerSnapshot> workers
) {
    public SocketSnapshot {
        cpuIds = (cpuIds == null) ? List.of() : List.copyOf(cpuIds);
        coreUsage = (coreUsage == null) ? List.of() : List.copyOf(coreUsage);
        workers = (workers == null) ? List.of() : List.copyOf(workers);
    }

    /**
     * Number of workers stacked in this socket.
     */
    public int workerCount() {
        return workers.size();
    }
}
