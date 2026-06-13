package io.gempba.dashboard.format;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RatesTest {

    @Test
    void no_elapsed_time_shows_total_only() {
        assertThat(Rates.countWithRate(12_450, 0)).isEqualTo("12,450 total");
        assertThat(Rates.countWithRate(7, -1)).isEqualTo("7 total");
    }

    @Test
    void with_elapsed_time_appends_average_rate() {
        assertThat(Rates.countWithRate(1000, 100)).isEqualTo("1,000 total · (10 / sec)");
    }

    @Test
    void per_second_uses_adaptive_precision() {
        assertThat(Rates.perSecond(Double.NaN)).isEqualTo("— / sec");
        assertThat(Rates.perSecond(0)).isEqualTo("0 / sec");
        assertThat(Rates.perSecond(0.42)).isEqualTo("0.42 / sec");
        assertThat(Rates.perSecond(3.5)).isEqualTo("3.5 / sec");
        assertThat(Rates.perSecond(42)).isEqualTo("42 / sec");
        assertThat(Rates.perSecond(1234)).isEqualTo("1,234 / sec");
    }
}
