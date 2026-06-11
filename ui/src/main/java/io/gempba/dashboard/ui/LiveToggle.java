package io.gempba.dashboard.ui;

import org.eclipse.swt.SWT;
import org.eclipse.swt.events.MouseAdapter;
import org.eclipse.swt.events.MouseEvent;
import org.eclipse.swt.events.PaintEvent;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.GC;
import org.eclipse.swt.graphics.Point;
import org.eclipse.swt.graphics.Rectangle;
import org.eclipse.swt.widgets.Canvas;
import org.eclipse.swt.widgets.Composite;

/**
 * A two-state pill toggle for the dashboard's auto-reconnect behaviour,
 * custom-painted to match the {@link Card} look (and to sidestep the
 * cross-platform headaches of putting transparent icons on a native button).
 * <p>
 * <strong>Live</strong> (default): a green pill with a filled "recording"
 * dot and the word <em>Live</em> — the dashboard is connected and
 * continuously retrying. <strong>Paused</strong>: a grey pill with two pause
 * bars and the word <em>Paused</em> — the connection is stopped and the cards
 * keep whatever data they last showed.
 * <p>
 * Clicking (or pressing space/enter while focused) flips the state and fires
 * {@link Listener#onLiveChanged}. {@link #setLive} changes the state
 * programmatically <em>without</em> firing the listener, so the host can keep
 * the toggle in sync after an explicit connect.
 */
public final class LiveToggle extends Canvas {

    private static final int PAD_H = 11;
    private static final int PAD_V = 6;
    private static final int ICON = 11;   // icon box (px)
    private static final int GAP = 8;     // icon → text gap (px)
    private static final int RADIUS = 9;  // pill corner radius (px)
    private final Color liveFill;
    private final Color liveBorder;
    private final Color pausedFill;
    private final Color pausedBorder;
    private final Color glyphColor;
    private boolean live = true;
    private Listener listener = l -> {
    };

    public LiveToggle(Composite parent) {
        super(parent, SWT.DOUBLE_BUFFERED);
        // Colors are device-free since SWT 3.115, so nothing here needs a
        // dispose listener.
        liveFill = new Color(39, 156, 86);
        liveBorder = new Color(28, 120, 66);
        pausedFill = new Color(128, 136, 148);
        pausedBorder = new Color(96, 104, 116);
        glyphColor = new Color(255, 255, 255);

        // Match the parent so the rounded pill's corners blend in rather than
        // sitting on a grey Canvas default background.
        setBackground(parent.getBackground());
        setCursor(getDisplay().getSystemCursor(SWT.CURSOR_HAND));

        addPaintListener(this::onPaint);
        addMouseListener(new MouseAdapter() {
            @Override
            public void mouseDown(MouseEvent e) {
                toggle();
            }
        });
        addListener(SWT.KeyDown, e -> {
            if (e.character == ' ' || e.character == '\r' || e.character == '\n') {
                toggle();
            }
        });
        updateTooltip();
    }

    public void setListener(Listener l) {
        this.listener = (l != null) ? l : x -> {
        };
    }

    public boolean isLive() {
        return live;
    }

    /**
     * Set the state programmatically. Does <em>not</em> fire the listener —
     * use this to mirror an external state change (e.g. an explicit connect
     * that implies "go live").
     */
    public void setLive(boolean live) {
        if (this.live == live) {
            return;
        }
        this.live = live;
        updateTooltip();
        if (!isDisposed()) {
            redraw();
        }
    }

    private void toggle() {
        live = !live;
        updateTooltip();
        if (!isDisposed()) {
            redraw();
        }
        listener.onLiveChanged(live);
    }

    private void updateTooltip() {
        setToolTipText(live
                ? "Live — continuously retrying the connection.\n"
                  + "Click to pause: keep the last data on screen and stop reconnecting."
                : "Paused — showing the last data received; not reconnecting.\n"
                  + "Click to go live and reconnect.");
    }

    @Override
    public Point computeSize(int wHint, int hHint, boolean changed) {
        int textW;
        int textH;
        GC gc = new GC(this);
        try {
            gc.setFont(getFont());
            // Size to the wider of the two labels so the pill width is stable
            // across toggles (no reflow jitter when the state flips).
            Point liveExt = gc.textExtent("Live");
            Point pausedExt = gc.textExtent("Paused");
            textW = Math.max(liveExt.x, pausedExt.x);
            textH = Math.max(liveExt.y, pausedExt.y);
        } finally {
            gc.dispose();
        }
        int w = (wHint != SWT.DEFAULT) ? wHint : PAD_H + ICON + GAP + textW + PAD_H;
        int h = (hHint != SWT.DEFAULT) ? hHint : PAD_V + Math.max(ICON, textH) + PAD_V;
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

        gc.setBackground(live ? liveFill : pausedFill);
        gc.fillRoundRectangle(0, 0, w, h, RADIUS * 2, RADIUS * 2);
        gc.setForeground(live ? liveBorder : pausedBorder);
        gc.setLineWidth(1);
        gc.drawRoundRectangle(0, 0, w, h, RADIUS * 2, RADIUS * 2);

        drawGlyph(gc, PAD_H, b.height / 2);

        gc.setForeground(glyphColor);
        gc.setFont(getFont());
        String text = live ? "Live" : "Paused";
        Point ext = gc.textExtent(text);
        gc.drawString(text, PAD_H + ICON + GAP, (b.height - ext.y) / 2, true);
    }

    private void drawGlyph(GC gc, int x, int centerY) {
        gc.setBackground(glyphColor);
        if (live) {
            // Filled "live/recording" dot.
            int d = ICON - 1;
            gc.fillOval(x, centerY - d / 2, d, d);
        } else {
            // Two vertical pause bars.
            int barW = 3;
            int barH = ICON;
            int gap = 3;
            int top = centerY - barH / 2;
            gc.fillRoundRectangle(x, top, barW, barH, 2, 2);
            gc.fillRoundRectangle(x + barW + gap, top, barW, barH, 2, 2);
        }
    }

    /**
     * Fired only on user interaction, never on {@link #setLive}.
     */
    public interface Listener {
        void onLiveChanged(boolean live);
    }
}
