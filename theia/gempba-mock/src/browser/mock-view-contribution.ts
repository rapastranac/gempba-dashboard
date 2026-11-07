import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { injectable } from '@theia/core/shared/inversify';
import { MockWidget } from './mock-widget';

/** Puts the Mock panel in the left side panel beside Connection, on a fresh layout without taking the focus. */
@injectable()
export class MockViewContribution extends AbstractViewContribution<MockWidget> implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: MockWidget.ID,
            widgetName: MockWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 200 },
            toggleCommandId: 'gempba.mock.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView({ activate: false });
    }
}
