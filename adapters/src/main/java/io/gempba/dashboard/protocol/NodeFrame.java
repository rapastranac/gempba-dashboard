package io.gempba.dashboard.protocol;

import java.util.List;

/**
 * Per-node telemetry frame, emitted only by the elected sentinel at the
 * NodeFrame cadence (default 1 s). Carries hostname, per-socket stats, and
 * memory / network / disk aggregates for the whole physical machine.
 */
public record NodeFrame(
        long sentinelWorkerId,
        long sentinelLocalMs,
        String hostname,
        int socketCount,
        int logicalCores,
        long memTotalBytes,
        long memAvailBytes,
        List<SocketStats> sockets,
        NetStats netAggregate,
        DiskStats diskAggregate
) {
}
