package io.gempba.dashboard.config;

/**
 * The telemetry refresh-rate bounds and defaults, in milliseconds — a pure
 * configuration fact defined once so every consumer (input clamping, pre-send
 * validation, sticky defaults) shares the same numbers.
 * <p>
 * The {@link #MIN_MS}/{@link #MAX_MS} range mirrors gempba's server-side clamp
 * ({@code parse_control_line} / {@code apply_control_from_client}); the defaults
 * match gempba's out-of-the-box cadences so the dashboard is honest about what
 * the process does before the user customises anything.
 */
public final class RefreshInterval {

    /**
     * Lower bound the gempba server clamps incoming interval values to.
     */
    public static final int MIN_MS = 50;

    /**
     * Upper bound the gempba server clamps incoming interval values to.
     */
    public static final int MAX_MS = 600_000;

    /**
     * Default worker-frame interval (gempba's {@code m_worker_interval_ms}).
     */
    public static final int DEFAULT_WORKER_MS = 500;

    /**
     * Default node-frame interval (the per-node sentinel cadence).
     */
    public static final int DEFAULT_NODE_MS = 1000;

    private RefreshInterval() {
    }
}
