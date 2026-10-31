import '../../src/browser/style/index.css';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { CommandContribution } from '@theia/core/lib/common/command';
import { ContainerModule } from '@theia/core/shared/inversify';
import { MOCK_SERVICE_PATH, MockServer } from '../common/mock-protocol';
import { MockClientImpl } from './mock-client-impl';
import { MockCommandContribution } from './mock-command-contribution';
import { MockController } from './mock-controller';
import { MockStatusBarContribution } from './mock-status-bar-contribution';
import { MockViewContribution } from './mock-view-contribution';
import { MockWidget } from './mock-widget';

export default new ContainerModule(bind => {
    bind(MockClientImpl).toSelf().inSingletonScope();
    bind(MockServer).toDynamicValue(ctx => ServiceConnectionProvider.createProxy<MockServer>(ctx.container, MOCK_SERVICE_PATH, ctx.container.get(MockClientImpl)))
        .inSingletonScope();
    bind(MockController).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MockController);
    bind(MockWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: MockWidget.ID,
        createWidget: () => ctx.container.get(MockWidget)
    })).inSingletonScope();
    bindViewContribution(bind, MockViewContribution);
    bind(FrontendApplicationContribution).toService(MockViewContribution);
    bind(MockCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(MockCommandContribution);
    bind(MockStatusBarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MockStatusBarContribution);
});
