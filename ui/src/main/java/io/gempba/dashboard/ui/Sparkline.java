package io.gempba.dashboard.ui;

import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.GC;
import org.eclipse.swt.graphics.Rectangle;

/**
 * Stateless filled-area line-graph painter, in the spirit of the Windows Task
 * Manager performance tiles: a faint grid, a translucent fill under the line,
 * and the line itself. Values are plotted evenly by index (newest last), which
 * is what gives the steady left-to-right scroll Task Manager has.
 * <p>
 * Pure GC drawing — the caller owns the {@link Color}s and their lifecycle; a
 * widget's {@code paintControl} just hands its {@link GC} and bounds here.
 */
final class Sparkline {

    private static final int GRID_DIVISIONS = 4;

    private Sparkline() {
    }

    /**
     * Paint {@code values} as a filled area graph inside {@code area}.
     *
     * @param gc     target context (antialiasing is enabled by the caller)
     * @param area   pixel rectangle to draw within
     * @param values samples, oldest first; may be empty
     * @param min    value mapped to the bottom edge
     * @param max    value mapped to the top edge (must be &gt; min)
     * @param line   line colour
     * @param fill   translucent area colour (drawn with reduced alpha)
     * @param grid   grid colour
     */
    static void paint(GC gc, Rectangle area, double[] values, double min, double max, Color line, Color fill, Color grid) {
        if (area.width <= 2 || area.height <= 2) {
            return;
        }

        int left = area.x;
        int top = area.y;
        int w = area.width;
        int h = area.height;
        double span = (max > min) ? (max - min) : 1.0;

        // ─── grid ───────────────────────────────────────────────────────────
        gc.setForeground(grid);
        gc.setLineWidth(1);
        for (int i = 1; i < GRID_DIVISIONS; i++) {
            int y = top + (int) Math.round(h * (i / (double) GRID_DIVISIONS));
            gc.drawLine(left, y, left + w, y);
        }

        if (values == null || values.length == 0) {
            return;
        }

        // ─── point mapping ──────────────────────────────────────────────────
        int n = values.length;
        // With a single sample, draw a flat line across the whole width.
        int[] xs = new int[n];
        int[] ys = new int[n];
        for (int i = 0; i < n; i++) {
            double fx = (n == 1) ? 1.0 : (i / (double) (n - 1));
            double v = (values[i] - min) / span;
            if (v < 0) {
                v = 0;
            }
            if (v > 1) {
                v = 1;
            }
            xs[i] = left + (int) Math.round(fx * w);
            ys[i] = top + (int) Math.round((1.0 - v) * h);
        }

        // ─── translucent fill under the line ────────────────────────────────
        // polygon: line points, then down the right edge and back along the
        // bottom to the first point.
        int[] poly = new int[(n + 2) * 2];
        int p = 0;
        for (int i = 0; i < n; i++) {
            poly[p++] = xs[i];
            poly[p++] = ys[i];
        }
        poly[p++] = xs[n - 1];
        poly[p++] = top + h;
        poly[p++] = xs[0];
        poly[p++] = top + h;

        int prevAlpha = gc.getAlpha();
        gc.setBackground(fill);
        gc.setAlpha(70);
        gc.fillPolygon(poly);
        gc.setAlpha(prevAlpha);

        // ─── the line ───────────────────────────────────────────────────────
        gc.setForeground(line);
        gc.setLineWidth(2);
        gc.setLineCap(SWT.CAP_ROUND);
        gc.setLineJoin(SWT.JOIN_ROUND);
        if (n == 1) {
            gc.drawLine(left, ys[0], left + w, ys[0]);
        } else {
            int[] linePts = new int[n * 2];
            for (int i = 0; i < n; i++) {
                linePts[i * 2] = xs[i];
                linePts[i * 2 + 1] = ys[i];
            }
            gc.drawPolyline(linePts);
        }
        gc.setLineWidth(1);
    }
}
