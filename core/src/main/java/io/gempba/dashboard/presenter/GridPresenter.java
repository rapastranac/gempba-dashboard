package io.gempba.dashboard.presenter;

import io.gempba.dashboard.history.NodeHistoryStore;
import io.gempba.dashboard.history.NodeSeries;
import io.gempba.dashboard.model.NodeSnapshot;
import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.GridView;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Presenter for the tile-grid tab. Owns the {@link NodeHistoryStore} (the
 * sparkline backing) — this is what removes the old render-only violation
 * where the grid widget reached into the store itself.
 * <p>
 * Only the grid-specific parts live here; the active/inactive lifecycle is
 * inherited from {@link TabPresenter}. It folds the history every frame
 * ({@link #ingest}) and projects a per-host {@link NodeSeries} for the view
 * ({@link #project}); {@link #clear} also forgets the history.
 */
public final class GridPresenter extends TabPresenter<Map<String, NodeSeries>> {

    private final NodeHistoryStore history;

    /**
     * @param onTileClick navigation callback fired when a tile is clicked
     *                    (wired to the view here)
     */
    public GridPresenter(GridView view, NodeHistoryStore history, Consumer<String> onTileClick) {
        super(view);
        this.history = history;
        view.setOnTileClick(onTileClick);
    }

    @Override
    protected void ingest(WorldSnapshot snapshot) {
        // ALWAYS fold history — even when inactive — so the sparkline stays
        // continuous across tab switches.
        history.update(snapshot);
    }

    @Override
    protected Map<String, NodeSeries> project(WorldSnapshot snapshot) {
        // Project each present host's latest series (LinkedHashMap preserves the
        // snapshot's stable first-seen host order as tile order).
        Map<String, NodeSeries> seriesByHost = new LinkedHashMap<>();
        for (NodeSnapshot n : snapshot.nodes()) {
            if (n.host() != null) {
                seriesByHost.put(n.host(), history.seriesFor(n.host()));
            }
        }
        return seriesByHost;
    }

    @Override
    public void clear() {
        super.clear();      // clears the tiles
        history.clear();    // and forgets the accumulated history
    }
}
