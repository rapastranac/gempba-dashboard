package io.gempba.dashboard.format;

/**
 * Counter + throughput formatting for the worker cards.
 */
public final class Rates {

    private Rates() {
    }

    /**
     * A cumulative counter with its average rate over the run, e.g.
     * {@code "12,450 total · (3.5 / sec)"}. With no elapsed time yet, just the
     * total.
     */
    public static String countWithRate(long count, long elapsedSeconds) {
        if (elapsedSeconds <= 0) {
            return String.format("%,d total", count);
        }
        double rate = count / (double) elapsedSeconds;
        return String.format("%,d total · (%s)", count, perSecond(rate));
    }

    /**
     * A per-second rate with adaptive precision: {@code "0.42 / sec"}, {@code "1,200 / sec"}.
     */
    public static String perSecond(double rate) {
        if (Double.isNaN(rate)) {
            return "— / sec";
        }
        if (rate >= 1000) {
            return String.format("%,.0f / sec", rate);
        }
        if (rate >= 10) {
            return String.format("%.0f / sec", rate);
        }
        if (rate >= 1) {
            return String.format("%.1f / sec", rate);
        }
        if (rate <= 0) {
            return "0 / sec";
        }
        return String.format("%.2f / sec", rate);
    }
}
