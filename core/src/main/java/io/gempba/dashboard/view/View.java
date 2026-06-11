package io.gempba.dashboard.view;

/**
 * The common contract for a renderable tab view: it is handed a {@code T} to
 * show and can be torn down. The two tab views — {@link GridView} and
 * {@link CardsView} — extend this, which is what lets a single generic
 * presenter ({@code TabPresenter<T>}) drive any of them.
 * <p>
 * Called on the UI thread.
 *
 * @param <T> what this view renders (its projection of the model)
 */
public interface View<T> {

    /**
     * Render {@code data}. Implementations own their internal bookkeeping
     * (e.g. re-measuring a scroll when their structure changed) — the
     * presenter neither knows nor cares.
     */
    void render(T data);

    /**
     * Tear the view down to its empty state.
     */
    void clear();
}
