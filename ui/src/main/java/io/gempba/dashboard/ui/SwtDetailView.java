package io.gempba.dashboard.ui;

import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.DetailView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.custom.ScrolledComposite;
import org.eclipse.swt.graphics.Point;
import org.eclipse.swt.graphics.Rectangle;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Shell;

/**
 * A live, modeless detail window for one node, opened by clicking a tile in
 * the grid view. It reuses the full {@link WorldCard} rendering path fed a
 * model narrowed to this host (see {@link WorldSnapshot#forHost}), so it shows
 * exactly that node's Node→Socket→Worker→Cores subtree with zero new card
 * code. The SWT implementation of the {@link DetailView} view contract.
 * <p>
 * Unlike {@link OutgoingPeersDialog}, this dialog must <em>not</em> run its own
 * nested event loop — that would freeze the main window and its frame pump.
 * It's a fire-and-forget {@code SWT.SHELL_TRIM} shell driven by the main
 * display loop; the host pushes each frame in via {@link #render}.
 * <p>
 * <strong>Auto-fit height.</strong> The window wraps the node card vertically:
 * when inner socket cards collapse it shrinks to fit, when they expand it grows
 * — but never past {@link #DEFAULT_H} (beyond that the content scrolls). Width
 * is left alone (a card's header text is custom-painted, not a layout child, so
 * it can't be measured). Once the user resizes the window themselves, auto-fit
 * stands down and defers to their size.
 */
public final class SwtDetailView implements DetailView {

    /**
     * The default opening size; the height auto-fit will not grow past.
     */
    private static final int DEFAULT_W = 720;
    private static final int DEFAULT_H = 640;
    /**
     * Floor so a tiny (all-collapsed) node still shows a usable window.
     */
    private static final int MIN_H = 200;

    private final Shell parent;
    private final String host;
    private final Shell shell;
    private final ScrolledComposite scroll;
    private final Composite content;
    private final WorldCard worldCard;
    private Runnable onDisposed = () -> {
    };

    /**
     * The last size we set ourselves; a resize to anything else is the user.
     */
    private Point appliedSize;
    /**
     * True once the user has resized — auto-fit then stands down.
     */
    private boolean userResized;
    /**
     * Center on the parent only the first time we fit to real content.
     */
    private boolean firstFit = true;

    public SwtDetailView(Shell parent, String host) {
        this.parent = parent;
        this.host = host;
        shell = new Shell(parent, SWT.SHELL_TRIM);
        shell.setText("Node detail — " + host);
        shell.setImages(parent.getImages()); // inherit the app icon
        shell.setLayout(new GridLayout(1, false));

        scroll = new ScrolledComposite(shell, SWT.V_SCROLL);
        scroll.setLayoutData(new GridData(SWT.FILL, SWT.FILL, true, true));
        scroll.setExpandHorizontal(true);
        scroll.setExpandVertical(true);

        content = new Composite(scroll, SWT.NONE);
        GridLayout contentLayout = new GridLayout(1, false);
        contentLayout.marginWidth = 8;
        contentLayout.marginHeight = 8;
        contentLayout.verticalSpacing = 8;
        content.setLayout(contentLayout);
        // Chromeless: show only this node's card(s), not the World wrapper.
        worldCard = new WorldCard(content, true);
        scroll.setContent(content);
        // Re-wrap the window whenever an inner socket/worker collapse changes
        // the node card's preferred height.
        worldCard.setOnSizeChanged(this::fit);

        scroll.addListener(SWT.Resize, e -> resync());
        // A resize to a size we didn't set ourselves is the user dragging the
        // border (or maximize) — hand control over and stop auto-fitting.
        shell.addListener(SWT.Resize, e -> {
            if (appliedSize == null || !shell.getSize().equals(appliedSize)) {
                userResized = true;
            }
        });
        // ESC closes, matching the other dialogs.
        Dialogs.closeOnEscape(shell);
        // Unregister on Dispose (not Close — Close fires first and is
        // vetoable; Dispose is the authoritative end of life).
        shell.addListener(SWT.Dispose, e -> onDisposed.run());

        // Fallback size + position until the first frame lets us fit to content.
        setShellSize(DEFAULT_W, DEFAULT_H);
        Dialogs.centerOnParent(parent, shell);
    }

    /**
     * Run when the window is disposed, so the host can drop it from its map.
     */
    public void setOnDisposed(Runnable r) {
        this.onDisposed = (r != null) ? r : () -> {
        };
    }

    /**
     * Apply one frame, narrowed to this host. Safe to call after disposal
     * (it no-ops), which matters because the host's per-frame push loop can
     * race a window the user just closed.
     */
    public void render(WorldSnapshot model) {
        if (shell.isDisposed() || content.isDisposed() || worldCard.isDisposed()) {
            return;
        }
        WorldSnapshot filtered = model.forHost(host);
        content.setRedraw(false);
        try {
            boolean structureChanged = worldCard.render(filtered);
            if (structureChanged) {
                resync();
                fit();
            }
        } finally {
            content.setRedraw(true);
        }
    }

    public void open() {
        shell.open();
    }

    public boolean isDisposed() {
        return shell.isDisposed();
    }

    public void close() {
        if (!shell.isDisposed()) {
            shell.close();
        }
    }

    /**
     * Bring an already-open window to the front (clicking the same tile again).
     */
    public void focus() {
        if (!shell.isDisposed()) {
            shell.setMinimized(false);
            shell.setActive();
            shell.forceActive();
        }
    }

    /**
     * Resize the window's height to wrap the node card, clamped to
     * [{@link #MIN_H}..{@link #DEFAULT_H}]. Width is left untouched. No-op once
     * the user has taken manual control of the size.
     */
    private void fit() {
        if (shell.isDisposed() || content.isDisposed() || userResized) {
            return;
        }

        int clientW = scroll.getClientArea().width;
        if (clientW <= 0) {
            clientW = DEFAULT_W;
        }
        // Height the content wants at the current width.
        Point pref = content.computeSize(clientW, SWT.DEFAULT);
        Rectangle target = shell.computeTrim(0, 0, clientW, pref.y);
        int shellH = Math.clamp(target.height, MIN_H, DEFAULT_H);

        setShellSize(shell.getSize().x, shellH);
        if (firstFit) {
            Dialogs.centerOnParent(parent, shell);
            firstFit = false;
        }
    }

    private void setShellSize(int w, int h) {
        appliedSize = new Point(w, h);
        shell.setSize(w, h);
    }

    private void resync() {
        Scrolling.resync(scroll, content);
    }
}
