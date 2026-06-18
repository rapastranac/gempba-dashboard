package io.gempba.dashboard.config;

/**
 * The <em>job pointer</em> — which gempba center to observe over an already-open
 * {@link SessionSpec} connection. Cheap to change: re-pointing opens a new local
 * forward on the live session and never re-authenticates.
 *
 * @param targetHost the compute node to reach (JUMP mode only, {@code user@host});
 *                   blank for LOCAL and HOST, where the destination is fixed by
 *                   the connection and only the port varies
 * @param gempbaPort the loopback port gempba is listening on at the destination
 */
public record TargetSpec(String targetHost, int gempbaPort) {

    public TargetSpec {
        if (targetHost == null) {
            targetHost = "";
        }
    }

    /**
     * Whether a distinct target host is named (JUMP mode). When false the target
     * is just a port on the connection's own destination.
     */
    public boolean hasTargetHost() {
        return targetHost != null && !targetHost.isBlank();
    }
}
