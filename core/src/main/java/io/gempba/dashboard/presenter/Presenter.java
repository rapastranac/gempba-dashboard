package io.gempba.dashboard.presenter;

import io.gempba.dashboard.model.WorldSnapshot;

/**
 * The most generic presenter contract: something that consumes each telemetry
 * frame and can be reset. SWT-free, so every implementation is unit-testable
 * with a fake view.
 * <p>
 * All methods are UI-thread-only by contract.
 */
public interface Presenter {

    /**
     * Called on <em>every</em> presenter <em>every</em> frame. The presenter
     * folds or routes the snapshot as it sees fit — what reaches a view, and
     * when, is the implementation's own policy.
     */
    void update(WorldSnapshot snapshot);

    /**
     * New connection target / reset: forget everything — views, windows, and
     * any accumulated data state.
     */
    void clear();
}
