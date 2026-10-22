import { injectable } from '@theia/core/shared/inversify';
import { app, BrowserWindow } from '@theia/core/electron-shared/electron';
import { TheiaRendererAPI } from '@theia/core/lib/electron-main/electron-api-main';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';

/**
 * Lets a minimized window count as hidden, as a background browser tab does, so views can stop drawing while
 * nobody can see them. Theia turns Chromium's background throttling off so that a window started minimized still
 * finishes loading; we turn it back on once the frontend is ready, and off again whenever it reloads.
 */
@injectable()
export class BackgroundThrottlingContribution implements ElectronMainApplicationContribution {

    onStart(): void {
        // Theia shows the main window before starting contributions, so it may already exist here.
        BrowserWindow.getAllWindows().forEach(window => this.track(window));
        app.on('browser-window-created', (_event, window) => this.track(window));
    }

    protected track(window: BrowserWindow): void {
        const contents = window.webContents;
        const listener = TheiaRendererAPI.onApplicationStateChanged(contents, state => {
            if (!contents.isDestroyed()) {
                contents.setBackgroundThrottling(state === 'ready');
            }
        });
        window.once('closed', () => listener.dispose());
    }
}
