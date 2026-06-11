package io.gempba.dashboard.policy;

/**
 * The per-allocation node-CPU policy — "your cores, your work." Pure
 * arithmetic with no dependency on the wire format, so it lives in the core
 * and is unit-tested in isolation; the <em>gathering</em> of its inputs (the
 * Σ-CPU numerator and the allocated-core denominator) is the caller's job.
 * <p>
 * {@code process_cpu_pct} is whole-process CPU in percent-of-one-core units
 * (so 400 = four cores pegged); the denominator is the number of distinct
 * cores the user's ranks were allocated. Dividing yields a 0..100 percentage
 * of the allocation — surfacing both saturation and under-use, and excluding
 * other users' load on a shared node.
 */
public final class NodeUtilization {

    private NodeUtilization() {
    }

    /**
     * Per-allocation utilization, clamped to {@code [0, 100]}.
     *
     * @param sumCpuPct      sum of the host's ranks' {@code process_cpu_pct}
     * @param allocatedCores count of distinct cores allocated to those ranks
     * @return {@code clamp(sumCpuPct / allocatedCores, 0, 100)}, or {@code 0}
     * when there is no allocation to divide by
     */
    public static double pct(double sumCpuPct, int allocatedCores) {
        if (allocatedCores <= 0) {
            return 0.0;
        }
        double util = sumCpuPct / allocatedCores;
        if (util < 0.0) {
            return 0.0;
        }
        return Math.min(util, 100.0);
    }
}
