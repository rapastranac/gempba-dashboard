package io.gempba.dashboard.ssh;

import java.util.ArrayList;
import java.util.List;

/**
 * Pure authoring, rendering, and parsing of the {@code ssh -N -L ...} command
 * the dashboard uses to tunnel to a remote gempba center. No process spawning,
 * no sockets — just argv lists and strings — so it carries no IO dependency and
 * can be reasoned about and unit-tested in isolation.
 * <p>
 * This separation is what lets a command <em>preview</em> be rendered from the
 * pure core while process management stays in the IO layer.
 * <p>
 * Templates carry two placeholders, {@value #PLACEHOLDER_LOCAL_PORT} and
 * {@value #PLACEHOLDER_SSH_KEY}, substituted at exec time by
 * {@link #resolveTemplate}. The dashboard displays the template directly so the
 * command line stays stable and readable (a long PEM path doesn't blow up the
 * rendering) and can be edited in override mode without losing the ability to
 * swap keys or pick a fresh local port.
 */
public final class SshCommand {

    public static final String PLACEHOLDER_LOCAL_PORT = "<local-port>";
    public static final String PLACEHOLDER_SSH_KEY = "<ssh-key>";

    private SshCommand() {
    }

    /**
     * Build the argv template the dashboard exec's and renders. The local
     * port slot uses {@value #PLACEHOLDER_LOCAL_PORT}; if {@code identityFile}
     * is non-blank, an {@code -i} arg is included with {@value #PLACEHOLDER_SSH_KEY}
     * as its value (so the displayed command stays short regardless of how
     * long the actual path is).
     */
    public static List<String> buildTemplate(String sshHost,
                                             String remoteHost,
                                             int remotePort,
                                             String identityFile,
                                             String jumpHost) {
        List<String> cmd = new ArrayList<>();
        cmd.add("ssh");
        cmd.add("-N");
        // Without ExitOnForwardFailure ssh stays connected even if the local
        // bind fails, which would let the readiness probe time out instead
        // of surfacing the real error.
        cmd.add("-o");
        cmd.add("ExitOnForwardFailure=yes");
        cmd.add("-o");
        cmd.add("ServerAliveInterval=30");
        cmd.add("-o");
        cmd.add("ServerAliveCountMax=3");
        // SLURM compute nodes get fresh host keys per allocation, so the
        // dashboard would fail every first-connect with the default 'ask'
        // policy (we close stdin, so there's no one to confirm). 'accept-new'
        // is TOFU: it auto-trusts unseen keys but still rejects mismatches,
        // which is the right tradeoff for a tunnel the user explicitly asked
        // us to open. Stable hosts (login node, GCP VM) are unaffected once
        // their key is in known_hosts.
        cmd.add("-o");
        cmd.add("StrictHostKeyChecking=accept-new");
        if (identityFile != null && !identityFile.isBlank()) {
            cmd.add("-i");
            cmd.add(PLACEHOLDER_SSH_KEY);
            // -i alone doesn't stop ssh-agent / default keys from being tried
            // first; IdentitiesOnly makes the chosen key the only one offered,
            // which matches what users expect when they pick a specific PEM.
            cmd.add("-o");
            cmd.add("IdentitiesOnly=yes");
        }
        if (jumpHost != null && !jumpHost.isBlank()) {
            cmd.add("-J");
            cmd.add(jumpHost.trim());
        }
        cmd.add("-L");
        cmd.add(PLACEHOLDER_LOCAL_PORT + ":" + remoteHost + ":" + remotePort);
        cmd.add(sshHost);
        return cmd;
    }

    /**
     * Substitute {@value #PLACEHOLDER_LOCAL_PORT} and {@value #PLACEHOLDER_SSH_KEY}
     * in every template arg. {@code identityFile} may be null/blank — in that
     * case any {@value #PLACEHOLDER_SSH_KEY} occurrences resolve to empty
     * strings, which ssh will reject loudly. The placeholders are
     * intentionally simple substring replacements so users can mix them
     * with surrounding text in custom commands (e.g. {@code -L 0.0.0.0:<local-port>:host:9000}).
     */
    public static List<String> resolveTemplate(List<String> template, int localPort, String identityFile) {
        String localStr = String.valueOf(localPort);
        String keyStr = (identityFile == null) ? "" : identityFile.trim();
        List<String> out = new ArrayList<>(template.size());
        for (String t : template) {
            out.add(t.replace(PLACEHOLDER_LOCAL_PORT, localStr)
                    .replace(PLACEHOLDER_SSH_KEY, keyStr));
        }
        return out;
    }

    /**
     * Render an argv as a single shell-style line for display or as the
     * default value of an editable command field. Args containing whitespace
     * are double-quoted; we don't try to be a full shell — the goal is
     * readability, not perfect round-tripping through arbitrary shells.
     */
    public static String renderTemplate(List<String> template) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < template.size(); i++) {
            if (i > 0) {
                sb.append(' ');
            }
            String t = template.get(i);
            if (t.isEmpty() || hasWhitespace(t)) {
                sb.append('"').append(t).append('"');
            } else {
                sb.append(t);
            }
        }
        return sb.toString();
    }

    /**
     * Split a shell-style command string into argv. Honors single and double
     * quotes (each preserves its content verbatim — no escape sequences,
     * which keeps Windows paths with backslashes working out of the box).
     * Mismatched quotes throw {@link IllegalArgumentException}.
     */
    public static List<String> tokenizeCommand(String cmd) {
        List<String> tokens = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        char quote = 0;
        boolean inToken = false;
        for (int i = 0; i < cmd.length(); i++) {
            char c = cmd.charAt(i);
            if (quote != 0) {
                if (c == quote) {
                    quote = 0;
                } else {
                    cur.append(c);
                }
            } else if (c == '"' || c == '\'') {
                quote = c;
                inToken = true;
            } else if (Character.isWhitespace(c)) {
                if (inToken) {
                    tokens.add(cur.toString());
                    cur.setLength(0);
                    inToken = false;
                }
            } else {
                cur.append(c);
                inToken = true;
            }
        }
        if (quote != 0) {
            throw new IllegalArgumentException("unclosed " + quote + " in command: " + cmd);
        }
        if (inToken) {
            tokens.add(cur.toString());
        }
        return tokens;
    }

    /**
     * Whether the template still carries the {@value #PLACEHOLDER_LOCAL_PORT} slot.
     */
    public static boolean containsLocalPortPlaceholder(List<String> template) {
        for (String t : template) {
            if (t.contains(PLACEHOLDER_LOCAL_PORT)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Walk the template for the first {@code -L} flag and parse the local
     * port out of its argument. Used in override mode when the user has
     * replaced {@value #PLACEHOLDER_LOCAL_PORT} with a literal port number.
     * Recognises both {@code localPort:host:remotePort} and
     * {@code bindAddr:localPort:host:remotePort}.
     *
     * @throws IllegalArgumentException when no {@code -L} forward is present or
     *                                  its local port can't be parsed
     */
    public static int parseLocalPortFromForward(List<String> template) {
        for (int i = 0; i + 1 < template.size(); i++) {
            if (!"-L".equals(template.get(i))) {
                continue;
            }
            String[] parts = template.get(i + 1).split(":");
            try {
                if (parts.length == 3) {
                    return parseValidPort(parts[0]);
                }
                if (parts.length == 4) {
                    return parseValidPort(parts[1]);
                }
            } catch (NumberFormatException ignored) {
                // fall through to error
            }
            throw new IllegalArgumentException("could not parse local port from -L argument: " + template.get(i + 1));
        }
        throw new IllegalArgumentException("custom command has no -L flag and no "
                + PLACEHOLDER_LOCAL_PORT + " placeholder; cannot determine local port to dial");
    }

    private static int parseValidPort(String s) {
        int p = Integer.parseInt(s);
        if (p < 1 || p > 65_535) {
            throw new NumberFormatException("port out of range: " + p);
        }
        return p;
    }

    private static boolean hasWhitespace(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (Character.isWhitespace(s.charAt(i))) {
                return true;
            }
        }
        return false;
    }
}
