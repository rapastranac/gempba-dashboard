package io.gempba.dashboard.format;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BytesTest {

    @Test
    void below_a_kibibyte_is_plain_bytes() {
        assertThat(Bytes.human(0)).isEqualTo("0 B");
        assertThat(Bytes.human(512)).isEqualTo("512 B");
        assertThat(Bytes.human(1023)).isEqualTo("1023 B");
    }

    @Test
    void scales_through_binary_suffixes_with_one_decimal() {
        assertThat(Bytes.human(1024)).isEqualTo("1.0 KB");
        assertThat(Bytes.human(1536)).isEqualTo("1.5 KB");
        assertThat(Bytes.human(1024L * 1024)).isEqualTo("1.0 MB");
        assertThat(Bytes.human(3L * 1024 * 1024 * 1024)).isEqualTo("3.0 GB");
        assertThat(Bytes.human(1024L * 1024 * 1024 * 1024)).isEqualTo("1.0 TB");
    }

    @Test
    void saturates_at_terabytes() {
        assertThat(Bytes.human(5L * 1024 * 1024 * 1024 * 1024)).isEqualTo("5.0 TB");
        assertThat(Bytes.human(2048L * 1024 * 1024 * 1024 * 1024)).endsWith(" TB");
    }
}
