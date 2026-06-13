package io.gempba.dashboard.format;

/**
 * Time-formatting helpers used by the cards. One entry point taking
 * microseconds picks the most useful granularity:
 * <ul>
 *   <li>&lt; 1 ms              → {@code 238 µs}</li>
 *   <li>&lt; 1 s               → {@code 238.3 ms}</li>
 *   <li>&lt; 1 minute           → {@code 4.5 s}</li>
 *   <li>&lt; 1 hour             → {@code 5 m 30 s}</li>
 *   <li>&lt; 1 day              → {@code 1 h 23 m 45 s}</li>
 *   <li>&ge; 1 day              → {@code 2 d 4 h 30 m}</li>
 * </ul>
 * <p>
 * Below 1 minute we keep one decimal so the value stays readable at fast
 * cadences. From 1 minute onward we round to whole seconds and always
 * include every coarser unit (no "drop trailing zeros" so the eye sees a
 * stable column width).
 */
public final class Durations {

    private static final long US_PER_MS = 1_000L;
    private static final long US_PER_S = 1_000_000L;
    private static final long US_PER_MIN = 60L * US_PER_S;
    private static final long US_PER_HOUR = 60L * US_PER_MIN;
    private static final long US_PER_DAY = 24L * US_PER_HOUR;

    private Durations() {
    }

    /**
     * Format a duration given in microseconds. Negative inputs return "—".
     */
    public static String format(long microseconds) {
        if (microseconds < 0) {
            return "—";
        }
        if (microseconds < US_PER_MS) {
            return microseconds + " µs";
        }
        if (microseconds < US_PER_S) {
            return String.format("%.1f ms", microseconds / (double) US_PER_MS);
        }
        if (microseconds < US_PER_MIN) {
            return String.format("%.1f s", microseconds / (double) US_PER_S);
        }
        // From here on we round to whole seconds and lay out every coarser
        // unit explicitly so the format stays predictable for the user.
        long totalSeconds = microseconds / US_PER_S;
        long s = totalSeconds % 60;
        long totalMinutes = totalSeconds / 60;
        if (microseconds < US_PER_HOUR) {
            return String.format("%d m %d s", totalMinutes, s);
        }
        long m = totalMinutes % 60;
        long totalHours = totalMinutes / 60;
        if (microseconds < US_PER_DAY) {
            return String.format("%d h %d m %d s", totalHours, m, s);
        }
        long h = totalHours % 24;
        long days = totalHours / 24;
        return String.format("%d d %d h %d m", days, h, m);
    }

    /**
     * Convenience entry point for callers holding integer seconds. Renders
     * as plain "{n} s" below one minute (no fractional or sub-second tail —
     * the input was already coarse), and routes through {@link #format} for
     * minute-and-up scales.
     */
    public static String formatSeconds(long seconds) {
        if (seconds < 0) {
            return "—";
        }
        if (seconds < 60) {
            return seconds + " s";
        }
        return format(seconds * US_PER_S);
    }
}
