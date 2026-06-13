package io.gempba.dashboard.format;

import io.gempba.dashboard.model.PeerSnapshot;

import java.util.List;

/**
 * Formatting for outgoing-peer collections. The inline one-liner a
 * {@code WorkerCard} shows on its "Outgoing peers" row — a count plus task and
 * byte totals — lives here so the view stays a pure renderer and the summary
 * can be unit-tested without SWT.
 */
public final class Peers {

    private Peers() {
    }

    /**
     * One-line summary of a worker's outgoing peers: {@code "N peers · M tasks
     * · X total"}, or {@code "none"} when there are no edges.
     */
    public static String summarize(List<PeerSnapshot> peers) {
        if (peers == null || peers.isEmpty()) {
            return "none";
        }
        long totalBytes = 0;
        long totalCount = 0;
        for (PeerSnapshot p : peers) {
            totalBytes += p.bytes();
            totalCount += p.count();
        }
        return String.format("%d peer%s · %,d task%s · %s total",
                peers.size(), peers.size() == 1 ? "" : "s",
                totalCount, totalCount == 1 ? "" : "s",
                Bytes.human(totalBytes));
    }
}
