package io.gempba.dashboard.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TargetSpecTest {

    @Test
    void null_target_host_is_normalized_to_blank() {
        TargetSpec t = new TargetSpec(null, 9000);
        assertThat(t.targetHost()).isEmpty();
        assertThat(t.hasTargetHost()).isFalse();
        assertThat(t.gempbaPort()).isEqualTo(9000);
    }

    @Test
    void blank_target_host_has_no_target() {
        assertThat(new TargetSpec("   ", 9000).hasTargetHost()).isFalse();
    }

    @Test
    void named_target_host_is_recognized() {
        TargetSpec t = new TargetSpec("me@node01", 9100);
        assertThat(t.hasTargetHost()).isTrue();
        assertThat(t.targetHost()).isEqualTo("me@node01");
    }
}
