package io.gempba.dashboard.settings;

import io.gempba.dashboard.config.ConnectionMode;
import io.gempba.dashboard.config.DashboardSettings;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SettingsStoreTest {

    @Test
    void round_trips_settings(@TempDir Path dir) {
        SettingsStore store = new SettingsStore(dir.resolve("settings.json"));
        DashboardSettings original = new DashboardSettings(
                ConnectionMode.JUMP,
                new DashboardSettings.LocalSettings(9001, List.of(9001, 9002)),
                new DashboardSettings.HostSettings("me@vm", 22, "/keys/id", 9100, List.of(9100)),
                new DashboardSettings.JumpSettings("me@login", 22, "", "me@node01", 9000,
                        List.of("me@node01", "me@node02"), List.of("me@login", "me@login2")),
                250,
                750);

        store.save(original);
        DashboardSettings loaded = store.load();

        assertThat(loaded).isEqualTo(original);
    }

    @Test
    void missing_file_loads_defaults(@TempDir Path dir) {
        SettingsStore store = new SettingsStore(dir.resolve("does-not-exist.json"));
        assertThat(store.load()).isEqualTo(DashboardSettings.defaults());
    }

    @Test
    void corrupt_file_loads_defaults_and_is_quarantined(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("settings.json");
        Files.writeString(file, "{ this is not valid json ");
        SettingsStore store = new SettingsStore(file);

        assertThat(store.load()).isEqualTo(DashboardSettings.defaults());
        assertThat(Files.exists(file)).isFalse();
        assertThat(Files.exists(dir.resolve("settings.json.corrupt"))).isTrue();
    }

    @Test
    void save_creates_missing_parent_directories(@TempDir Path dir) {
        Path nested = dir.resolve("a").resolve("b").resolve("settings.json");
        SettingsStore store = new SettingsStore(nested);
        store.save(DashboardSettings.defaults());
        assertThat(Files.exists(nested)).isTrue();
    }

    @Test
    void loads_old_settings_without_recent_login_hosts(@TempDir Path dir) throws IOException {
        // A settings.json written before recentLoginHosts existed: the JUMP block
        // has no such key. It must still load, with the field defaulted to empty.
        Path file = dir.resolve("settings.json");
        Files.writeString(file, """
                {
                  "lastMode": "JUMP",
                  "local": {"gempbaPort": 9001, "recentPorts": [9001]},
                  "host": {"host": "me@vm", "sshPort": 22, "sshKey": "", "gempbaPort": 9100, "recentPorts": []},
                  "jump": {"loginHost": "me@login", "sshPort": 22, "sshKey": "", "targetHost": "me@node01",
                           "gempbaPort": 9000, "recentTargets": ["me@node01", "me@node02"]},
                  "workerIntervalMs": 250,
                  "nodeIntervalMs": 750
                }
                """);

        DashboardSettings loaded = new SettingsStore(file).load();

        assertThat(loaded.jump().recentLoginHosts()).isEmpty();
        assertThat(loaded.jump().loginHost()).isEqualTo("me@login");
        assertThat(loaded.jump().recentTargets()).containsExactly("me@node01", "me@node02");
    }
}
