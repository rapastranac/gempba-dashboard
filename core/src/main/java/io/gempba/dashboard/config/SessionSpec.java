package io.gempba.dashboard.config;

/**
 * The <em>connection identity</em> — everything needed to authenticate once,
 * and nothing about which job is observed. This is the half of the old
 * {@link ConnectionSpec} that the user sets before clicking Connect; the
 * job pointer lives separately in {@link TargetSpec}, so re-pointing at a
 * different node/port never re-authenticates.
 *
 * @param mode       LOCAL (no SSH), HOST (direct VM), or JUMP (via a login node)
 * @param host       the SSH endpoint to authenticate to — the VM for HOST, the
 *                   login node for JUMP, blank for LOCAL ({@code user@host})
 * @param sshPort    the SSH port of {@code host} (defaults to 22)
 * @param sshKey     optional identity file; blank relies on the default keys
 * @param authMethod how to authenticate; only {@link AuthMethod#SSH_KEY} is wired
 *                   today — {@link AuthMethod#PASSWORD} is the scalability seam
 */
public record SessionSpec(
        ConnectionMode mode,
        String host,
        int sshPort,
        String sshKey,
        AuthMethod authMethod) {

    public static final int DEFAULT_SSH_PORT = 22;

    /**
     * Authentication method. Today the embedded client always offers
     * publickey + keyboard-interactive ({@link #SSH_KEY}); {@link #PASSWORD}
     * is reserved so adding password auth later is a new enum value and a UI
     * field, not a signature change.
     */
    public enum AuthMethod {
        SSH_KEY,
        PASSWORD
    }

    public SessionSpec {
        if (mode == null) {
            mode = ConnectionMode.LOCAL;
        }
        if (host == null) {
            host = "";
        }
        if (sshPort <= 0) {
            sshPort = DEFAULT_SSH_PORT;
        }
        if (sshKey == null) {
            sshKey = "";
        }
        if (authMethod == null) {
            authMethod = AuthMethod.SSH_KEY;
        }
    }

    /**
     * The LOCAL connection — no SSH, authenticates nothing.
     */
    public static SessionSpec local() {
        return new SessionSpec(ConnectionMode.LOCAL, "", DEFAULT_SSH_PORT, "", AuthMethod.SSH_KEY);
    }

    /**
     * Whether reaching this connection involves SSH (and therefore an
     * authentication step). False only for {@link ConnectionMode#LOCAL}.
     */
    public boolean requiresSsh() {
        return mode != ConnectionMode.LOCAL;
    }
}
