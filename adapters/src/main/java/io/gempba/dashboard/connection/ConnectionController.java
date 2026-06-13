package io.gempba.dashboard.connection;

import io.gempba.dashboard.adapter.ssh.SshTunnel;
import io.gempba.dashboard.client.FrameListener;
import io.gempba.dashboard.client.TelemetryClient;
import io.gempba.dashboard.concurrent.UiExecutor;
import io.gempba.dashboard.config.ConnectionSpec;
import io.gempba.dashboard.protocol.BroadcastEnvelope;
import io.gempba.dashboard.ssh.SshCommand;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Owns the runtime lifecycle of a connection to a gempba center —
 * {@link TelemetryClient} and (optionally) {@link SshTunnel}, plus the
 * sticky refresh-rate intervals re-pushed on every (re)connect.
 * <p>
 * Inputs from the UI come in as {@link ConnectionSpec} for connect calls
 * and as plain ints for rate pushes. Outputs go back through
 * {@link Listener} on the UI thread (the controller hops via the injected
 * {@link UiExecutor} internally), so listener implementations can touch
 * widgets directly without checking the current thread. Crucially the
 * controller itself imports no UI toolkit — only the {@code UiExecutor} port —
 * so it lives in the SWT-free adapter layer.
 * <p>
 * Threading shape:
 * <ul>
 *   <li>Public methods are call-from-anywhere safe; they may block briefly
 *       on teardown but never on remote I/O.</li>
 *   <li>SSH tunnel readiness probe runs on a dedicated daemon thread — it
 *       can take ~20s on a cold connect, so we don't pin the caller.</li>
 *   <li>{@link FrameListener} callbacks fire on the
 *       {@link TelemetryClient}'s worker thread; the controller hops them
 *       to the UI thread before invoking {@link Listener}.</li>
 * </ul>
 * <p>
 * Lifecycle: one instance lives for the whole shell. {@link #connect}
 * tears down any prior client/tunnel before starting a new one. {@link #close}
 * tears down the current one and signals "no more callbacks" — async
 * tunnel-opener threads still in flight will silently drop their results.
 * <p>
 * Live vs. paused: {@link #setLive} toggles the auto-reconnect machinery.
 * While live (the default), a {@link TelemetryClient} is active and retries
 * the connection continuously. When paused, the client and tunnel are torn
 * down — no reconnect attempts, no new frames — but nothing is cleared, so
 * the UI keeps showing the last data it received. Re-enabling live
 * reconnects to the most recent {@link ConnectionSpec}.
 * <p>
 * Stale-callback guard: every (re)connect and teardown bumps an epoch
 * counter, and each frame listener captures the epoch it was created under.
 * Callbacks whose epoch no longer matches are dropped, so a client that's
 * being torn down can't post a late "disconnected — retrying…" over a fresh
 * "paused" status, nor leak frames from a previous target.
 */
public final class ConnectionController implements AutoCloseable {

    /**
     * gempba's center TCP server hardcodes loopback in
     * {@code center_tcp_server.cpp}; the controller always dials this,
     * either as a local gempba directly or as the local end of an SSH tunnel.
     */
    private static final String LOOPBACK = "127.0.0.1";
    private final UiExecutor uiExecutor;
    private final Listener listener;
    private final AtomicReference<TelemetryClient> clientRef = new AtomicReference<>();
    private final AtomicReference<SshTunnel> tunnelRef = new AtomicReference<>();
    /**
     * User-facing description of the current connection target — used to
     * stamp status messages with something like {@code "user@vm → 127.0.0.1:9000"}.
     * Set whenever {@link #connect} starts and not cleared until the next
     * one starts.
     */
    private final AtomicReference<String> activeTarget = new AtomicReference<>("");
    /**
     * Last-applied intervals, re-pushed on every (re)connect so a gempba
     * restart inherits them. Default values match gempba's defaults so the
     * initial push is a no-op for users who haven't customised.
     */
    private final AtomicInteger desiredWorkerIntervalMs;
    private final AtomicInteger desiredNodeIntervalMs;
    /**
     * Set by {@link #close}. Async work in flight (tunnel openers, frame
     * dispatches) checks this before touching the listener so a closed
     * controller never fires.
     */
    private final AtomicBoolean closed = new AtomicBoolean(false);
    /**
     * Bumped on every {@link #teardownInternal} (i.e. every (re)connect,
     * pause, and close). Frame listeners and tunnel openers capture the
     * epoch they belong to and ignore their own callbacks once it's stale.
     */
    private final AtomicInteger epoch = new AtomicInteger(0);
    /**
     * The most recent target. Remembered so {@link #setLive}{@code (true)}
     * can reconnect after a pause without the UI having to re-supply it.
     * UI-thread state.
     */
    private ConnectionSpec lastSpec;
    /**
     * Whether the auto-reconnect machinery is active. Starts {@code true}
     * (the dashboard connects and retries by default). UI-thread state.
     */
    private boolean live = true;

    public ConnectionController(UiExecutor uiExecutor,
                                Listener listener,
                                int initialWorkerIntervalMs,
                                int initialNodeIntervalMs) {
        this.uiExecutor = uiExecutor;
        this.listener = listener;
        this.desiredWorkerIntervalMs = new AtomicInteger(initialWorkerIntervalMs);
        this.desiredNodeIntervalMs = new AtomicInteger(initialNodeIntervalMs);
    }

    /**
     * Switch to a new connection target. Tears down any current
     * client/tunnel first; opens the new one asynchronously when an SSH
     * tunnel is involved (the readiness probe blocks for up to ~20 s on a
     * cold connect, so {@code connect} returns immediately and the result
     * arrives via {@link Listener#onStatus}).
     */
    public void connect(ConnectionSpec spec) {
        // Remember the target and mark us live: an explicit connect is an
        // intent to be live, so it also un-pauses if we were paused.
        this.lastSpec = spec;
        this.live = true;
        teardownInternal();
        FrameListener frameListener = newFrameListener();

        if (spec.overrideMode()) {
            List<String> template;
            try {
                template = SshCommand.tokenizeCommand(spec.customCommand());
            } catch (IllegalArgumentException ex) {
                postStatus("invalid override command: " + ex.getMessage());
                return;
            }
            if (template.isEmpty()) {
                postStatus("override command is empty");
                return;
            }
            openTunnel(template, spec.sshKey(), "(custom command)", frameListener);
            return;
        }

        if (spec.sshHost().isBlank()) {
            String target = LOOPBACK + ":" + spec.port();
            activeTarget.set(target);
            postStatus("connecting to " + target + "…");
            TelemetryClient client = new TelemetryClient(LOOPBACK, spec.port(), frameListener);
            // Publish before start: onConnected reads clientRef from the
            // worker thread, which may fire before a post-start set().
            clientRef.set(client);
            client.start();
            return;
        }

        String hopDescription = spec.jumpHost().isBlank()
                ? spec.sshHost() + " → " + LOOPBACK + ":" + spec.port()
                : spec.jumpHost() + " ⇒ " + spec.sshHost() + " → " + LOOPBACK + ":" + spec.port();
        List<String> template = SshCommand.buildTemplate(
                spec.sshHost(), LOOPBACK, spec.port(),
                spec.sshKey().isBlank() ? null : spec.sshKey(),
                spec.jumpHost().isBlank() ? null : spec.jumpHost());
        openTunnel(template, spec.sshKey(), hopDescription, frameListener);
    }

    /**
     * Push the chosen worker and node frame intervals to the running
     * gempba. Stores them as the new desired values so subsequent
     * reconnects re-apply them. If currently disconnected, only the desired
     * values are stored; the next connect will push them as a side effect
     * of {@link FrameListener#onConnected}.
     * <p>
     * The result (success / saved-offline / partial-failure) is reported
     * via {@link Listener#onStatus}.
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

    /**
     * Whether the auto-reconnect machinery is currently active.
     */
    public boolean isLive() {
        return live;
    }

    /**
     * Turn the auto-reconnect machinery on or off.
     * <p>
     * {@code setLive(false)} tears down the active client and tunnel and
     * stops all reconnect attempts; the UI keeps whatever it last showed
     * (nothing is cleared). {@code setLive(true)} reconnects to the most
     * recent {@link ConnectionSpec}, if there is one. No-op when already in
     * the requested state.
     */
    public void setLive(boolean live) {
        if (this.live == live) {
            return;
        }
        this.live = live;
        if (!live) {
            teardownInternal();
            postStatus("paused — showing last received data (auto-reconnect off)");
        } else if (lastSpec != null) {
            connect(lastSpec);
        } else {
            postStatus("ready — apply a connection to go live");
        }
    }

    @Override
    public void close() {
        closed.set(true);
        teardownInternal();
    }

    private void teardownInternal() {
        // Invalidate any in-flight callbacks from the client/tunnel we're
        // about to drop, so their late status/frames don't land on the UI.
        epoch.incrementAndGet();
        TelemetryClient old = clientRef.getAndSet(null);
        if (old != null) {
            old.close();
        }
        SshTunnel oldTunnel = tunnelRef.getAndSet(null);
        if (oldTunnel != null) {
            oldTunnel.close();
        }
    }

    // ─── internals ──────────────────────────────────────────────────────────

    private void openTunnel(List<String> template,
                            String sshKeyForSubst,
                            String hopDescription,
                            FrameListener frameListener) {
        // The epoch this tunnel belongs to. If a pause/reconnect/close bumps
        // it while the ~20s readiness probe runs, the opened tunnel is
        // discarded instead of becoming the active connection.
        final int myEpoch = epoch.get();
        activeTarget.set(hopDescription);
        postStatus("opening ssh tunnel via " + hopDescription + "…");
        Thread opener = new Thread(() -> {
            try {
                SshTunnel tunnel = SshTunnel.openWithTemplate(
                        template,
                        (sshKeyForSubst == null || sshKeyForSubst.isBlank()) ? null : sshKeyForSubst,
                        SshTunnel.DEFAULT_ACCEPT_TIMEOUT);
                hopToUi(() -> {
                    if (closed.get() || myEpoch != epoch.get()) {
                        tunnel.close();
                        return;
                    }
                    tunnelRef.set(tunnel);
                    int local = tunnel.localPort();
                    listener.onStatus("ssh tunnel up via " + hopDescription + " (127.0.0.1:" + local + ") — connecting…");
                    TelemetryClient client = new TelemetryClient(LOOPBACK, local, frameListener);
                    // Publish before start: onConnected reads clientRef from the
                    // worker thread, which may fire before a post-start set().
                    clientRef.set(client);
                    client.start();
                });
            } catch (IOException ex) {
                postStatusForEpoch(myEpoch, "ssh tunnel failed (" + hopDescription + "): " + ex.getMessage());
            }
        }, "gempba-ssh-opener");
        opener.setDaemon(true);
        opener.start();
    }

    private FrameListener newFrameListener() {
        // Capture the epoch this listener belongs to (connect() bumped it via
        // teardownInternal just before calling us). Stale callbacks from a
        // superseded client compare unequal and are dropped.
        final int myEpoch = epoch.get();
        return new FrameListener() {
            @Override
            public void onConnected() {
                // Push sticky intervals from this (worker) thread before
                // the UI sees "connected" — the socket is open and the
                // worker thread can write directly.
                TelemetryClient c = clientRef.get();
                if (c != null) {
                    c.sendControl(TelemetryClient.CONTROL_SET_WORKER_INTERVAL_MS, desiredWorkerIntervalMs.get());
                    c.sendControl(TelemetryClient.CONTROL_SET_NODE_INTERVAL_MS, desiredNodeIntervalMs.get());
                }
                postStatusForEpoch(myEpoch, "connected to " + activeTarget.get());
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
                String reason = (cause == null) ? "peer closed" : cause.getMessage();
                postStatusForEpoch(myEpoch, "disconnected from " + activeTarget.get() + " (" + reason + ") — retrying…");
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

    /**
     * Like {@link #postStatus} but dropped when the epoch has moved on.
     */
    private void postStatusForEpoch(int myEpoch, String text) {
        hopToUi(() -> {
            if (closed.get() || myEpoch != epoch.get()) {
                return;
            }
            listener.onStatus(text);
        });
    }

    /**
     * Schedule {@code r} on the UI thread via the injected {@link UiExecutor}.
     * Silently no-ops when the controller is closed; the executor itself drops
     * work if the UI is gone (both happen during shell teardown when in-flight
     * async work is racing the exit sequence).
     */
    private void hopToUi(Runnable r) {
        if (closed.get()) {
            return;
        }
        uiExecutor.execute(r);
    }

    /**
     * Outward callbacks from the controller. All methods fire on the SWT
     * UI thread.
     */
    public interface Listener {
        /**
         * A user-facing status update — status banner text, basically.
         * Covers connecting / connected / disconnected / tunnel-failed /
         * rates-pushed / etc. The controller pre-formats each message so
         * the listener doesn't need to care about the underlying state
         * machine.
         */
        void onStatus(String text);

        /**
         * A telemetry frame arrived. The listener typically forwards this
         * to whatever views need it.
         */
        void onFrame(BroadcastEnvelope frame);
    }
}
