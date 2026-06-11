package io.gempba.dashboard.protocol;

import java.util.List;

/**
 * One physical machine in the run — the node-level entry the C++ topology
 * builder publishes once at startup. Workers on the same hostname collapse
 * into one entry; sockets describe the CPU layout discovered on that host.
 * <p>
 * {@code totalPhysicalCores} is 0 when the C++ probe cannot detect it
 * (without hwloc the platform-specific shims only know logical CPUs
 * reliably). {@code memTotalBytes} is captured once at startup; the live
 * NodeFrame carries the per-tick available memory.
 */
public record TopologyNode(
        String hostname,
        long sentinelWorkerId,
        int totalPhysicalCores,
        int totalLogicalCores,
        long memTotalBytes,
        List<Long> workerIds,
        List<TopologySocket> sockets
) {
}
