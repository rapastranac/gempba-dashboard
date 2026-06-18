package io.gempba.dashboard.adapter.ssh;

/**
 * A live local SSH port forward: something listening on {@code 127.0.0.1:}{@link
 * #localPort()} that carries bytes to a remote gempba center, torn down by
 * {@link #close()}.
 * <p>
 * Two implementations share this contract so the connection controller can hold
 * either without caring which: {@link SshTunnel} (a system {@code ssh} child
 * process, used for the dormant custom-command path) and {@link Forward} (a
 * forward over an embedded SSH session that can answer an interactive MFA
 * challenge, used for the Host and Jump paths). The controller only ever calls
 * {@link #localPort()} and {@link #close()}.
 */
public interface PortForwardTunnel extends AutoCloseable {

    /**
     * The local loopback port the viewer/telemetry client dials.
     */
    int localPort();

    /**
     * Tear the forward down. Narrows {@link AutoCloseable#close()} to throw
     * nothing, since teardown is best-effort.
     */
    @Override
    void close();
}
