import { ContainerModule } from '@theia/core/shared/inversify';
import { ElectronMainMenuFactory } from '@theia/core/lib/electron-browser/menu/electron-main-menu-factory';
import { ShellElectronMainMenuFactory } from './shell-electron-main-menu-factory';

export default new ContainerModule((_bind, _unbind, _isBound, rebind) => {
    rebind(ElectronMainMenuFactory).to(ShellElectronMainMenuFactory).inSingletonScope();
});
