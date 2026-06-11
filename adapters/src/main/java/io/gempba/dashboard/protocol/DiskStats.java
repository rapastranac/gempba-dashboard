package io.gempba.dashboard.protocol;

/**
 * Aggregated per-node disk counters (sum across all block devices).
 */
public record DiskStats(long readBytes, long writeBytes) {
}
