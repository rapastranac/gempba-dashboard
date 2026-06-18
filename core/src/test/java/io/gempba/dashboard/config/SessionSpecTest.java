package io.gempba.dashboard.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SessionSpecTest {

    @Test
    void null_strings_and_nonpositive_port_are_normalized() {
        SessionSpec s = new SessionSpec(null, null, 0, null, null);
        assertThat(s.mode()).isEqualTo(ConnectionMode.LOCAL);
        assertThat(s.host()).isEmpty();
        assertThat(s.sshPort()).isEqualTo(SessionSpec.DEFAULT_SSH_PORT);
        assertThat(s.sshKey()).isEmpty();
        assertThat(s.authMethod()).isEqualTo(SessionSpec.AuthMethod.SSH_KEY);
    }

    @Test
    void local_factory_requires_no_ssh() {
        SessionSpec s = SessionSpec.local();
        assertThat(s.mode()).isEqualTo(ConnectionMode.LOCAL);
        assertThat(s.requiresSsh()).isFalse();
    }

    @Test
    void host_and_jump_require_ssh() {
        assertThat(new SessionSpec(ConnectionMode.HOST, "me@vm", 22, "", null).requiresSsh()).isTrue();
        assertThat(new SessionSpec(ConnectionMode.JUMP, "me@login", 22, "", null).requiresSsh()).isTrue();
    }

    @Test
    void identical_fields_are_equal_so_a_redundant_connect_is_detectable() {
        SessionSpec a = new SessionSpec(ConnectionMode.JUMP, "me@login", 22, "/k", SessionSpec.AuthMethod.SSH_KEY);
        SessionSpec b = new SessionSpec(ConnectionMode.JUMP, "me@login", 22, "/k", SessionSpec.AuthMethod.SSH_KEY);
        assertThat(a).isEqualTo(b);
    }
}
