package io.gempba.dashboard.adapter.ssh;

/**
 * A parsed SSH endpoint — {@code user}, {@code host}, {@code port} — from a
 * {@code user@host} or {@code user@host:port} string. A missing user falls back
 * to the OS login name; a missing port to {@value #DEFAULT_PORT}. Shared by the
 * connection (login/VM host) and the JUMP target (compute node) so both parse
 * the same way.
 */
public record SshEndpoint(String user, String host, int port) {

    public static final int DEFAULT_PORT = 22;

    public static SshEndpoint parse(String spec) {
        String s = spec == null ? "" : spec.trim();
        String user;
        String hostPort;
        int at = s.indexOf('@');
        if (at >= 0) {
            user = s.substring(0, at);
            hostPort = s.substring(at + 1);
        } else {
            user = System.getProperty("user.name", "");
            hostPort = s;
        }
        int colon = hostPort.lastIndexOf(':');
        String host = hostPort;
        int port = DEFAULT_PORT;
        if (colon > 0) {
            try {
                port = Integer.parseInt(hostPort.substring(colon + 1).trim());
                host = hostPort.substring(0, colon);
            } catch (NumberFormatException keepDefault) {
                // not a host:port -- treat the whole thing as the host
            }
        }
        return new SshEndpoint(user.trim(), host.trim(), port);
    }
}
