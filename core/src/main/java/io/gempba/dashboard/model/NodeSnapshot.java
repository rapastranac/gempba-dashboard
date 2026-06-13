package io.gempba.dashboard.model;

import java.util.List;

/**
 * Immutable read-model for one physical machine (node). The header-resolution
 * decisions that used to live in {@code NodeCard} (topology-vs-frame
 * precedence for core counts and the sentinel) are already resolved into
 * these fields; the view only formats them.
 * <p>
 * Memory is presented two ways depending on data availability:
 * {@link #hasLiveMemory} true means the sentinel emitted a node frame, so
 * "used of total" is meaningful; false means only the startup topology's
 * total is known (shown when {@link #memTotalBytes} &gt; 0).
 *
 * @param host             hostname
 * @param socketCount      number of sockets reported for this node
 * @param physicalCores    total physical cores (0 when unknown)
 * @param logicalCores     total logical cores
 * @param hasLiveMemory    whether a live node frame supplied used/avail memory
 * @param memTotalBytes    total memory in bytes (frame value, else topology)
 * @param memUsedBytes     used memory in bytes (0 when not live)
 * @param sentinelWorkerId the node's elected sentinel worker id
 * @param nodeUtilPct      per-allocation CPU utilization (0..100) — the
 *                         {@code Σ rank cpu ÷ allocated cores} metric, already
 *                         clamped; see {@code policy.NodeUtilization}
 * @param sockets          socket read-models, in ascending socket-id order
 */
public record NodeSnapshot(
        String host,
        int socketCount,
        int physicalCores,
        int logicalCores,
        boolean hasLiveMemory,
        long memTotalBytes,
        long memUsedBytes,
        long sentinelWorkerId,
        double nodeUtilPct,
        List<SocketSnapshot> sockets
) {
    public NodeSnapshot {
        sockets = (sockets == null) ? List.of() : List.copyOf(sockets);
    }

    /**
     * Total workers across all sockets on this node.
     */
    public int workerCount() {
        int n = 0;
        for (SocketSnapshot s : sockets) {
            n += s.workerCount();
        }
        return n;
    }
}
