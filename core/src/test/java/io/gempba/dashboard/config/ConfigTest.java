package io.gempba.dashboard.config;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ConfigTest {

    private static final java.util.function.Function<String, String> EMPTY_ENV = key -> null;

    @Test
    void defaults_when_no_args_and_no_env() {
        Config c = Config.from(new String[]{}, EMPTY_ENV);
        assertThat(c.port()).isEqualTo(Config.DEFAULT_PORT);
        assertThat(c.sshHost()).isEmpty();
        assertThat(c.jumpHost()).isEmpty();
        assertThat(c.sshKey()).isEmpty();
        assertThat(c.usesSshTunnel()).isFalse();
    }

    @Test
    void env_var_overrides_default_port() {
        Map<String, String> env = Map.of(Config.ENV_PORT, "9100");
        Config c = Config.from(new String[]{}, env::get);
        assertThat(c.port()).isEqualTo(9100);
    }

    @Test
    void cli_equals_form_overrides_env() {
        Map<String, String> env = Map.of(Config.ENV_PORT, "9100");
        Config c = Config.from(new String[]{"--port=9200"}, env::get);
        assertThat(c.port()).isEqualTo(9200);
    }

    @Test
    void cli_space_form_overrides_env() {
        Config c = Config.from(new String[]{"--port", "9300"}, EMPTY_ENV);
        assertThat(c.port()).isEqualTo(9300);
    }

    @Test
    void invalid_env_port_falls_back_to_default() {
        Config c = Config.from(new String[]{}, key -> Config.ENV_PORT.equals(key) ? "not-a-number" : null);
        assertThat(c.port()).isEqualTo(Config.DEFAULT_PORT);
    }

    @Test
    void invalid_cli_port_keeps_env_value() {
        Map<String, String> env = new HashMap<>();
        env.put(Config.ENV_PORT, "9100");
        Config c = Config.from(new String[]{"--port=garbage"}, env::get);
        assertThat(c.port()).isEqualTo(9100);
    }

    @Test
    void unknown_args_are_ignored() {
        Config c = Config.from(new String[]{"--something-else", "value", "--port=9100"}, EMPTY_ENV);
        assertThat(c.port()).isEqualTo(9100);
    }

    @Test
    void blank_env_value_falls_back_to_default() {
        Config c = Config.from(new String[]{}, key -> Config.ENV_PORT.equals(key) ? "   " : null);
        assertThat(c.port()).isEqualTo(Config.DEFAULT_PORT);
    }

    @Test
    void ssh_host_from_cli_equals_form() {
        Config c = Config.from(new String[]{"--ssh-host=user@vm-ip"}, EMPTY_ENV);
        assertThat(c.sshHost()).isEqualTo("user@vm-ip");
        assertThat(c.usesSshTunnel()).isTrue();
    }

    @Test
    void ssh_host_from_cli_space_form() {
        Config c = Config.from(new String[]{"--ssh-host", "user@vm-ip"}, EMPTY_ENV);
        assertThat(c.sshHost()).isEqualTo("user@vm-ip");
    }

    @Test
    void ssh_host_from_env() {
        Config c = Config.from(new String[]{},
                key -> Config.ENV_SSH_HOST.equals(key) ? "user@vm-ip" : null);
        assertThat(c.sshHost()).isEqualTo("user@vm-ip");
        assertThat(c.usesSshTunnel()).isTrue();
    }

    @Test
    void ssh_key_from_cli_overrides_env() {
        Map<String, String> env = Map.of(Config.ENV_SSH_KEY, "/env/key.pem");
        Config c = Config.from(new String[]{"--ssh-key=/cli/key.pem"}, env::get);
        assertThat(c.sshKey()).isEqualTo("/cli/key.pem");
    }

    @Test
    void ssh_fields_default_to_empty_string_not_null() {
        Config c = new Config(1, null, null, null);
        assertThat(c.sshHost()).isEmpty();
        assertThat(c.jumpHost()).isEmpty();
        assertThat(c.sshKey()).isEmpty();
        assertThat(c.usesSshTunnel()).isFalse();
    }

    @Test
    void usesSshTunnel_treats_blank_string_as_disabled() {
        Config c = new Config(1, "   ", "", "");
        assertThat(c.usesSshTunnel()).isFalse();
    }

    @Test
    void jump_host_from_cli_equals_form() {
        Config c = Config.from(new String[]{"--jump-host=user@login.cluster.edu"}, EMPTY_ENV);
        assertThat(c.jumpHost()).isEqualTo("user@login.cluster.edu");
    }

    @Test
    void jump_host_from_cli_space_form() {
        Config c = Config.from(new String[]{"--jump-host", "user@login.cluster.edu"}, EMPTY_ENV);
        assertThat(c.jumpHost()).isEqualTo("user@login.cluster.edu");
    }

    @Test
    void jump_host_from_env() {
        Config c = Config.from(new String[]{},
                key -> Config.ENV_JUMP_HOST.equals(key) ? "user@login.cluster.edu" : null);
        assertThat(c.jumpHost()).isEqualTo("user@login.cluster.edu");
    }

    @Test
    void jump_host_cli_overrides_env() {
        Map<String, String> env = Map.of(Config.ENV_JUMP_HOST, "env-login");
        Config c = Config.from(new String[]{"--jump-host=cli-login"}, env::get);
        assertThat(c.jumpHost()).isEqualTo("cli-login");
    }
}
