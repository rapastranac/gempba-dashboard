import { RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { ElectronConnectionHandler } from '@theia/core/lib/electron-main/messaging/electron-connection-handler';
import { ContainerModule } from '@theia/core/shared/inversify';
import { UPDATER_PATH, UpdaterClient } from '../common/updater-protocol';
import { ElectronUpdateEngine } from './electron-update-engine';
import { UpdaterService } from './updater-service';

/** One updater for the whole app, served to each window over Electron IPC. */
export default new ContainerModule(bind => {
    bind(UpdaterService).toDynamicValue(() => new UpdaterService(new ElectronUpdateEngine())).inSingletonScope();
    bind(ElectronConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<UpdaterClient>(UPDATER_PATH, client => ctx.container.get(UpdaterService).connect(client))
    ).inSingletonScope();
});
