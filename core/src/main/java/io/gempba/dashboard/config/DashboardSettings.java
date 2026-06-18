package io.gempba.dashboard.config;

import java.util.List;

/**
 * The persisted UI state — what the dashboard remembers between launches so the
 * connection bar comes back pre-filled. Stored as JSON under
 * {@code ~/.gempba-dashboard/} by the adapters layer; this record is the pure,
 * toolkit-free shape (no Jackson annotations — the store's mapper handles them).
 * <p>
 * Each mode keeps its own block so switching the mode dropdown restores exactly
 * the fields the user last used for that mode, plus a short list of recently
 * observed targets for quick switching.
 *
 * @param lastMode         the mode selected when the app last closed
 * @param local            LOCAL-mode fields
 * @param host             HOST-mode fields
 * @param jump             JUMP-mode fields
 * @param workerIntervalMs last worker refresh interval pushed to gempba
 * @param nodeIntervalMs   last node refresh interval pushed to gempba
 */
public record DashboardSettings(
        ConnectionMode lastMode,
        LocalSettings local,
        HostSettings host,
        JumpSettings jump,
        int workerIntervalMs,
        int nodeIntervalMs) {

    public DashboardSettings {
        if (lastMode == null) {
            lastMode = ConnectionMode.LOCAL;
        }
        if (local == null) {
            local = LocalSettings.defaults();
        }
        if (host == null) {
            host = HostSettings.defaults();
        }
        if (jump == null) {
            jump = JumpSettings.defaults();
        }
        if (workerIntervalMs <= 0) {
            workerIntervalMs = RefreshInterval.DEFAULT_WORKER_MS;
        }
        if (nodeIntervalMs <= 0) {
            nodeIntervalMs = RefreshInterval.DEFAULT_NODE_MS;
        }
    }

    /**
     * The out-of-the-box settings used on first launch or when the saved file
     * is missing or unreadable.
     */
    public static DashboardSettings defaults() {
        return new DashboardSettings(
                ConnectionMode.LOCAL,
                LocalSettings.defaults(),
                HostSettings.defaults(),
                JumpSettings.defaults(),
                RefreshInterval.DEFAULT_WORKER_MS,
                RefreshInterval.DEFAULT_NODE_MS);
    }

    public record LocalSettings(int gempbaPort, List<Integer> recentPorts) {
        public LocalSettings {
            if (gempbaPort <= 0) {
                gempbaPort = Config.DEFAULT_PORT;
            }
            recentPorts = (recentPorts == null) ? List.of() : List.copyOf(recentPorts);
        }

        public static LocalSettings defaults() {
            return new LocalSettings(Config.DEFAULT_PORT, List.of());
        }
    }

    public record HostSettings(String host, int sshPort, String sshKey, int gempbaPort, List<Integer> recentPorts) {
        public HostSettings {
            if (host == null) {
                host = "";
            }
            if (sshPort <= 0) {
                sshPort = SessionSpec.DEFAULT_SSH_PORT;
            }
            if (sshKey == null) {
                sshKey = "";
            }
            if (gempbaPort <= 0) {
                gempbaPort = Config.DEFAULT_PORT;
            }
            recentPorts = (recentPorts == null) ? List.of() : List.copyOf(recentPorts);
        }

        public static HostSettings defaults() {
            return new HostSettings("", SessionSpec.DEFAULT_SSH_PORT, "", Config.DEFAULT_PORT, List.of());
        }
    }

    public record JumpSettings(String loginHost, int sshPort, String sshKey, String targetHost, int gempbaPort,
                               List<String> recentTargets, List<String> recentLoginHosts) {
        public JumpSettings {
            if (loginHost == null) {
                loginHost = "";
            }
            if (sshPort <= 0) {
                sshPort = SessionSpec.DEFAULT_SSH_PORT;
            }
            if (sshKey == null) {
                sshKey = "";
            }
            if (targetHost == null) {
                targetHost = "";
            }
            if (gempbaPort <= 0) {
                gempbaPort = Config.DEFAULT_PORT;
            }
            recentTargets = (recentTargets == null) ? List.of() : List.copyOf(recentTargets);
            recentLoginHosts = (recentLoginHosts == null) ? List.of() : List.copyOf(recentLoginHosts);
        }

        public static JumpSettings defaults() {
            return new JumpSettings("", SessionSpec.DEFAULT_SSH_PORT, "", "", Config.DEFAULT_PORT, List.of(),
                    List.of());
        }
    }
}
