import '../../src/browser/style/index.css';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { ContainerModule } from '@theia/core/shared/inversify';
import { SETTINGS_SERVICE_PATH, SettingsServer } from '../common/settings-protocol';
import { ConnectionViewContribution } from './connection-view-contribution';
import { ConnectionWidget } from './connection-widget';
import { RememberedRatesMove } from './remembered-rates-move';

export default new ContainerModule(bind => {
    bind(SettingsServer).toDynamicValue(ctx => ServiceConnectionProvider.createProxy<SettingsServer>(ctx.container, SETTINGS_SERVICE_PATH)).inSingletonScope();
    bind(ConnectionWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: ConnectionWidget.ID,
        createWidget: () => ctx.container.get(ConnectionWidget)
    })).inSingletonScope();
    bindViewContribution(bind, ConnectionViewContribution);
    bind(FrontendApplicationContribution).toService(ConnectionViewContribution);
    bind(RememberedRatesMove).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(RememberedRatesMove);
});
