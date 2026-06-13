package io.gempba.dashboard.model;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The immutable domain read-model for one telemetry frame — the single value
 * the whole UI renders from. Produced upstream from the wire format, once per
 * frame; wire types never cross into this model. Holds raw magnitudes only
 * (no formatted strings) so presenters and views own all presentation.
 *
 * @param schemaVersion   telemetry schema version of the source frame
 * @param timestampMillis frame timestamp (epoch millis)
 * @param elapsedSeconds  run elapsed seconds
 * @param nodes           node read-models, in first-seen host order
 * @param structure       structural signature for relayout elision
 */
public record WorldSnapshot(
        int schemaVersion,
        long timestampMillis,
        long elapsedSeconds,
        List<NodeSnapshot> nodes,
        StructureKey structure
) {
    public WorldSnapshot {
        nodes = (nodes == null) ? List.of() : List.copyOf(nodes);
        structure = (structure == null) ? StructureKey.empty() : structure;
    }

    /**
     * A model with no nodes — the initial/disconnected state.
     */
    public static WorldSnapshot empty() {
        return new WorldSnapshot(0, 0L, 0L, List.of(), StructureKey.empty());
    }

    /**
     * Number of nodes in this frame.
     */
    public int totalNodes() {
        return nodes.size();
    }

    /**
     * Total workers across every node in this frame.
     */
    public int totalWorkers() {
        int n = 0;
        for (NodeSnapshot node : nodes) {
            n += node.workerCount();
        }
        return n;
    }

    /**
     * Narrow this model to a single host — a pure read-model operation. The
     * live node-detail window renders {@code model.forHost(host)} so it draws
     * exactly that one node's subtree. Null host returns this model unchanged;
     * an unknown host yields an empty model that still carries the frame's
     * version/timestamp.
     */
    public WorldSnapshot forHost(String host) {
        if (host == null) {
            return this;
        }
        List<NodeSnapshot> kept = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        for (NodeSnapshot node : nodes) {
            if (host.equals(node.host())) {
                kept.add(node);
                for (SocketSnapshot s : node.sockets()) {
                    for (WorkerSnapshot w : s.workers()) {
                        keys.add(node.host() + '|' + s.socketId() + '|' + w.workerId());
                    }
                }
            }
        }
        return new WorldSnapshot(schemaVersion, timestampMillis, elapsedSeconds, kept, new StructureKey(keys));
    }
}
