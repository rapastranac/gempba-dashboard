import '../../src/browser/style/index.css';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { createTreeContainer } from '@theia/core/lib/browser/tree/tree-container';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { TelemetryService } from '@gempba/telemetry/lib/common';
import { CardsDetailsWidget } from './cards-details-widget';
import { CardsNodeOpener } from './cards-node-opener';
import { CardsTree } from './cards-tree';
import { CardsTreeWidget } from './cards-tree-widget';
import { CardsViewContribution } from './cards-view-contribution';
import { CardsWidget } from './cards-widget';

/**
 * Theia's tree services with our tree and tree widget (no search, no multi-select, our own selection
 * publishing), and the details pane beside them in Theia's split widget, which we build by hand because it is
 * not a DI class.
 */
function createCardsWidget(parent: interfaces.Container): CardsWidget {
    const child = createTreeContainer(parent, {
        tree: CardsTree,
        widget: CardsTreeWidget,
        props: { search: false, multiSelect: false, globalSelection: false }
    });
    child.bind(CardsDetailsWidget).toSelf();
    return new CardsWidget(child.get(CardsTreeWidget), child.get(CardsTree), child.get(CardsDetailsWidget),
        child.get(TelemetryService), child.get(SelectionService));
}

export default new ContainerModule(bind => {
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: CardsWidget.ID,
        createWidget: () => createCardsWidget(ctx.container)
    })).inSingletonScope();
    bindViewContribution(bind, CardsViewContribution);
    bind(FrontendApplicationContribution).toService(CardsViewContribution);
    bind(TabBarToolbarContribution).toService(CardsViewContribution);
    bind(CardsNodeOpener).toSelf().inSingletonScope();
    bind(OpenHandler).toService(CardsNodeOpener);
});
