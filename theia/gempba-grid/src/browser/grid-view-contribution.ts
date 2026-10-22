import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { injectable } from '@theia/core/shared/inversify';
import { GridWidget } from './grid-widget';

/**
 * Puts the Grid view in the main area, with a View-menu entry. It is opened on a fresh layout and added to a
 * restored one that lacks it (one saved before the view existed).
 */
@injectable()
export class GridViewContribution extends AbstractViewContribution<GridWidget> implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: GridWidget.ID,
            widgetName: GridWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
            toggleCommandId: 'gempba.grid.toggle'
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
