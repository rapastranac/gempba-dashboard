package io.gempba.dashboard.adapter.ssh;

import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;
import io.gempba.dashboard.auth.AuthPrompt;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Adapts jsch's auth callbacks ({@link UserInfo} + {@link UIKeyboardInteractive})
 * onto the toolkit-free {@link AuthPrompt} port. This is the <em>only</em> class
 * where jsch's interactive types appear, so the rest of the SSH adapter — and all
 * of {@code core}/{@code ui} — never names them.
 * <p>
 * jsch calls these methods on the thread driving {@code Session.connect()} (the
 * tunnel-opener thread); each delegates to {@link AuthPrompt}, which blocks until
 * the user answers. A {@code null} return tells jsch the user cancelled, and it
 * aborts that authentication method.
 */
final class AuthPromptUserInfo implements UserInfo, UIKeyboardInteractive {

    /**
     * jsch's unknown-host prompt: {@code "<type> key fingerprint is <fp>."},
     * preceded by {@code "...host '<host>' ..."}.
     */
    private static final Pattern HOST = Pattern.compile("host '([^']+)'");
    private static final Pattern FINGERPRINT = Pattern.compile("(\\S+) key fingerprint is (\\S+?)\\.?\\s*$", Pattern.MULTILINE);

    private final AuthPrompt prompt;
    private final String keyPath;
    private String lastPassphrase;

    AuthPromptUserInfo(AuthPrompt prompt, String keyPath) {
        this.prompt = prompt;
        this.keyPath = keyPath;
    }

    @Override
    public String[] promptKeyboardInteractive(String destination,
                                              String name,
                                              String instruction,
                                              String[] prompts,
                                              boolean[] echo) {
        List<AuthPrompt.Field> fields = new ArrayList<>(prompts.length);
        for (int i = 0; i < prompts.length; i++) {
            boolean shown = echo != null && echo.length > i && echo[i];
            fields.add(new AuthPrompt.Field(prompts[i], shown));
        }
        List<String> answers = prompt.keyboardInteractive(
                name == null ? "" : name,
                instruction == null ? "" : instruction,
                fields);
        if (answers == null) {
            return null; // cancelled -> jsch aborts keyboard-interactive
        }
        return answers.toArray(new String[0]);
    }

    @Override
    public boolean promptPassphrase(String message) {
        lastPassphrase = prompt.passphrase(keyPath);
        return lastPassphrase != null;
    }

    @Override
    public String getPassphrase() {
        return lastPassphrase;
    }

    @Override
    public boolean promptYesNo(String message) {
        // jsch funnels host-key decisions through here. A changed/mismatched key
        // is rejected without asking the user (only first-seen keys are TOFU).
        String lower = message == null ? "" : message.toLowerCase();
        if (lower.contains("has changed") || lower.contains("warning") || lower.contains("identification")) {
            return false;
        }
        String host = group(HOST, message, 1, "(unknown host)");
        Matcher fp = FINGERPRINT.matcher(message == null ? "" : message);
        String keyType = "(unknown)";
        String fingerprint = message == null ? "" : message.trim();
        if (fp.find()) {
            keyType = fp.group(1);
            fingerprint = fp.group(2);
        }
        return prompt.confirmHostKey(host, keyType, fingerprint) == AuthPrompt.Decision.ACCEPT;
    }

    // No password authentication -- keys + keyboard-interactive only.
    @Override
    public boolean promptPassword(String message) {
        return false;
    }

    @Override
    public String getPassword() {
        return null;
    }

    @Override
    public void showMessage(String message) {
        // SSH banner / info text; nothing to surface in the dashboard.
    }

    private static String group(Pattern p, String text, int group, String fallback) {
        if (text == null) {
            return fallback;
        }
        Matcher m = p.matcher(text);
        return m.find() ? m.group(group) : fallback;
    }
}
