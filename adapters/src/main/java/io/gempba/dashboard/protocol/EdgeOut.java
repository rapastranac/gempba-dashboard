package io.gempba.dashboard.protocol;

/**
 * Sender-side edge counter — one entry per peer this worker has sent to.
 * Mirrors {@code edges_out[]} in the C++ WorkerFrame; the dashboard transposes
 * the matrix to render the topology graph.
 */
public record EdgeOut(int to, long bytes, long count) {
}
