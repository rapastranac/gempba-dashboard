package io.gempba.dashboard.protocol;

/**
 * Aggregated per-node network counters (sum across all interfaces).
 */
public record NetStats(
        long bytesIn,
        long bytesOut,
        long packetsIn,
        long packetsOut
) {
}
