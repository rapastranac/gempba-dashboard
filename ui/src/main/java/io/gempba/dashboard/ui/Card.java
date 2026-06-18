package io.gempba.dashboard.ui;

import org.eclipse.swt.SWT;
import org.eclipse.swt.custom.ScrolledComposite;
import org.eclipse.swt.events.MouseAdapter;
import org.eclipse.swt.events.MouseEvent;
import org.eclipse.swt.events.PaintEvent;
import org.eclipse.swt.graphics.*;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Label;

/**
 * A rounded-rectangle panel with a header (title + optional subtitle) and a
 * padded body. Children added to a {@code Card} via the usual {@code new
 * Widget(card, ...)} call land inside the body, laid out by the card's
 * GridLayout.
 * <p>
 * Colors are picked from a {@link CardStyle} so callers can give each
 * nesting level (World / Node / Worker) a distinct shade.
 * <p>
 * The card paints itself on every paint event with anti-aliased
 * fillRoundRectangle / drawRoundRectangle calls; children paint on top in the
 * normal SWT order.
 */
public class Card extends Composite {

    /**
     * Border accent used by sentinels — a deliberately warm gold to stand out.
     */
    public static final RGB SENTINEL_BORDER = new RGB(220, 150, 30);
    private static final int CORNER_RADIUS = 6;
    private static final int HEADER_HEIGHT = 38;
    private static final int SIDE_PADDING = 12;
    private static final int BOTTOM_PADDING = 12;
    private final CardStyle style;
    private final Color fill;
    private final Color titleColor;
    private final Color subtitleColor;
    private final Font titleFont;
    private Color border;
    private String title;
    private String subtitle;
    private boolean collapsible = false;
    private boolean collapsed = false;
    private boolean clickListenerInstalled = false;
    private boolean chrome = true;
    private Runnable onSizeChanged;

    public Card(Composite parent, CardStyle style, String initialTitle) {
        // DOUBLE_BUFFERED smooths out the rounded-rect repaint that fires on
        // every label update — without it, frequent setText calls cause a
        // visible flicker where the card briefly shows the parent background
        // through the corners.
        super(parent, SWT.NO_BACKGROUND | SWT.DOUBLE_BUFFERED);
        this.style = style;
        this.title = initialTitle;
        this.subtitle = "";

        this.fill = new Color(style.fill());
        this.border = new Color(style.border());
        this.titleColor = new Color(style.title());
        this.subtitleColor = new Color(style.subtitle());
        this.titleFont = Fonts.bold(parent.getDisplay().getSystemFont());

        GridLayout layout = new GridLayout(1, false);
        layout.marginTop = HEADER_HEIGHT;
        layout.marginLeft = SIDE_PADDING;
        layout.marginRight = SIDE_PADDING;
        layout.marginBottom = BOTTOM_PADDING;
        layout.marginHeight = 0;
        layout.marginWidth = 0;
        layout.verticalSpacing = 4;
        setLayout(layout);

        // Child widgets pick up the card's fill colour as their own background
        // so labels and other widgets sit visually inside the rounded panel
        // without each caller having to setBackground manually.
        setBackground(fill);
        setBackgroundMode(SWT.INHERIT_DEFAULT);

        addPaintListener(this::onPaint);
        // Colors are device-free since SWT 3.115 and need no disposal; only
        // the derived font is a native resource.
        addDisposeListener(e -> titleFont.dispose());
    }

    /**
     * Set a label's text only when it differs from what's already shown.
     * SWT's native {@code setText} invalidates and repaints the label even
     * when the value is identical; at high telemetry refresh rates most
     * fields are unchanged frame-to-frame, so skipping the redundant writes
     * removes a large share of the per-frame paint work (and the flicker
     * that comes with it). Subclasses use this for every live counter.
     */
    protected static void setTextIfChanged(Label label, String text) {
        if (label == null || label.isDisposed()) {
            return;
        }
        if (!text.equals(label.getText())) {
            label.setText(text);
        }
    }

    /**
     * Update the header text. Triggers a redraw of the header band only —
     * and only when the text actually changed. Node and socket headers are
     * stable across most frames, so eliding the no-op redraw removes a large
     * share of the per-frame paint work at high refresh rates.
     */
    public void setHeader(String title, String subtitle) {
        String newTitle = (title == null) ? "" : title;
        String newSubtitle = (subtitle == null) ? "" : subtitle;
        if (newTitle.equals(this.title) && newSubtitle.equals(this.subtitle)) {
            return;
        }
        this.title = newTitle;
        this.subtitle = newSubtitle;
        if (!isDisposed()) {
            redraw(0, 0, getClientArea().width, HEADER_HEIGHT, false);
        }
    }

    /**
     * Override the border colour for accent purposes (e.g. marking a worker
     * as the node's sentinel). Pass the style's default RGB to undo the
     * accent.
     */
    public void setBorderRgb(RGB rgb) {
        if (rgb == null) {
            return;
        }
        border = new Color(rgb);
        if (!isDisposed()) {
            redraw();
        }
    }

    /**
     * Turn this card into a transparent container: no border, header, or
     * margins, and its own area is painted with the parent background so only
     * its child controls show. Used when a card is reused inside another
     * surface (e.g. a single node's detail popup) where the outer card chrome
     * would be redundant.
     */
    public void setChromeless() {
        chrome = false;
        if (getLayout() instanceof GridLayout l) {
            l.marginTop = 0;
            l.marginLeft = 0;
            l.marginRight = 0;
            l.marginBottom = 0;
        }
        setBackground(getParent().getBackground());
        if (!isDisposed()) {
            layout(true, true);
            redraw();
        }
    }

    public CardStyle style() {
        return style;
    }

    /**
     * Opt the card into the collapse mechanism. Adds a click listener on the
     * header band that toggles {@link #setCollapsed}, and tells {@link #onPaint}
     * to render a chevron in front of the title. Idempotent.
     */
    public void setCollapsible(boolean enabled) {
        this.collapsible = enabled;
        if (enabled && !clickListenerInstalled) {
            addMouseListener(new MouseAdapter() {
                @Override
                public void mouseDown(MouseEvent e) {
                    if (collapsible && e.y >= 0 && e.y < HEADER_HEIGHT) {
                        setCollapsed(!collapsed);
                    }
                }
            });
            clickListenerInstalled = true;
        }
        if (!isDisposed()) {
            redraw(0, 0, getClientArea().width, HEADER_HEIGHT, false);
        }
    }

    public boolean isCollapsed() {
        return collapsed;
    }

    /**
     * Hide every direct child when collapsing (and exclude them from the
     * GridLayout so the card shrinks to its header). Reverse on expand.
     * Bubbles a layout pass up the parent chain so outer cards reflow even
     * when no telemetry frame is currently driving the world update.
     */
    public void setCollapsed(boolean shouldCollapse) {
        if (collapsed == shouldCollapse) {
            return;
        }
        setCollapsedInitial(shouldCollapse);
        if (!isDisposed()) {
            redraw(0, 0, getClientArea().width, HEADER_HEIGHT, false);
        }
        layout(true, true);
        bubbleLayoutToAncestors();
        if (!collapsed) {
            // Cards skip updating their internals while hidden; repaint the
            // freshly revealed subtree from cache now instead of waiting for
            // the next frame.
            refreshVisibleDescendants();
        }
    }

    /**
     * Hook for subclasses to re-render content they skipped while hidden, from
     * their cached frame, the moment they become visible again (e.g. after an
     * ancestor is expanded). Also fires when this card's own collapse state
     * flips, so dynamic header content (e.g. {@link WorkerCard}'s inline
     * collapsed summary) updates immediately. Default does nothing.
     */
    protected void refreshFromCache() {
    }

    /**
     * Refresh every now-visible {@link Card} descendant from its cache. Called
     * after an expand so cards that skipped updates while hidden show current
     * data immediately.
     */
    private void refreshVisibleDescendants() {
        for (Control c : getChildren()) {
            if (c.isDisposed() || !c.getVisible()) {
                continue;
            }
            if (c instanceof Card card) {
                card.refreshFromCache();
                card.refreshVisibleDescendants();
            }
        }
    }

    /**
     * Set the initial collapsed state during bulk construction WITHOUT
     * laying out or re-measuring ancestors. Calling {@link #setCollapsed} for
     * every card while building a large hierarchy is O(n²) — each call
     * re-lays-out the whole ancestor chain and re-measures the enclosing
     * scroll. The builder uses this instead and relies on the single layout
     * pass the per-frame resync already does at the end, keeping construction
     * O(n). Late-added children are still handled by {@link #hideIfCollapsed}.
     */
    protected void setCollapsedInitial(boolean shouldCollapse) {
        if (collapsed == shouldCollapse) {
            return;
        }
        collapsed = shouldCollapse;
        for (Control c : getChildren()) {
            if (c.isDisposed()) {
                continue;
            }
            c.setVisible(!collapsed);
            if (c.getLayoutData() instanceof GridData gridData) {
                gridData.exclude = collapsed;
            }
        }
        refreshFromCache();
    }

    /**
     * Subclasses call this after attaching a new child while the card may
     * already be collapsed. {@link #setCollapsed} only iterates children that
     * existed at the moment it ran; without this helper a worker card added
     * after the parent socket was collapsed would be visible until the user
     * toggled collapse manually. Idempotent and safe when not collapsed.
     */
    protected void hideIfCollapsed(Control child) {
        if (!collapsed) {
            return;
        }
        if (child == null || child.isDisposed()) {
            return;
        }
        child.setVisible(false);
        if (child.getLayoutData() instanceof GridData gridData) {
            gridData.exclude = true;
        }
    }

    /**
     * Swing's {@code revalidate()} has only a partial SWT analog
     * ({@code Control.requestLayout()}), and neither covers the two extra
     * obligations handled here: a {@link ScrolledComposite} never re-measures
     * its content the way {@code JScrollPane} does, and an ancestor card
     * wrapping a window around this subtree (the detail popup) must be told to
     * refit. So walk the ancestor chain ourselves, re-laying-out and
     * re-measuring at each level.
     */
    private void bubbleLayoutToAncestors() {
        Composite p = getParent();
        while (p != null && !p.isDisposed()) {
            p.layout(true, true);
            if (p instanceof ScrolledComposite sc && sc.getContent() instanceof Composite child) {
                Scrolling.resync(sc, child);
            }
            // Notify a registered ancestor card (e.g. the single-node detail
            // popup's root) that its subtree's preferred size just changed, so
            // it can resize the window to follow.
            if (p instanceof Card card && card.onSizeChanged != null) {
                card.onSizeChanged.run();
            }
            p = p.getParent();
        }
    }

    /**
     * Register a callback fired when a collapse/expand anywhere in this card's
     * subtree changes its preferred size. Used by the detail popup to wrap the
     * window around the node card. Default unset (no-op) — the main views don't
     * resize to content.
     */
    public void setOnSizeChanged(Runnable onSizeChanged) {
        this.onSizeChanged = onSizeChanged;
    }

    private void onPaint(PaintEvent e) {
        GC gc = e.gc;
        gc.setAdvanced(true);
        gc.setAntialias(SWT.ON);
        gc.setTextAntialias(SWT.ON);

        if (!chrome) {
            // Transparent container: fill with the parent background so the
            // NO_BACKGROUND canvas shows no stale pixels; children paint on top.
            gc.setBackground(getParent().getBackground());
            gc.fillRectangle(getClientArea());
            return;
        }

        Rectangle b = getClientArea();
        int w = b.width - 1;
        int h = b.height - 1;

        gc.setBackground(fill);
        gc.fillRoundRectangle(0, 0, w, h, CORNER_RADIUS * 2, CORNER_RADIUS * 2);

        gc.setForeground(border);
        gc.setLineWidth(1);
        gc.drawRoundRectangle(0, 0, w, h, CORNER_RADIUS * 2, CORNER_RADIUS * 2);

        if (title != null && !title.isEmpty()) {
            // Prepend a chevron when this card opted into collapse so the
            // user has a visual cue that clicking the header does something.
            final String displayTitle;
            if (collapsible) {
                displayTitle = (collapsed ? "▶  " : "▼  ") + title;
            } else {
                displayTitle = title;
            }

            gc.setForeground(titleColor);
            gc.setFont(titleFont);
            Point titleSize = gc.textExtent(displayTitle);
            int titleX = SIDE_PADDING;
            int titleY = (HEADER_HEIGHT - titleSize.y) / 2 + 2;
            gc.drawString(displayTitle, titleX, titleY, true);

            if (subtitle != null && !subtitle.isEmpty()) {
                gc.setFont(getFont());
                gc.setForeground(subtitleColor);
                int subtitleX = titleX + titleSize.x + 12;
                Point subSize = gc.textExtent(subtitle);
                int subY = (HEADER_HEIGHT - subSize.y) / 2 + 2;
                gc.drawString(subtitle, subtitleX, subY, true);
            }
        }
    }

    /**
     * Color palette for one card level. Each component is an {@link RGB}
     * triple so styles stay plain data; the card turns them into
     * {@link Color}s itself.
     */
    public record CardStyle(RGB fill, RGB border, RGB title, RGB subtitle) {

        public static CardStyle world() {
            return new CardStyle(
                    new RGB(246, 249, 252),
                    new RGB(230, 235, 242),
                    new RGB(20, 50, 90),
                    new RGB(80, 110, 140));
        }

        public static CardStyle node() {
            return new CardStyle(
                    new RGB(255, 255, 255),
                    new RGB(230, 235, 242),
                    new RGB(15, 45, 80),
                    new RGB(70, 100, 130));
        }

        /**
         * Slightly warmer hue than node so socket boundaries pop visually.
         */
        public static CardStyle socket() {
            return new CardStyle(
                    new RGB(245, 248, 252),
                    new RGB(233, 237, 244),
                    new RGB(40, 30, 80),
                    new RGB(95, 85, 130));
        }

        public static CardStyle worker() {
            return new CardStyle(
                    new RGB(255, 255, 255),
                    new RGB(237, 240, 246),
                    new RGB(35, 55, 80),
                    new RGB(100, 120, 145));
        }
    }
}
