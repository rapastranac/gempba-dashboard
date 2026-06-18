package io.gempba.dashboard.protocol;

import java.util.List;

/**
 * Per-node telemetry frame, emitted only by the elected sentinel at the
 * NodeFrame cadence (default 1 s). Carries hostname, per-socket stats, and
 * memory / network / disk aggregates for the whole physical machine.
 * <p>
 * {@code cgroupMemUsedBytes} / {@code cgroupMemLimitBytes} are the job's
 * memory-cgroup usage and allocation (0 when the process is not in a memory
 * cgroup or the limit is effectively unlimited) — the dashboard prefers these
 * over the host-wide totals so a shared node shows gempba's footprint, not
 * other tenants' load.
 */
public record NodeFrame(
        long sentinelWorkerId,
        long sentinelLocalMs,
        String hostname,
        int socketCount,
        int logicalCores,
        long memTotalBytes,
        long memAvailBytes,
        long cgroupMemUsedBytes,
        long cgroupMemLimitBytes,
        List<SocketStats> sockets,
        NetStats netAggregate,
        DiskStats diskAggregate
) {
}
