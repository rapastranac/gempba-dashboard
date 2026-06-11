package io.gempba.dashboard.telemetry;

import io.gempba.dashboard.model.NodeSnapshot;
import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.protocol.*;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class TelemetryStoreTest {

    /**
     * Host "h", worker 0 pegging a 4-core allocation.
     */
    private static BroadcastEnvelope withTopology(long ts) {
        Topology topo = new Topology(
                List.of(new TopologyNode("h", 0L, 0, 0, 0L, List.of(0L), List.of())),
                List.of(new WorkerIdentity(0, "h", 1000, 0, List.of(0, 1, 2, 3))));
        return new BroadcastEnvelope(7, ts, 0L, topo, List.of(cpuFrame(0, 400f)), List.of(nodeFrame()));
    }

    private static io.gempba.dashboard.protocol.NodeFrame nodeFrame() {
        return new io.gempba.dashboard.protocol.NodeFrame(0, 0L, "h", 1, 4, 1000L, 250L, null, null, null);
    }

    private static WorkerFrame cpuFrame(long wid, float cpu) {
        return new WorkerFrame(wid, 1, 0, 0, 0, 0, 0, 0, 0, cpu, 0, 1, List.of());
    }

    @Test
    void null_envelope_maps_to_empty_model() {
        assertThat(new TelemetryStore().ingest(null)).isEqualTo(WorldSnapshot.empty());
    }

    // ─── factories ──────────────────────────────────────────────────────────

    @Test
    void caches_topology_so_a_null_topology_frame_stays_complete() {
        TelemetryStore store = new TelemetryStore();

        // Frame 1 carries topology → host resolves, util computed, cache fills.
        WorldSnapshot m1 = store.ingest(withTopology(1L));
        assertThat(m1.nodes()).extracting(NodeSnapshot::host).containsExactly("h");
        assertThat(m1.nodes().getFirst().nodeUtilPct()).isCloseTo(100.0, within(1e-9));

        // Frame 2 has topology == null but the same worker. Without the cache
        // the worker would orphan to "(unknown host)" and util collapse to 0;
        // the substituted topology keeps the model whole.
        BroadcastEnvelope noTopo = new BroadcastEnvelope(7, 2L, 0L, null,
                List.of(cpuFrame(0, 400f)), List.of(nodeFrame()));
        WorldSnapshot m2 = store.ingest(noTopo);
        assertThat(m2.nodes()).extracting(NodeSnapshot::host).containsExactly("h");
        assertThat(m2.nodes().getFirst().nodeUtilPct()).isCloseTo(100.0, within(1e-9));
    }

    @Test
    void without_a_cached_topology_a_null_frame_maps_as_is() {
        WorldSnapshot m = new TelemetryStore().ingest(
                new BroadcastEnvelope(7, 1L, 0L, null, List.of(cpuFrame(0, 400f)), null));
        assertThat(m.nodes()).extracting(NodeSnapshot::host)
                .containsExactly(WorldSnapshotMapper.UNKNOWN_HOST);
    }

    @Test
    void reset_forgets_the_cached_topology() {
        TelemetryStore store = new TelemetryStore();
        store.ingest(withTopology(1L));      // cache fills
        store.reset();
        WorldSnapshot m = store.ingest(
                new BroadcastEnvelope(7, 2L, 0L, null, List.of(cpuFrame(0, 400f)), null));
        assertThat(m.nodes()).extracting(NodeSnapshot::host)
                .containsExactly(WorldSnapshotMapper.UNKNOWN_HOST);
    }
}
