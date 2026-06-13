package io.gempba.dashboard.config;

/**
 * The user's intent to connect, as captured by the settings UI at the moment
 * they click "Apply". Shares its core shape with {@link Config} (the startup
 * form) but adds two UI-only fields: {@link #overrideMode} and
 * {@link #customCommand}, which let an advanced user bypass the dashboard's
 * generated ssh command.
 * <p>
 * This record is the boundary between the UI layer and the connection
 * lifecycle. The settings strip produces it; the app's connection controller
 * consumes it. It does not validate (the strip pre-validates port range
 * before constructing one), and it does not carry refresh-rate state —
 * those live separately because they're pushed over the live connection
 * rather than driving (re)connection.
 *
 * @param port          gempba's listening TCP port (1–65535)
 * @param sshHost       SSH destination ({@code user@host}); blank means direct loopback
 * @param jumpHost      optional ProxyJump destination; blank for single-hop
 * @param sshKey        optional path passed to {@code ssh -i}; blank to use system ssh config
 * @param overrideMode  when true, {@link #customCommand} is used verbatim; the other fields are ignored
 * @param customCommand user-edited ssh command line (only consulted when {@code overrideMode == true})
 */
public record ConnectionSpec(
        int port,
        String sshHost,
        String jumpHost,
        String sshKey,
        boolean overrideMode,
        String customCommand) {

    public ConnectionSpec {
        if (sshHost == null) {
            sshHost = "";
        }
        if (jumpHost == null) {
            jumpHost = "";
        }
        if (sshKey == null) {
            sshKey = "";
        }
        if (customCommand == null) {
            customCommand = "";
        }
    }

    /**
     * True iff this spec asks for an SSH tunnel (either via the structured
     * fields or via a custom command). False means a direct TCP connection
     * to gempba running on this machine.
     */
    public boolean usesSshTunnel() {
        return overrideMode || !sshHost.isBlank();
    }
}
