package io.gempba.dashboard.protocol;

import java.util.List;

/**
 * One CPU socket within a node, as reported in the startup topology snapshot.
 * <p>
 * {@code physicalCores} is 0 when the C++ probe cannot determine it without
 * hwloc — until that lands the dashboard treats 0 as "unknown" and only
 * reports the logical core count.
 * <p>
 * {@code cpuIds} lists the OS-level logical CPU indices that belong to this
 * socket; the dashboard intersects it with each worker's
 * {@link WorkerIdentity#allowedCpuIds()} to figure out how many of the
 * socket's cores a given worker can actually use.
 */
public record TopologySocket(
        int socketId,
        String name,
        int physicalCores,
        int logicalCores,
        List<Integer> cpuIds
) {
}
