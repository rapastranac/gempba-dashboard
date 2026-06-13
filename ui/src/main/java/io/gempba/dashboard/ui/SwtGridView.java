package io.gempba.dashboard.ui;

import io.gempba.dashboard.history.NodeSeries;
import io.gempba.dashboard.view.GridView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.custom.ScrolledComposite;
import org.eclipse.swt.layout.RowLayout;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

/**
 * The tile-grid view: one {@link NodeTile} per node, wrapping to the available
 * width like the Windows Task Manager grid. The SWT implementation of
 * {@link GridView} — it is a pure render-only view: the presenter hands it ready
 * {@link NodeSeries} per host, so it never reaches into a history store.
 * <p>
 * Self-contained: it owns its scrolled composite, redraw-suppression, and
 * scroll re-measurement; {@link #control()} returns the control to host in a
 * tab.
 */
public final class SwtGridView implements GridView {

    private final ScrolledComposite scroll;
    private final Composite tiles;
    private final Map<String, NodeTile> tilesByHost = new LinkedHashMap<>();
    private Consumer<String> onTileClick = host -> {
    };

    public SwtGridView(Composite parent) {
        scroll = new ScrolledComposite(parent, SWT.V_SCROLL);
        scroll.setExpandHorizontal(true);
        scroll.setExpandVertical(true);

        tiles = new Composite(scroll, SWT.NONE);
        RowLayout layout = new RowLayout(SWT.HORIZONTAL);
        layout.wrap = true;
        layout.fill = false;
        layout.marginWidth = 8;
        layout.marginHeight = 8;
        layout.spacing = 10;
        tiles.setLayout(layout);

        scroll.setContent(tiles);
        scroll.addListener(SWT.Resize, e -> resync());
    }

    /**
     * The control to host in a tab.
     */
    public Control control() {
        return scroll;
    }

    @Override
    public void setOnTileClick(Consumer<String> onTileClick) {
        this.onTileClick = (onTileClick != null) ? onTileClick : host -> {
        };
    }

    @Override
    public void render(Map<String, NodeSeries> seriesByHost) {
        if (tiles.isDisposed()) {
            return;
        }
        boolean structureChanged = false;

        tiles.setRedraw(false);
        try {
            // Upsert a tile per host (map iteration order = tile order).
            for (Map.Entry<String, NodeSeries> e : seriesByHost.entrySet()) {
                NodeTile tile = tilesByHost.get(e.getKey());
                if (tile == null) {
                    tile = new NodeTile(tiles, e.getKey());
                    tile.setListener(h -> onTileClick.accept(h));
                    tilesByHost.put(e.getKey(), tile);
                    structureChanged = true;
                }
                tile.update(e.getValue());
            }
            // Drop tiles for hosts no longer present.
            var iter = tilesByHost.entrySet().iterator();
            while (iter.hasNext()) {
                var entry = iter.next();
                if (!seriesByHost.containsKey(entry.getKey())) {
                    entry.getValue().dispose();
                    iter.remove();
                    structureChanged = true;
                }
            }
        } finally {
            tiles.setRedraw(true);
        }

        if (structureChanged) {
            resync();
        }
    }

    @Override
    public void clear() {
        for (NodeTile t : tilesByHost.values()) {
            t.dispose();
        }
        tilesByHost.clear();
        resync();
    }

    private void resync() {
        Scrolling.resync(scroll, tiles);
    }
}
