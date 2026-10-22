import { ContainerModule } from '@theia/core/shared/inversify';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { BackgroundThrottlingContribution } from './background-throttling-contribution';
import { WindowIconContribution } from './window-icon-contribution';

export default new ContainerModule(bind => {
    bind(WindowIconContribution).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(WindowIconContribution);
    bind(BackgroundThrottlingContribution).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(BackgroundThrottlingContribution);
});
