package io.gempba.dashboard.client;

import io.gempba.dashboard.protocol.BroadcastEnvelope;

/**
 * Callbacks the {@link TelemetryClient} fires from its background thread. The
 * UI must marshal these onto the SWT display thread itself ({@code
 * display.asyncExec}); the client deliberately stays UI-agnostic so it can be
 * driven from tests, headless tools, or alternative front-ends.
 */
public interface FrameListener {

    /**
     * Fired once each time a TCP connection is established.
     */
    void onConnected();

    /**
     * Fired for every successfully parsed broadcast frame.
     */
    void onFrame(BroadcastEnvelope frame);

    /**
     * Fired when the connection drops, either because the peer closed it
     * (cause may be null) or because of an I/O error (cause carries the
     * underlying exception). The client retries on its own afterwards.
     */
    void onDisconnected(Exception cause);
}
