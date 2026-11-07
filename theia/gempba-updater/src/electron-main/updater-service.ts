import { UpdateText } from '../common/update-text';
import { DownloadResult, UpdateCheck, Updater, UpdaterClient } from '../common/updater-protocol';
import { UpdateEngine } from './update-engine';

/**
 * The app's one updater, shared by every window. It checks and downloads only when a window asks: once at startup,
 * on Check for Updates…, and on the user's Update. Windows asking for the same download share it, each told its progress.
 */
export class UpdaterService {

    protected startupChecked = false;
    protected downloading?: Promise<DownloadResult>;
    protected readonly downloadClients = new Set<UpdaterClient>();

    constructor(protected readonly engine: UpdateEngine) { }

    /** The updater as one window sees it, calling back to that window's client. */
    connect(client: UpdaterClient): Updater {
        return {
            checkAtStartup: () => this.checkAtStartup(),
            check: () => this.check(),
            download: () => this.download(client),
            install: async () => this.install()
        };
    }

    async checkAtStartup(): Promise<UpdateCheck | undefined> {
        if (this.startupChecked) {
            return undefined;
        }
        this.startupChecked = true;
        return this.check();
    }

    async check(): Promise<UpdateCheck> {
        try {
            if (!this.engine.isActive()) {
                return { kind: 'inactive' };
            }
            const latest = await this.engine.check();
            if (!latest) {
                return { kind: 'inactive' };
            }
            if (!latest.available) {
                return { kind: 'up-to-date', version: this.engine.currentVersion() };
            }
            return { kind: 'available', version: latest.version, mode: await this.engine.mode(), releasePage: this.engine.releasePage(latest.version) };
        } catch (error) {
            return { kind: 'failed', reason: UpdateText.reason(error) };
        }
    }

    async download(client: UpdaterClient): Promise<DownloadResult> {
        this.downloadClients.add(client);
        try {
            this.downloading ??= this.engine.download(percent => this.report(percent)).then(
                (): DownloadResult => ({ ok: true }),
                (error): DownloadResult => ({ ok: false, reason: UpdateText.reason(error) })
            ).finally(() => this.downloading = undefined);
            return await this.downloading;
        } finally {
            this.downloadClients.delete(client);
        }
    }

    install(): void {
        // after the reply has gone back to the window
        setImmediate(() => this.engine.install());
    }

    protected report(percent: number): void {
        for (const client of this.downloadClients) {
            try {
                client.onDownloadProgress(percent);
            } catch {
                // the window closed during the download
                this.downloadClients.delete(client);
            }
        }
    }
}
