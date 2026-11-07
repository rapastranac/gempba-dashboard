import { expect } from 'chai';
import { UpdateMode } from '../common/update-mode';
import { UpdaterClient } from '../common/updater-protocol';
import { UpdateEngine } from './update-engine';
import { UpdaterService } from './updater-service';

class FakeEngine implements UpdateEngine {
    active = true;
    latest: { available: boolean, version: string } | undefined = { available: false, version: '2.0.0' };
    checkError?: Error;
    checks = 0;
    downloads = 0;
    installs = 0;
    progress: ((percent: number) => void) | undefined;
    finishDownload: (error?: Error) => void = () => undefined;

    isActive(): boolean {
        return this.active;
    }

    currentVersion(): string {
        return '2.0.0';
    }

    async check(): Promise<{ available: boolean, version: string } | undefined> {
        this.checks++;
        if (this.checkError) {
            throw this.checkError;
        }
        return this.latest;
    }

    download(onProgress: (percent: number) => void): Promise<void> {
        this.downloads++;
        this.progress = onProgress;
        return new Promise((resolve, reject) => this.finishDownload = error => error ? reject(error) : resolve());
    }

    install(): void {
        this.installs++;
    }

    async mode(): Promise<UpdateMode> {
        return 'install';
    }

    releasePage(version: string): string | undefined {
        return `https://github.com/rapastranac/gempba-dashboard/releases/tag/v${version}`;
    }
}

class RecordingClient implements UpdaterClient {
    readonly percents: number[] = [];

    onDownloadProgress(percent: number): void {
        this.percents.push(percent);
    }
}

const tick = () => new Promise(resolve => setImmediate(resolve));

describe('UpdaterService', () => {

    it('says this version is up to date when no release is newer', async () => {
        const service = new UpdaterService(new FakeEngine());
        expect(await service.check()).to.deep.equal({ kind: 'up-to-date', version: '2.0.0' });
    });

    it('says a newer version is out, how it installs, and where its release page is', async () => {
        const engine = new FakeEngine();
        engine.latest = { available: true, version: '2.1.0' };
        expect(await new UpdaterService(engine).check()).to.deep.equal({
            kind: 'available', version: '2.1.0', mode: 'install', releasePage: 'https://github.com/rapastranac/gempba-dashboard/releases/tag/v2.1.0'
        });
    });

    it('checks at startup once, for the first window only', async () => {
        const engine = new FakeEngine();
        const service = new UpdaterService(engine);
        expect(await service.checkAtStartup()).to.deep.equal({ kind: 'up-to-date', version: '2.0.0' });
        expect(await service.checkAtStartup()).to.equal(undefined);
        expect(engine.checks).to.equal(1);
        await service.check();
        expect(engine.checks).to.equal(2);
    });

    it('returns a failed check in a few words rather than throwing', async () => {
        const engine = new FakeEngine();
        engine.checkError = new Error('net::ERR_INTERNET_DISCONNECTED');
        expect(await new UpdaterService(engine).check()).to.deep.equal({ kind: 'failed', reason: 'no network connection' });
    });

    it('does not check in a build that cannot update', async () => {
        const engine = new FakeEngine();
        engine.active = false;
        expect(await new UpdaterService(engine).check()).to.deep.equal({ kind: 'inactive' });
        expect(engine.checks).to.equal(0);
        engine.active = true;
        engine.latest = undefined;
        expect(await new UpdaterService(engine).check()).to.deep.equal({ kind: 'inactive' });
    });

    it('shares one download between windows and tells each its progress', async () => {
        const engine = new FakeEngine();
        const service = new UpdaterService(engine);
        const first = new RecordingClient();
        const second = new RecordingClient();
        const firstDone = service.connect(first).download();
        const secondDone = service.connect(second).download();
        await tick();
        engine.progress?.(40);
        engine.progress?.(100);
        engine.finishDownload();
        expect(await firstDone).to.deep.equal({ ok: true });
        expect(await secondDone).to.deep.equal({ ok: true });
        expect(engine.downloads).to.equal(1);
        expect(first.percents).to.deep.equal([40, 100]);
        expect(second.percents).to.deep.equal([40, 100]);
    });

    it('keeps reporting progress when a window closed during the download', async () => {
        const engine = new FakeEngine();
        const service = new UpdaterService(engine);
        const closed: UpdaterClient = { onDownloadProgress: () => { throw new Error('connection closed'); } };
        const open = new RecordingClient();
        const closedDone = service.download(closed);
        const openDone = service.download(open);
        await tick();
        engine.progress?.(10);
        engine.progress?.(20);
        engine.finishDownload();
        await Promise.all([closedDone, openDone]);
        expect(open.percents).to.deep.equal([10, 20]);
    });

    it('returns a failed download in a few words, and downloads again when asked', async () => {
        const engine = new FakeEngine();
        const service = new UpdaterService(engine);
        const failed = service.download(new RecordingClient());
        await tick();
        engine.finishDownload(new Error('net::ERR_CONNECTION_RESET'));
        expect(await failed).to.deep.equal({ ok: false, reason: "the update server can't be reached" });
        const retried = service.download(new RecordingClient());
        await tick();
        engine.finishDownload();
        expect(await retried).to.deep.equal({ ok: true });
        expect(engine.downloads).to.equal(2);
    });

    it('installs after replying to the window', async () => {
        const engine = new FakeEngine();
        await new UpdaterService(engine).connect(new RecordingClient()).install();
        expect(engine.installs).to.equal(0);
        await tick();
        expect(engine.installs).to.equal(1);
    });
});
