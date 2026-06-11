package io.gempba.dashboard.config;

import java.util.function.Function;

/**
 * Connection settings the dashboard uses at startup. Resolved in this
 * precedence order:
 * <p>
 * 1. CLI args ({@code --port=...} / {@code --port ...},
 * {@code --ssh-host=...}, {@code --jump-host=...}, {@code --ssh-key=...})
 * 2. environment variables ({@code GEMPBA_TELEMETRY_PORT},
 * {@code GEMPBA_TELEMETRY_SSH_HOST}, {@code GEMPBA_TELEMETRY_JUMP_HOST},
 * {@code GEMPBA_TELEMETRY_SSH_KEY})
 * 3. compiled-in defaults ({@link #DEFAULT_PORT}; SSH fields default to empty)
 * <p>
 * Invalid values (non-numeric port, blank string) silently fall back to the
 * next tier so the dashboard always starts up; the user sees the resolved
 * settings reflected in the connection status label.
 * <p>
 * No host knob: gempba's center TCP server hardcodes {@code INADDR_LOOPBACK}
 * — it only accepts connections on {@code 127.0.0.1}. Reaching it from
 * another machine therefore requires an SSH tunnel (set {@link #sshHost()}),
 * and the dashboard always dials {@code 127.0.0.1} on either the local
 * gempba or the local end of the tunnel.
 * <p>
 * SSH semantics: when {@link #sshHost()} is non-blank, the dashboard tunnels
 * its connection through {@code ssh -N -L} to {@code sshHost} and points
 * its TCP reader at the local end of the tunnel. When {@link #jumpHost()}
 * is also set, ssh routes through the jump host first via {@code -J}
 * (ProxyJump) — the common HPC pattern of "login node → compute node".
 * When {@link #sshHost()} is blank the connection is direct to
 * {@code 127.0.0.1:port} on the dashboard's own machine.
 * <p>
 * <strong>Lifecycle:</strong> {@code Config} captures the <em>startup</em>
 * snapshot only. User edits made through the UI live in
 * {@link ConnectionSpec} instead — they share shape but {@code Config}
 * never mutates after {@link #from(String[])}.
 */
public record Config(int port, String sshHost, String jumpHost, String sshKey) {

    public static final int DEFAULT_PORT = 9000;

    public static final String ENV_PORT = "GEMPBA_TELEMETRY_PORT";
    public static final String ENV_SSH_HOST = "GEMPBA_TELEMETRY_SSH_HOST";
    public static final String ENV_JUMP_HOST = "GEMPBA_TELEMETRY_JUMP_HOST";
    public static final String ENV_SSH_KEY = "GEMPBA_TELEMETRY_SSH_KEY";

    public Config {
        if (sshHost == null) {
            sshHost = "";
        }
        if (jumpHost == null) {
            jumpHost = "";
        }
        if (sshKey == null) {
            sshKey = "";
        }
    }

    public static Config from(String[] args) {
        return from(args, System::getenv);
    }

    static Config from(String[] args, Function<String, String> env) {
        int port = parseIntOrDefault(env.apply(ENV_PORT), DEFAULT_PORT);
        String sshHost = orDefault(env.apply(ENV_SSH_HOST), "");
        String jumpHost = orDefault(env.apply(ENV_JUMP_HOST), "");
        String sshKey = orDefault(env.apply(ENV_SSH_KEY), "");

        for (int i = 0; i < args.length; i++) {
            String a = args[i];
            if (a.startsWith("--port=")) {
                port = parseIntOrDefault(a.substring("--port=".length()), port);
            } else if (a.startsWith("--ssh-host=")) {
                sshHost = a.substring("--ssh-host=".length());
            } else if (a.startsWith("--jump-host=")) {
                jumpHost = a.substring("--jump-host=".length());
            } else if (a.startsWith("--ssh-key=")) {
                sshKey = a.substring("--ssh-key=".length());
            } else if ("--port".equals(a) && i + 1 < args.length) {
                port = parseIntOrDefault(args[++i], port);
            } else if ("--ssh-host".equals(a) && i + 1 < args.length) {
                sshHost = args[++i];
            } else if ("--jump-host".equals(a) && i + 1 < args.length) {
                jumpHost = args[++i];
            } else if ("--ssh-key".equals(a) && i + 1 < args.length) {
                sshKey = args[++i];
            }
        }
        return new Config(port, sshHost, jumpHost, sshKey);
    }

    private static String orDefault(String value, String fallback) {
        return (value == null || value.isBlank()) ? fallback : value;
    }

    private static int parseIntOrDefault(String value, int fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    public boolean usesSshTunnel() {
        return !sshHost.isBlank();
    }
}
