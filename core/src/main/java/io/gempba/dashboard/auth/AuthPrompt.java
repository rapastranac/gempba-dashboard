package io.gempba.dashboard.auth;

import java.util.List;

/**
 * A port for soliciting interactive SSH credentials from the user — the seam
 * that makes in-app MFA possible.
 * <p>
 * The dashboard's embedded SSH client calls this when a server issues an
 * interactive challenge: a keyboard-interactive round (Duo), a passphrase for
 * an encrypted private key, a first-connect host-key decision, or consent to
 * set up passwordless node-hopping on a cluster. The implementation hops to the
 * UI thread, shows a modal dialog, and <strong>blocks the calling thread</strong>
 * until the user answers.
 * <p>
 * Threading: every method is called from a background (tunnel-opener) thread and
 * blocks it until the user responds. Implementations MUST be safe to call from
 * any non-UI thread and MUST NOT be called from the UI thread — a UI-thread call
 * would deadlock, since the method blocks waiting for that same thread to run
 * the dialog. Returning {@code null} (or {@link Decision#REJECT}) means the user
 * cancelled, and the SSH client aborts the connection attempt.
 * <p>
 * This port carries no SSH-library types, so it lives in {@code core} alongside
 * {@link io.gempba.dashboard.concurrent.UiExecutor} and keeps the toolkit- and
 * dependency-free boundary intact: the adapter maps the library's callbacks onto
 * these methods, and the UI supplies the dialogs.
 */
public interface AuthPrompt {

    /**
     * One line of a keyboard-interactive challenge (RFC&nbsp;4256): the prompt
     * label to show, and whether the typed response should be echoed
     * ({@code false} for secrets like a passcode).
     */
    record Field(String label, boolean echo) {
    }

    /**
     * The user's answer to a yes/no confirmation.
     */
    enum Decision {
        ACCEPT,
        REJECT
    }

    /**
     * Present a keyboard-interactive challenge (the Duo step) and collect one
     * response per field, in order.
     *
     * @param name        the challenge name supplied by the server (often blank)
     * @param instruction free-text instruction supplied by the server (often blank)
     * @param fields      the prompt lines; an empty list is a zero-field
     *                    informational round that needs no dialog — return
     *                    {@link List#of()} immediately
     * @return one response per field in order, or {@code null} if the user
     * cancelled (the SSH client then aborts authentication)
     */
    List<String> keyboardInteractive(String name, String instruction, List<Field> fields);

    /**
     * Ask for the passphrase protecting an encrypted private key.
     *
     * @param keyPath the identity file being unlocked, for display
     * @return the passphrase, or {@code null} if the user cancelled
     */
    String passphrase(String keyPath);

    /**
     * Confirm a host key the first time it is seen (trust-on-first-use). The
     * implementation shows the host, key type, and SHA-256 fingerprint and lets
     * the user accept or reject.
     * <p>
     * Only unseen hosts reach this method; a host whose key has <em>changed</em>
     * from a previously trusted one is rejected by the adapter without prompting.
     *
     * @return {@link Decision#ACCEPT} to trust and persist the key,
     * {@link Decision#REJECT} to abort the connection
     */
    Decision confirmHostKey(String host, String keyType, String fingerprintSha256);
}
