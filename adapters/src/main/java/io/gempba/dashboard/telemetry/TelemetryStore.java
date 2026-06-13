package io.gempba.dashboard.telemetry;

import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.protocol.BroadcastEnvelope;
import io.gempba.dashboard.protocol.Topology;

/**
 * Stateful front door for the telemetry pipeline: turns each wire
 * {@link BroadcastEnvelope} into a domain {@link WorldSnapshot} via the pure
 * {@link WorldSnapshotMapper}, while carrying the small amount of cross-frame
 * state the pure mapper cannot.
 * <p>
 * <strong>Last-good topology.</strong> The topology snapshot (worker→host
 * mapping, per-rank CPU allocation, socket layout) is stable for a run and
 * rides every broadcast in practice. Should a frame ever arrive with a
 * null/empty topology, mapping it alone would orphan every worker to
 * "(unknown host)" and collapse the per-allocation CPU denominator to zero.
 * This store remembers the last usable topology and substitutes it for such a
 * frame, so the resulting model stays complete — protecting the whole view,
 * not just the CPU sparkline.
 * <p>
 * Single-threaded (UI-thread) like the rest of the render pipeline.
 */
public final class TelemetryStore {

    private Topology lastTopology;

    private static boolean isUsable(Topology t) {
        return t != null && t.identities() != null && !t.identities().isEmpty();
    }

    /**
     * Map one envelope to its domain read-model, substituting the cached
     * topology when this frame lacks one. Null in → empty model.
     */
    public WorldSnapshot ingest(BroadcastEnvelope env) {
        if (env == null) {
            return WorldSnapshot.empty();
        }
        return WorldSnapshotMapper.toWorldSnapshot(withTopology(env));
    }

    /**
     * Forget the cached topology (on reconnect / new target).
     */
    public void reset() {
        lastTopology = null;
    }

    private BroadcastEnvelope withTopology(BroadcastEnvelope env) {
        if (isUsable(env.topology())) {
            lastTopology = env.topology();
            return env;
        }
        if (lastTopology == null) {
            return env; // nothing cached yet
        }
        return new BroadcastEnvelope(env.version(), env.ts(), env.elapsedSeconds(), lastTopology, env.workers(), env.nodes());
    }
}
