package io.gempba.dashboard.presenter;

import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.DetailView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Presenter for the live node-detail windows: at most one per host, opened on a
 * tile click, fed every frame, and closed on {@link #clear}. The concrete
 * window comes from an injected factory, so this presenter depends only on the
 * {@link DetailView} contract.
 * <p>
 * UI-thread only.
 */
public final class DetailWindowsPresenter implements Presenter {

    private final Map<String, DetailView> byHost = new LinkedHashMap<>();
    private final Function<String, DetailView> factory;

    /**
     * The most recent frame, kept so a freshly opened window can be seeded
     * without the caller having to supply it. Cleared by {@link #clear} —
     * a reconnect must not seed a new window with the old target's data.
     */
    private WorldSnapshot latest;

    public DetailWindowsPresenter(Function<String, DetailView> factory) {
        this.factory = factory;
    }

    /**
     * Open a detail window for {@code host}, or focus the existing one. A
     * freshly opened window is immediately fed the latest frame so it shows
     * data without waiting for the next one.
     */
    public void openOrFocus(String host) {
        DetailView existing = byHost.get(host);
        if (existing != null && !existing.isDisposed()) {
            existing.focus();
            return;
        }
        DetailView view = factory.apply(host);
        view.setOnDisposed(() -> byHost.remove(host, view));
        byHost.put(host, view);
        view.open();
        if (latest != null) {
            view.render(latest);
        }
    }

    /**
     * Push one frame to every open window.
     */
    @Override
    public void update(WorldSnapshot snapshot) {
        latest = snapshot;
        // Copy first: a window can dispose mid-iteration (user closes it),
        // which removes it from the map via its onDisposed callback.
        for (DetailView d : new ArrayList<>(byHost.values())) {
            d.render(snapshot);
        }
    }

    /**
     * Close every open window and forget the seed snapshot (reconnect / shell
     * close).
     */
    @Override
    public void clear() {
        for (DetailView d : new ArrayList<>(byHost.values())) {
            d.close();
        }
        byHost.clear();
        latest = null;
    }
}
