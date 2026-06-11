package io.gempba.dashboard.history;

/**
 * An immutable snapshot of one node's recent history, handed to a tile for
 * drawing. Copied out of {@link NodeHistoryStore} so the consumer never sees
 * the live (mutating) buffer.
 *
 * @param cpu            CPU% samples, oldest first, one per retained frame
 * @param cpuLatest      most recent CPU% (0 when there are no samples)
 * @param memUsedLatest  most recent used memory in bytes
 * @param memTotalLatest most recent total memory in bytes
 */
public record NodeSeries(double[] cpu, double cpuLatest, long memUsedLatest, long memTotalLatest) {

    private static final NodeSeries EMPTY = new NodeSeries(new double[0], 0.0, 0L, 0L);

    public static NodeSeries empty() {
        return EMPTY;
    }

    public boolean isEmpty() {
        return cpu.length == 0;
    }
}
