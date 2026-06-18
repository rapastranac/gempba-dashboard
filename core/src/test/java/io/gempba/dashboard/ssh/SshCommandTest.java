package io.gempba.dashboard.ssh;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SshCommandTest {

    // ─── buildTemplate ─────────────────────────────────────────────────────

    @Test
    void template_minimal_uses_placeholders_for_local_port_only() {
        List<String> tpl = SshCommand.buildTemplate("user@vm", "127.0.0.1", 9000, null, null);
        assertThat(tpl).containsExactly(
                "ssh",
                "-N",
                "-o", "ExitOnForwardFailure=yes",
                "-o", "ServerAliveInterval=30",
                "-o", "ServerAliveCountMax=3",
                "-o", "StrictHostKeyChecking=accept-new",
                "-L", "<local-port>:127.0.0.1:9000",
                "user@vm");
    }

    @Test
    void template_includes_ssh_key_placeholder_when_identity_set() {
        // Even a long path is rendered as <ssh-key> in the template, keeping
        // the displayed command short and stable for the override field.
        List<String> tpl = SshCommand.buildTemplate("user@vm", "127.0.0.1", 9000,
                "C:/Users/user/.ssh/very/long/path/to/aws-key.pem", null);
        assertThat(tpl).containsSubsequence(
                "-i", "<ssh-key>",
                "-o", "IdentitiesOnly=yes",
                "-L", "<local-port>:127.0.0.1:9000");
        assertThat(tpl).doesNotContain("C:/Users/user/.ssh/very/long/path/to/aws-key.pem");
    }

    @Test
    void template_omits_identity_when_blank() {
        List<String> tpl = SshCommand.buildTemplate("user@vm", "127.0.0.1", 9000, "   ", null);
        assertThat(tpl).doesNotContain("-i");
        assertThat(tpl).doesNotContain("IdentitiesOnly=yes");
        assertThat(tpl).doesNotContain("<ssh-key>");
    }

    @Test
    void template_includes_jump_host_when_set() {
        List<String> tpl = SshCommand.buildTemplate("user@compute-12", "127.0.0.1", 9000,
                null, "user@login.cluster.edu");
        assertThat(tpl).containsSubsequence(
                "-J", "user@login.cluster.edu",
                "-L", "<local-port>:127.0.0.1:9000",
                "user@compute-12");
    }

    @Test
    void template_jump_host_is_trimmed() {
        List<String> tpl = SshCommand.buildTemplate("user@compute", "127.0.0.1", 9000,
                null, "  user@login  ");
        assertThat(tpl).contains("user@login");
        assertThat(tpl).doesNotContain("  user@login  ");
    }

    @Test
    void template_blank_jump_host_is_ignored() {
        List<String> tpl = SshCommand.buildTemplate("user@vm", "127.0.0.1", 9000, null, "   ");
        assertThat(tpl).doesNotContain("-J");
    }

    @Test
    void template_preserves_remote_host_for_non_loopback_targets() {
        List<String> tpl = SshCommand.buildTemplate("user@bastion", "internal-svc", 9000, null, null);
        assertThat(tpl).contains("<local-port>:internal-svc:9000");
    }

    @Test
    void template_always_sets_strict_host_key_checking_to_accept_new() {
        List<String> tpl = SshCommand.buildTemplate("user@vm", "127.0.0.1", 9000, null, null);
        assertThat(tpl).containsSubsequence("-o", "StrictHostKeyChecking=accept-new");
    }

    // ─── resolveTemplate ───────────────────────────────────────────────────

    @Test
    void resolve_substitutes_local_port_and_ssh_key() {
        List<String> tpl = SshCommand.buildTemplate("user@vm", "127.0.0.1", 9000,
                "/home/me/.ssh/key.pem", null);
        List<String> resolved = SshCommand.resolveTemplate(tpl, 54321, "/home/me/.ssh/key.pem");
        assertThat(resolved).contains("/home/me/.ssh/key.pem");
        assertThat(resolved).contains("54321:127.0.0.1:9000");
        assertThat(resolved).doesNotContain("<ssh-key>");
        assertThat(resolved).doesNotContain("<local-port>:127.0.0.1:9000");
    }

    @Test
    void resolve_with_blank_key_substitutes_empty_string() {
        // Edge case: template was built with a key, then user cleared the
        // field. The placeholder still gets removed; ssh will fail clearly.
        List<String> tpl = List.of("ssh", "-i", "<ssh-key>", "user@vm");
        List<String> resolved = SshCommand.resolveTemplate(tpl, 1234, "");
        assertThat(resolved).containsExactly("ssh", "-i", "", "user@vm");
    }

    @Test
    void resolve_handles_placeholder_inside_compound_arg() {
        // Custom -L args mix the placeholder with surrounding text.
        List<String> tpl = List.of("ssh", "-L", "0.0.0.0:<local-port>:host:9000", "user@vm");
        List<String> resolved = SshCommand.resolveTemplate(tpl, 7777, null);
        assertThat(resolved).contains("0.0.0.0:7777:host:9000");
    }

    // ─── renderTemplate ────────────────────────────────────────────────────

    @Test
    void render_joins_args_with_spaces() {
        List<String> tpl = SshCommand.buildTemplate("user@vm", "127.0.0.1", 9000, null, null);
        String rendered = SshCommand.renderTemplate(tpl);
        assertThat(rendered).startsWith("ssh -N -o ExitOnForwardFailure=yes");
        assertThat(rendered).endsWith("-L <local-port>:127.0.0.1:9000 user@vm");
    }

    @Test
    void render_quotes_args_containing_spaces() {
        List<String> tpl = List.of("ssh", "-o", "RemoteCommand=echo hi", "user@vm");
        String rendered = SshCommand.renderTemplate(tpl);
        assertThat(rendered).isEqualTo("ssh -o \"RemoteCommand=echo hi\" user@vm");
    }

    // ─── tokenizeCommand ───────────────────────────────────────────────────

    @Test
    void tokenize_splits_on_whitespace() {
        List<String> argv = SshCommand.tokenizeCommand("ssh -N -L 9000:127.0.0.1:9000 user@vm");
        assertThat(argv).containsExactly("ssh", "-N", "-L", "9000:127.0.0.1:9000", "user@vm");
    }

    @Test
    void tokenize_collapses_multiple_spaces_and_tabs() {
        List<String> argv = SshCommand.tokenizeCommand("ssh   -N\t-L 9000:127.0.0.1:9000\tuser@vm");
        assertThat(argv).containsExactly("ssh", "-N", "-L", "9000:127.0.0.1:9000", "user@vm");
    }

    @Test
    void tokenize_honors_double_quotes() {
        List<String> argv = SshCommand.tokenizeCommand("ssh -o \"RemoteCommand=echo hi\" user@vm");
        assertThat(argv).containsExactly("ssh", "-o", "RemoteCommand=echo hi", "user@vm");
    }

    @Test
    void tokenize_honors_single_quotes() {
        List<String> argv = SshCommand.tokenizeCommand("ssh -o 'RemoteCommand=echo hi' user@vm");
        assertThat(argv).containsExactly("ssh", "-o", "RemoteCommand=echo hi", "user@vm");
    }

    @Test
    void tokenize_keeps_backslashes_literal_for_windows_paths() {
        // Important: no backslash-escape semantics, so C:\Users\me works
        // as a typical pasted Windows path.
        List<String> argv = SshCommand.tokenizeCommand("ssh -i C:\\Users\\me\\key.pem user@vm");
        assertThat(argv).containsExactly("ssh", "-i", "C:\\Users\\me\\key.pem", "user@vm");
    }

    @Test
    void tokenize_supports_empty_quoted_string() {
        List<String> argv = SshCommand.tokenizeCommand("a \"\" b");
        assertThat(argv).containsExactly("a", "", "b");
    }

    @Test
    void tokenize_throws_on_unclosed_quote() {
        assertThatThrownBy(() -> SshCommand.tokenizeCommand("ssh -o \"RemoteCommand=echo hi user@vm"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unclosed");
    }

    @Test
    void tokenize_then_render_round_trips_simple_commands() {
        List<String> tpl = SshCommand.buildTemplate("user@vm", "127.0.0.1", 9000,
                "/home/me/key.pem", "user@login");
        String rendered = SshCommand.renderTemplate(tpl);
        List<String> roundTripped = SshCommand.tokenizeCommand(rendered);
        assertThat(roundTripped).isEqualTo(tpl);
    }
}
