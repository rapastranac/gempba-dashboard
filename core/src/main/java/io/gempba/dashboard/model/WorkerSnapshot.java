package io.gempba.dashboard.model;

import java.util.List;

/**
 * Immutable read-model for a single worker. Carries raw magnitudes only —
 * every string the {@code WorkerCard} shows is derived from these fields by
 * the view's formatters, never stored here.
 * <p>
 * {@link #elapsedSeconds} rides along so the view can turn cumulative totals
 * into average rates without reaching back to the enclosing {@code WorldSnapshot}.
 *
 * @param workerId              worker rank id
 * @param seqNo                 this worker's frame sequence number
 * @param pid                   OS process id (0 when unknown)
 * @param sentinel              whether this worker is its node's sentinel
 * @param tasksLocalTotal       cumulative tasks submitted to the local pool
 * @param tasksRunning          tasks executing in the local pool right now
 * @param tasksSentTotal        cumulative tasks dispatched to remote workers
 * @param tasksRecvTotal        cumulative remote tasks landed on this worker
 * @param schedulerPendingCount IPC scheduler queue depth
 * @param idleMicrosPerWorker   cumulative idle time averaged across pool threads
 * @param cpuPct                process CPU percentage
 * @param rssBytes              resident set size in bytes
 * @param threads               OS thread count
 * @param elapsedSeconds        run elapsed seconds (for rate derivation)
 * @param peers                 outgoing-peer edges (never null)
 */
public record WorkerSnapshot(
        long workerId,
        long seqNo,
        long pid,
        boolean sentinel,
        long tasksLocalTotal,
        int tasksRunning,
        long tasksSentTotal,
        long tasksRecvTotal,
        int schedulerPendingCount,
        long idleMicrosPerWorker,
        double cpuPct,
        long rssBytes,
        int threads,
        long elapsedSeconds,
        List<PeerSnapshot> peers
) {
    public WorkerSnapshot {
        peers = (peers == null) ? List.of() : List.copyOf(peers);
    }
}
