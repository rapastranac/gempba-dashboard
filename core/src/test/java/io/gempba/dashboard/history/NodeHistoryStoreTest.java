package io.gempba.dashboard.history;

import io.gempba.dashboard.model.NodeSnapshot;
import io.gempba.dashboard.model.StructureKey;
import io.gempba.dashboard.model.WorldSnapshot;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * The store is now a pure read-model buffer: it appends one sample per node
 * that carries live memory, reading the already-computed
 * {@link NodeSnapshot#nodeUtilPct()} and memory figures. The per-allocation CPU
 * metric itself is exercised in {@code WorldSnapshotMapperTest} (the join) and
 * {@code NodeUtilizationTest} (the clamp); here we test buffering, sample
 * gating, capacity, and clear.
 */
class NodeHistoryStoreTest {

    private static WorldSnapshot oneNode(long ts, String host, boolean liveMem,
                                         double util, long memUsed, long memTotal) {
        NodeSnapshot n = new NodeSnapshot(host, 1, 0, 1, liveMem, memTotal, memUsed, 0L, util, List.of());
        return new WorldSnapshot(1, ts, 0L, List.of(n), StructureKey.empty());
    }

    @Test
    void appends_a_sample_with_util_and_memory() {
        NodeHistoryStore store = new NodeHistoryStore();
        store.update(oneNode(1_000L, "h", true, 100.0, 750L, 1000L));

        NodeSeries s = store.seriesFor("h");
        assertThat(s.cpu()).containsExactly(100.0);
        assertThat(s.cpuLatest()).isEqualTo(100.0);
        assertThat(s.memUsedLatest()).isEqualTo(750L);
        assertThat(s.memTotalLatest()).isEqualTo(1000L);
    }

    @Test
    void node_without_live_memory_adds_no_sample() {
        NodeHistoryStore store = new NodeHistoryStore();
        // A node still waiting on its first node frame (hasLiveMemory == false).
        store.update(oneNode(5L, "h", false, 0.0, 0L, 0L));
        assertThat(store.hosts()).isEmpty();
        assertThat(store.seriesFor("h").isEmpty()).isTrue();
    }

    @Test
    void buffer_is_capped_and_drops_oldest() {
        NodeHistoryStore store = new NodeHistoryStore();
        int n = NodeHistoryStore.CAPACITY + 10;
        for (int i = 0; i < n; i++) {
            store.update(oneNode(i, "h", true, i, 0L, 100L)); // util = i (distinct)
        }
        NodeSeries s = store.seriesFor("h");
        assertThat(s.cpu()).hasSize(NodeHistoryStore.CAPACITY);
        assertThat(s.cpu()[0]).isCloseTo(10.0, within(1e-9));      // first kept = sample #10
        assertThat(s.cpuLatest()).isCloseTo(n - 1, within(1e-9));
    }

    @Test
    void history_survives_a_frame_where_the_node_has_no_live_memory() {
        NodeHistoryStore store = new NodeHistoryStore();
        store.update(oneNode(1L, "h", true, 100.0, 0L, 100L)); // sample
        store.update(oneNode(2L, "h", false, 0.0, 0L, 0L));    // gap: no sample
        store.update(oneNode(3L, "h", true, 50.0, 0L, 100L));  // sample
        assertThat(store.seriesFor("h").cpu()).containsExactly(100.0, 50.0);
    }

    @Test
    void clear_drops_history() {
        NodeHistoryStore store = new NodeHistoryStore();
        store.update(oneNode(1L, "h", true, 100.0, 0L, 100L));
        store.clear();
        assertThat(store.hosts()).isEmpty();
        assertThat(store.seriesFor("h").isEmpty()).isTrue();
    }

    @Test
    void seriesFor_unknown_host_is_empty() {
        assertThat(new NodeHistoryStore().seriesFor("nope").isEmpty()).isTrue();
    }

    // ─── factories ──────────────────────────────────────────────────────────

    @Test
    void null_model_is_a_no_op() {
        NodeHistoryStore store = new NodeHistoryStore();
        store.update(null);
        assertThat(store.hosts()).isEmpty();
    }
}
