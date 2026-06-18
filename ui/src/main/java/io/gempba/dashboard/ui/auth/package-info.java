/**
 * In-app authentication dialogs. {@link io.gempba.dashboard.ui.auth.SwtAuthPrompt}
 * is the SWT implementation of the {@code core} {@code AuthPrompt} port: it turns
 * a Duo keyboard-interactive challenge, a key passphrase, a host-key trust
 * decision, or node-hopping consent into a modal dialog, blocking the SSH
 * opener thread until the user answers.
 */
package io.gempba.dashboard.ui.auth;
