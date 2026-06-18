package io.gempba.dashboard.settings;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.gempba.dashboard.config.DashboardSettings;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Reads and writes the remembered UI state ({@link DashboardSettings}) as JSON
 * under {@code ~/.gempba-dashboard/}, so the connection bar comes back
 * pre-filled. The location is in the user's HOME — deliberately outside the
 * build tree — so it survives {@code mvn clean} during development.
 * <p>
 * Persistence is best-effort and must never break the app: a missing or corrupt
 * file loads as {@link DashboardSettings#defaults()} (the bad file is set aside
 * as {@code .corrupt} for forensics), and a failed save is swallowed. Writes go
 * to a temp file and are atomically moved into place so a crash mid-write can't
 * leave a half-written settings file.
 * <p>
 * Uses its own {@link ObjectMapper} (default camelCase, pretty-printed) — not the
 * snake-case wire {@code JsonMapper} — and relies on Jackson's native record
 * support, so the pure {@code core} records need no annotations.
 */
public final class SettingsStore {

    private final Path file;
    private final ObjectMapper mapper;

    public SettingsStore(Path file) {
        this.file = file;
        this.mapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .enable(SerializationFeature.INDENT_OUTPUT);
    }

    /**
     * The store at {@code ~/.gempba-dashboard/settings.json}.
     */
    public static SettingsStore atDefaultLocation() {
        return new SettingsStore(Path.of(System.getProperty("user.home"), ".gempba-dashboard", "settings.json"));
    }

    /**
     * Load the saved settings, or {@link DashboardSettings#defaults()} if the
     * file is absent or unreadable. Never throws.
     */
    public DashboardSettings load() {
        if (!Files.isReadable(file)) {
            return DashboardSettings.defaults();
        }
        try {
            return mapper.readValue(Files.readAllBytes(file), DashboardSettings.class);
        } catch (IOException | RuntimeException corrupt) {
            quarantine();
            return DashboardSettings.defaults();
        }
    }

    /**
     * Persist the settings atomically. Best-effort: any IO failure is swallowed.
     */
    public void save(DashboardSettings settings) {
        try {
            Path parent = file.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            mapper.writeValue(tmp.toFile(), settings);
            try {
                Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException atomicUnsupported) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ignored) {
            // persistence is best-effort; a failed save must never break the app
        }
    }

    private void quarantine() {
        try {
            Files.move(file, file.resolveSibling(file.getFileName() + ".corrupt"), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ignored) {
            // nothing more we can do
        }
    }
}
