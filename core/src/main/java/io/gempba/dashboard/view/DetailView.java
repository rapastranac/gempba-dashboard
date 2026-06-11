package io.gempba.dashboard.view;

import io.gempba.dashboard.model.WorldSnapshot;

/**
 * View contract for a single node's live detail window: opened once, fed each
 * frame, brought to the front on re-request, and closed by whoever drives it.
 * The window renders only its own node's slice of the model
 * ({@code model.forHost(host)}) and never reaches back for data — that is what
 * keeps it render-only.
 * <p>
 * All methods are called on the UI thread.
 */
public interface DetailView {

    /**
     * Show the window.
     */
    void open();

    /**
     * Apply one frame (the view narrows it to its own host).
     */
    void render(WorldSnapshot model);

    /**
     * Bring an already-open window to the front.
     */
    void focus();

    /**
     * Close the window.
     */
    void close();

    /**
     * Whether the window has been disposed.
     */
    boolean isDisposed();

    /**
     * Register a callback fired when the window is disposed.
     */
    void setOnDisposed(Runnable onDisposed);
}
