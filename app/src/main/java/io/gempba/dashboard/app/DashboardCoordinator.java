package io.gempba.dashboard.app;

import io.gempba.dashboard.config.ConnectionSpec;
import io.gempba.dashboard.connection.ConnectionController;
import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.presenter.Presenter;
import io.gempba.dashboard.presenter.TabPresenter;
import io.gempba.dashboard.protocol.BroadcastEnvelope;
import io.gempba.dashboard.telemetry.TelemetryStore;
import io.gempba.dashboard.ui.LiveToggle;
import io.gempba.dashboard.view.SettingsView;
import io.gempba.dashboard.view.StatusView;
import org.eclipse.swt.widgets.Display;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.IntSupplier;

/**
 * The application's orchestrator — the thin "global controller" that owns the
 * live session and fans each frame out to the per-view {@link Presenter}s. It
 * never touches a widget directly: it drives the presenters through their
 * common contract and the status/settings views through their interfaces.
 * <p>
 * Per frame (on the UI thread, after the connection controller's hop): map the
 * wire frame to a {@link WorldSnapshot} once and push it to every
 * {@link Presenter} — tab presenters fold data state always and repaint only
 * while active; always-on presenters (the detail windows) render every frame.
 * On a tab switch it activates the selected {@link TabPresenter} and
 * deactivates the rest; on a new target it resets everything.
 * <p>
 * It is itself the {@link ConnectionController.Listener} (status + frames) and
 * the {@link SettingsView.Listener} (apply / rates), so wiring is a matter of
 * handing it to those components.
 * <p>
 * SWT-aware only because it owns the {@link FrameCoalescer} (a {@code Display}
 * timer); all presentation logic lives in the SWT-free presenters.
 */
final class DashboardCoordinator implements ConnectionController.Listener, SettingsView.Listener {

    private final TelemetryStore telemetryStore;
    /**
     * Every frame consumer — the tab presenters plus the always-on ones (the
     * detail windows). Fan-out and reset targets.
     */
    private final List<Presenter> presenters;
    /**
     * The tab presenters only, in tab order (list index = tab index).
     */
    private final List<TabPresenter<?>> tabs;
    private final StatusView statusView;
    private final IntSupplier activeIndex;
    private final FrameCoalescer coalescer;

    private final AtomicReference<WorldSnapshot> lastSnapshot = new AtomicReference<>();

    // Late-bound to break the construction cycle (the controller needs this as
    // its Listener, and an Apply needs the controller back).
    private ConnectionController controller;
    private LiveToggle liveToggle;

    DashboardCoordinator(Display display,
                         int renderIntervalMs,
                         TelemetryStore telemetryStore,
                         List<Presenter> presenters,
                         List<TabPresenter<?>> tabs,
                         StatusView statusView,
                         IntSupplier activeIndex) {
        this.telemetryStore = telemetryStore;
        this.presenters = presenters;
        this.tabs = tabs;
        this.statusView = statusView;
        this.activeIndex = activeIndex;
        this.coalescer = new FrameCoalescer(display, renderIntervalMs, this::dispatch);
    }

    /**
     * Resolve the construction cycle; call once after the controller exists.
     */
    void bind(ConnectionController controller, LiveToggle liveToggle) {
        this.controller = controller;
        this.liveToggle = liveToggle;
    }

    /**
     * Sync presenter active-state to the initially selected tab.
     */
    void start() {
        onTabChanged();
    }

    /**
     * Activate the now-selected tab's presenter, deactivate the rest.
     */
    void onTabChanged() {
        int active = activeIndex.getAsInt();
        WorldSnapshot last = lastSnapshot.get();
        for (int i = 0; i < tabs.size(); i++) {
            if (i == active) {
                tabs.get(i).activate(last);
            } else {
                tabs.get(i).deactivate();
            }
        }
    }

    /**
     * Forget all state for a new connection target.
     */
    void reset() {
        for (Presenter p : presenters) {
            p.clear();
        }
        telemetryStore.reset();
        lastSnapshot.set(null);
    }

    private void dispatch(BroadcastEnvelope frame) {
        WorldSnapshot snapshot = telemetryStore.ingest(frame);
        lastSnapshot.set(snapshot);
        // Every presenter sees every frame; what repaints when is each
        // presenter's own policy (tabs only while active, detail windows always).
        for (Presenter p : presenters) {
            p.update(snapshot);
        }
    }

    // ─── ConnectionController.Listener ───────────────────────────────────────

    @Override
    public void onStatus(String text) {
        statusView.setStatus(text);
    }

    @Override
    public void onFrame(BroadcastEnvelope frame) {
        coalescer.submit(frame);
    }

    // ─── SettingsView.Listener ───────────────────────────────────────────────

    @Override
    public void onConnectionApply(ConnectionSpec spec) {
        // Forget the previous topology so switching hosts leaves no stale cards,
        // tiles, history, or detail windows; then connect. Reset before connect
        // so a later tab switch can't repopulate a just-cleared view.
        reset();
        controller.connect(spec);
        // An explicit Apply implies "go live" — re-sync the toggle if paused.
        liveToggle.setLive(true);
    }

    @Override
    public void onConnectionInvalid(String reason) {
        statusView.setStatus(reason);
    }

    @Override
    public void onRatesApply(int workerIntervalMs, int nodeIntervalMs) {
        controller.pushRates(workerIntervalMs, nodeIntervalMs);
    }
}
