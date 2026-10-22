import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { injectable } from '@theia/core/shared/inversify';
import { ConnectionWidget } from './connection-widget';

/**
 * Puts the Connection view in the left side panel, with a View-menu entry. It is opened on a fresh layout and
 * added to a restored one that lacks it (one saved before the view existed), since it is the way to connect.
 */
@injectable()
export class ConnectionViewContribution extends AbstractViewContribution<ConnectionWidget> implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: ConnectionWidget.ID,
            widgetName: ConnectionWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 100 },
            toggleCommandId: 'gempba.connection.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView({ activate: true });
    }

    async onDidInitializeLayout(): Promise<void> {
        if (!this.tryGetWidget()) {
            await this.openView({ activate: false, reveal: true });
        }
    }
}
