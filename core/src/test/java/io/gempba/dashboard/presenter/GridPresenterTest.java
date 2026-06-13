package io.gempba.dashboard.presenter;

import io.gempba.dashboard.history.NodeHistoryStore;
import io.gempba.dashboard.history.NodeSeries;
import io.gempba.dashboard.model.NodeSnapshot;
import io.gempba.dashboard.model.StructureKey;
import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.GridView;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The payoff of the MVP restructure: the grid's orchestration is now SWT-free
 * and unit-testable against a fake view. These assert the load-bearing
 * invariant — history folds every frame even while the tab is inactive, but the
 * view only paints when active — that previously lived in untestable SWT
 * lambdas.
 */
class GridPresenterTest {

    /**
     * One host carrying live memory so the history store folds a sample.
     */
    private static WorldSnapshot snap(long ts, String host, double util) {
        NodeSnapshot n = new NodeSnapshot(host, 1, 0, 1, true, 100L, 0L, 0L, util, List.of());
        return new WorldSnapshot(1, ts, 0L, List.of(n), StructureKey.empty());
    }

    @Test
    void folds_history_while_inactive_without_painting() {
        FakeGridView view = new FakeGridView();
        NodeHistoryStore history = new NodeHistoryStore();
        GridPresenter p = new GridPresenter(view, history, h -> {
        });

        // Never activated → inactive.
        p.update(snap(1, "h", 100.0));
        p.update(snap(2, "h", 50.0));

        assertThat(view.renders).isEmpty();                              // no paint while inactive
        assertThat(history.seriesFor("h").cpu()).containsExactly(100.0, 50.0); // but history folded
    }

    @Test
    void activate_paints_a_series_continuous_across_the_inactive_gap() {
        FakeGridView view = new FakeGridView();
        NodeHistoryStore history = new NodeHistoryStore();
        GridPresenter p = new GridPresenter(view, history, h -> {
        });

        p.update(snap(1, "h", 100.0));   // folded while inactive
        WorldSnapshot last = snap(2, "h", 50.0);
        p.update(last);                  // folded while inactive
        p.activate(last);                // now becomes active and paints

        assertThat(view.renders).hasSize(1);
        NodeSeries pushed = view.renders.getFirst().get("h");
        // Both samples survived the inactive gap (continuity), matching a
        // directly-fed history store.
        assertThat(pushed.cpu()).containsExactly(100.0, 50.0);
        assertThat(pushed.cpuLatest()).isEqualTo(history.seriesFor("h").cpuLatest());
    }

    @Test
    void paints_every_frame_while_active() {
        FakeGridView view = new FakeGridView();
        GridPresenter p = new GridPresenter(view, new NodeHistoryStore(), h -> {
        });
        p.activate(null);                // active, but nothing to paint yet
        assertThat(view.renders).isEmpty();
        p.update(snap(1, "h", 100.0));
        p.update(snap(2, "h", 50.0));
        assertThat(view.renders).hasSize(2);
    }

    @Test
    void deactivate_clears_the_view_but_retains_history() {
        FakeGridView view = new FakeGridView();
        NodeHistoryStore history = new NodeHistoryStore();
        GridPresenter p = new GridPresenter(view, history, h -> {
        });
        p.activate(null);
        p.update(snap(1, "h", 100.0));
        p.deactivate();

        assertThat(view.clears).isGreaterThanOrEqualTo(1);
        assertThat(history.seriesFor("h").cpu()).containsExactly(100.0);  // retained

        view.renders.clear();
        p.activate(snap(1, "h", 100.0));                                  // re-shown
        assertThat(view.renders.getFirst().get("h").cpu()).containsExactly(100.0);
    }

    @Test
    void clear_empties_both_the_view_and_the_history() {
        FakeGridView view = new FakeGridView();
        NodeHistoryStore history = new NodeHistoryStore();
        GridPresenter p = new GridPresenter(view, history, h -> {
        });
        p.activate(null);
        p.update(snap(1, "h", 100.0));
        p.clear();

        assertThat(view.clears).isGreaterThanOrEqualTo(1);
        assertThat(history.seriesFor("h").isEmpty()).isTrue();
    }

    @Test
    void wires_tile_clicks_to_the_navigation_callback() {
        FakeGridView view = new FakeGridView();
        List<String> clicked = new ArrayList<>();
        new GridPresenter(view, new NodeHistoryStore(), clicked::add);

        view.onTileClick.accept("h7");
        assertThat(clicked).containsExactly("h7");
    }

    /**
     * Records what the presenter pushes, without any SWT.
     */
    private static final class FakeGridView implements GridView {
        final List<Map<String, NodeSeries>> renders = new ArrayList<>();
        int clears = 0;
        Consumer<String> onTileClick;

        @Override
        public void render(Map<String, NodeSeries> seriesByHost) {
            renders.add(new LinkedHashMap<>(seriesByHost));
        }

        @Override
        public void clear() {
            clears++;
        }

        @Override
        public void setOnTileClick(Consumer<String> onTileClick) {
            this.onTileClick = onTileClick;
        }
    }
}
