package io.gempba.dashboard.adapter.ssh;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.Session;

/**
 * A single per-target local port forward over a live {@link RemoteConnection} —
 * the cheap, disposable half of the connection model. Switching which job the
 * dashboard observes is just closing one {@code Forward} and opening another on
 * the same authenticated session, with no re-authentication.
 * <p>
 * Teardown is surgical: {@link #close()} removes only this forward's own listener
 * from the authenticated session and, for a JUMP forward, ends the inner
 * {@code ssh} process running on the login node (the PTY exec channel SIGHUPs it
 * on disconnect). It <strong>never</strong> disconnects the persistent
 * authenticated session — that survives every target switch.
 */
public final class Forward implements PortForwardTunnel {

    /**
     * The authenticated session that owns the local listener (the VM session for
     * HOST, the login-node session for JUMP). Never disconnected here.
     */
    private final Session authSession;
    private final int localPort;
    /**
     * JUMP only: the {@code ssh -N -L ...} running on the login node that bridges
     * to the compute node. Disconnecting the channel SIGHUPs it. {@code null} for
     * HOST (the listener forwards straight to the VM's loopback).
     */
    private final ChannelExec innerProcess;

    Forward(Session authSession, int localPort, ChannelExec innerProcess) {
        this.authSession = authSession;
        this.localPort = localPort;
        this.innerProcess = innerProcess;
    }

    @Override
    public int localPort() {
        return localPort;
    }

    @Override
    public void close() {
        try {
            if (authSession != null && authSession.isConnected()) {
                authSession.delPortForwardingL(localPort);
            }
        } catch (Exception ignored) {
            // best-effort: listener may already be gone
        }
        if (innerProcess != null) {
            try {
                innerProcess.disconnect();
            } catch (Exception ignored) {
                // best-effort
            }
        }
    }
}
