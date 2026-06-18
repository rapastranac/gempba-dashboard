package io.gempba.dashboard.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.gempba.dashboard.config.RefreshInterval;
import io.gempba.dashboard.protocol.BroadcastEnvelope;
import io.gempba.dashboard.protocol.JsonMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Background reader of the gempba center's line-delimited JSON stream, with
 * out-of-band control writes back over the same socket.
 * <p>
 * Owns one daemon thread that:
 * 1. opens a TCP socket to (host, port),
 * 2. reads one JSON object per line and parses each into a {@link BroadcastEnvelope},
 * 3. invokes the {@link FrameListener} on every frame,
 * 4. on disconnect, fires onDisconnected and — when {@code autoReconnect} — retries
 * after the configured backoff. A one-shot client ({@code autoReconnect=false})
 * instead stops after the first disconnect, leaving any retry decision to the
 * caller (so the stream ending is a single, final event).
 * <p>
 * {@link #sendControl} writes a single {@code \n}-terminated JSON line on the
 * write half of the same socket — the server side
 * ({@code center_tcp_server.cpp}) parses it via {@code parse_control_line} and
 * fans the change out across MPI. Writes are synchronized so concurrent UI
 * actions can't tear; reads happen on the worker thread on the read half and
 * don't conflict.
 * <p>
 * Thread-safety: all listener callbacks happen on the client's worker
 * thread. UI consumers are responsible for hopping back onto their own
 * event loop (e.g. SWT's display.asyncExec).
 */
public final class TelemetryClient implements AutoCloseable {

    /**
     * Default reconnect backoff used when the constructor doesn't specify one.
     */
    public static final Duration DEFAULT_RECONNECT_BACKOFF = Duration.ofSeconds(1);

    /**
     * Lower bound the gempba server clamps incoming interval values to.
     * Sourced from {@link RefreshInterval} so the bound is defined once.
     */
    public static final int MIN_INTERVAL_MS = RefreshInterval.MIN_MS;

    /**
     * Upper bound the gempba server clamps incoming interval values to.
     */
    public static final int MAX_INTERVAL_MS = RefreshInterval.MAX_MS;

    /**
     * Wire {@code kind} string for the worker-frame interval control message.
     */
    public static final String CONTROL_SET_WORKER_INTERVAL_MS = "set_worker_interval_ms";

    /**
     * Wire {@code kind} string for the node-frame interval control message.
     */
    public static final String CONTROL_SET_NODE_INTERVAL_MS = "set_node_interval_ms";

    private final String host;
    private final int port;
    private final FrameListener listener;
    private final ObjectMapper mapper;
    private final Duration reconnectBackoff;
    private final boolean autoReconnect;
    private final Thread worker;
    private final AtomicBoolean running = new AtomicBoolean(false);
    /**
     * The socket currently being read by the worker thread, or null when
     * disconnected / between reconnect attempts. {@link #sendControl} reads
     * this to find the write half.
     */
    private final AtomicReference<Socket> activeSocket = new AtomicReference<>();
    private final Object writeLock = new Object();

    public TelemetryClient(String host, int port, FrameListener listener) {
        this(host, port, listener, DEFAULT_RECONNECT_BACKOFF, true);
    }

    /**
     * One-shot vs. auto-reconnecting client. With {@code autoReconnect=false} the
     * worker stops after the first disconnect rather than retrying.
     */
    public TelemetryClient(String host, int port, FrameListener listener, boolean autoReconnect) {
        this(host, port, listener, DEFAULT_RECONNECT_BACKOFF, autoReconnect);
    }

    public TelemetryClient(String host, int port, FrameListener listener, Duration reconnectBackoff) {
        this(host, port, listener, reconnectBackoff, true);
    }

    public TelemetryClient(String host, int port, FrameListener listener, Duration reconnectBackoff,
                           boolean autoReconnect) {
        this.host = host;
        this.port = port;
        this.listener = listener;
        this.reconnectBackoff = reconnectBackoff;
        this.autoReconnect = autoReconnect;
        this.mapper = JsonMapper.create();
        this.worker = new Thread(this::run, "gempba-telemetry-client");
        this.worker.setDaemon(true);
    }

    /**
     * Starts the background reader thread. Idempotent (subsequent calls are no-ops).
     */
    public synchronized void start() {
        if (running.compareAndSet(false, true)) {
            worker.start();
        }
    }

    @Override
    public void close() {
        running.set(false);
        // Interrupt only unblocks sleepBackoff(); a thread blocked in a
        // socket read ignores it. Closing the socket makes readLine() throw
        // immediately, so the old connection can't linger after a target switch.
        Socket s = activeSocket.get();
        if (s != null) {
            try {
                s.close();
            } catch (IOException ignored) {
            }
        }
        worker.interrupt();
        try {
            worker.join(2_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Push one control line back to the gempba center. Returns {@code true}
     * if the bytes were handed to the kernel send buffer, {@code false} if
     * we're currently disconnected or the write failed (the worker thread
     * will see the error on its next read and reconnect; the caller can
     * retry via {@link FrameListener#onConnected}).
     * <p>
     * The wire format is one line per call: {@code {"kind":"<kind>","value":<int>}\n}.
     * Server-side clamping to [{@value #MIN_INTERVAL_MS}, {@value #MAX_INTERVAL_MS}]
     * is the source of truth — the dashboard does not pre-clamp, so the user
     * sees what they asked for sent and what gempba honored arrives in
     * subsequent frames.
     */
    public boolean sendControl(String kind, int value) {
        Socket s = activeSocket.get();
        if (s == null || s.isClosed() || !s.isConnected()) {
            return false;
        }
        // Hand-rolled line: this is two strings and a number — Jackson's
        // overhead and risk of reordering or pretty-printing aren't worth
        // it. The server's parser is forgiving about whitespace.
        String line = "{\"kind\":\"" + kind + "\",\"value\":" + value + "}\n";
        byte[] bytes = line.getBytes(StandardCharsets.UTF_8);
        try {
            OutputStream out = s.getOutputStream();
            synchronized (writeLock) {
                out.write(bytes);
                out.flush();
            }
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private void run() {
        while (running.get()) {
            try (Socket socket = new Socket(host, port);
                 BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8))) {

                activeSocket.set(socket);
                try {
                    listener.onConnected();
                    pumpFrames(reader);
                    // Peer-clean close: cause = null distinguishes from I/O errors.
                    listener.onDisconnected(null);
                } finally {
                    activeSocket.set(null);
                }
            } catch (IOException ioe) {
                activeSocket.set(null);
                listener.onDisconnected(ioe);
            }

            if (!autoReconnect) {
                // One-shot: the disconnect just delivered is final; don't retry.
                running.set(false);
                return;
            }
            sleepBackoff();
        }
    }

    private void pumpFrames(BufferedReader reader) throws IOException {
        String line;
        while (running.get() && (line = reader.readLine()) != null) {
            if (line.isBlank()) {
                continue;
            }
            try {
                BroadcastEnvelope envelope = mapper.readValue(line, BroadcastEnvelope.class);
                listener.onFrame(envelope);
            } catch (Exception parseEx) {
                // A single malformed frame must not kill the connection — the
                // C++ side is the contract owner; we log nothing here and let
                // higher layers add observability if they want it.
            }
        }
    }

    private void sleepBackoff() {
        if (!running.get()) {
            return;
        }
        try {
            Thread.sleep(reconnectBackoff.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            running.set(false);
        }
    }
}
