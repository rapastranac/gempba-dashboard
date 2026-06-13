package io.gempba.dashboard.protocol;

/**
 * Per-CPU-socket stats inside a NodeFrame. {@code mem_total_bytes} and
 * {@code mem_used_bytes} are the NUMA-domain split when known; in the v1
 * gempba snapshot they currently mirror the host totals because hwloc is not
 * yet wired in.
 */
public record SocketStats(
        int socketId,
        float cpuPct,
        long memTotalBytes,
        long memUsedBytes
) {
}
