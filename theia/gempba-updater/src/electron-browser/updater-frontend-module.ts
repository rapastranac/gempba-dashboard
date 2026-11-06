import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { CommandContribution } from '@theia/core/lib/common/command';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { ElectronIpcConnectionProvider } from '@theia/core/lib/electron-browser/messaging/electron-ipc-connection-source';
import { ContainerModule } from '@theia/core/shared/inversify';
import { UPDATER_PATH, Updater } from '../common/updater-protocol';
import { UpdaterClientImpl } from './updater-client-impl';
import { UpdaterContribution } from './updater-contribution';

export default new ContainerModule(bind => {
    bind(UpdaterClientImpl).toSelf().inSingletonScope();
    bind(Updater).toDynamicValue(ctx => ElectronIpcConnectionProvider.createProxy<Updater>(ctx.container, UPDATER_PATH, ctx.container.get(UpdaterClientImpl))).inSingletonScope();
    bind(UpdaterContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(UpdaterContribution);
    bind(MenuContribution).toService(UpdaterContribution);
    bind(FrontendApplicationContribution).toService(UpdaterContribution);
});
