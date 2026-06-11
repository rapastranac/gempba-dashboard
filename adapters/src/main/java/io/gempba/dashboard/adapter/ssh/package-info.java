/**
 * SSH tunnel IO: spawns and supervises a child {@code ssh} process for a local
 * port-forward to a remote gempba center. The driven adapter half of the SSH
 * support — it owns the process and the readiness probe, and delegates all
 * non-IO work (command building, parsing) to the core {@code SshCommand}.
 */
package io.gempba.dashboard.adapter.ssh;
