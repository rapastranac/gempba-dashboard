/**
 * Application bootstrap and composition root.
 * <p>
 * {@link io.gempba.dashboard.app.DashboardApp DashboardApp} owns the SWT
 * {@link org.eclipse.swt.widgets.Display Display} and root
 * {@link org.eclipse.swt.widgets.Shell Shell}; it builds the widget graph,
 * constructs the presenters and the
 * {@link io.gempba.dashboard.app.DashboardCoordinator DashboardCoordinator},
 * wires the ports to their implementations, and runs the event loop. It holds
 * no render or dispatch logic of its own.
 * <p>
 * The cross-cutting orchestration lives in the
 * {@link io.gempba.dashboard.app.DashboardCoordinator}: the frame pipeline
 * ({@link io.gempba.dashboard.app.FrameCoalescer}, mapping, fan-out to the
 * presenters) and the session lifecycle. The SWT realization of the {@code core}
 * threading port is {@link io.gempba.dashboard.app.SwtUiExecutor}.
 * <p>
 * The root {@link io.gempba.dashboard.Main Main} is intentionally a one-line
 * entry point that delegates here — process bootstrap is separable from
 * application bootstrap.
 */
package io.gempba.dashboard.app;
