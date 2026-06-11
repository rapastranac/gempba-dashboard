package io.gempba.dashboard.format;

import java.util.List;

/**
 * CPU-related formatting: logical-CPU id ranges, effective-core estimates, and
 * the per-worker "cores" row shown in the CoresCard.
 */
public final class Cpu {

    private Cpu() {
    }

    /**
     * Render a logical-CPU id list as a compact range when contiguous, else as
     * a comma-separated list. {@code [0,1,2,3,4]} → {@code "CPUs 0–4"};
     * {@code [0,2,4]} → {@code "CPUs 0, 2, 4"}; {@code [0,1,2,5,6,7]} →
     * {@code "CPUs 0–2, 5–7"}. Empty/null → {@code ""}.
     */
    public static String range(List<Integer> ids) {
        if (ids == null || ids.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("CPUs ");
        int runStart = ids.get(0);
        int prev = runStart;
        boolean firstChunk = true;
        for (int i = 1; i <= ids.size(); ++i) {
            int cur = (i < ids.size()) ? ids.get(i) : Integer.MIN_VALUE;
            if (cur == prev + 1) {
                prev = cur;
                continue;
            }
            if (!firstChunk) {
                sb.append(", ");
            }
            firstChunk = false;
            if (runStart == prev) {
                sb.append(runStart);
            } else {
                sb.append(runStart).append("–").append(prev); // en-dash
            }
            runStart = cur;
            prev = cur;
        }
        return sb.toString();
    }

    /**
     * Per-worker cores row, e.g.
     * {@code "Worker 3:  87.3 % CPU  ·  can use 4 of 8 cores  ·  currently using ≈ 0.87 cores"}.
     */
    public static String coreRow(long workerId, double cpuPct, int accessibleHere, int socketCores) {
        double effectiveCores = cpuPct / 100.0;
        String accessSummary = (accessibleHere == socketCores)
                ? String.format("can use all %d cores", socketCores)
                : String.format("can use %d of %d cores", accessibleHere, socketCores);
        String usageSummary = String.format("currently using ≈ %s", effectiveCores(effectiveCores, accessibleHere));
        return String.format("Worker %d:  %.1f %% CPU  ·  %s  ·  %s", workerId, cpuPct, accessSummary, usageSummary);
    }

    /**
     * A worker's effective busy-core count: {@code "idle"}, {@code "0.87"},
     * {@code "1.4 cores"}, or {@code "9.1 cores (oversubscribed)"}.
     */
    public static String effectiveCores(double effective, int accessible) {
        if (effective < 0.05) {
            return "idle";
        }
        String number = (effective < 1.0)
                ? String.format("%.2f", effective)
                : String.format("%.1f", effective);
        if (effective > accessible + 0.5) {
            return number + " cores (oversubscribed)";
        }
        return number + " core" + (effective < 1.5 && effective >= 1.0 ? "" : "s");
    }
}
