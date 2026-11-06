import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { app } from '@theia/core/electron-shared/electron';
import { AppUpdater, autoUpdater, ProgressInfo } from 'electron-updater';
import { ReleasePage } from '../common/release-page';
import { UpdateMode } from '../common/update-mode';
import { UpdateEngine } from './update-engine';

/**
 * electron-updater, against the GitHub Releases named in electron-builder.yml's `publish`. It never downloads or
 * installs on its own: only when asked.
 */
export class ElectronUpdateEngine implements UpdateEngine {

    protected updaterInstance?: AppUpdater;
    protected modeOnce?: Promise<UpdateMode>;

    /** Created on first use: electron-updater picks the updater for this platform and package when first read. */
    protected get updater(): AppUpdater {
        if (!this.updaterInstance) {
            const updater = autoUpdater;
            updater.autoDownload = false;
            updater.autoInstallOnAppQuit = false;
            // An 'error' event with no listener would throw; every failure also rejects the call that caused it.
            updater.on('error', () => undefined);
            this.updaterInstance = updater;
        }
        return this.updaterInstance;
    }

    isActive(): boolean {
        return this.updater.isUpdaterActive();
    }

    currentVersion(): string {
        return app.getVersion();
    }

    async check(): Promise<{ available: boolean, version: string } | undefined> {
        const result = await this.updater.checkForUpdates();
        return result ? { available: result.isUpdateAvailable, version: result.updateInfo.version } : undefined;
    }

    async download(onProgress: (percent: number) => void): Promise<void> {
        const listener = (info: ProgressInfo) => onProgress(info.percent);
        this.updater.on('download-progress', listener);
        try {
            await this.updater.downloadUpdate();
        } finally {
            this.updater.off('download-progress', listener);
        }
    }

    install(): void {
        this.updater.quitAndInstall(true, true);
    }

    mode(): Promise<UpdateMode> {
        this.modeOnce ??= this.macDeveloperId().then(signed => UpdateMode.of(process.platform, process.env.APPIMAGE, signed));
        return this.modeOnce;
    }

    releasePage(version: string): string | undefined {
        try {
            return ReleasePage.of(fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8'), version);
        } catch {
            return undefined;
        }
    }

    /** macOS installs an update in place only into an app signed with a Developer ID, which codesign shows. */
    protected macDeveloperId(): Promise<boolean> {
        if (process.platform !== 'darwin') {
            return Promise.resolve(false);
        }
        // the executable is Name.app/Contents/MacOS/Name
        const bundle = path.resolve(app.getPath('exe'), '..', '..', '..');
        return new Promise(resolve => execFile('codesign', ['-dv', '--verbose=2', bundle], (_error, stdout, stderr) => resolve(UpdateMode.hasDeveloperId(`${stdout}${stderr}`))));
    }
}
