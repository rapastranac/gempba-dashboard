import * as path from 'path';
import { inject, injectable } from '@theia/core/shared/inversify';
import { app, BrowserWindow } from '@theia/core/electron-shared/electron';
import { ElectronMainApplicationContribution, ElectronMainApplicationGlobals } from '@theia/core/lib/electron-main/electron-main-application';

@injectable()
export class WindowIconContribution implements ElectronMainApplicationContribution {

    @inject(ElectronMainApplicationGlobals)
    protected readonly globals: ElectronMainApplicationGlobals;

    onStart(): void {
        const icon = path.resolve(this.globals.THEIA_APP_PROJECT_PATH, 'resources', 'icon.png');
        // Theia shows the main window before starting contributions, so it may already exist here.
        BrowserWindow.getAllWindows().forEach(window => window.setIcon(icon));
        app.on('browser-window-created', (_event, window) => window.setIcon(icon));
    }
}
