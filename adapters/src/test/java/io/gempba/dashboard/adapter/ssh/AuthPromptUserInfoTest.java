package io.gempba.dashboard.adapter.ssh;

import io.gempba.dashboard.auth.AuthPrompt;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AuthPromptUserInfoTest {

    @Test
    void keyboard_interactive_maps_prompts_and_returns_answers() {
        Fake fake = new Fake();
        fake.kiResponse = List.of("123456");
        AuthPromptUserInfo ui = new AuthPromptUserInfo(fake, "/home/me/.ssh/id_ed25519");

        String[] out = ui.promptKeyboardInteractive(
                "me@login", "Duo", "Choose a factor",
                new String[]{"Passcode:"}, new boolean[]{false});

        assertThat(out).containsExactly("123456");
        assertThat(fake.lastName).isEqualTo("Duo");
        assertThat(fake.lastInstruction).isEqualTo("Choose a factor");
        assertThat(fake.lastFields).singleElement().satisfies(f -> {
            assertThat(f.label()).isEqualTo("Passcode:");
            assertThat(f.echo()).isFalse();
        });
    }

    @Test
    void keyboard_interactive_cancel_returns_null() {
        Fake fake = new Fake();
        fake.kiResponse = null; // user cancelled
        AuthPromptUserInfo ui = new AuthPromptUserInfo(fake, null);

        String[] out = ui.promptKeyboardInteractive(
                "d", "", "", new String[]{"Code:"}, new boolean[]{false});

        assertThat(out).isNull();
    }

    @Test
    void passphrase_is_fetched_then_returned() {
        Fake fake = new Fake();
        fake.passphraseResponse = "s3cret";
        AuthPromptUserInfo ui = new AuthPromptUserInfo(fake, "/keys/id_rsa");

        assertThat(ui.promptPassphrase("Enter passphrase")).isTrue();
        assertThat(ui.getPassphrase()).isEqualTo("s3cret");
        assertThat(fake.lastKeyPath).isEqualTo("/keys/id_rsa");
    }

    @Test
    void cancelled_passphrase_returns_false() {
        Fake fake = new Fake();
        fake.passphraseResponse = null;
        AuthPromptUserInfo ui = new AuthPromptUserInfo(fake, "/keys/id_rsa");

        assertThat(ui.promptPassphrase("Enter passphrase")).isFalse();
        assertThat(ui.getPassphrase()).isNull();
    }

    @Test
    void unknown_host_prompt_is_parsed_and_accepted() {
        Fake fake = new Fake();
        fake.hostKeyDecision = AuthPrompt.Decision.ACCEPT;
        AuthPromptUserInfo ui = new AuthPromptUserInfo(fake, null);

        boolean ok = ui.promptYesNo(
                "The authenticity of host 'node01' can't be established.\n"
                        + "ssh-ed25519 key fingerprint is SHA256:abcdEFghiJK.\n"
                        + "Are you sure you want to continue connecting?");

        assertThat(ok).isTrue();
        assertThat(fake.hkHost).isEqualTo("node01");
        assertThat(fake.hkType).isEqualTo("ssh-ed25519");
        assertThat(fake.hkFingerprint).isEqualTo("SHA256:abcdEFghiJK");
    }

    @Test
    void unknown_host_prompt_can_be_rejected() {
        Fake fake = new Fake();
        fake.hostKeyDecision = AuthPrompt.Decision.REJECT;
        AuthPromptUserInfo ui = new AuthPromptUserInfo(fake, null);

        assertThat(ui.promptYesNo(
                "The authenticity of host 'h' can't be established.\n"
                        + "ssh-rsa key fingerprint is SHA256:zzz.\nAre you sure?")).isFalse();
    }

    @Test
    void changed_host_key_is_rejected_without_asking() {
        Fake fake = new Fake();
        fake.hostKeyDecision = AuthPrompt.Decision.ACCEPT; // would accept if asked
        AuthPromptUserInfo ui = new AuthPromptUserInfo(fake, null);

        boolean ok = ui.promptYesNo(
                "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!\n"
                        + "It is possible that someone is doing something nasty.");

        assertThat(ok).isFalse();
        assertThat(fake.hkHost).isNull(); // the port was never consulted
    }

    @Test
    void password_authentication_is_refused() {
        AuthPromptUserInfo ui = new AuthPromptUserInfo(new Fake(), null);
        assertThat(ui.promptPassword("Password:")).isFalse();
        assertThat(ui.getPassword()).isNull();
    }

    private static final class Fake implements AuthPrompt {
        String lastName;
        String lastInstruction;
        List<Field> lastFields;
        List<String> kiResponse;

        String passphraseResponse;
        String lastKeyPath;

        Decision hostKeyDecision = Decision.REJECT;
        String hkHost;
        String hkType;
        String hkFingerprint;

        @Override
        public List<String> keyboardInteractive(String name, String instruction, List<Field> fields) {
            lastName = name;
            lastInstruction = instruction;
            lastFields = fields;
            return kiResponse;
        }

        @Override
        public String passphrase(String keyPath) {
            lastKeyPath = keyPath;
            return passphraseResponse;
        }

        @Override
        public Decision confirmHostKey(String host, String keyType, String fingerprintSha256) {
            hkHost = host;
            hkType = keyType;
            hkFingerprint = fingerprintSha256;
            return hostKeyDecision;
        }
    }
}
