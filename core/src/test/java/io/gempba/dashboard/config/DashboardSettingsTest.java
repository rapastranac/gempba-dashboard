package io.gempba.dashboard.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DashboardSettingsTest {

    @Test
    void defaults_are_local_with_default_port_and_intervals() {
        DashboardSettings d = DashboardSettings.defaults();
        assertThat(d.lastMode()).isEqualTo(ConnectionMode.LOCAL);
        assertThat(d.local().gempbaPort()).isEqualTo(Config.DEFAULT_PORT);
        assertThat(d.workerIntervalMs()).isEqualTo(RefreshInterval.DEFAULT_WORKER_MS);
        assertThat(d.nodeIntervalMs()).isEqualTo(RefreshInterval.DEFAULT_NODE_MS);
    }

    @Test
    void null_blocks_and_lists_are_normalized() {
        DashboardSettings d = new DashboardSettings(null, null, null, null, 0, 0);
        assertThat(d.local().recentPorts()).isEmpty();
        assertThat(d.host().recentPorts()).isEmpty();
        assertThat(d.jump().recentTargets()).isEmpty();
        assertThat(d.jump().recentLoginHosts()).isEmpty();
        assertThat(d.workerIntervalMs()).isEqualTo(RefreshInterval.DEFAULT_WORKER_MS);
        assertThat(d.nodeIntervalMs()).isEqualTo(RefreshInterval.DEFAULT_NODE_MS);
    }

    @Test
    void recent_lists_are_defensively_copied_and_immutable() {
        DashboardSettings.JumpSettings j = new DashboardSettings.JumpSettings(
                "me@login", 22, "", "me@fc1", 9000, java.util.List.of("me@fc1", "me@fc2"),
                java.util.List.of("me@login1", "me@login2"));
        assertThat(j.recentTargets()).containsExactly("me@fc1", "me@fc2");
        assertThat(j.recentLoginHosts()).containsExactly("me@login1", "me@login2");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> j.recentTargets().add("x"))
                .isInstanceOf(UnsupportedOperationException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> j.recentLoginHosts().add("x"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void per_mode_blocks_default_to_default_port() {
        assertThat(DashboardSettings.HostSettings.defaults().gempbaPort()).isEqualTo(Config.DEFAULT_PORT);
        assertThat(DashboardSettings.JumpSettings.defaults().gempbaPort()).isEqualTo(Config.DEFAULT_PORT);
        assertThat(DashboardSettings.HostSettings.defaults().sshPort()).isEqualTo(SessionSpec.DEFAULT_SSH_PORT);
    }
}
