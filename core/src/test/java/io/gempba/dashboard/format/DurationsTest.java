package io.gempba.dashboard.format;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DurationsTest {

    @Test
    void microseconds_below_one_millisecond() {
        assertThat(Durations.format(0)).isEqualTo("0 µs");
        assertThat(Durations.format(1)).isEqualTo("1 µs");
        assertThat(Durations.format(999)).isEqualTo("999 µs");
    }

    @Test
    void milliseconds_below_one_second() {
        assertThat(Durations.format(1_000)).isEqualTo("1.0 ms");
        assertThat(Durations.format(238_293)).isEqualTo("238.3 ms");
        assertThat(Durations.format(999_999)).isEqualTo("1000.0 ms");
    }

    @Test
    void seconds_below_one_minute_keep_one_decimal() {
        assertThat(Durations.format(1_000_000L)).isEqualTo("1.0 s");
        assertThat(Durations.format(4_500_000L)).isEqualTo("4.5 s");
        assertThat(Durations.format(59_900_000L)).isEqualTo("59.9 s");
    }

    @Test
    void minutes_use_minutes_and_seconds() {
        assertThat(Durations.format(60L * 1_000_000L)).isEqualTo("1 m 0 s");
        assertThat(Durations.format(75L * 1_000_000L)).isEqualTo("1 m 15 s");
        assertThat(Durations.format(330L * 1_000_000L)).isEqualTo("5 m 30 s");
    }

    @Test
    void hours_use_hours_minutes_and_seconds() {
        assertThat(Durations.format(3_600L * 1_000_000L)).isEqualTo("1 h 0 m 0 s");
        // 1h 23m 45s
        assertThat(Durations.format((3_600L + 23 * 60L + 45L) * 1_000_000L))
                .isEqualTo("1 h 23 m 45 s");
        // 23h 59m 59s — last instant before "days"
        assertThat(Durations.format((23L * 3_600L + 59 * 60L + 59L) * 1_000_000L))
                .isEqualTo("23 h 59 m 59 s");
    }

    @Test
    void days_drop_seconds_and_show_d_h_m() {
        // 1d 0h 0m
        assertThat(Durations.format(86_400L * 1_000_000L)).isEqualTo("1 d 0 h 0 m");
        // 2d 4h 30m — seconds intentionally dropped at this scale
        long us = (2L * 86_400L + 4 * 3_600L + 30 * 60L + 17L) * 1_000_000L;
        assertThat(Durations.format(us)).isEqualTo("2 d 4 h 30 m");
    }

    @Test
    void negative_input_renders_dash() {
        assertThat(Durations.format(-1)).isEqualTo("—");
    }

    @Test
    void formatSeconds_renders_integer_seconds_below_one_minute() {
        // Integer-seconds input doesn't deserve a fractional tail — the
        // C++ side already rounded to whole seconds before publishing.
        assertThat(Durations.formatSeconds(0)).isEqualTo("0 s");
        assertThat(Durations.formatSeconds(1)).isEqualTo("1 s");
        assertThat(Durations.formatSeconds(45)).isEqualTo("45 s");
        assertThat(Durations.formatSeconds(59)).isEqualTo("59 s");
    }

    @Test
    void formatSeconds_minute_and_up_uses_the_microsecond_path() {
        assertThat(Durations.formatSeconds(60)).isEqualTo("1 m 0 s");
        assertThat(Durations.formatSeconds(330)).isEqualTo("5 m 30 s");
        assertThat(Durations.formatSeconds(3_600 + 23 * 60 + 45))
                .isEqualTo("1 h 23 m 45 s");
    }

    @Test
    void formatSeconds_negative_returns_dash() {
        assertThat(Durations.formatSeconds(-1)).isEqualTo("—");
    }
}
