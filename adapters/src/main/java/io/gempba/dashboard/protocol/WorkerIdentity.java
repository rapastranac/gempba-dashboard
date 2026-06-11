package io.gempba.dashboard.protocol;

import java.util.List;

/**
 * Identity record exchanged at run start so the center can group workers by
 * physical host. Sent once and re-served to any dashboard client that
 * connects mid-run.
 * <p>
 * {@code allowedCpuIds} replaced the earlier {@code allowed_cpu_mask} on the
 * C++ side because (a) it's not capped at 64 logical CPUs and (b) it round-
 * trips through JSON without any unsigned-overflow gymnastics on the Java
 * side. Intersecting with a {@link TopologySocket#cpuIds()} tells the
 * dashboard how many cores of that socket the worker can actually use.
 */
public record WorkerIdentity(
        long workerId,
        String hostname,
        long pid,
        int primarySocket,
        List<Integer> allowedCpuIds
) {
}
