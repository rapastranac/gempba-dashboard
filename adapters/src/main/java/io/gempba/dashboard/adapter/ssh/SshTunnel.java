package io.gempba.dashboard.adapter.ssh;

import io.gempba.dashboard.ssh.SshCommand;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * Local SSH port-forward managed as a child {@code ssh -N -L ...} process.
 * <p>
 * Mirrors {@code scripts/connect_telemetry.ps1} from the gempba repo: the
 * dashboard shells out to whatever {@code ssh} binary is on PATH, so users
 * inherit their existing OpenSSH config (~/.ssh/config, ssh-agent, OS Login
 * for GCP VMs, etc.) without the dashboard needing to know about credentials.
 * <p>
 * Lifecycle: {@link #openWithTemplate} returns once the local end of the
 * tunnel is accepting TCP connections, or throws if {@code ssh} exited or the
 * timeout elapsed first. {@link #close} kills the child.
 * <p>
 * This class is the IO half of the SSH support; all the pure command authoring,
 * rendering, and parsing lives in {@link SshCommand}, which this class delegates
 * to. The argv produced by {@link SshCommand#buildTemplate} carries two
 * placeholders substituted at exec time by {@link SshCommand#resolveTemplate}.
 */
public final class SshTunnel implements AutoCloseable {

    /**
     * Default time to wait for the local forwarded port to start accepting
     * TCP after spawning ssh. Generous because first-time host-key prompts
     * can stall if {@code StrictHostKeyChecking=ask} is in effect.
     */
    public static final Duration DEFAULT_ACCEPT_TIMEOUT = Duration.ofSeconds(20);

    private static final int STDERR_TAIL_LINES = 40;
    private final Process process;
    private final int localPort;
    private final Thread stderrDrainer;

    private SshTunnel(Process process, int localPort, Thread stderrDrainer) {
        this.process = process;
        this.localPort = localPort;
        this.stderrDrainer = stderrDrainer;
    }

    /**
     * Open the tunnel from a pre-built template (override mode). The template
     * may contain the local-port and ssh-key placeholders, which are
     * substituted with an auto-picked port and the supplied identity file path
     * before exec.
     * <p>
     * If the template does not contain the local-port placeholder, the local
     * port is parsed out of the first {@code -L} flag instead.
     */
    public static SshTunnel openWithTemplate(List<String> template,
                                             String identityFile,
                                             Duration acceptTimeout) throws IOException {
        int localPort = SshCommand.containsLocalPortPlaceholder(template)
                ? pickEphemeralPort()
                : parseLocalPortOrThrow(template);

        List<String> resolved = SshCommand.resolveTemplate(template, localPort, identityFile);

        ProcessBuilder pb = new ProcessBuilder(resolved);
        pb.redirectErrorStream(false);
        Process process = pb.start();
        // ssh has nothing useful to read from stdin; closing it lets ssh treat
        // the channel as closed instead of waiting on a TTY for a passphrase.
        process.getOutputStream().close();

        Deque<String> stderrTail = new ArrayDeque<>(STDERR_TAIL_LINES);
        Thread drainer = startStderrDrainer(process, stderrTail);

        try {
            waitUntilLocalPortAccepts(process, localPort, acceptTimeout, stderrTail);
        } catch (IOException ready) {
            killAndJoin(process, drainer);
            throw ready;
        }

        return new SshTunnel(process, localPort, drainer);
    }

    /**
     * Parse the override command's local port (via {@link SshCommand}),
     * adapting its {@link IllegalArgumentException} to this layer's
     * {@link IOException} contract.
     */
    private static int parseLocalPortOrThrow(List<String> template) throws IOException {
        try {
            return SshCommand.parseLocalPortFromForward(template);
        } catch (IllegalArgumentException ex) {
            throw new IOException(ex.getMessage(), ex);
        }
    }

    private static int pickEphemeralPort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            s.setReuseAddress(true);
            return s.getLocalPort();
        }
    }

    private static Thread startStderrDrainer(Process process, Deque<String> stderrTail) {
        Thread t = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    synchronized (stderrTail) {
                        if (stderrTail.size() == STDERR_TAIL_LINES) {
                            stderrTail.removeFirst();
                        }
                        stderrTail.addLast(line);
                    }
                }
            } catch (IOException ignored) {
                // stream closed because ssh exited; nothing to do.
            }
        }, "gempba-ssh-stderr");
        t.setDaemon(true);
        t.start();
        return t;
    }

    private static void waitUntilLocalPortAccepts(Process process,
                                                  int localPort,
                                                  Duration timeout,
                                                  Deque<String> stderrTail) throws IOException {
        long deadlineNanos = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadlineNanos) {
            if (!process.isAlive()) {
                throw new IOException("ssh exited before tunnel was ready (code " + process.exitValue() + "): " + tailAsText(stderrTail));
            }
            try (Socket probe = new Socket()) {
                probe.connect(new java.net.InetSocketAddress("127.0.0.1", localPort), 500);
                return;
            } catch (IOException notReadyYet) {
                try {
                    Thread.sleep(200);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("interrupted while waiting for ssh tunnel", e);
                }
            }
        }
        throw new IOException("ssh tunnel did not accept within " + timeout.toMillis() + "ms: " + tailAsText(stderrTail));
    }

    // ─── internals ─────────────────────────────────────────────────────────

    private static String tailAsText(Deque<String> stderrTail) {
        synchronized (stderrTail) {
            if (stderrTail.isEmpty()) {
                return "(no stderr from ssh)";
            }
            return String.join(" | ", stderrTail);
        }
    }

    private static void killAndJoin(Process process, Thread drainer) {
        if (process.isAlive()) {
            process.destroy();
            try {
                if (!process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                process.destroyForcibly();
            }
        }
        try {
            drainer.join(1_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public int localPort() {
        return localPort;
    }

    @Override
    public void close() {
        killAndJoin(process, stderrDrainer);
    }
}
