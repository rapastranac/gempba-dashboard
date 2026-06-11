package io.gempba.dashboard.presenter;

import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.CardsView;

/**
 * Presenter for the detailed-cards tab. The card hierarchy reconciles itself
 * from the snapshot, so the projection is the identity and there is no data
 * state — the entire class is that one fact. The active/inactive lifecycle is
 * inherited from {@link TabPresenter}.
 */
public final class CardsPresenter extends TabPresenter<WorldSnapshot> {

    public CardsPresenter(CardsView view) {
        super(view);
    }

    @Override
    protected WorldSnapshot project(WorldSnapshot snapshot) {
        return snapshot;   // the cards render the whole model tree as-is
    }
}
