package io.gempba.dashboard.ui;

import org.eclipse.swt.SWT;
import org.eclipse.swt.dnd.Clipboard;
import org.eclipse.swt.dnd.TextTransfer;
import org.eclipse.swt.dnd.Transfer;
import org.eclipse.swt.events.MouseAdapter;
import org.eclipse.swt.events.MouseEvent;
import org.eclipse.swt.events.MouseTrackAdapter;
import org.eclipse.swt.events.PaintEvent;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.GC;
import org.eclipse.swt.graphics.Point;
import org.eclipse.swt.widgets.Canvas;
import org.eclipse.swt.widgets.Composite;

import java.util.function.Supplier;

/**
 * A small clipboard "copy" icon — the kind that sits in the corner of a rendered
 * code block. Custom-painted (like {@link Card}) so the glyph stays crisp
 * and blends with the theme: the two-overlapping-pages copy mark normally, and a
 * green check for a moment right after a copy. Clicking copies the supplied text
 * to the system clipboard.
 */
public final class CopyIcon extends Canvas {

    private static final int GLYPH = 16;       // glyph box (px)
    private static final int PAD = 3;          // around the glyph (px)
    private static final int COPIED_FEEDBACK_MS = 1100;

    private final Supplier<String> textSource;
    // Colors are device-free since SWT 3.115, so none of these need disposing.
    private final Color idle = new Color(132, 140, 152);
    private final Color hovered = new Color(70, 78, 92);
    private final Color check = new Color(39, 156, 86);

    private boolean hover;
    private boolean copied;

    public CopyIcon(Composite parent, Supplier<String> textSource) {
        super(parent, SWT.DOUBLE_BUFFERED);
        this.textSource = textSource;
        setBackground(parent.getBackground());
        setCursor(getDisplay().getSystemCursor(SWT.CURSOR_HAND));
        setToolTipText("Copy to clipboard");

        addPaintListener(this::onPaint);
        addMouseTrackListener(new MouseTrackAdapter() {
            @Override
            public void mouseEnter(MouseEvent e) {
                hover = true;
                redraw();
            }

            @Override
            public void mouseExit(MouseEvent e) {
                hover = false;
                redraw();
            }
        });
        addMouseListener(new MouseAdapter() {
            @Override
            public void mouseDown(MouseEvent e) {
                doCopy();
            }
        });
    }

    @Override
    public Point computeSize(int wHint, int hHint, boolean changed) {
        int w = (wHint != SWT.DEFAULT) ? wHint : GLYPH + PAD * 2;
        int h = (hHint != SWT.DEFAULT) ? hHint : GLYPH + PAD * 2;
        return new Point(w, h);
    }

    private void doCopy() {
        String text = textSource.get();
        if (text == null || text.isEmpty()) {
            return;
        }
        Clipboard clipboard = new Clipboard(getDisplay());
        try {
            clipboard.setContents(new Object[]{text}, new Transfer[]{TextTransfer.getInstance()});
        } finally {
            clipboard.dispose();
        }
        copied = true;
        setToolTipText("Copied!");
        redraw();
        getDisplay().timerExec(COPIED_FEEDBACK_MS, () -> {
            if (isDisposed()) {
                return;
            }
            copied = false;
            setToolTipText("Copy to clipboard");
            redraw();
        });
    }

    private void onPaint(PaintEvent e) {
        GC gc = e.gc;
        gc.setAdvanced(true);
        gc.setAntialias(SWT.ON);
        int x = PAD;
        int y = PAD;

        if (copied) {
            gc.setForeground(check);
            gc.setLineWidth(2);
            gc.setLineCap(SWT.CAP_ROUND);
            gc.setLineJoin(SWT.JOIN_ROUND);
            gc.drawPolyline(new int[]{x + 2, y + 8, x + 6, y + 12, x + 13, y + 3});
            return;
        }

        Color fg = hover ? hovered : idle;
        gc.setForeground(fg);
        gc.setLineWidth(1);
        // Two overlapping rounded pages — the universal "copy" mark. The front
        // page is filled with the widget background so it cleanly occludes the
        // back one.
        gc.drawRoundRectangle(x + 5, y + 1, 8, 9, 3, 3);
        gc.setBackground(getBackground());
        gc.fillRoundRectangle(x + 2, y + 4, 8, 9, 3, 3);
        gc.drawRoundRectangle(x + 2, y + 4, 8, 9, 3, 3);
    }
}
