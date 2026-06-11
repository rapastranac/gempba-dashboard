package io.gempba.dashboard.client;

import io.gempba.dashboard.protocol.BroadcastEnvelope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.*;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Drives the telemetry client against a tiny in-process TCP server. The server
 * binds to port 0 so the OS picks a free one, avoiding collisions with a real
 * gempba running on 9000.
 */
class TelemetryClientTest {

    private static final String SAMPLE_FRAME = """
            {"version":1,"ts":1700000000000,"topology":{"nodes":[],"identities":[]},"workers":[{"worker_id":0,"seq_no":1,"worker_local_ms":0,"tasks_local_total":42,"tasks_sent_total":0,"tasks_recv_total":0,"tasks_running":0,"scheduler_pending_count":0,"idle_microseconds_per_worker":0,"process_cpu_pct":0.0,"process_rss_bytes":0,"process_threads":1,"edges_out":[]}],"nodes":[]}""";

    private ServerSocket server;
    private TelemetryClient client;

    private static int freePort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    @BeforeEach
    void setUp() throws IOException {
        server = new ServerSocket(0); // OS-assigned ephemeral port
    }

    @AfterEach
    void tearDown() throws IOException {
        if (client != null) {
            client.close();
        }
        if (server != null && !server.isClosed()) {
            server.close();
        }
    }

    @Test
    void delivers_a_parsed_frame_to_the_listener() throws Exception {
        CountDownLatch frameReceived = new CountDownLatch(1);
        List<BroadcastEnvelope> frames = new ArrayList<>();

        FrameListener listener = new FrameListener() {
            @Override
            public void onConnected() {
            }

            @Override
            public void onFrame(BroadcastEnvelope frame) {
                frames.add(frame);
                frameReceived.countDown();
            }

            @Override
            public void onDisconnected(Exception cause) {
            }
        };

        Thread serverThread = new Thread(() -> {
            try (Socket peer = server.accept();
                 Writer w = new OutputStreamWriter(peer.getOutputStream(), StandardCharsets.UTF_8)) {
                w.write(SAMPLE_FRAME);
                w.write('\n');
                w.flush();
                // Hold the connection open briefly so the client has time to
                // parse before the close races the read.
                Thread.sleep(200);
            } catch (Exception ignored) {
            }
        }, "test-server");
        serverThread.setDaemon(true);
        serverThread.start();

        client = new TelemetryClient("127.0.0.1", server.getLocalPort(), listener, Duration.ofMillis(50));
        client.start();

        assertThat(frameReceived.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(frames).hasSize(1);
        assertThat(frames.get(0).workers().get(0).tasksLocalTotal()).isEqualTo(42L);
    }

    @Test
    void fires_onConnected_before_any_frames() throws Exception {
        CountDownLatch connected = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger(0);
        AtomicInteger connectedAt = new AtomicInteger(-1);
        AtomicInteger firstFrameAt = new AtomicInteger(-1);

        FrameListener listener = new FrameListener() {
            @Override
            public void onConnected() {
                connectedAt.compareAndSet(-1, order.incrementAndGet());
                connected.countDown();
            }

            @Override
            public void onFrame(BroadcastEnvelope frame) {
                firstFrameAt.compareAndSet(-1, order.incrementAndGet());
            }

            @Override
            public void onDisconnected(Exception cause) {
            }
        };

        Thread serverThread = new Thread(() -> {
            try (Socket peer = server.accept();
                 Writer w = new OutputStreamWriter(peer.getOutputStream(), StandardCharsets.UTF_8)) {
                w.write(SAMPLE_FRAME);
                w.write('\n');
                w.flush();
                Thread.sleep(200);
            } catch (Exception ignored) {
            }
        });
        serverThread.setDaemon(true);
        serverThread.start();

        client = new TelemetryClient("127.0.0.1", server.getLocalPort(), listener, Duration.ofMillis(50));
        client.start();

        assertThat(connected.await(2, TimeUnit.SECONDS)).isTrue();
        // Allow the frame to land too.
        Thread.sleep(300);
        assertThat(connectedAt.get()).isPositive();
        assertThat(firstFrameAt.get()).isGreaterThan(connectedAt.get());
    }

    @Test
    void reconnects_after_the_peer_drops_the_connection() throws Exception {
        AtomicInteger connections = new AtomicInteger(0);
        CountDownLatch twoConnections = new CountDownLatch(2);

        FrameListener listener = new FrameListener() {
            @Override
            public void onConnected() {
                connections.incrementAndGet();
                twoConnections.countDown();
            }

            @Override
            public void onFrame(BroadcastEnvelope frame) {
            }

            @Override
            public void onDisconnected(Exception cause) {
            }
        };

        Thread serverThread = new Thread(() -> {
            for (int i = 0; i < 2; i++) {
                try (Socket peer = server.accept()) {
                    // Hand the client a fresh socket each iteration but close
                    // immediately so the client treats it as a clean drop and
                    // reconnects.
                    Thread.sleep(30);
                } catch (Exception ignored) {
                    return;
                }
            }
        });
        serverThread.setDaemon(true);
        serverThread.start();

        client = new TelemetryClient("127.0.0.1", server.getLocalPort(), listener, Duration.ofMillis(50));
        client.start();

        assertThat(twoConnections.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(connections.get()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void onDisconnected_carries_an_io_exception_when_the_initial_connect_fails() throws Exception {
        // Bind a port and immediately release it so its number is "ours" but
        // unbound by the time the client tries — Socket() will throw.
        int unbound = freePort();

        CountDownLatch disconnected = new CountDownLatch(1);
        List<Exception> causes = new ArrayList<>();

        FrameListener listener = new FrameListener() {
            @Override
            public void onConnected() {
            }

            @Override
            public void onFrame(BroadcastEnvelope frame) {
            }

            @Override
            public void onDisconnected(Exception cause) {
                causes.add(cause);
                disconnected.countDown();
            }
        };

        client = new TelemetryClient("127.0.0.1", unbound, listener, Duration.ofMillis(50));
        client.start();

        assertThat(disconnected.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(causes.get(0)).isInstanceOf(IOException.class);
    }

    @Test
    void sendControl_writes_one_json_line_to_the_server() throws Exception {
        CountDownLatch connected = new CountDownLatch(1);
        AtomicReference<String> receivedLine = new AtomicReference<>();
        CountDownLatch lineReceived = new CountDownLatch(1);

        FrameListener listener = new FrameListener() {
            @Override
            public void onConnected() {
                connected.countDown();
            }

            @Override
            public void onFrame(BroadcastEnvelope frame) {
            }

            @Override
            public void onDisconnected(Exception cause) {
            }
        };

        Thread serverThread = new Thread(() -> {
            try (Socket peer = server.accept();
                 BufferedReader reader = new BufferedReader(
                         new InputStreamReader(peer.getInputStream(), StandardCharsets.UTF_8))) {
                String line = reader.readLine();
                receivedLine.set(line);
                lineReceived.countDown();
                // Hold open briefly so the client doesn't see a clean drop.
                Thread.sleep(200);
            } catch (Exception ignored) {
            }
        }, "test-server-recv");
        serverThread.setDaemon(true);
        serverThread.start();

        client = new TelemetryClient("127.0.0.1", server.getLocalPort(), listener, Duration.ofMillis(50));
        client.start();

        assertThat(connected.await(2, TimeUnit.SECONDS)).isTrue();

        boolean ok = client.sendControl(TelemetryClient.CONTROL_SET_WORKER_INTERVAL_MS, 2500);
        assertThat(ok).isTrue();

        assertThat(lineReceived.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(receivedLine.get())
                .isEqualTo("{\"kind\":\"set_worker_interval_ms\",\"value\":2500}");
    }

    @Test
    void sendControl_returns_false_when_disconnected() {
        FrameListener listener = new FrameListener() {
            @Override
            public void onConnected() {
            }

            @Override
            public void onFrame(BroadcastEnvelope frame) {
            }

            @Override
            public void onDisconnected(Exception cause) {
            }
        };

        // Client is constructed but not started, and the server hasn't
        // accepted anything — sendControl must not throw, must return false.
        client = new TelemetryClient("127.0.0.1", server.getLocalPort(), listener);
        boolean ok = client.sendControl(TelemetryClient.CONTROL_SET_NODE_INTERVAL_MS, 1000);
        assertThat(ok).isFalse();
    }

    @Test
    void close_is_safe_when_start_was_never_called() {
        FrameListener listener = new FrameListener() {
            @Override
            public void onConnected() {
            }

            @Override
            public void onFrame(BroadcastEnvelope frame) {
            }

            @Override
            public void onDisconnected(Exception cause) {
            }
        };
        client = new TelemetryClient("127.0.0.1", 12345, listener);
        client.close(); // should not throw or hang
    }
}
