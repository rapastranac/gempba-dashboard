package io.gempba.dashboard.adapter.ssh;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import io.gempba.dashboard.auth.AuthPrompt;
import io.gempba.dashboard.config.ConnectionMode;
import io.gempba.dashboard.config.SessionSpec;
import io.gempba.dashboard.config.TargetSpec;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

/**
 * A persistent, authenticated SSH connection to a gempba host — the expensive
 * half of the connection model, established <em>once</em> (paying the MFA cost)
 * and held until the user disconnects. Re-pointing the dashboard at a different
 * job opens a fresh {@link Forward} over this same session via
 * {@link #openForward}, which never re-authenticates.
 * <p>
 * It answers an interactive Duo / keyboard-interactive challenge, a key
 * passphrase, and host-key trust through the {@link AuthPrompt} port. Two shapes:
 * <ul>
 *   <li><b>HOST</b> — one session to the VM; each {@link Forward} is a local
 *       forward to a chosen gempba port on that VM.</li>
 *   <li><b>JUMP</b> — one session to the login node (Duo); each {@link Forward}
 *       runs the hop <em>on the login node</em> ({@code ssh -N -L ...} over a PTY
 *       exec channel), exactly as a user would after SSH-ing in by hand. The hop
 *       therefore uses the cluster's native node-to-node trust (the login node's
 *       own key / host-based trust), so there is no per-laptop key to install and
 *       no setup prompt. A laptop-side forward then reaches the bound port on the
 *       login node.</li>
 * </ul>
 * <p>
 * Threading: {@link #connect} blocks the calling (opener) thread through the
 * whole handshake (including the Duo dialog); {@link #openForward} blocks only
 * while the on-login hop comes up, with no Duo. Both run off the UI thread.
 */
public final class RemoteConnection implements AutoCloseable {

    /**
     * Ceiling on the TCP connect + SSH handshake to a host. Generous because the
     * first hop sits in front of an interactive Duo prompt; the auth phase itself
     * is not bounded by this — it waits on the user via {@link AuthPrompt}.
     */
    public static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(120);

    private static final String LOOPBACK = "127.0.0.1";

    /**
     * Keepalive so an idle session (between target switches) isn't dropped by the
     * cluster/NAT: ping every 30s, tolerate ~6 missed (~3 min) before declaring
     * the session dead.
     */
    private static final int KEEPALIVE_INTERVAL_MS = 30_000;
    private static final int KEEPALIVE_COUNT_MAX = 6;

    /**
     * How long to wait for the on-login hop to start carrying gempba data before
     * giving up (the inner ssh authenticates + binds its port in ~1–2s).
     */
    private static final Duration FORWARD_READY_TIMEOUT = Duration.ofSeconds(20);

    /**
     * Default identity file names, in OpenSSH's order. Offered from {@code ~/.ssh}
     * when present so a user who relies on a standard key (as the system ssh
     * client does) needn't point us at it — the gap that otherwise leaves the
     * publickey factor unmet and loops MFA.
     */
    private static final List<String> DEFAULT_KEY_NAMES = List.of("id_ed25519", "id_ecdsa", "id_ecdsa_sk", "id_ed25519_sk", "id_rsa", "id_dsa");

    /**
     * A safe {@code user}/{@code host} token — no shell metacharacters — since the
     * compute node string is interpolated into the on-login {@code ssh} command.
     */
    private static final Pattern SAFE_TOKEN = Pattern.compile("[A-Za-z0-9._-]+");

    private final Session session;
    private final ConnectionMode connectionMode;
    private final String authHostLabel;

    private RemoteConnection(Session session, ConnectionMode connectionMode, String authHostLabel) {
        this.session = session;
        this.connectionMode = connectionMode;
        this.authHostLabel = authHostLabel;
    }

    /**
     * Authenticate to the connection's host (blocking on Duo if prompted) and
     * hold the session open. Only for HOST/JUMP — LOCAL has nothing to connect to.
     */
    public static RemoteConnection connect(SessionSpec spec, AuthPrompt prompt, Path knownHosts) throws IOException {
        if (spec.mode() == ConnectionMode.LOCAL) {
            throw new IllegalArgumentException("LOCAL connections do not use RemoteConnection");
        }
        String keyPath = spec.sshKey().isBlank() ? null : spec.sshKey();
        Session session1 = null;
        try {
            JSch jsch = new JSch();
            prepareKnownHosts(jsch, knownHosts);
            addIdentities(jsch, keyPath);
            AuthPromptUserInfo ui = new AuthPromptUserInfo(prompt, keyPath);

            SshEndpoint ep = SshEndpoint.parse(spec.host());
            int port = ep.port() != SshEndpoint.DEFAULT_PORT ? ep.port() : spec.sshPort();

            session1 = jsch.getSession(ep.user(), ep.host(), port);
            session1.setUserInfo(ui);
            session1.setConfig("StrictHostKeyChecking", "ask");
            session1.setConfig("PreferredAuthentications", "publickey,keyboard-interactive");
            session1.connect((int) DEFAULT_CONNECT_TIMEOUT.toMillis());
            session1.setServerAliveInterval(KEEPALIVE_INTERVAL_MS);
            session1.setServerAliveCountMax(KEEPALIVE_COUNT_MAX);

            return new RemoteConnection(session1, spec.mode(), ep.host());
        } catch (JSchException e) {
            safeDisconnect(session1);
            throw new IOException("ssh to " + spec.host() + " failed: " + e.getMessage(), e);
        } catch (RuntimeException | IOException e) {
            safeDisconnect(session1);
            throw e;
        }
    }

    /**
     * Open a fresh local forward to the given target over this live session. No
     * re-authentication.
     */
    public Forward openForward(TargetSpec target) throws IOException {
        if (connectionMode == ConnectionMode.HOST) {
            try {
                int local = session.setPortForwardingL(LOOPBACK, 0, LOOPBACK, target.gempbaPort());
                return new Forward(session, local, null);
            } catch (JSchException e) {
                throw new IOException("could not forward to 127.0.0.1:" + target.gempbaPort() + " on " + authHostLabel + ": " + e.getMessage(), e);
            }
        }
        return openForwardOnLogin(target);
    }

    /**
     * JUMP: run {@code ssh -N -L ...} on the login node (the way the user would by
     * hand), then forward a laptop port to the port it binds there. The on-login
     * ssh uses the cluster's native node-to-node trust, so no per-laptop key and
     * no setup prompt are involved.
     */
    private Forward openForwardOnLogin(TargetSpec target) throws IOException {
        SshEndpoint node = SshEndpoint.parse(target.targetHost());
        requireSafe(node.host(), target.targetHost());
        int mid = ThreadLocalRandom.current().nextInt(20_000, 60_000);
        // Hop by BARE host name: on the login node the user is implicit (the same
        // cluster account you logged in as), so let ssh default it. This also means
        // a stray or typo'd user@ in the field can't turn the hop into the wrong
        // account. The inner ssh then uses the cluster's native node-to-node trust
        // (host-based — the "no special auth" hop done by hand; the PTY below lets
        // it complete non-interactively), with publickey as a fallback. BatchMode
        // so a locked key fails fast instead of hanging; accept-new because compute
        // keys rotate; ExitOnForwardFailure so a port clash surfaces.
        // -v so that, if the hop fails, the captured tail shows which auth method
        // the compute node rejected (it's only surfaced on failure).
        String command = "ssh -v -N -o BatchMode=yes -o ExitOnForwardFailure=yes "
                + "-o StrictHostKeyChecking=accept-new "
                + "-L 127.0.0.1:" + mid + ":127.0.0.1:" + target.gempbaPort() + " " + node.host();

        ChannelExec channel;
        ByteArrayOutputStream sink = new ByteArrayOutputStream();
        try {
            channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(command);
            channel.setInputStream(null);
            // A PTY gives the inner ssh a controlling terminal, so disconnecting
            // the channel SIGHUPs it — no ssh left lingering on the login node.
            channel.setPty(true);
            channel.setOutputStream(sink);
            channel.setErrStream(sink);
            channel.connect();
        } catch (JSchException e) {
            throw new IOException("could not start the hop on " + authHostLabel + ": " + e.getMessage(), e);
        }

        int local;
        try {
            local = session.setPortForwardingL(0, LOOPBACK, mid);
        } catch (JSchException e) {
            channel.disconnect();
            throw new IOException("could not bind the local forward: " + e.getMessage(), e);
        }

        try {
            awaitForwardReady(local, channel, sink, target);
        } catch (IOException ready) {
            safeDelForward(session, local);
            channel.disconnect();
            throw ready;
        }
        return new Forward(session, local, channel);
    }

    /**
     * Whether the authenticated session is still up (false after a dropped idle
     * session or {@link #close}).
     */
    public boolean isAlive() {
        return session != null && session.isConnected();
    }

    @Override
    public void close() {
        safeDisconnect(session);
    }

    // ─── on-login hop helpers ────────────────────────────────────────────────

    private void awaitForwardReady(int local, ChannelExec channel, ByteArrayOutputStream sink, TargetSpec target)
            throws IOException {
        long deadline = System.nanoTime() + FORWARD_READY_TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            if (channel.isClosed()) {
                int code = channel.getExitStatus();
                String out = tail(sink.toString(StandardCharsets.UTF_8), 4);
                throw new IOException("the login node could not reach " + target.targetHost()
                        + " (inner ssh exited" + (code >= 0 ? " code " + code : "") + ")"
                        + (out.isEmpty() ? "" : ": " + out));
            }
            if (forwardCarriesData(local)) {
                return;
            }
            sleepQuietly();
        }
        String out = tail(sink.toString(StandardCharsets.UTF_8), 4);
        throw new IOException("timed out reaching " + target.targetHost() + ":" + target.gempbaPort()
                + " — is gempba running there on that port?" + (out.isEmpty() ? "" : " (" + out + ")"));
    }

    private static boolean forwardCarriesData(int localPort) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(LOOPBACK, localPort), 1000);
            socket.setSoTimeout(1500);
            return socket.getInputStream().read() >= 0;
        } catch (IOException notReadyYet) {
            return false;
        }
    }

    private static void requireSafe(String host, String raw) throws IOException {
        if (!SAFE_TOKEN.matcher(host).matches()) {
            throw new IOException("unsafe or empty compute node name in '" + raw + "'");
        }
    }

    /**
     * The last {@code maxLines} non-blank lines of {@code text}, joined with " | "
     * — enough of the inner ssh's output to diagnose a failure without dumping the
     * whole log into the status bar.
     */
    private static String tail(String text, int maxLines) {
        String[] lines = text.strip().split("\\R");
        StringBuilder sb = new StringBuilder();
        int taken = 0;
        for (int i = lines.length - 1; i >= 0 && taken < maxLines; i--) {
            String line = lines[i].strip();
            if (line.isEmpty()) {
                continue;
            }
            sb.insert(0, taken == 0 ? line : line + " | ");
            taken++;
        }
        return sb.toString();
    }

    private static void sleepQuietly() {
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // ─── small helpers ───────────────────────────────────────────────────────

    private static void addIdentities(JSch jsch, String keyPath) throws JSchException {
        if (keyPath != null) {
            jsch.addIdentity(keyPath);
        }
        Path sshDir = Path.of(System.getProperty("user.home"), ".ssh");
        for (String name : DEFAULT_KEY_NAMES) {
            Path key = sshDir.resolve(name);
            if (Files.isRegularFile(key) && !key.toString().equals(keyPath)) {
                try {
                    jsch.addIdentity(key.toString());
                } catch (JSchException unreadableDefault) {
                    // a malformed/unsupported default key shouldn't sink the connect
                }
            }
        }
    }

    private static void prepareKnownHosts(JSch jsch, Path knownHosts) throws IOException {
        if (knownHosts == null) {
            return;
        }
        Path parent = knownHosts.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        if (!Files.exists(knownHosts)) {
            Files.createFile(knownHosts);
        }
        try {
            jsch.setKnownHosts(knownHosts.toString());
        } catch (JSchException e) {
            throw new IOException("could not load known_hosts at " + knownHosts + ": " + e.getMessage(), e);
        }
    }

    private static void safeDisconnect(Session session) {
        try {
            if (session != null && session.isConnected()) {
                session.disconnect();
            }
        } catch (RuntimeException ignored) {
            // best-effort
        }
    }

    private static void safeDelForward(Session session, int port) {
        try {
            if (session != null && session.isConnected()) {
                session.delPortForwardingL(port);
            }
        } catch (Exception ignored) {
            // best-effort
        }
    }
}
