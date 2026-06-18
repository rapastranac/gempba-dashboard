package io.gempba.dashboard.ui;

import io.gempba.dashboard.format.Bytes;
import io.gempba.dashboard.history.NodeSeries;
import org.eclipse.swt.SWT;
import org.eclipse.swt.events.MouseAdapter;
import org.eclipse.swt.events.MouseEvent;
import org.eclipse.swt.events.MouseTrackAdapter;
import org.eclipse.swt.events.PaintEvent;
import org.eclipse.swt.graphics.*;
import org.eclipse.swt.widgets.Canvas;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Display;

/**
 * A Windows-Task-Manager-style tile for one node: the host name, a live CPU%
 * readout, a filled-area CPU history graph, and a memory used/total bar.
 * Clicking opens that node's full detail (the host wires the listener).
 * <p>
 * Custom-painted {@link Canvas} like {@link Card} — owns
 * its colours and fonts and disposes them. Reads nothing itself; the grid view
 * pushes a {@link NodeSeries} snapshot via {@link #update}.
 */
final class NodeTile extends Canvas {

    static final int TILE_W = 240;
    static final int TILE_H = 150;
    private static final int PAD = 12;
    private static final int CORNER = 4;
    private static final int HEADER_H = 22;
    private static final int BAR_H = 6;          // memory bar thickness
    private static final int BAR_TEXT_GAP = 4;   // gap between mem text and bar
    private static final int GRAPH_MEM_GAP = 6;  // gap between sparkline and mem text
    private final String host;
    private final Color fill;
    private final Color border;
    private final Color borderHover;
    private final Color titleColor;
    private final Color mutedColor;
    private final Color cpuLine;
    private final Color cpuFill;
    private final Color grid;
    private final Color memTrack;
    private final Color memFill;
    private final Font nameFont;
    private final Font readoutFont;
    private NodeSeries series = NodeSeries.empty();
    private boolean hovered;
    private Listener listener = h -> {
    };

    NodeTile(Composite parent, String host) {
        super(parent, SWT.DOUBLE_BUFFERED);
        this.host = host;
        Display d = getDisplay();

        Card.CardStyle style = Card.CardStyle.node();
        fill = new Color(style.fill());
        border = new Color(style.border());
        borderHover = new Color(15, 157, 107);   // emerald accent
        titleColor = new Color(style.title());
        mutedColor = new Color(style.subtitle());
        cpuLine = new Color(15, 157, 107);
        cpuFill = new Color(15, 157, 107);
        grid = new Color(238, 241, 246);
        memTrack = new Color(238, 241, 246);
        memFill = new Color(120, 110, 200);
        nameFont = Fonts.bold(d.getSystemFont());
        readoutFont = Fonts.bold(d.getSystemFont(), 6);

        setBackground(parent.getBackground());
        setCursor(d.getSystemCursor(SWT.CURSOR_HAND));
        setToolTipText(
                "CPU utilization of this node's gempba allocation (0–100%):\n"
                        + "your processes' CPU ÷ the cores allocated to them.\n"
                        + "Other users' load on a shared node is excluded — if your\n"
                        + "tasks saturate your cores it reads 100%; if they're idle it\n"
                        + "reads 0% regardless of what else runs on the node.\n"
                        + "Click for this node's full detail.");

        addPaintListener(this::onPaint);
        addMouseListener(new MouseAdapter() {
            @Override
            public void mouseDown(MouseEvent e) {
                listener.onTileClicked(host);
            }
        });
        addMouseTrackListener(new MouseTrackAdapter() {
            @Override
            public void mouseEnter(MouseEvent e) {
                hovered = true;
                if (!isDisposed()) {
                    redraw();
                }
            }

            @Override
            public void mouseExit(MouseEvent e) {
                hovered = false;
                if (!isDisposed()) {
                    redraw();
                }
            }
        });
        // Colors are device-free since SWT 3.115 and need no disposal; only
        // the derived fonts are native resources.
        addDisposeListener(e -> {
            nameFont.dispose();
            readoutFont.dispose();
        });
    }

    private static boolean changed(NodeSeries a, NodeSeries b) {
        return a == null
                || a.cpu().length != b.cpu().length
                || a.cpuLatest() != b.cpuLatest()
                || a.memUsedLatest() != b.memUsedLatest()
                || a.memTotalLatest() != b.memTotalLatest();
    }

    void setListener(Listener l) {
        this.listener = (l != null) ? l : h -> {
        };
    }

    /**
     * Push the latest history snapshot; repaints only when something changed.
     */
    void update(NodeSeries s) {
        NodeSeries next = (s != null) ? s : NodeSeries.empty();
        if (!changed(series, next)) {
            series = next;
            return;
        }
        series = next;
        if (!isDisposed()) {
            redraw();
        }
    }

    @Override
    public Point computeSize(int wHint, int hHint, boolean changed) {
        int w = (wHint != SWT.DEFAULT) ? wHint : TILE_W;
        int h = (hHint != SWT.DEFAULT) ? hHint : TILE_H;
        return new Point(w, h);
    }

    private void onPaint(PaintEvent e) {
        GC gc = e.gc;
        gc.setAdvanced(true);
        gc.setAntialias(SWT.ON);
        gc.setTextAntialias(SWT.ON);

        Rectangle b = getClientArea();
        int w = b.width - 1;
        int h = b.height - 1;

        gc.setBackground(fill);
        gc.fillRoundRectangle(0, 0, w, h, CORNER * 2, CORNER * 2);
        gc.setForeground(hovered ? borderHover : border);
        gc.setLineWidth(hovered ? 2 : 1);
        gc.drawRoundRectangle(0, 0, w, h, CORNER * 2, CORNER * 2);
        gc.setLineWidth(1);

        // ─── header: host name + CPU% readout ───────────────────────────────
        gc.setForeground(titleColor);
        gc.setFont(nameFont);
        gc.drawString(host, PAD, PAD, true);

        String pct = Math.round(series.cpuLatest()) + "%";
        gc.setFont(readoutFont);
        Point pctExt = gc.textExtent(pct);
        gc.drawString(pct, b.width - PAD - pctExt.x, PAD - 2, true);

        // ─── memory section geometry (measured first so nothing overlaps) ───
        // Stacked from the bottom up: bottom pad · bar · gap · text. The
        // sparkline then fills whatever is left above the text.
        long used = series.memUsedLatest();
        long total = series.memTotalLatest();
        gc.setFont(getFont());
        String memText = (total > 0)
                ? "Mem  " + Bytes.human(used) + " / " + Bytes.human(total)
                : "Mem  —";
        Point memExt = gc.textExtent(memText);
        int barW = b.width - 2 * PAD;
        int barY = b.height - PAD - BAR_H;
        int memTextY = barY - BAR_TEXT_GAP - memExt.y;

        // ─── CPU sparkline ──────────────────────────────────────────────────
        int graphTop = PAD + HEADER_H;
        int graphBottom = memTextY - GRAPH_MEM_GAP;
        if (graphBottom > graphTop) {
            Rectangle graph = new Rectangle(PAD, graphTop, barW, graphBottom - graphTop);
            Sparkline.paint(gc, graph, series.cpu(), 0.0, 100.0, cpuLine, cpuFill, grid);
        }

        // ─── memory text + bar ──────────────────────────────────────────────
        gc.setForeground(mutedColor);
        gc.drawString(memText, PAD, memTextY, true);

        gc.setBackground(memTrack);
        gc.fillRoundRectangle(PAD, barY, barW, BAR_H, BAR_H, BAR_H);
        if (total > 0 && used > 0) {
            double frac = Math.min(1.0, used / (double) total);
            int fillW = Math.max(BAR_H, (int) Math.round(frac * barW));
            gc.setBackground(memFill);
            gc.fillRoundRectangle(PAD, barY, fillW, BAR_H, BAR_H, BAR_H);
        }
    }

    interface Listener {
        void onTileClicked(String host);
    }
}
