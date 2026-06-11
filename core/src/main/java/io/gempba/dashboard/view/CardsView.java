package io.gempba.dashboard.view;

import io.gempba.dashboard.model.WorldSnapshot;

/**
 * View contract for the detailed card hierarchy tab. It renders the
 * full {@link WorldSnapshot} tree (World → Node → Socket → Worker → Cores) and
 * owns its own scroll/redraw bookkeeping. Adds nothing beyond
 * {@link View}{@code <WorldSnapshot>} — it exists as a named contract so an
 * implementation reads as {@code implements CardsView} rather than
 * {@code implements View<WorldSnapshot>}.
 * <p>
 * Called on the UI thread.
 */
public interface CardsView extends View<WorldSnapshot> {
}
