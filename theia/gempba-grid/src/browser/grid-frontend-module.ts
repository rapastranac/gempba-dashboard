import '../../src/browser/style/index.css';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { ContainerModule } from '@theia/core/shared/inversify';
import { GridViewContribution } from './grid-view-contribution';
import { GridWidget } from './grid-widget';

export default new ContainerModule(bind => {
    bind(GridWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GridWidget.ID,
        createWidget: () => ctx.container.get(GridWidget)
    })).inSingletonScope();
    bindViewContribution(bind, GridViewContribution);
    bind(FrontendApplicationContribution).toService(GridViewContribution);
});
