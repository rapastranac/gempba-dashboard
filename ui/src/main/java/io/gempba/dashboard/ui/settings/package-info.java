/**
 * The settings strip — the top band of the dashboard window where the user
 * picks a connection target, edits the generated ssh command, and tunes
 * gempba's frame-emit rates.
 * <p>
 * The strip is self-contained: it owns its widgets and internal UI state,
 * and communicates with the surrounding application only through a
 * {@link io.gempba.dashboard.ui.settings.SwtSettingsView.Listener Listener}
 * interface. It does not know about telemetry clients, ssh tunnels, the
 * status banner, or anything else outside the band.
 */
package io.gempba.dashboard.ui.settings;
