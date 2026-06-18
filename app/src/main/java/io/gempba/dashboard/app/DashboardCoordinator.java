package io.gempba.dashboard.app;

import io.gempba.dashboard.config.ConnectionState;
import io.gempba.dashboard.config.SessionSpec;
import io.gempba.dashboard.config.TargetSpec;
import io.gempba.dashboard.connection.ConnectionController;
import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.presenter.Presenter;
import io.gempba.dashboard.presenter.TabPresenter;
import io.gempba.dashboard.protocol.BroadcastEnvelope;
import io.gempba.dashboard.settings.SettingsStore;
import io.gempba.dashboard.telemetry.TelemetryStore;
import io.gempba.dashboard.view.SettingsView;
import io.gempba.dashboard.view.StatusView;
import org.eclipse.swt.widgets.Display;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.IntSupplier;

/**
 * The application's orchestrator — owns the live session and fans each frame out
 * to the per-view {@link Presenter}s, and routes the connection bar's two-phase
 * intent (connect / listen / disconnect) to the {@link ConnectionController}
 * while relaying the controller's lifecycle state back to the bar. It never
 * touches a widget directly.
 * <p>
 * It is itself the {@link ConnectionController.Listener} (status / frames /
 * state) and the {@link SettingsView.Listener} (connect / listen / disconnect /
 * rates), so wiring is a matter of handing it to those components. After each
 * user action it persists the bar's state through the {@link SettingsStore}.
 */
final class DashboardCoordinator implements ConnectionController.Listener, SettingsView.Listener {

    private final TelemetryStore telemetryStore;
    private final List<Presenter> presenters;
    private final List<TabPresenter<?>> tabs;
    private final StatusView statusView;
    private final SettingsView settingsView;
    private final SettingsStore store;
    private final IntSupplier activeIndex;
    private final FrameCoalescer coalescer;

    private final AtomicReference<WorldSnapshot> lastSnapshot = new AtomicReference<>();

    // Late-bound to break the construction cycle.
    private ConnectionController controller;

    DashboardCoordinator(Display display,
                         int renderIntervalMs,
                         TelemetryStore telemetryStore,
                         List<Presenter> presenters,
                         List<TabPresenter<?>> tabs,
                         StatusView statusView,
                         SettingsView settingsView,
                         SettingsStore store,
                         IntSupplier activeIndex) {
        this.telemetryStore = telemetryStore;
        this.presenters = presenters;
        this.tabs = tabs;
        this.statusView = statusView;
        this.settingsView = settingsView;
        this.store = store;
        this.activeIndex = activeIndex;
        this.coalescer = new FrameCoalescer(display, renderIntervalMs, this::dispatch);
    }

    /**
     * Resolve the construction cycle; call once after the controller exists.
     */
    void bind(ConnectionController controller) {
        this.controller = controller;
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
     * Forget all state for a new observation target.
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

    @Override
    public void onConnectionState(ConnectionState state) {
        settingsView.setConnectionState(state);
    }

    // ─── SettingsView.Listener ───────────────────────────────────────────────

    @Override
    public void onConnect(SessionSpec session) {
        controller.connect(session);
        save();
    }

    @Override
    public void onDisconnect() {
        controller.disconnect();
        save();
    }

    @Override
    public void onListen(TargetSpec target) {
        // Forget the previous topology so switching jobs leaves no stale cards,
        // tiles, history, or detail windows; then point at the new target.
        reset();
        controller.listen(target);
        save();
    }

    @Override
    public void onStopListen() {
        // Stop observing but keep the authenticated connection warm; re-listening
        // needs no re-auth. (Nothing persisted changes.)
        controller.stopListening();
    }

    @Override
    public void onModeChange() {
        // A different mode is a different observation context — clear the views,
        // and remember the newly selected mode.
        reset();
        save();
    }

    @Override
    public void onRatesApply(int workerIntervalMs, int nodeIntervalMs) {
        controller.pushRates(workerIntervalMs, nodeIntervalMs);
        save();
    }

    @Override
    public void onInvalid(String reason) {
        statusView.setStatus(reason);
    }

    private void save() {
        store.save(settingsView.currentSettings());
    }
}
