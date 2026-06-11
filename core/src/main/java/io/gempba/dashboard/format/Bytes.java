package io.gempba.dashboard.format;

/**
 * Human-readable byte sizes. Single source for the dashboard — previously this
 * lived as a copy-pasted {@code humanBytes} in several cards.
 */
public final class Bytes {

    private Bytes() {
    }

    /**
     * {@code 0 B}, {@code 512 B}, {@code 1.5 KB}, {@code 3.0 GB}, … (binary, 1 decimal).
     */
    public static String human(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        double v = bytes;
        String[] suffixes = {"KB", "MB", "GB", "TB"};
        int idx = -1;
        do {
            v /= 1024.0;
            idx++;
        } while (v >= 1024.0 && idx < suffixes.length - 1);
        return String.format("%.1f %s", v, suffixes[idx]);
    }
}
