package io.gempba.dashboard.connection;

import io.gempba.dashboard.adapter.ssh.Forward;
import io.gempba.dashboard.adapter.ssh.PortForwardTunnel;
import io.gempba.dashboard.adapter.ssh.RemoteConnection;
import io.gempba.dashboard.adapter.ssh.RemoteConnectionFactory;
import io.gempba.dashboard.auth.AuthPrompt;
import io.gempba.dashboard.client.FrameListener;
import io.gempba.dashboard.client.TelemetryClient;
import io.gempba.dashboard.concurrent.UiExecutor;
import io.gempba.dashboard.config.ConnectionMode;
import io.gempba.dashboard.config.ConnectionState;
import io.gempba.dashboard.config.SessionSpec;
import io.gempba.dashboard.config.TargetSpec;
import io.gempba.dashboard.protocol.BroadcastEnvelope;

import java.io.IOException;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Owns the runtime lifecycle of a connection to a gempba center, split into two
 * decoupled phases so authenticating (the expensive, MFA-gated step) happens
 * <em>once</em> and re-pointing at a different job is cheap:
 * <ul>
 *   <li>{@link #connect} authenticates and holds a {@link RemoteConnection}
 *       (no-op for LOCAL). This is the only place an interactive MFA prompt
 *       fires.</li>
 *   <li>{@link #listen} opens a {@link Forward} over the held connection and
 *       starts a {@link TelemetryClient} on it; re-callable to switch targets,
 *       reusing the connection with no re-authentication.</li>
 *   <li>{@link #stopListening} stops the telemetry stream but keeps the
 *       authenticated connection warm, so a later {@link #listen} never
 *       re-prompts. The same teardown runs automatically when the gempba stream
 *       ends, reverting the UI from LISTENING back to CONNECTED.</li>
 *   <li>{@link #disconnect} tears everything down.</li>
 * </ul>
 * <p>
 * Outputs go back through {@link Listener} on the UI thread (the controller hops
 * via the injected {@link UiExecutor}); the controller itself imports no UI
 * toolkit. Threading: public methods are call-from-anywhere safe; SSH work runs
 * on a dedicated daemon thread (it can block on a Duo dialog), and frame
 * callbacks are hopped to the UI thread. An epoch counter plus a closed flag
 * drop callbacks from a connection/stream that has since been superseded.
 */
public final class ConnectionController implements AutoCloseable {

    private static final String LOOPBACK = "127.0.0.1";
    private static final String SSH_OPENER_THREAD = "gempba-ssh-opener";
    private static final String FORWARD_OPENER_THREAD = "gempba-forward-opener";

    private final UiExecutor uiExecutor;
    private final Listener listener;
    private final AuthPrompt authPrompt;
    private final Path knownHostsPath;
    private final RemoteConnectionFactory connectionFactory;

    private final AtomicReference<RemoteConnection> connectionRef = new AtomicReference<>();
    private final AtomicReference<PortForwardTunnel> forwardRef = new AtomicReference<>();
    private final AtomicReference<TelemetryClient> clientRef = new AtomicReference<>();
    private final AtomicReference<String> activeTarget = new AtomicReference<>("");

    private final AtomicInteger desiredWorkerIntervalMs;
    private final AtomicInteger desiredNodeIntervalMs;

    private final AtomicBoolean closed = new AtomicBoolean(false);
    /**
     * Bumped on every teardown (connect, listen, disconnect, pause). Frame
     * listeners and async openers capture the epoch they belong to and ignore
     * their own callbacks once it's stale.
     */
    private final AtomicInteger epoch = new AtomicInteger(0);

    // UI-thread state, remembered for re-listen.
    private SessionSpec lastSession;
    private TargetSpec lastTarget;

    public ConnectionController(UiExecutor uiExecutor,
                                Listener listener,
                                AuthPrompt authPrompt,
                                Path knownHostsPath,
                                int initialWorkerIntervalMs,
                                int initialNodeIntervalMs) {
        this(uiExecutor, listener, authPrompt, knownHostsPath, RemoteConnection::connect, initialWorkerIntervalMs, initialNodeIntervalMs);
    }

    /**
     * Constructor with an injectable connection factory (for tests).
     */
    public ConnectionController(UiExecutor uiExecutor,
                                Listener listener,
                                AuthPrompt authPrompt,
                                Path knownHostsPath,
                                RemoteConnectionFactory connectionFactory,
                                int initialWorkerIntervalMs,
                                int initialNodeIntervalMs) {
        this.uiExecutor = uiExecutor;
        this.listener = listener;
        this.authPrompt = authPrompt;
        this.knownHostsPath = knownHostsPath;
        this.connectionFactory = connectionFactory;
        this.desiredWorkerIntervalMs = new AtomicInteger(initialWorkerIntervalMs);
        this.desiredNodeIntervalMs = new AtomicInteger(initialNodeIntervalMs);
    }

    // ─── phase 1: connect (authenticate once) ────────────────────────────────

    /**
     * Authenticate to the given connection and hold it open. Tears down any
     * prior connection first. For LOCAL there is nothing to authenticate, so it
     * succeeds immediately. For HOST/JUMP the handshake (and any Duo prompt) runs
     * on a daemon thread, so this returns at once and the result arrives via
     * {@link Listener}.
     */
    public void connect(SessionSpec session) {
        this.lastSession = session;
        teardownAll();

        if (session.mode() == ConnectionMode.LOCAL) {
            postStatus("local — pick a port and press Go");
            postState(ConnectionState.CONNECTED);
            return;
        }

        final int myEpoch = epoch.get();
        postStatus("connecting to " + session.host() + "… (enter your MFA code if prompted)");
        postState(ConnectionState.CONNECTING);
        Thread opener = new Thread(() -> {
            try {
                RemoteConnection remoteConnection = connectionFactory.connect(session, authPrompt, knownHostsPath);
                hopToUi(() -> {
                    if (closed.get() || myEpoch != epoch.get()) {
                        remoteConnection.close();
                        return;
                    }
                    connectionRef.set(remoteConnection);
                    listener.onStatus("connected to " + session.host() + " — pick a target and press Go");
                    listener.onConnectionState(ConnectionState.CONNECTED);
                });
            } catch (IOException ex) {
                hopToUi(() -> {
                    if (closed.get() || myEpoch != epoch.get()) {
                        return;
                    }
                    listener.onStatus("connection failed: " + ex.getMessage());
                    listener.onConnectionState(ConnectionState.DISCONNECTED);
                });
            }
        }, SSH_OPENER_THREAD);
        opener.setDaemon(true);
        opener.start();
    }

    // ─── phase 2: listen (point at a job, cheaply, no re-auth) ───────────────

    /**
     * Observe the given target over the held connection. Tears down the prior
     * forward + telemetry client (but not the connection) and opens a new one.
     * For LOCAL it dials {@code 127.0.0.1:port} directly.
     */
    public void listen(TargetSpec target) {
        this.lastTarget = target;
        ConnectionMode mode = currentMode();
        teardownStream();
        final int myEpoch = epoch.get();
        FrameListener frameListener = newFrameListener(myEpoch);

        if (mode == ConnectionMode.LOCAL) {
            String desc = LOOPBACK + ":" + target.gempbaPort();
            activeTarget.set(desc);
            postStatus("connecting to " + desc + "…");
            postState(ConnectionState.LISTENING);
            startClient(target.gempbaPort(), frameListener);
            return;
        }

        RemoteConnection conn = connectionRef.get();
        if (conn == null || !conn.isAlive()) {
            postStatus("not connected — press Connect first");
            postState(ConnectionState.DISCONNECTED);
            return;
        }
        String desc = describeTarget(mode, target);
        activeTarget.set(desc);
        postStatus("opening telemetry forward to " + desc + "…");
        Thread opener = new Thread(() -> {
            try {
                Forward forward = conn.openForward(target);
                hopToUi(() -> {
                    if (closed.get() || myEpoch != epoch.get()) {
                        forward.close();
                        return;
                    }
                    forwardRef.set(forward);
                    listener.onStatus("listening to " + desc + " (127.0.0.1:" + forward.localPort() + ")…");
                    listener.onConnectionState(ConnectionState.LISTENING);
                    startClient(forward.localPort(), frameListener);
                });
            } catch (IOException ex) {
                hopToUi(() -> {
                    if (closed.get() || myEpoch != epoch.get()) {
                        return;
                    }
                    // The session is still fine; only this target failed.
                    listener.onStatus("could not observe " + desc + ": " + ex.getMessage());
                    listener.onConnectionState(ConnectionState.CONNECTED);
                });
            }
        }, FORWARD_OPENER_THREAD);
        opener.setDaemon(true);
        opener.start();
    }

    /**
     * Tear everything down and return to disconnected.
     */
    public void disconnect() {
        teardownAll();
        postStatus("disconnected");
        postState(ConnectionState.DISCONNECTED);
    }

    /**
     * Stop observing the current target (close the telemetry client and its
     * forward) while keeping the authenticated connection open, so a later
     * {@link #listen} reuses it with no re-authentication. Returns to CONNECTED
     * (or DISCONNECTED if the session itself is gone). This is what the UI's
     * Listen/Stop toggle calls, and what {@link #listen}'s stream-end handler
     * runs automatically when gempba finishes.
     */
    public void stopListening() {
        teardownStream();
        postState(heldConnectionState());
        postStatus(isConnectionHeld() ? "stopped — connection kept, press Listen to observe again" : "disconnected");
    }

    /**
     * Push the chosen worker and node frame intervals to the running gempba over
     * the live telemetry socket. Stores them as the new desired values so a
     * (re)connect re-applies them.
     */
    public void pushRates(int workerIntervalMs, int nodeIntervalMs) {
        desiredWorkerIntervalMs.set(workerIntervalMs);
        desiredNodeIntervalMs.set(nodeIntervalMs);
        TelemetryClient c = clientRef.get();
        if (c == null) {
            postStatus("rates saved (worker=" + workerIntervalMs + "ms, node=" + nodeIntervalMs + "ms) — will push on next connect");
            return;
        }
        boolean a = c.sendControl(TelemetryClient.CONTROL_SET_WORKER_INTERVAL_MS, workerIntervalMs);
        boolean b = c.sendControl(TelemetryClient.CONTROL_SET_NODE_INTERVAL_MS, nodeIntervalMs);
        if (a && b) {
            postStatus("rates pushed (worker=" + workerIntervalMs + "ms, node=" + nodeIntervalMs + "ms)");
        } else {
            postStatus("rates partially failed — connection may be down; will retry on next reconnect");
        }
    }

    @Override
    public void close() {
        closed.set(true);
        teardownAll();
    }

    // ─── internals ───────────────────────────────────────────────────────────

    private ConnectionMode currentMode() {
        return (lastSession != null) ? lastSession.mode() : ConnectionMode.LOCAL;
    }

    private String describeTarget(ConnectionMode mode, TargetSpec target) {
        String dest = (mode == ConnectionMode.JUMP && target.hasTargetHost())
                ? target.targetHost()
                : (lastSession != null ? lastSession.host() : "");
        return dest + " → 127.0.0.1:" + target.gempbaPort();
    }

    /**
     * Start a telemetry client on a loopback port at the current epoch. Closes
     * any prior client first.
     */
    private void startClient(int localPort, FrameListener frameListener) {
        TelemetryClient old = clientRef.getAndSet(null);
        if (old != null) {
            old.close();
        }
        // One-shot: when the stream ends we revert to "ready" rather than silently
        // reconnecting, so the worker must not retry on its own (that also rules
        // out a reconnect racing the teardown that onDisconnected schedules).
        TelemetryClient client = new TelemetryClient(LOOPBACK, localPort, frameListener, false);
        // Publish before start: onConnected reads clientRef from the worker
        // thread, which may fire before a post-start set().
        clientRef.set(client);
        client.start();
    }

    /**
     * Whether an authenticated connection is still usable for a (re)listen:
     * always true for LOCAL (no SSH session needed), otherwise true while the
     * SSH session is alive.
     */
    private boolean isConnectionHeld() {
        if (currentMode() == ConnectionMode.LOCAL) {
            return true;
        }
        RemoteConnection conn = connectionRef.get();
        return conn != null && conn.isAlive();
    }

    private ConnectionState heldConnectionState() {
        return isConnectionHeld() ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED;
    }

    /**
     * Tear down the telemetry stream + forward (not the connection). Bumps epoch.
     */
    private void teardownStream() {
        epoch.incrementAndGet();
        TelemetryClient client = clientRef.getAndSet(null);
        if (client != null) {
            client.close();
        }
        PortForwardTunnel forward = forwardRef.getAndSet(null);
        if (forward != null) {
            forward.close();
        }
    }

    /**
     * Tear down stream + forward + connection.
     */
    private void teardownAll() {
        teardownStream();
        RemoteConnection remoteConnection = connectionRef.getAndSet(null);
        if (remoteConnection != null) {
            remoteConnection.close();
        }
    }

    private FrameListener newFrameListener(int myEpoch) {
        return new FrameListener() {
            @Override
            public void onConnected() {
                if (closed.get() || myEpoch != epoch.get()) {
                    return; // superseded by a newer listen/stop/disconnect
                }
                TelemetryClient client = clientRef.get();
                if (client != null) {
                    client.sendControl(TelemetryClient.CONTROL_SET_WORKER_INTERVAL_MS, desiredWorkerIntervalMs.get());
                    client.sendControl(TelemetryClient.CONTROL_SET_NODE_INTERVAL_MS, desiredNodeIntervalMs.get());
                }
                postStatusForEpoch(myEpoch, "streaming " + activeTarget.get());
            }

            @Override
            public void onFrame(BroadcastEnvelope frame) {
                hopToUi(() -> {
                    if (closed.get() || myEpoch != epoch.get()) {
                        return;
                    }
                    listener.onFrame(frame);
                });
            }

            @Override
            public void onDisconnected(Exception cause) {
                hopToUi(() -> {
                    if (closed.get() || myEpoch != epoch.get()) {
                        return; // superseded by a newer listen/stop/disconnect
                    }
                    // The stream ended — gempba finished, or the link dropped.
                    // Stop listening (so we don't silently retry) but keep the
                    // authenticated connection warm, and revert LISTENING →
                    // CONNECTED so the Listen/Stop toggle flips back on its own.
                    String target = activeTarget.get();
                    teardownStream();
                    boolean held = isConnectionHeld();
                    String why = (cause == null) ? "stream ended" : ("link lost: " + cause.getMessage());
                    listener.onStatus(target + " — " + why + (held ? " (press Listen to observe again)" : ""));
                    listener.onConnectionState(heldConnectionState());
                });
            }
        };
    }

    private void postStatus(String text) {
        hopToUi(() -> {
            if (closed.get()) {
                return;
            }
            listener.onStatus(text);
        });
    }

    private void postStatusForEpoch(int myEpoch, String text) {
        hopToUi(() -> {
            if (closed.get() || myEpoch != epoch.get()) {
                return;
            }
            listener.onStatus(text);
        });
    }

    private void postState(ConnectionState state) {
        hopToUi(() -> {
            if (closed.get()) {
                return;
            }
            listener.onConnectionState(state);
        });
    }

    private void hopToUi(Runnable r) {
        if (closed.get()) {
            return;
        }
        uiExecutor.execute(r);
    }

    /**
     * Outward callbacks from the controller. All methods fire on the UI thread.
     */
    public interface Listener {

        /**
         * A user-facing status line (connecting / connected / listening /
         * paused / failed / rates-pushed / …), pre-formatted by the controller.
         */
        void onStatus(String text);

        /**
         * A telemetry frame arrived.
         */
        void onFrame(BroadcastEnvelope frame);

        /**
         * The connection lifecycle moved, so the UI can lock/unlock fields and
         * flip the Connect/Disconnect button.
         */
        void onConnectionState(ConnectionState state);
    }
}
