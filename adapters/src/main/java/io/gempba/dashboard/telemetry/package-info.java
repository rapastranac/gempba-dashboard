/**
 * Telemetry adapters: the boundary that turns the wire protocol into the
 * domain read-model. {@link io.gempba.dashboard.telemetry.WorldSnapshotMapper}
 * is a pure function {@code BroadcastEnvelope → WorldSnapshot}; it depends on both
 * {@code protocol} (the wire DTOs) and {@code model} (the read-model) precisely
 * so that nothing downstream has to. It lives in the {@code adapters} module
 * alongside the protocol DTOs and the telemetry client, keeping the view layer
 * protocol-free.
 */
package io.gempba.dashboard.telemetry;
