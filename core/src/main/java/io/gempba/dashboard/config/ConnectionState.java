package io.gempba.dashboard.config;

/**
 * The connection lifecycle as the UI needs to see it, so the connection bar can
 * lock fields and flip the Connect/Disconnect button without knowing anything
 * about SSH. Lives in {@code core} so the SWT view can react to it without
 * depending on the adapters layer that produces it.
 * <ul>
 *   <li>{@link #DISCONNECTED} — no live connection; connection fields editable,
 *       button shows "Connect".</li>
 *   <li>{@link #CONNECTING} — authenticating (possibly waiting on MFA); fields
 *       locked, button disabled.</li>
 *   <li>{@link #CONNECTED} — authenticated and held, but not yet observing a job;
 *       target fields enabled.</li>
 *   <li>{@link #LISTENING} — authenticated and streaming a target's telemetry.</li>
 * </ul>
 */
public enum ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    LISTENING
}
