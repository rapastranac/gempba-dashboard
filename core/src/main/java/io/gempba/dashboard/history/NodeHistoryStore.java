package io.gempba.dashboard.history;

import io.gempba.dashboard.model.NodeSnapshot;
import io.gempba.dashboard.model.WorldSnapshot;

import java.util.*;

/**
 * Per-node rolling history of utilization samples. The telemetry stream keeps
 * no history (each frame fully replaces prior state), so the Grid tile's
 * sparkline needs its own buffer — this is it.
 * <p>
 * A pure read-model consumer: it folds a {@link WorldSnapshot} and reads each
 * node's already-computed {@link NodeSnapshot#nodeUtilPct()} and memory
 * figures. The per-allocation CPU metric — "your cores, your work", the
 * {@code Σ rank cpu ÷ allocated cores} join of {@code policy.NodeUtilization}
 * — is resolved upstream; this store never sees worker frames or identities.
 * <p>
 * A sample is appended only for nodes that carry live memory
 * ({@link NodeSnapshot#hasLiveMemory()}, i.e. the sentinel emitted a node frame
 * this tick), which also supplies the memory readout; the CPU value rides on
 * the same node view.
 * <p>
 * <strong>Threading:</strong> UI-thread only. {@link #update} and
 * {@link #seriesFor} never race; {@link #seriesFor} still returns a copy so a
 * tile never paints a mutating buffer.
 */
public final class NodeHistoryStore {

    /**
     * Samples retained per host. At the default 1&nbsp;Hz node cadence this is
     * ~2&nbsp;minutes; the window scales with the node interval the user sets.
     */
    static final int CAPACITY = 120;

    private final Map<String, Deque<NodeSample>> byHost = new LinkedHashMap<>();

    /**
     * Fold one frame into the history: append a sample for each node that
     * carries live memory. No-op for a null model and for nodes still waiting
     * on their first node frame.
     */
    public void update(WorldSnapshot model) {
        if (model == null) {
            return;
        }
        long ts = model.timestampMillis();
        for (NodeSnapshot node : model.nodes()) {
            if (!node.hasLiveMemory()) {
                continue;
            }
            String host = node.host();
            if (host == null) {
                continue;
            }

            Deque<NodeSample> q = byHost.computeIfAbsent(host, h -> new ArrayDeque<>());
            q.addLast(new NodeSample(ts, node.nodeUtilPct(), node.memUsedBytes(), node.memTotalBytes()));
            while (q.size() > CAPACITY) {
                q.removeFirst();
            }
        }
    }

    /**
     * Immutable snapshot of one host's history for drawing, or
     * {@link NodeSeries#empty()} if the host has no samples yet.
     */
    public NodeSeries seriesFor(String host) {
        Deque<NodeSample> q = byHost.get(host);
        if (q == null || q.isEmpty()) {
            return NodeSeries.empty();
        }
        double[] cpu = new double[q.size()];
        int i = 0;
        NodeSample last = null;
        for (NodeSample s : q) {
            cpu[i++] = s.cpuPct();
            last = s;
        }
        return new NodeSeries(cpu, last.cpuPct(), last.memUsedBytes(), last.memTotalBytes());
    }

    /**
     * Hosts with at least one retained sample.
     */
    public Set<String> hosts() {
        return Collections.unmodifiableSet(byHost.keySet());
    }

    /**
     * Drop all history (on reconnect / new target).
     */
    public void clear() {
        byHost.clear();
    }
}
