/**
 * Interactive-authentication port. {@link io.gempba.dashboard.auth.AuthPrompt}
 * is how the embedded SSH client (in {@code adapters}) solicits a Duo
 * keyboard-interactive response, a key passphrase, a host-key trust decision,
 * or consent to seed {@code authorized_keys} — without naming a UI toolkit or
 * an SSH library, so it stays in the dependency-free {@code core}.
 */
package io.gempba.dashboard.auth;
