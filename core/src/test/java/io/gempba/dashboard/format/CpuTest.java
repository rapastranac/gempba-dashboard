package io.gempba.dashboard.format;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CpuTest {

    @Test
    void range_collapses_contiguous_runs() {
        assertThat(Cpu.range(List.of(0, 1, 2, 3, 4))).isEqualTo("CPUs 0–4");
        assertThat(Cpu.range(List.of(0, 2, 4))).isEqualTo("CPUs 0, 2, 4");
        assertThat(Cpu.range(List.of(0, 1, 2, 5, 6, 7))).isEqualTo("CPUs 0–2, 5–7");
    }

    @Test
    void range_empty_is_blank() {
        assertThat(Cpu.range(List.of())).isEmpty();
        assertThat(Cpu.range(null)).isEmpty();
    }

    @Test
    void effective_cores_buckets() {
        assertThat(Cpu.effectiveCores(0.0, 4)).isEqualTo("idle");
        assertThat(Cpu.effectiveCores(0.5, 4)).isEqualTo("0.50 cores");
        assertThat(Cpu.effectiveCores(1.2, 4)).isEqualTo("1.2 core");   // singular only in [1.0, 1.5)
        assertThat(Cpu.effectiveCores(2.1, 4)).isEqualTo("2.1 cores");
        assertThat(Cpu.effectiveCores(9.1, 4)).isEqualTo("9.1 cores (oversubscribed)");
    }

    @Test
    void core_row_shows_access_and_usage() {
        assertThat(Cpu.coreRow(3, 87.3, 8, 8))
                .isEqualTo("Worker 3:  87.3 % CPU  ·  can use all 8 cores  ·  currently using ≈ 0.87 cores");
        assertThat(Cpu.coreRow(5, 50.0, 4, 8))
                .contains("can use 4 of 8 cores");
    }
}
