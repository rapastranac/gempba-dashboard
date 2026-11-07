import { Emitter } from '@theia/core/lib/common/event';
import { injectable } from '@theia/core/shared/inversify';
import { UpdaterClient } from '../common/updater-protocol';

/** Receives the updater's calls from Electron main and re-emits them inside the window. */
@injectable()
export class UpdaterClientImpl implements UpdaterClient {

    protected readonly onDownloadProgressEmitter = new Emitter<number>();

    readonly downloadProgress = this.onDownloadProgressEmitter.event;

    onDownloadProgress(percent: number): void {
        this.onDownloadProgressEmitter.fire(percent);
    }
}
