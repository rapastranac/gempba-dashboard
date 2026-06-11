/**
 * The presenters (the P in MVP). {@link io.gempba.dashboard.presenter.Presenter}
 * is the generic frame-consumer contract; tab presenters extend
 * {@link io.gempba.dashboard.presenter.TabPresenter}, which adds the
 * visible/hidden tab lifecycle, and
 * {@link io.gempba.dashboard.presenter.DetailWindowsPresenter} implements
 * {@code Presenter} directly (always-on). Presenters own data access (e.g. the
 * grid's history buffer) and projection (which slice of the model) — but no
 * SWT, which is what makes them unit-testable against a fake view. Part of
 * {@code core}.
 */
package io.gempba.dashboard.presenter;
