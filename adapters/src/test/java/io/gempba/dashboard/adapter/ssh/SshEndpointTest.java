package io.gempba.dashboard.adapter.ssh;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SshEndpointTest {

    @Test
    void parses_user_and_host_with_default_port() {
        SshEndpoint e = SshEndpoint.parse("user@login.cluster.edu");
        assertThat(e.user()).isEqualTo("user");
        assertThat(e.host()).isEqualTo("login.cluster.edu");
        assertThat(e.port()).isEqualTo(SshEndpoint.DEFAULT_PORT);
    }

    @Test
    void parses_explicit_port() {
        SshEndpoint e = SshEndpoint.parse("me@vm:2222");
        assertThat(e.user()).isEqualTo("me");
        assertThat(e.host()).isEqualTo("vm");
        assertThat(e.port()).isEqualTo(2222);
    }

    @Test
    void missing_user_falls_back_to_os_login_name() {
        SshEndpoint e = SshEndpoint.parse("just-a-host");
        assertThat(e.user()).isEqualTo(System.getProperty("user.name", ""));
        assertThat(e.host()).isEqualTo("just-a-host");
        assertThat(e.port()).isEqualTo(SshEndpoint.DEFAULT_PORT);
    }

    @Test
    void non_numeric_port_is_treated_as_part_of_the_host() {
        SshEndpoint e = SshEndpoint.parse("me@vm:notaport");
        assertThat(e.host()).isEqualTo("vm:notaport");
        assertThat(e.port()).isEqualTo(SshEndpoint.DEFAULT_PORT);
    }

    @Test
    void blank_is_handled() {
        SshEndpoint e = SshEndpoint.parse("  ");
        assertThat(e.host()).isEmpty();
        assertThat(e.port()).isEqualTo(SshEndpoint.DEFAULT_PORT);
    }
}
