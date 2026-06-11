package io.gempba.dashboard.view;

import io.gempba.dashboard.history.NodeSeries;

import java.util.Map;
import java.util.function.Consumer;

/**
 * View contract for the tile grid. The presenter hands it ready
 * {@link NodeSeries} per host — the view never reaches into a history store.
 * The map's iteration order is the tile order.
 * <p>
 * It renders a {@code Map<host, NodeSeries>} and inherits {@code render} +
 * {@code clear} from {@link View}; the only thing it adds is the tile-click
 * seam.
 * <p>
 * Called on the UI thread.
 */
public interface GridView extends View<Map<String, NodeSeries>> {

    /**
     * Register the per-tile click handler (carries the tile's host).
     */
    void setOnTileClick(Consumer<String> onTileClick);
}
