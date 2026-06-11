package io.gempba.dashboard.app;

import io.gempba.dashboard.concurrent.UiExecutor;
import org.eclipse.swt.SWTException;
import org.eclipse.swt.widgets.Display;

/**
 * SWT-backed {@link UiExecutor}: marshals work onto the SWT UI thread via
 * {@link Display#asyncExec}. Silently no-ops once the display has been disposed
 * — both the explicit check and the {@link SWTException} catch cover the small
 * race window during shell teardown when in-flight background work outlives the
 * display.
 * <p>
 * This is the one place SWT meets the connection controller's threading port,
 * keeping {@code Display} out of the adapter layer entirely.
 */
public final class SwtUiExecutor implements UiExecutor {

    private final Display display;

    public SwtUiExecutor(Display display) {
        this.display = display;
    }

    @Override
    public void execute(Runnable task) {
        if (display.isDisposed()) {
            return;
        }
        try {
            display.asyncExec(task);
        } catch (SWTException ex) {
            // Display dropped between the check above and the asyncExec call
            // (very small race window during shutdown). Nothing to surface —
            // the app is exiting.
        }
    }
}
