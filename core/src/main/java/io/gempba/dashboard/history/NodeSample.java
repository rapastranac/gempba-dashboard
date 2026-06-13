package io.gempba.dashboard.history;

/**
 * One point-in-time utilization sample for a single node, retained by
 * {@link NodeHistoryStore} so views can draw a short rolling history (the
 * telemetry stream itself keeps no history — every frame replaces state).
 *
 * @param timeStamp     envelope timestamp (epoch millis) the sample came from
 * @param cpuPct        aggregated node CPU utilization, 0..100
 * @param memUsedBytes  used physical memory (total − available)
 * @param memTotalBytes total physical memory
 */
public record NodeSample(long timeStamp, double cpuPct, long memUsedBytes, long memTotalBytes) {
}
