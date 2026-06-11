package io.gempba.dashboard.view;

import io.gempba.dashboard.config.ConnectionSpec;

/**
 * View contract for the settings strip. The view owns its own input
 * widgets, validation, and ssh-command preview; it emits results outward
 * through {@link Listener}. Thin enough to have no presenter — whoever
 * attaches as the listener receives the results directly.
 * <p>
 * All callbacks fire on the UI thread.
 */
public interface SettingsView {

    /**
     * Attach the listener that receives Apply / Apply-rates events.
     */
    void setListener(Listener listener);

    /**
     * Outward callbacks from the settings view.
     */
    interface Listener {

        /**
         * User applied a valid connection spec.
         */
        void onConnectionApply(ConnectionSpec spec);

        /**
         * User applied an invalid connection; {@code reason} is user-facing.
         */
        void onConnectionInvalid(String reason);

        /**
         * User applied refresh rates (spinner-clamped to the accepted range).
         */
        void onRatesApply(int workerIntervalMs, int nodeIntervalMs);
    }
}
