package io.gempba.dashboard.model;

/**
 * Per-worker CPU-core context within a socket: how many of the socket's
 * cores the worker may run on, the socket's total logical cores, and the
 * worker's current CPU percentage. The join between a worker's
 * {@code allowed_cpu_ids} and the socket's {@code cpu_ids} is already
 * resolved here ({@link #accessibleCores}) so the view only formats.
 *
 * @param workerId        the worker this row describes
 * @param cpuPct          the worker's current process CPU percentage
 * @param accessibleCores how many of this socket's cores the worker can use
 *                        (|allowed ∩ socket cpu_ids|, or all cores when the
 *                        allowed set is unrestricted)
 * @param socketCores     the socket's total logical core count
 */
public record CoreUsageSnapshot(long workerId, double cpuPct, int accessibleCores, int socketCores) {
}
