package io.gempba.dashboard.view;

/**
 * View contract for the status banner. Thin enough that it has no presenter —
 * callers hand it pre-formatted text.
 * <p>
 * Called on the UI thread.
 */
@FunctionalInterface
public interface StatusView {

    /**
     * Show a user-facing status line.
     */
    void setStatus(String text);
}
