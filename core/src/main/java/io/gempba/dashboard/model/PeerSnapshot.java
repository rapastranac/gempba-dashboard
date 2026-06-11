package io.gempba.dashboard.model;

/**
 * One outgoing-peer edge in the domain read-model: how much this worker has
 * sent to a given peer worker. Carries raw magnitudes only — no formatting,
 * no wire types.
 *
 * @param peerWorkerId the destination worker this edge points at
 * @param bytes        cumulative bytes sent to that peer
 * @param count        cumulative task count sent to that peer
 */
public record PeerSnapshot(int peerWorkerId, long bytes, long count) {
}
