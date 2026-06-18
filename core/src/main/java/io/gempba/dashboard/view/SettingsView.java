package io.gempba.dashboard.view;

import io.gempba.dashboard.config.ConnectionState;
import io.gempba.dashboard.config.DashboardSettings;
import io.gempba.dashboard.config.SessionSpec;
import io.gempba.dashboard.config.TargetSpec;

/**
 * View contract for the connection bar. The bar owns its own widgets and
 * validation and emits the user's intent outward through {@link Listener}; the
 * application pushes connection state back in through
 * {@link #setConnectionState} so the bar can lock fields and flip the
 * Connect/Disconnect button. The two halves are deliberately separate — connect
 * (authenticate once) and listen (point at a job) — so re-pointing never
 * re-authenticates.
 * <p>
 * All callbacks fire on the UI thread.
 */
public interface SettingsView {

    /**
     * Attach the listener that receives connect / listen / disconnect / rate
     * events.
     */
    void setListener(Listener listener);

    /**
     * Reflect the current connection lifecycle into the bar (lock/unlock,
     * relabel the button). Called on the UI thread.
     */
    void setConnectionState(ConnectionState state);

    /**
     * A snapshot of the bar's current field values + recents, for persistence.
     */
    DashboardSettings currentSettings();

    /**
     * Outward callbacks from the connection bar.
     */
    interface Listener {

        /**
         * User asked to open (authenticate) a connection. For LOCAL this is a
         * no-op connection, usually fired together with the first listen.
         */
        void onConnect(SessionSpec session);

        /**
         * User asked to close the current connection.
         */
        void onDisconnect();

        /**
         * User asked to observe a target over the open connection.
         */
        void onListen(TargetSpec target);

        /**
         * User asked to stop observing the current target, keeping the
         * authenticated connection open (the inverse of {@link #onListen}).
         */
        void onStopListen();

        /**
         * User switched the connection mode (Local / Host / Jump). A different
         * mode is a different observation context, so the views should be
         * cleared of the previous session's tiles and cards.
         */
        void onModeChange();

        /**
         * User applied refresh rates (spinner-clamped to the accepted range).
         */
        void onRatesApply(int workerIntervalMs, int nodeIntervalMs);

        /**
         * User input was invalid; {@code reason} is user-facing.
         */
        void onInvalid(String reason);
    }
}
