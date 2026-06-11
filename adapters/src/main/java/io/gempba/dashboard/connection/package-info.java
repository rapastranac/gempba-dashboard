/**
 * Connection lifecycle: owns the
 * {@link io.gempba.dashboard.client.TelemetryClient TelemetryClient} and
 * (optionally) the {@link io.gempba.dashboard.ssh.SshTunnel SshTunnel}
 * for the currently selected target, plus the sticky refresh-rate
 * intervals re-pushed across reconnects.
 * <p>
 * The boundary between the UI and the transport. Inputs are a
 * {@link io.gempba.dashboard.config.ConnectionSpec ConnectionSpec} and
 * rate updates; outputs are status messages and parsed
 * {@link io.gempba.dashboard.protocol.BroadcastEnvelope BroadcastEnvelope}s
 * delivered on the SWT UI thread via
 * {@link io.gempba.dashboard.connection.ConnectionController.Listener Listener}.
 * <p>
 * Future neighbours: a {@code session} package that pairs a
 * {@code ConnectionController} with a domain-state store, and a
 * {@code SessionManager} that owns multiple sessions for compare/replay.
 */
package io.gempba.dashboard.connection;
