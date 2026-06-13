package io.gempba.dashboard.presenter;

import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.View;

/**
 * Generic base for a content-tab presenter. It captures the whole tab lifecycle
 * once — the active/inactive flag, "fold data every frame but repaint only when
 * active", and tear-down — so a concrete presenter only has to say <em>how</em>
 * it projects the model to what its view renders.
 * <p>
 * Only tabs have a visible/hidden lifecycle, so {@link #activate} and
 * {@link #deactivate} live here — and, being {@code final} alongside
 * {@link #update}, they make the invariant unbreakable: a subclass cannot
 * forget to fold while hidden or repaint while inactive.
 * <p>
 * A subclass implements {@link #project} (the one per-tab difference) and may
 * override {@link #ingest} (per-frame side effects that must run even while the
 * tab is hidden, e.g. folding a history buffer) and {@link #clear} (to also drop
 * accumulated data state).
 *
 * @param <T> what this tab's view renders (its projection of the model)
 */
public abstract class TabPresenter<T> implements Presenter {

    private final View<T> view;
    private boolean active;

    protected TabPresenter(View<T> view) {
        this.view = view;
    }

    /**
     * Project the full model to what this tab's view renders.
     */
    protected abstract T project(WorldSnapshot snapshot);

    /**
     * Per-frame side effects that must run on <em>every</em> frame, even while
     * the tab is inactive (e.g. fold the snapshot into a history buffer).
     * Default does nothing.
     */
    protected void ingest(WorldSnapshot snapshot) {
    }

    @Override
    public final void update(WorldSnapshot snapshot) {
        ingest(snapshot);                          // always — keeps data state continuous
        if (active) {
            view.render(project(snapshot)); // repaint only when shown
        }
    }

    /**
     * This tab became the visible one. Repaint the view from {@code last} (the
     * most recent snapshot, possibly {@code null} before the first frame) so a
     * freshly-shown tab shows current data immediately.
     */
    public final void activate(WorldSnapshot last) {
        active = true;
        if (last != null) {
            view.render(project(last));
        }
    }

    /**
     * This tab was hidden. Tear the view down to its empty state so a hidden
     * tab costs nothing; accumulated data state (e.g. history) is retained for
     * when the tab is re-activated.
     */
    public final void deactivate() {
        active = false;
        view.clear();   // drop widgets; data state (if any) is retained
    }

    @Override
    public void clear() {
        view.clear();   // subclasses override to also forget accumulated data state
    }
}
