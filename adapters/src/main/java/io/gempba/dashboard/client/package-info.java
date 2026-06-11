/**
 * The telemetry TCP client: a background-threaded reader that connects to the
 * gempba center, parses the {@code protocol} stream, and pushes frames to a
 * {@link io.gempba.dashboard.client.FrameListener}. A driven adapter — it
 * speaks the wire format and owns sockets, so it lives in {@code adapters}.
 */
package io.gempba.dashboard.client;
