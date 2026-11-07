import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { ContainerModule } from '@theia/core/shared/inversify';
import { DashboardSettings } from '@gempba/core';
import { SETTINGS_SERVICE_PATH, SettingsServer } from '../common/settings-protocol';
import { SettingsStore } from './settings-store';

/** One store for the whole app: every window reads and writes the same file. */
export default new ContainerModule(bind => {
    bind(SettingsStore).toDynamicValue(() => new SettingsStore(SettingsStore.defaultFile())).inSingletonScope();
    bind(SettingsServer).toDynamicValue(ctx => {
        const store = ctx.container.get(SettingsStore);
        const server: SettingsServer = {
            load: async () => store.load(),
            save: async (settings: DashboardSettings) => store.save(DashboardSettings.of(settings))
        };
        return server;
    }).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx => new RpcConnectionHandler(SETTINGS_SERVICE_PATH, () => ctx.container.get(SettingsServer))).inSingletonScope();
});
