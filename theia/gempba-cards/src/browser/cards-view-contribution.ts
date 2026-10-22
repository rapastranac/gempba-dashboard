import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { injectable } from '@theia/core/shared/inversify';
import { CardsWidget } from './cards-widget';

/**
 * Puts the Cards view in the main area as a tab beside the Grid, with a View-menu entry. It is opened on a fresh
 * layout and added to a restored one that lacks it, without taking the front from the tab already shown.
 */
@injectable()
export class CardsViewContribution extends AbstractViewContribution<CardsWidget> implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: CardsWidget.ID,
            widgetName: CardsWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
            toggleCommandId: 'gempba.cards.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView({ activate: false, reveal: false });
    }

    async onDidInitializeLayout(): Promise<void> {
        if (!this.tryGetWidget()) {
            await this.openView({ activate: false, reveal: false });
        }
    }
}
