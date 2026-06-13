package io.gempba.dashboard.policy;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * The pure clamp at the heart of the per-allocation metric. The end-to-end
 * scenarios (which ranks count, how the allocation union is formed) are
 * exercised against the mapper in {@code WorldSnapshotMapperTest}; here we pin
 * just the arithmetic.
 */
class NodeUtilizationTest {

    @Test
    void four_cores_pegged_over_four_core_allocation_is_100() {
        assertThat(NodeUtilization.pct(400.0, 4)).isCloseTo(100.0, within(1e-9));
    }

    @Test
    void ten_cores_busy_over_twenty_core_allocation_is_50() {
        assertThat(NodeUtilization.pct(1000.0, 20)).isCloseTo(50.0, within(1e-9));
    }

    @Test
    void idle_allocation_is_zero() {
        assertThat(NodeUtilization.pct(0.0, 4)).isEqualTo(0.0);
    }

    @Test
    void oversubscription_clamps_to_100() {
        assertThat(NodeUtilization.pct(500.0, 4)).isEqualTo(100.0);
    }

    @Test
    void no_allocation_is_zero_not_infinity() {
        assertThat(NodeUtilization.pct(400.0, 0)).isEqualTo(0.0);
        assertThat(NodeUtilization.pct(400.0, -1)).isEqualTo(0.0);
    }

    @Test
    void negative_cpu_floored_to_zero() {
        assertThat(NodeUtilization.pct(-5.0, 4)).isEqualTo(0.0);
    }
}
