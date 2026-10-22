import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ContainerModule } from '@theia/core/shared/inversify';
import { TELEMETRY_SERVICE_PATH, TelemetryServer, TelemetryServerClient } from '../common/telemetry-protocol';
import { TelemetryServerImpl } from './telemetry-server-impl';
import { LocalTunnelProvider } from './tunnel/local-tunnel-provider';
import { TunnelProvider } from './tunnel/tunnel-provider';

/**
 * One TelemetryServerImpl per frontend connection, disposed when that window goes away. Tunnel providers are bound
 * per connection too, here or in another extension's connection module, so an SSH provider can prompt the window
 * that asked to connect.
 */
const telemetryConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindContributionProvider(bind, TunnelProvider);
    bind(LocalTunnelProvider).toSelf().inSingletonScope();
    bind(TunnelProvider).toService(LocalTunnelProvider);
    bind(TelemetryServerImpl).toSelf().inSingletonScope();
    bind(TelemetryServer).toService(TelemetryServerImpl);
    bindBackendService<TelemetryServer, TelemetryServerClient>(TELEMETRY_SERVICE_PATH, TelemetryServer, (server, client) => {
        server.setClient(client);
        client.onDidCloseConnection(() => server.dispose());
        return server;
    });
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(telemetryConnectionModule);
});
