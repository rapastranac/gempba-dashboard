package io.gempba.dashboard.config;

/**
 * How the dashboard reaches a gempba center — the top-level choice that shapes
 * what "connect" and "observe a job" mean.
 * <ul>
 *   <li>{@link #LOCAL} — gempba runs on this machine; no SSH. Switching jobs is
 *       switching the local port.</li>
 *   <li>{@link #HOST} — a remote VM the user reaches directly over SSH (no jump);
 *       authenticate once, switch jobs by switching the gempba port on that VM.</li>
 *   <li>{@link #JUMP} — a cluster reached through a login/bastion node (often
 *       behind MFA); authenticate once at the login node, switch jobs by
 *       pointing at different compute nodes and ports.</li>
 * </ul>
 */
public enum ConnectionMode {
    LOCAL,
    HOST,
    JUMP
}
