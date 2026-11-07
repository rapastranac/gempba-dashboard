import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConnectionMode, DashboardSettings } from '@gempba/core';

/**
 * The remembered UI state as JSON in `~/.gempba-dashboard/settings.json`, the same file the Java dashboard used.
 * Best effort and never throws: a missing or corrupt file loads as the defaults (a corrupt one is set aside as
 * `.corrupt`), a failed save is ignored, and writes go through a temporary file so a crash cannot leave half a file.
 */
export class SettingsStore {

    static defaultFile(): string {
        return path.join(os.homedir(), '.gempba-dashboard', 'settings.json');
    }

    constructor(readonly file: string) { }

    load(): DashboardSettings {
        if (!fs.existsSync(this.file)) {
            return DashboardSettings.defaults();
        }
        try {
            const json: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            if (typeof json !== 'object' || json === null || Array.isArray(json)) {
                throw new Error('not a settings object');
            }
            const input = json as DashboardSettings.Input;
            const lastMode = Object.values(ConnectionMode).includes(input.lastMode as ConnectionMode) ? input.lastMode : undefined;
            return DashboardSettings.of({ ...input, lastMode });
        } catch {
            this.quarantine();
            return DashboardSettings.defaults();
        }
    }

    save(settings: DashboardSettings): void {
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            const temporary = `${this.file}.tmp`;
            fs.writeFileSync(temporary, JSON.stringify(settings, undefined, 2) + '\n');
            fs.renameSync(temporary, this.file);
        } catch {
            // Persistence is best effort; a failed save must never break the app.
        }
    }

    protected quarantine(): void {
        try {
            fs.renameSync(this.file, `${this.file}.corrupt`);
        } catch {
            // Nothing more to do.
        }
    }
}
