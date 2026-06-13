package io.gempba.dashboard.concurrent;

/**
 * A port for hopping work onto the UI thread, so code running on background
 * threads can hand results to UI-thread listeners without depending on a UI
 * toolkit.
 * <p>
 * Implementations must be safe to call from any thread and must silently drop
 * work once the UI is gone (e.g. during shutdown) rather than throw.
 */
@FunctionalInterface
public interface UiExecutor {

    /**
     * Schedule {@code task} to run on the UI thread; no-op if the UI is gone.
     */
    void execute(Runnable task);
}
